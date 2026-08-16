/**
 * Real-network relay-first reachability acceptance harness.
 * Run manually: `npx tsx tests/harness/pairing-harness.ts`.
 */
import assert from "node:assert/strict";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { createLibp2pMessagingTransport } from "../../packages/core/network/engine.ts";
import { createPairedPeerConnectionManager } from "../../packages/core/network/pairedConnections.ts";
import type { PeerRecordStore } from "../../packages/core/network/peerRecords.ts";
import { CLIP_PROTOCOL } from "../../packages/core/network/protocol.ts";
import { startWebsocketRelay } from "../../packages/core/network/relay/server.ts";
import {
  PAIRING_PROTOCOL,
  decodePairingFrame,
  decodeTrustRequestEnvelope,
  decodeTrustRequestPayload,
  encodePairingFrame,
  verifyPairingTrustRequestSignature,
} from "../../packages/core/pairing/protocol.ts";
import { createPairingSession } from "../../packages/core/pairing/session.ts";
import { systemRuntimeClock } from "../../packages/core/runtime/clock.ts";

const WAIT_TIMEOUT_MS = 12_000;
const RENDEZVOUS_LEASE_MS = 750;

class MemoryPeerRecordStore implements PeerRecordStore {
  private readonly records = new Map<string, Uint8Array>();

  async load(): Promise<Record<string, Uint8Array>> {
    return Object.fromEntries(
      [...this.records].map(([peerId, record]) => [peerId, Uint8Array.from(record)])
    );
  }

  async save(peerId: string, record: Uint8Array): Promise<void> {
    this.records.set(peerId, Uint8Array.from(record));
  }
}

type HarnessPeer = Awaited<ReturnType<typeof bootPeer>>;

async function bootPeer(options: {
  label: string;
  privateKey: any;
  relayAddress: string;
  activeMembers: Set<string>;
  peerRecordStore: PeerRecordStore;
}) {
  const peerId = peerIdFromPrivateKey(options.privateKey).toString();
  const transport = createLibp2pMessagingTransport({
    privateKey: options.privateKey,
    relayAddresses: [options.relayAddress],
    enableDCUtR: true,
    enableWebRTCDirect: false,
    enableTcp: false,
    enableWebSocketListener: false,
    enableRelayReservations: true,
    rendezvousIntervalMs: 1_000,
    relayReservationRetryMs: 250,
    dialTimeoutMs: 2_000,
    peerRecordStore: options.peerRecordStore,
    isPeerKnown: async (remotePeerId) => options.activeMembers.has(remotePeerId),
  });
  await transport.start();
  await waitUntil(`${options.label} relay reservation`, () =>
    transport
      .getSelfMultiaddrs?.()
      .some((address) => address.startsWith(`${options.relayAddress}/p2p-circuit`)) ?? false
  );
  return { ...options, peerId, transport };
}

async function pairOverRelay(a: HarnessPeer, b: HarnessPeer): Promise<void> {
  const bRecord = await b.transport.getSignedPeerRecord?.();
  assert(bRecord, "Pairing Target requires B's Signed Peer Record");
  await a.transport.importSignedPeerRecord?.(b.peerId, bRecord);
  await a.transport.refreshPeerRecord?.(b.peerId);
  await a.transport.connect(`${a.relayAddress}/p2p-circuit/p2p/${b.peerId}`);
  await waitUntil("relay-first authenticated connection", () =>
    hasConnectionPath(a, b.peerId, "relay")
  );

  let resolvePairing!: () => void;
  let rejectPairing!: (error: unknown) => void;
  const paired = new Promise<void>((resolve, reject) => {
    resolvePairing = resolve;
    rejectPairing = reject;
  });
  const session = createPairingSession({
    identity: async () => ({ peerId: a.peerId, deviceName: a.label, nameRevision: 0 }),
    send: (targetPeerId, frame) => a.transport.send(PAIRING_PROTOCOL, targetPeerId, frame),
    sign: (bytes) => a.privateKey.sign(bytes),
    verify: verifyPairingTrustRequestSignature,
    membership: {
      membershipStatus: async (peerId: string) => a.activeMembers.has(peerId) ? "active" : "unknown",
      admit: async (peerId: string) => {
        a.activeMembers.add(peerId);
        return "admitted";
      },
    },
    clock: systemRuntimeClock,
  });

  a.transport.onMessage(PAIRING_PROTOCOL, (from, frame) => {
    void session.receiveResponse(from, frame).then((decision) => {
      if (decision === "accepted") resolvePairing();
    }, rejectPairing);
  });
  b.transport.onMessage(PAIRING_PROTOCOL, (from, frame) => {
    void (async () => {
      const request = decodePairingFrame(frame);
      assert(request?.kind === "request", "B must receive a Pairing request");
      const envelope = decodeTrustRequestEnvelope(request.envelope);
      assert(envelope, "Pairing request envelope must decode");
      const payload = decodeTrustRequestPayload(envelope.signedPayload);
      assert(payload, "Pairing request payload must decode");
      assert.equal(payload.initiatorPeerId, from);
      assert.equal(payload.targetPeerId, b.peerId);
      assert(
        await verifyPairingTrustRequestSignature(
          envelope.signedPayload,
          envelope.signature,
          from
        ),
        "Pairing request signature must verify"
      );
      b.activeMembers.add(from);
      await b.transport.send(
        PAIRING_PROTOCOL,
        from,
        encodePairingFrame({
          kind: "response",
          response: {
            decision: "accepted",
            requestEnvelope: request.envelope,
            responderDeviceName: b.label,
            responderNameRevision: 0n,
          },
        })
      );
    })().catch(rejectPairing);
  });

  await session.request(b.peerId);
  await withTimeout(paired, "Pairing response");
  assert(a.activeMembers.has(b.peerId), "A must admit B after Pairing");
  assert(b.activeMembers.has(a.peerId), "B must admit A after Pairing");
  await session.stop();
}

