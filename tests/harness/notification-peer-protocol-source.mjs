import assert from "node:assert/strict";
import { installLoopbackNetworkGuard } from "./loopback-network-guard.mjs";
const guard = installLoopbackNetworkGuard();
const owned = [];
let expired = false;
const deadline = setTimeout(() => {
  expired = true;
  for (const owner of owned) void owner.stop();
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
  const actor = await startAndroidNotificationPeer({
    nonce: "source-loopback-16",
    expiresAtUnixMs: Date.now() + 9000,
  });
  owned.push(actor);
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
  const local = await identity.get();
  const key = await privateKeyFromProtobuf(
    Buffer.from(local.privateKey, "base64")
  );
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
  await pending.start();
  await transport.start();
  await importPairingTargetAndRequest({
    text: actor.info.target,
    network: transport,
    request: (peer) => sessions.request(peer),
  });
  await waitFor(
    async () => (await actor.state()).incomingPeerId === local.deviceId
  );
  assert.equal((await actor.state()).connected, true);
  await actor.requestIncoming();
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
  await Promise.all(receives);
  if (receiveError) throw receiveError;
  assert.equal(expired, false);
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
  for (const owner of [...owned].reverse()) {
    try {
      await owner.stop();
    } catch (error) {
      process.exitCode = 1;
      console.error(error);
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
}
