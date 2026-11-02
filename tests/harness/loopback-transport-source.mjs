import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { installLoopbackNetworkGuard } from "./loopback-network-guard.mjs";

// Install before importing any actual transport source. No actor executes on import.
const guard = installLoopbackNetworkGuard();
const stage = (value) => console.error(`[loopback-source] ${value}`);
stage(`guards-installed pid=${process.pid}`);
const owned = [];
let expired = false;
const timeout = setTimeout(() => {
  expired = true;
  stage("owner-deadline");
  for (const transport of owned) void transport.stop();
}, 10_000);
try {
  const { createLibp2pMessagingTransport } =
    await import("../../packages/core/network/engine.ts");
  const { verifiedSignedPeerRecordMultiaddrs } =
    await import("../../packages/core/network/peerRecords.ts");
  const { generateKeyPair } = await import("@libp2p/crypto/keys");
  const privateKey = await generateKeyPair("Ed25519");
  const transport = createLibp2pMessagingTransport({
    privateKey,
    nativeListenInterface: "127.0.0.1",
    enableMdns: false,
    bootstrapList: [],
    relayAddresses: [],
    enableTcp: false,
    enableWebRTCDirect: false,
    enableDCUtR: false,
    enableRelayReservations: false,
    enableRendezvous: false,
  });
  owned.push(transport);
  stage("transport-start");
  await transport.start();
  stage("transport-started");
  const addresses = transport.getSelfMultiaddrs();
  assert.ok(addresses.length > 0, "actual owned listener must be reachable");
  assert.ok(
    addresses.every((address) =>
      /^\/ip4\/127\.0\.0\.1\/tcp\/[1-9][0-9]*\/ws(?:\/p2p\/[^/]+)?$/.test(
        address
      )
    ),
    "every real advertised listener is loopback WebSocket"
  );
  const record = await transport.getSignedPeerRecord();
  const self = addresses[0].split("/p2p/")[1];
  assert.ok(self, "actual transport identifies its signed endpoint");
  const verified = await verifiedSignedPeerRecordMultiaddrs(record, self);
  assert.ok(verified.length > 0);
  assert.ok(
    verified.every((address) => address.includes("/ip4/127.0.0.1/tcp/"))
  );
  assert.equal(
    expired,
    false,
    "owned source interval must finish before deadline"
  );
  console.log(
    "SOURCE_RECEIPT " +
      JSON.stringify({
        phase: "signed-loopback-record",
        addresses,
        verifiedAddresses: verified,
        signedRecordSha256: createHash("sha256").update(record).digest("hex"),
      })
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error);
} finally {
  stage("cleanup-enter");
  clearTimeout(timeout);
  for (const transport of owned) {
    try {
      stage("transport-stop");
      await transport.stop();
      stage("transport-stopped");
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
  } finally {
    stage("cleanup-finished; guards-remain-installed");
  }
}
