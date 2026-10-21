import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { installLoopbackNetworkGuard } from "./loopback-network-guard.mjs";

/** Inert on import. The caller owns one finite, synthetic, genuine protocol peer.
 * No arbitrary target, admission operation, persisted key or application bridge. */
export async function startAndroidNotificationPeer({ nonce, expiresAtUnixMs }) {
  const now = Date.now();
  if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce))
    throw Error("invalid_peer_nonce");
  if (
    !Number.isSafeInteger(expiresAtUnixMs) ||
    expiresAtUnixMs <= now ||
    expiresAtUnixMs > now + 600_000
  )
    throw Error("invalid_peer_deadline");
  let transport, sessions, pending, initialization, stopping, timer;
  let closed = false,
    attempted = false,
    incomingPeerId = null,
    receiveFailed = false;
  const messages = new Set();
  let resolveClosed;
  const closedResult = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const assertActive = () => {
    if (closed || Date.now() >= expiresAtUnixMs)
      throw Error("peer_interval_closed");
  };
  async function stop() {
    if (stopping) return stopping;
    closed = true;
    clearTimeout(timer);
    stopping = (async () => {
      await initialization?.catch(() => {});
      const results = await Promise.allSettled([
        sessions?.stop(),
        pending?.stop(),
        transport?.stop(),
      ]);
      await Promise.allSettled(messages);
      const failures = results.filter((result) => result.status === "rejected");
      resolveClosed({ clean: failures.length === 0 });
      if (failures.length) throw Error("peer_cleanup_failed");
    })();
    return stopping;
  }
  timer = setTimeout(() => {
    void stop().catch(() => {});
  }, expiresAtUnixMs - now);
  const name = `Notif ${nonce.slice(0, 16)}`;
  let info;
  initialization = (async () => {
    const { createIdentityManager } =
      await import("../../packages/core/trust/identity.ts");
    const { privateKeyFromProtobuf } = await import("@libp2p/crypto/keys");
    const { createLibp2pMessagingTransport } =
      await import("../../packages/core/network/engine.ts");
    const { verifiedSignedPeerRecordMultiaddrs } =
      await import("../../packages/core/network/peerRecords.ts");
    const { createPairingRuntimeSessions } =
      await import("../../packages/core/pairing/runtimeCoordinator.ts");
    const {
      createPendingTrustRequestCoordinator,
      createKVPendingTrustRequestStore,
    } = await import("../../packages/core/pairing/pending.ts");
    const { PAIRING_PROTOCOL, verifyPairingTrustRequestSignature } =
      await import("../../packages/core/pairing/protocol.ts");
    const { encodePairingTarget } =
      await import("../../packages/core/pairing/v2.ts");
    const { systemRuntimeClock } =
      await import("../../packages/core/runtime/clock.ts");
    const { setLogLevel } = await import("../../packages/core/logger.ts");
    setLogLevel("error");
    assertActive();
    let identityValue;
    const identity = createIdentityManager({
      repo: {
        get: async () => identityValue,
        upsert: async (value) => {
          identityValue = structuredClone(value);
        },
      },
      initialDeviceName: name,
    });
    const local = await identity.get();
    const privateKey = await privateKeyFromProtobuf(
      Buffer.from(local.privateKey, "base64")
    );
    transport = createLibp2pMessagingTransport({
      privateKey,
      nativeListenInterface: "127.0.0.1",
      enableMdns: false,
      relayAddresses: [],
      bootstrapList: [],
      enableTcp: false,
      enableWebRTCDirect: false,
      enableDCUtR: false,
      enableRelayReservations: false,
      enableRendezvous: false,
      isPeerKnown: async (peer) =>
        (await identity.membershipStatus(peer)) === "active",
      isPeerRevoked: async (peer) =>
        (await identity.membershipStatus(peer)) === "revoked",
    });
    sessions = createPairingRuntimeSessions({
      identity: async () => ({
        peerId: local.deviceId,
        deviceName: name,
        nameRevision: 0,
      }),
      send: (peer, frame) => transport.send(PAIRING_PROTOCOL, peer, frame),
      sign: (bytes) => privateKey.sign(bytes),
      verify: verifyPairingTrustRequestSignature,
      membership: identity,
      clock: systemRuntimeClock,
    });
    const values = new Map();
    pending = createPendingTrustRequestCoordinator({
      localPeerId: async () => local.deviceId,
      store: createKVPendingTrustRequestStore({
        storage: {
          get: async (key) => values.get(key),
          set: async (key, value) => {
            values.set(key, value);
          },
          remove: async (key) => {
            values.delete(key);
          },
        },
        key: "owned-notification-peer-requests",
      }),
      // Headless counterpart only; Android's actual native adapter is untouched.
      notifications: {
        show: async () => {},
        dismiss: async () => {},
        onSelect: () => () => {},
      },
      lifecycle: { openApprovalView: () => {} },
      clock: systemRuntimeClock,
      verify: verifyPairingTrustRequestSignature,
      membership: identity,
    });
    transport.onMessage(PAIRING_PROTOCOL, (from, frame) => {
      if (closed) return;
      const operation = sessions.receive(from, frame, (peer, request) =>
        pending.receive(peer, request)
      );
      messages.add(operation);
      void operation.then(
        () => messages.delete(operation),
        () => {
          if (!closed) receiveFailed = true;
          messages.delete(operation);
        }
      );
    });
    sessions.start();
    await pending.start();
    assertActive();
    await transport.start();
    assertActive();
    const record = await transport.getSignedPeerRecord();
    const addresses = await verifiedSignedPeerRecordMultiaddrs(
      record,
      local.deviceId
    );
    if (addresses.length !== 1)
      throw Error("single_loopback_endpoint_required");
    const match = addresses[0].match(
      /^\/ip4\/127\.0\.0\.1\/tcp\/([1-9][0-9]*)\/ws\/p2p\/[^/]+$/
    );
    if (!match || Number(match[1]) > 65535)
      throw Error("single_loopback_endpoint_required");
    const target = encodePairingTarget({
      targetPeerId: local.deviceId,
      signedPeerRecord: record,
      deviceNameHint: name,
    });
    if (target.length > 65536) throw Error("bounded_peer_target_required");
    info = Object.freeze({
      nonce,
      pid: process.pid,
      expiresAtUnixMs,
      peerId: local.deviceId,
      name,
      port: Number(match[1]),
      address: addresses[0],
      target,
    });
  })();
  try {
    await initialization;
    assertActive();
  } catch (error) {
    await stop();
    throw error;
  }
  async function state() {
    if (closed)
      return {
        closed: true,
        requested: attempted,
        incomingPeerId,
        connected: false,
        pendingCount: 0,
      };
    assertActive();
    if (receiveFailed) throw Error("peer_protocol_receive_failed");
    const requests = await pending.list();
    const peers = [
      ...new Set(requests.map((request) => request.initiatorPeerId)),
    ];
    if (
      peers.length > 1 ||
      (peers.length === 1 && incomingPeerId && incomingPeerId !== peers[0])
    )
      throw Error("single_verified_incoming_peer_required");
    if (peers.length === 1) incomingPeerId = peers[0];
    return {
      closed: false,
      requested: attempted,
      incomingPeerId,
      connected:
        !!incomingPeerId &&
        transport.getConnectedPeers().includes(incomingPeerId),
      pendingCount: requests.length,
    };
  }
  return Object.freeze({
    info,
    state,
    stop,
    closed: closedResult,
    async requestIncoming() {
      assertActive();
      if (attempted) throw Error("reverse_request_already_attempted");
      const current = await state();
      if (!current.incomingPeerId || current.pendingCount !== 1)
        throw Error("verified_incoming_request_required");
      if (!current.connected)
        throw Error("verified_incoming_connection_required");
      attempted = true;
      await sessions.request(current.incomingPeerId);
      return state();
    },
  });
}