async function assertApplicationTraffic(a: HarnessPeer, b: HarnessPeer): Promise<void> {
  const expected = Uint8Array.of(7, 8, 9);
  let resolveMessage!: (message: Uint8Array) => void;
  const received = new Promise<Uint8Array>((resolve) => { resolveMessage = resolve; });
  b.transport.onMessage(CLIP_PROTOCOL, (_from, message) => resolveMessage(message));
  await a.transport.send(CLIP_PROTOCOL, b.peerId, expected);
  assert.deepEqual(await withTimeout(received, "relayed application traffic"), expected);
}

async function main() {
  const previousLease = process.env.RENDEZVOUS_RECORD_TTL_MS;
  process.env.RENDEZVOUS_RECORD_TTL_MS = String(RENDEZVOUS_LEASE_MS);
  const relay = await startWebsocketRelay({
    listen: ["/ip4/127.0.0.1/tcp/0/ws"],
    enableWebRTC: false,
    statusIntervalMs: 60_000,
    debugNamespaces: "",
  });
  const relayAddress = relay.node.getMultiaddrs().find((address) => String(address).includes("/ws"))?.toString();
  assert(relayAddress, "relay WebSocket address must be available");

  const aKey = await generateKeyPair("Ed25519");
  const bKey = await generateKeyPair("Ed25519");
  const aMembers = new Set<string>();
  const bMembers = new Set<string>();
  const aRecords = new MemoryPeerRecordStore();
  const bRecords = new MemoryPeerRecordStore();
  let a: HarnessPeer | undefined;
  let b: HarnessPeer | undefined;

  try {
    a = await bootPeer({ label: "A", privateKey: aKey, relayAddress, activeMembers: aMembers, peerRecordStore: aRecords });
    b = await bootPeer({ label: "B", privateKey: bKey, relayAddress, activeMembers: bMembers, peerRecordStore: bRecords });
    await pairOverRelay(a, b);
    assert(hasConnectionPath(a, b.peerId, "relay"), "Pairing must begin over a Relayed Connection");

    const originalRecord = await a.transport.getSignedPeerRecordFor?.(b.peerId);
    assert(originalRecord, "A must retain B's verified record after Pairing");
    await assertApplicationTraffic(a, b);

    await b.transport.stop();
    await waitUntil("offline member disconnect", () => !a!.transport.getConnectedPeers().includes(b!.peerId));
    await delay(RENDEZVOUS_LEASE_MS + 250);
    await a.transport.refreshPeerRecord?.(b.peerId);
    assert(!a.transport.getConnectedPeers().includes(b.peerId), "expired reachability must not create a connection");

    b = await bootPeer({ label: "B", privateKey: bKey, relayAddress, activeMembers: bMembers, peerRecordStore: bRecords });
    await waitUntil("refreshed Signed Peer Record", async () => {
      await a!.transport.refreshPeerRecord?.(b!.peerId);
      const refreshed = await a!.transport.getSignedPeerRecordFor?.(b!.peerId);
      return Boolean(refreshed && !sameBytes(refreshed, originalRecord));
    });

    const reconnect = createPairedPeerConnectionManager({
      transport: a.transport,
      getPairedPeers: async () => [{
        deviceId: b!.peerId,
        multiaddrs: [`${relayAddress}/p2p-circuit/p2p/${b!.peerId}`],
      }],
      intervalMs: 60_000,
    });
    await reconnect.reconnectNow();
    await waitUntil("offline Active Member relay reconnect", () => hasConnectionPath(a!, b!.peerId, "relay"));
    assert(
      !a.transport.getPeerConnectionInfo?.().find((entry) => entry.peerId === b!.peerId)?.hasDirect,
      "DCUtR-disabled direct transports must leave application traffic on the relay fallback"
    );
    await assertApplicationTraffic(a, b);
    reconnect.stop();

    console.log("✓ relay-first Pairing");
    console.log("✓ reservation loss and finite lease expiry");
    console.log("✓ Signed Peer Record refresh and offline Active Member reconnect");
    console.log("✓ DCUtR attempt preserves relayed application traffic when no direct path is available");
  } finally {
    await a?.transport.stop().catch(() => undefined);
    await b?.transport.stop().catch(() => undefined);
    await relay.stop();
    if (previousLease === undefined) delete process.env.RENDEZVOUS_RECORD_TTL_MS;
    else process.env.RENDEZVOUS_RECORD_TTL_MS = previousLease;
  }
}

function hasConnectionPath(peer: HarnessPeer, remotePeerId: string, path: "relay" | "direct"): boolean {
  const info = peer.transport.getPeerConnectionInfo?.().find((entry) => entry.peerId === remotePeerId);
  return path === "relay" ? info?.hasRelay === true : info?.hasDirect === true;
}

async function waitUntil(
  label: string,
  condition: () => boolean | Promise<boolean>,
  timeoutMs = WAIT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() >= deadline) throw new Error(`${label}_timeout`);
    await delay(100);
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    delay(WAIT_TIMEOUT_MS).then(() => { throw new Error(`${label}_timeout`); }),
  ]);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Harness failed", error);
  process.exitCode = 1;
});
