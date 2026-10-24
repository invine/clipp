import assert from "node:assert/strict";
import { installLoopbackNetworkGuard } from "./loopback-network-guard.mjs";
import { createNotificationPeerShutdown } from "./notificationPeerShutdown.ts";
const guard = installLoopbackNetworkGuard();
const owned = [];
const shutdown = createNotificationPeerShutdown(owned);
let phase = "imports";
let firstStopOrigin = "none";
let stoppedOwnerCount = 0;
const stop = (origin) => {
  if (firstStopOrigin === "none") {
    firstStopOrigin = origin;
    stoppedOwnerCount = owned.length;
  }
  return shutdown.stop(origin);
};
let expired = false;
const deadline = setTimeout(() => {
  expired = true;
  void stop("deadline");
}, 10_000);
const waitFor = async (read) => {
  for (let count = 0; count < 100 && !expired; count++) {
    if (await read()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error("actual_protocol_progress_required");
};
try {
  const { startAndroidNotificationPeer } =
    await import("./android-notification-peer.mjs");
  const { createIdentityManager } =
    await import("../../packages/core/trust/identity.ts");
  const { privateKeyFromProtobuf } = await import("@libp2p/crypto/keys");
  const { createLibp2pMessagingTransport } =
    await import("../../packages/core/network/engine.ts");
  const { createPairingRuntimeSessions } =
    await import("../../packages/core/pairing/runtimeCoordinator.ts");
  const {
    createPendingTrustRequestCoordinator,
    createKVPendingTrustRequestStore,
  } = await import("../../packages/core/pairing/pending.ts");
  const { PAIRING_PROTOCOL, verifyPairingTrustRequestSignature } =
    await import("../../packages/core/pairing/protocol.ts");
  const { importPairingTargetAndRequest } =
    await import("../../packages/core/pairing/target.ts");
  const { systemRuntimeClock } =
    await import("../../packages/core/runtime/clock.ts");
  phase = "actor_initialization";
  const actor = await startAndroidNotificationPeer({
    nonce: "source-loopback-16",
    expiresAtUnixMs: Date.now() + 9000,
  });
  if (expired) {
    await actor.stop();
    throw Error("actual_protocol_progress_required");
  }
  owned.push(actor);
  phase = "actor_negative_request";
  await assert.rejects(
    actor.requestIncoming(),
    /verified_incoming_request_required/
  );
  let identityValue;
  const identity = createIdentityManager({
    repo: {
      get: async () => identityValue,
      upsert: async (value) => {
        identityValue = structuredClone(value);
      },
    },
    initialDeviceName: "Source counterpart",
  });
  phase = "counterpart_identity";
  const local = await identity.get();
  phase = "counterpart_key";
  const key = await privateKeyFromProtobuf(
    Buffer.from(local.privateKey, "base64")
  );
  assert.equal(expired, false);
  const transport = createLibp2pMessagingTransport({
    privateKey: key,
    nativeListenInterface: "127.0.0.1",
    enableMdns: false,
    relayAddresses: [],
    bootstrapList: [],
    enableTcp: false,
    enableWebRTCDirect: false,
    enableDCUtR: false,
    enableRelayReservations: false,
    enableRendezvous: false,
  });
  owned.push(transport);
  const sessions = createPairingRuntimeSessions({
    identity: async () => ({
      peerId: local.deviceId,
      deviceName: local.deviceName,
      nameRevision: 0,
    }),
    send: (peer, frame) => transport.send(PAIRING_PROTOCOL, peer, frame),
    sign: (bytes) => key.sign(bytes),
    verify: verifyPairingTrustRequestSignature,
    membership: identity,
    clock: systemRuntimeClock,
  });
  owned.push(sessions);
  const storage = new Map();
  const pending = createPendingTrustRequestCoordinator({
    localPeerId: async () => local.deviceId,
    store: createKVPendingTrustRequestStore({
      storage: {
        get: async (key) => storage.get(key),
        set: async (key, value) => {
          storage.set(key, value);
        },
        remove: async (key) => {
          storage.delete(key);
        },
      },
      key: "owned-source-requests",
    }),
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
  owned.push(pending);
  const receives = new Set();
  let receiveError;
  transport.onMessage(PAIRING_PROTOCOL, (from, frame) => {
    const operation = sessions.receive(from, frame, (peer, request) =>
      pending.receive(peer, request)
    );
    receives.add(operation);
    void operation.then(
      () => receives.delete(operation),
      (error) => {
        receiveError = error;
        receives.delete(operation);
      }
    );
  });
  sessions.start();
  phase = "pending_start";
  await pending.start();
  phase = "transport_start";
  await transport.start();
  phase = "forward_request";
  await importPairingTargetAndRequest({
    text: actor.info.target,
    network: transport,
    request: (peer) => sessions.request(peer),
  });
  phase = "verify_actor_incoming";
  await waitFor(
    async () => (await actor.state()).incomingPeerId === local.deviceId
  );
  assert.equal((await actor.state()).connected, true);
  phase = "reverse_request";
  await actor.requestIncoming();
  phase = "verify_counterpart_pending";
  await waitFor(async () =>
    (await pending.list()).some(
      (request) => request.initiatorPeerId === actor.info.peerId
    )
  );
  assert.equal(
    await identity.membershipStatus(actor.info.peerId),
    "unknown",
    "a genuine reverse request is not admission"
  );
  await assert.rejects(
    actor.requestIncoming(),
    /reverse_request_already_attempted/
  );
  phase = "receive_completion";
  await Promise.all(receives);
  if (receiveError) throw receiveError;
  assert.equal(expired, false);
  phase = "success_receipt";
  console.log(
    "SOURCE_RECEIPT " +
      JSON.stringify({
        phase: "genuine-signed-reverse-request",
        hostPeerId: actor.info.peerId,
        verifiedIncomingPeerId: local.deviceId,
        hostPort: actor.info.port,
        counterpartPendingCount: (await pending.list()).length,
        counterpartMembership: await identity.membershipStatus(
          actor.info.peerId
        ),
      })
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error);
} finally {
  clearTimeout(deadline);
  const outcomes = await stop("finally");
  for (const result of outcomes) {
    if (result.status === "rejected") {
      process.exitCode = 1;
      console.error(result.reason);
    }
  }
  try {
    guard.assertClean();
    console.log('SOURCE_RECEIPT {"phase":"guard","clean":true}');
    guard.assertClosed();
    console.log('SOURCE_RECEIPT {"phase":"listeners","closed":true}');
  } catch (error) {
    process.exitCode = 1;
    console.error(error);
  }
  if (process.exitCode) {
    console.error(
      "SOURCE_FAILURE " +
        JSON.stringify({
          phase,
          outerExpired: expired,
          firstStopOrigin,
          stoppedOwnerCount,
          fulfilled: outcomes.filter((result) => result.status === "fulfilled")
            .length,
          rejected: outcomes.filter((result) => result.status === "rejected")
            .length,
        })
    );
  }
}