/** Exact finite stdin actions only. Root must separately own the native interval. */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--nonce" || args[2] !== "--expires-at")
    throw Error("usage_nonce_and_absolute_deadline_required");
  const guard = installLoopbackNetworkGuard();
  let peer, onData, onEnd;
  const write = (value) => {
    const line = JSON.stringify(value);
    if (line.length > 70000) throw Error("bounded_peer_output_required");
    process.stdout.write(line + "\n");
  };
  try {
    peer = await startAndroidNotificationPeer({
      nonce: args[1],
      expiresAtUnixMs: Number(args[3]),
    });
    write({ event: "ready", ...peer.info });
    let commands = 0,
      bytes = 0,
      buffer = "",
      queue = Promise.resolve();
    const fail = () => {
      process.exitCode = 1;
      process.stdin.pause();
      write({ event: "failed", reason: "peer_command_failed" });
      void peer.stop().catch(() => {
        process.exitCode = 1;
      });
    };
    const command = (line) => {
      if (++commands > 16 || Buffer.byteLength(line) > 256) {
        fail();
        return;
      }
      queue = queue
        .then(async () => {
          const parsed = JSON.parse(line);
          if (
            !parsed ||
            Object.keys(parsed).sort().join(",") !== "action,nonce" ||
            parsed.nonce !== args[1]
          )
            throw Error("peer_command_nonce_required");
          if (parsed.action === "state")
            write({ event: "state", nonce: args[1], ...(await peer.state()) });
          else if (parsed.action === "requestIncoming")
            write({
              event: "request",
              nonce: args[1],
              ...(await peer.requestIncoming()),
            });
          else if (parsed.action === "stop") await peer.stop();
          else throw Error("peer_command_not_allowed");
        })
        .catch(fail);
    };
    onData = (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 4096) {
        fail();
        return;
      }
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        command(line);
        if (process.exitCode) return;
      }
      if (Buffer.byteLength(buffer) > 256) fail();
    };
    onEnd = () => {
      if (buffer.length) fail();
      else void queue.then(() => peer.stop()).catch(fail);
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    const result = await peer.closed;
    if (!result.clean) process.exitCode = 1;
    process.stdin.pause();
    await queue;
    guard.assertClean();
    guard.assertClosed();
    write({
      event: "closed",
      nonce: args[1],
      clean: result.clean,
      guardClean: true,
      listenersClosed: true,
    });
  } finally {
    process.stdin.pause();
    if (onData) process.stdin.removeListener("data", onData);
    if (onEnd) process.stdin.removeListener("end", onEnd);
    try {
      await peer?.stop();
    } finally {
      guard.assertClean();
      guard.assertClosed();
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await main();
  } catch {
    process.exitCode = 1;
    process.stderr.write("notification_peer_failed\n");
  }
}
