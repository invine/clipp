/** Run with `npx tsx tests/harness/direct-connection-harness.ts`. */
import assert from "node:assert/strict";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { PeerRecord, RecordEnvelope } from "@libp2p/peer-record";
import { createLibp2pMessagingTransport } from "../../packages/core/network/engine.js";
import { startWebsocketRelay } from "../../packages/core/network/relay/server.js";
import {
  encodePairingFrame,
  PAIRING_PROTOCOL,
} from "../../packages/core/pairing/protocol.js";
import { setLogLevel } from "../../packages/core/logger.js";

setLogLevel("warn");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(label: string, predicate: () => boolean) {
  const deadline = Date.now() + 15_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await pause(50);
  }
}
const relay = await startWebsocketRelay({
  host: "127.0.0.1",
  port: 0,
  enableWebRTC: false,
  debugNamespaces: "",
  statusIntervalMs: 0,
});
const address = relay.node
  .getMultiaddrs()
  .find((addr) => addr.toString().includes("/ws/"))!
  .toString();
const peers: ReturnType<typeof createLibp2pMessagingTransport>[] = [];
try {
  for (let index = 0; index < 2; index++) {
    const peer = createLibp2pMessagingTransport({
      privateKey: await generateKeyPair("Ed25519"),
      relayAddresses: [address],
      enableWebRTCDirect: true,
      enableWebSocketListener: false,
      enableTcp: false,
      enableDCUtR: true,
      dcutrTimeoutMs: 500,
      dcutrRetries: 1,
      enableRelayReservations: true,
      isPeerKnown: async () => true,
    });
    peers.push(peer);
    await peer.start();
    await waitFor("WebRTC circuit advertisement", () =>
      peer.getSelfMultiaddrs!().some((addr) =>
        addr.includes("/p2p-circuit/webrtc/")
      )
    );
  }
  const [left, right] = peers;
  // Identify can publish a newer self record without changing listen addresses.
  // A Pairing Target must not keep returning a cached, older sequence.
  const cached = await right.getSignedPeerRecord!();
  const cachedRecord = PeerRecord.createFromProtobuf(
    RecordEnvelope.createFromProtobuf(cached).payload
  );
  const rightNode = (right as any).node;
  const latest = await RecordEnvelope.seal(
    new PeerRecord({
      peerId: rightNode.peerId,
      multiaddrs: rightNode.getMultiaddrs(),
      seqNumber: cachedRecord.seqNumber + 1n,
    }),
    (right as any).opts.privateKey
  );
  const originalGet = rightNode.peerStore.get.bind(rightNode.peerStore);
  rightNode.peerStore.get = async (id: any, ...args: any[]) => {
    const peer = await originalGet(id, ...args);
    return id.equals(rightNode.peerId)
      ? { ...peer, peerRecordEnvelope: latest.marshal() }
      : peer;
  };
  try {
    const current = await right.getSignedPeerRecord!();
    const currentRecord = PeerRecord.createFromProtobuf(
      RecordEnvelope.createFromProtobuf(current).payload
    );
    assert.ok(
      currentRecord.seqNumber > cachedRecord.seqNumber + 1n,
      "Pairing Target must supersede the newer Identify record"
    );
    await left.importSignedPeerRecord!(rightNode.peerId.toString(), current);
    // Identify Push can sign a newer record without storing it on the sender.
    // A previously generated public Pairing Target must use retained newer
    // reachability rather than fail or downgrade the receiver's peer store.
    const pushed = await RecordEnvelope.seal(
      new PeerRecord({
        peerId: rightNode.peerId,
        multiaddrs: rightNode.getMultiaddrs(),
        seqNumber: currentRecord.seqNumber + 1n,
      }),
      (right as any).opts.privateKey
    );
    const pushedBytes = pushed.marshal();
    const leftNode = (left as any).node;
    await leftNode.peerStore.consumePeerRecord(pushedBytes, rightNode.peerId);
    await left.importSignedPeerRecord!(rightNode.peerId.toString(), current);
    assert.deepEqual(
      (left as any).persistedPeerRecords.get(rightNode.peerId.toString()),
      pushedBytes,
      "stale pairing must retain the newer Identify record"
    );
    const tampered = Uint8Array.from(current);
    tampered[tampered.length - 1] ^= 1;
    await assert.rejects(
      left.importSignedPeerRecord!(rightNode.peerId.toString(), tampered)
    );
    await assert.rejects(
      left.importSignedPeerRecord!(leftNode.peerId.toString(), current)
    );
    const wrongSigner = await RecordEnvelope.seal(
      new PeerRecord({
        peerId: rightNode.peerId,
        multiaddrs: rightNode.getMultiaddrs(),
        seqNumber: currentRecord.seqNumber,
      }),
      (left as any).opts.privateKey
    );
    await assert.rejects(
      left.importSignedPeerRecord!(
        rightNode.peerId.toString(),
        wrongSigner.marshal()
      )
    );
  } finally {
    rightNode.peerStore.get = originalGet;
  }
  const target = right.getSelfMultiaddrs!().find(
    (addr) => addr.includes("/p2p-circuit/") && !addr.includes("/webrtc")
  )!;
  const rightId = target.split("/p2p/").at(-1)!;
  await left.connect(target);
  assert.equal(
    left.getPeerConnectionInfo!().find((info) => info.peerId === rightId)
      ?.hasRelay,
    true
  );
  const direct = right.getSelfMultiaddrs!().find((addr) =>
    addr.includes("/p2p-circuit/webrtc/")
  )!;
  await left.connect(direct);
  await waitFor("direct connection", () =>
    left.getPeerConnectionInfo!().some(
      (info) => info.peerId === rightId && info.hasDirect
    )
  );
  const frames: Uint8Array[] = [];
  right.onMessage(PAIRING_PROTOCOL, (_from, bytes) => {
    frames.push(bytes);
  });
  const frame = encodePairingFrame({
    kind: "response",
    response: {
      decision: "rejected",
      requestEnvelope: Uint8Array.of(1),
      responderDeviceName: "Harness",
      responderNameRevision: 0n,
    },
  });
  await left.send(PAIRING_PROTOCOL, rightId, frame);
  await waitFor(
    "pairing frame delivered after upgrade",
    () => frames.length === 1
  );
  assert.deepEqual(frames[0], frame);
  await waitFor("relay released after upgrade", () =>
    left.getPeerConnectionInfo!().some(
      (info) => info.peerId === rightId && info.hasDirect && !info.hasRelay
    )
  );
  await left.disconnect!(rightId);
  await waitFor(
    "peer disconnected",
    () => !left.getConnectedPeers().includes(rightId)
  );
  await left.connect(target);
  assert.equal(
    left.getPeerConnectionInfo!().find((info) => info.peerId === rightId)
      ?.hasRelay,
    true
  );
  await left.connect(direct);
  await left.send(PAIRING_PROTOCOL, rightId, frame);
  await waitFor("pairing delivered after reconnect", () => frames.length === 2);
  console.log(
    "PASS: native WebRTC upgrades, releases relay capacity, delivers pairing frames, and upgrades again after disconnect"
  );
} finally {
  for (const peer of peers) await peer.stop().catch(() => undefined);
  await relay.stop();
}
