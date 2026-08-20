/**
 * Real-network relay-first reachability acceptance harness.
 * Run manually: `npx tsx tests/harness/pairing-harness.ts`.
 */
import assert from "node:assert/strict";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { createLibp2pMessagingTransport } from "../../packages/core/network/engine.ts";
import { createPairedPeerConnectionManager } from "../../packages/core/network/pairedConnections.ts";
import type { SignedPeerRecordPersistence } from "../../packages/core/network/peerRecords.ts";
import { createLiveClipGossip } from "../../packages/core/sync/liveClipGossip.ts";
import { createHistoryReconciliation } from "../../packages/core/sync/historyReconciliation.ts";
import { createClipboardSyncManager } from "../../packages/core/sync/clipboardSync.ts";
import { createManualClipboardService, createPollingClipboardService } from "../../packages/core/clipboard/service.ts";
import { MemoryHistoryStore } from "../../packages/core/history/store.ts";
import { createIdentityManager, type IdentityManager } from "../../packages/core/trust/identity.ts";
import { createMembershipReconciler } from "../../packages/core/membership/reconciliation.ts";
import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
} from "../../packages/core/runtime/platformAdapters.ts";
import type { RuntimeAdapter, RuntimePlatform } from "../../packages/core/runtime/contract.ts";
import type { Clip } from "../../packages/core/models/Clip.ts";
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

class MemorySignedPeerRecordPersistence implements SignedPeerRecordPersistence {
  private readonly records = new Map<string, Uint8Array>();

  async load(): Promise<Record<string, Uint8Array>> {
    return Object.fromEntries(
      [...this.records].map(([peerId, record]) => [peerId, Uint8Array.from(record)])
    );
  }

  async save(peerId: string, record: Uint8Array): Promise<void> {
    this.records.set(peerId, Uint8Array.from(record));
  }

  async remove(peerId: string): Promise<void> {
    this.records.delete(peerId);
  }
}

type HarnessPeer = Awaited<ReturnType<typeof bootPeer>>;

type HarnessRuntimeAdapter = RuntimeAdapter<unknown, Record<string, never>, Record<string, never>>;

function createHarnessRuntimeAdapter(options: {
  platform: RuntimePlatform;
  transport: ReturnType<typeof createLibp2pMessagingTransport>;
  relayAddress: string;
  clipboardWrites: string[];
}): HarnessRuntimeAdapter {
  const storage = new Map<string, unknown>();
  let clipboardText = "";
  const dependencies = {
    storage: {
      get: async <Value>(key: string) => storage.get(key) as Value | undefined,
      set: async <Value>(key: string, value: Value) => { storage.set(key, structuredClone(value)); },
      remove: async (key: string) => { storage.delete(key); },
    },
    identityKey: "identity",
    applicationStateKey: "application",
    initialApplicationState: () => ({}),
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (text: string) => {
        clipboardText = text;
        options.clipboardWrites.push(text);
      },
    },
    notifications: {
      show: async () => undefined,
      dismiss: async () => undefined,
      onSelect: () => () => undefined,
    },
    lifecycle: {
      onShutdown: () => () => undefined,
      openApprovalView: () => undefined,
    },
    network: options.transport,
    clock: systemRuntimeClock,
    publicState: {
      read: async () => ({}),
      publish: async () => undefined,
    },
    relays: {
      readAddresses: async () => [options.relayAddress],
      updateAddresses: async (addresses: string[]) => addresses,
    },
  };
  if (options.platform === "electron") return createElectronRuntimeAdapter(dependencies);
  if (options.platform === "android") return createAndroidRuntimeAdapter(dependencies);
  return createChromeExtensionRuntimeAdapter(dependencies);
}

async function bootPeer(options: {
  label: string;
  platform: RuntimePlatform;
  privateKey: any;
  relayAddress: string;
  signedPeerRecordPersistence: SignedPeerRecordPersistence;
  identity?: IdentityManager;
  history?: MemoryHistoryStore;
  clipboardWrites?: string[];
}) {
  const peerId = peerIdFromPrivateKey(options.privateKey).toString();
  let storedIdentity: Awaited<ReturnType<IdentityManager["get"]>> | undefined;
  const identity = options.identity ?? createIdentityManager({
    repo: {
      get: async () => storedIdentity,
      upsert: async (value) => { storedIdentity = structuredClone(value); },
    },
    initialDeviceName: options.label,
    generateKeyMaterial: async () => ({
      peerId,
      privateKey: `${options.label}-private-key`,
      publicKey: `${options.label}-public-key`,
    }),
  });
  assert.equal((await identity.get()).deviceId, peerId);
  const directUpgradeAttempts: string[] = [];
  const transport = createLibp2pMessagingTransport({
    privateKey: options.privateKey,
    relayAddresses: [options.relayAddress],
    enableDCUtR: true,
    onDCUtRAttempt: (remotePeerId) => directUpgradeAttempts.push(remotePeerId),
    dcutrTimeoutMs: 250,
    dcutrRetries: 1,
    enableWebRTCDirect: false,
    enableTcp: false,
    enableWebSocketListener: false,
    enableRelayReservations: true,
    rendezvousIntervalMs: 1_000,
    relayReservationRetryMs: 60_000,
    dialTimeoutMs: 8_000,
    signedPeerRecordPersistence: options.signedPeerRecordPersistence,
    isPeerKnown: async (remotePeerId) => await identity.membershipStatus(remotePeerId) === "active",
    isPeerRevoked: async (remotePeerId) => await identity.membershipStatus(remotePeerId) === "revoked",
  });
  await transport.start();
  await waitUntil(`${options.label} relay reservation`, () =>
    transport
      .getSelfMultiaddrs?.()
      .some((address) => address.startsWith(`${options.relayAddress}/p2p-circuit`)) ?? false
  );
  const clipboardWrites = options.clipboardWrites ?? [];
  const runtimeAdapter = createHarnessRuntimeAdapter({
    platform: options.platform,
    transport,
    relayAddress: options.relayAddress,
    clipboardWrites,
  });
  const history = options.history ?? new MemoryHistoryStore(undefined, {
    pinPersistence: runtimeAdapter.capabilities.pinPersistence,
  });
  const clipboardOptions = {
    getSenderId: () => peerId,
    readText: runtimeAdapter.clipboard.readText,
    writeText: runtimeAdapter.clipboard.writeText,
  };
  const clipboard = runtimeAdapter.capabilities.clipboardCapture === "polling"
    ? createPollingClipboardService({ ...clipboardOptions, pollIntervalMs: 60_000 })
    : createManualClipboardService(clipboardOptions);
  const liveGossip = createLiveClipGossip({
    transport: runtimeAdapter.network,
    membershipStatus: (remotePeerId) => identity.membershipStatus(remotePeerId),
  });
  const clipboardSync = createClipboardSyncManager({
    clipboard,
    history,
    getLocalDeviceId: async () => peerId,
    liveGossip,
    isActiveMember: async (remotePeerId) => await identity.membershipStatus(remotePeerId) === "active",
  });
  const historyReconciliation = createHistoryReconciliation({
    transport,
    history,
    getLocalDeviceId: async () => peerId,
    membershipStatus: (remotePeerId) => identity.membershipStatus(remotePeerId),
    onMembershipChanged: identity.onMembershipChanged,
  });
  let localRevoked = false;
  const membershipReconciler = createMembershipReconciler({
    transport,
    identity,
    onLocalRevoked: () => { localRevoked = true; },
  });
  membershipReconciler.start();
  historyReconciliation.start();
  clipboardSync.start();
  return {
    ...options,
    peerId,
    identity,
    history,
    clipboard,
    clipboardSync,
    historyReconciliation,
    membershipReconciler,
    runtimeAdapter,
    transport,
    directUpgradeAttempts,
    clipboardWrites,
    get localRevoked() { return localRevoked; },
  };
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
    membership: a.identity,
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
      await b.identity.admit(from);
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
  assert.equal(await a.identity.membershipStatus(b.peerId), "active", "A must admit B after Pairing");
  assert.equal(await b.identity.membershipStatus(a.peerId), "active", "B must admit A after Pairing");
  await session.stop();
}

async function assertLiveClipGossip(
  source: HarnessPeer,
  targets: HarnessPeer[],
  content: string,
): Promise<Clip> {
  const clip = await source.clipboard.processLocalText(content);
  assert(clip, "local capture must create a Clip");
  await waitUntil("live Clip gossip", async () =>
    (await Promise.all(targets.map((target) => target.history.getById(clip.id))))
      .every(Boolean)
  );
  for (const target of targets) {
    assert(
      target.clipboardWrites.includes(content),
      `${target.label} must apply the live Clip to its runtime clipboard`,
    );
  }
  return clip;
}

async function main() {
  const previousLease = process.env.RENDEZVOUS_RECORD_TTL_MS;
  process.env.RENDEZVOUS_RECORD_TTL_MS = String(RENDEZVOUS_LEASE_MS);
  const relay = await startWebsocketRelay({
    listen: ["/ip4/127.0.0.1/tcp/0/ws"],
    enableWebRTC: false,
    statusIntervalMs: 60_000,
    reservationTtlMs: 60_000,
    debugNamespaces: process.env.CLIPP_HARNESS_DEBUG ?? "",
  });
  const relayAddress = relay.node.getMultiaddrs().find((address) => String(address).includes("/ws"))?.toString();
  assert(relayAddress, "relay WebSocket address must be available");

  const aKey = await generateKeyPair("Ed25519");
  const bKey = await generateKeyPair("Ed25519");
  const cKey = await generateKeyPair("Ed25519");
  const bPeerIdObject = peerIdFromPrivateKey(bKey);
  const aRecords = new MemorySignedPeerRecordPersistence();
  const bRecords = new MemorySignedPeerRecordPersistence();
  const cRecords = new MemorySignedPeerRecordPersistence();
  let a: HarnessPeer | undefined;
  let b: HarnessPeer | undefined;
  let c: HarnessPeer | undefined;

  try {
    a = await bootPeer({ label: "Desktop", platform: "electron", privateKey: aKey, relayAddress, signedPeerRecordPersistence: aRecords });
    b = await bootPeer({ label: "Mobile", platform: "android", privateKey: bKey, relayAddress, signedPeerRecordPersistence: bRecords });
    c = await bootPeer({ label: "Extension", platform: "chrome-extension", privateKey: cKey, relayAddress, signedPeerRecordPersistence: cRecords });
    assert.deepEqual(
      [a.runtimeAdapter.capabilities.platform, b.runtimeAdapter.capabilities.platform, c.runtimeAdapter.capabilities.platform],
      ["electron", "android", "chrome-extension"],
      "the harness must exercise all three runtime adapters",
    );
    await pairOverRelay(a, b);
    await pairOverRelay(b, c);
    await waitUntil("three-runtime Membership convergence", async () => {
      const peers = [a!, b!, c!];
      return (await Promise.all(peers.flatMap((local) =>
        peers.map((remote) => local.identity.membershipStatus(remote.peerId))
      ))).every((status) => status === "active");
    });
    assert(hasConnectionPath(a, b.peerId, "relay"), "Pairing must begin over a Relayed Connection");

    const originalRecord = await a.transport.getSignedPeerRecordFor?.(b.peerId);
    assert(originalRecord, "A must retain B's verified record after Pairing");
    await assertLiveClipGossip(a, [b, c], "relay-first live Clip");

    const recordBeforeReservationLoss = await b.transport.getSignedPeerRecord?.();
    assert(recordBeforeReservationLoss, "B must publish a record before reservation loss");
    await b.transport.disconnect?.(relay.node.peerId.toString());
    await waitUntil(
      "live relay reservation loss",
      () => !b!.transport.getSelfMultiaddrs?.().some((address) => address.includes("/p2p-circuit"))
    );
    await waitUntil("offline member disconnect", () => !a!.transport.getConnectedPeers().includes(b!.peerId));
    const missedClip = await a.clipboard.processLocalText("history-only repair after Mobile was offline");
    assert(missedClip, "offline capture must remain in Desktop history");
    await waitUntil("offline Clip persistence", async () => Boolean(await a!.history.getById(missedClip.id)));
    await waitUntil("new record after reservation loss", async () => {
      const recordAfterReservationLoss = await b!.transport.getSignedPeerRecord?.();
      return Boolean(
        recordAfterReservationLoss &&
        !sameBytes(recordBeforeReservationLoss, recordAfterReservationLoss)
      );
    });
    await delay(RENDEZVOUS_LEASE_MS + 250);
    await a.transport.refreshPeerRecord?.(b.peerId);
    assert(!a.transport.getConnectedPeers().includes(b.peerId), "expired reachability must not create a connection");
    const bIdentity = b.identity;
    const bHistory = b.history;
    const bClipboardWrites = b.clipboardWrites;
    await stopPeer(b);
    (relay.node.services.circuitRelay as any).reservations.delete(bPeerIdObject);
    assert(
      !(relay.node.services.circuitRelay as any).reservations.has(bPeerIdObject),
      "the harness must clear B's old same-identity relay reservation before restart"
    );

    b = await bootPeer({
      label: "Mobile",
      platform: "android",
      privateKey: bKey,
      relayAddress,
      signedPeerRecordPersistence: bRecords,
      identity: bIdentity,
      history: bHistory,
      clipboardWrites: bClipboardWrites,
    });
    await waitUntil(
      "restarted relay reservation",
      () => (relay.node.services.circuitRelay as any).reservations.has(bPeerIdObject)
    );
    const restartedRecord = await b.transport.getSignedPeerRecord?.();
    assert(restartedRecord, "restarted B must publish its current relay reservation");
    await waitUntil("refreshed Signed Peer Record", async () => {
      await a!.transport.refreshPeerRecord?.(b!.peerId);
      const refreshed = await a!.transport.getSignedPeerRecordFor?.(b!.peerId);
      return Boolean(refreshed && sameBytes(refreshed, restartedRecord));
    });

    a.directUpgradeAttempts.length = 0;
    const reconnect = createPairedPeerConnectionManager({
      transport: a.transport,
      getPairedPeers: async () => [{ deviceId: b!.peerId }],
      intervalMs: 60_000,
    });
    await reconnect.reconnectNow();
    await waitUntil("offline Active Member relay reconnect", () => hasConnectionPath(a!, b!.peerId, "relay"));
    await waitUntil(
      "DCUtR upgrade attempt",
      () =>
        a!.directUpgradeAttempts.includes(b!.peerId) ||
        b!.directUpgradeAttempts.includes(a!.peerId)
    );
    assert(
      !a.transport.getPeerConnectionInfo?.().find((entry) => entry.peerId === b!.peerId)?.hasDirect,
      "unavailable direct transports must leave application traffic on the relay fallback"
    );
    await waitUntil("missed history repair", async () => Boolean(await b!.history.getById(missedClip.id)));
    assert(
      !b.clipboardWrites.includes(missedClip.content),
      "history reconciliation must not apply an imported Clip to the runtime clipboard",
    );
    await assertLiveClipGossip(a, [b, c], "live Clip after failed DCUtR");
    await reconnect.stop();

    assert.equal(await a.identity.revoke(c.peerId), "revoked");
    await a.membershipReconciler.pushConnected();
    await waitUntil("Device Revocation convergence", async () =>
      await b!.identity.membershipStatus(c!.peerId) === "revoked" &&
      await c!.identity.membershipStatus(c!.peerId) === "revoked" &&
      c!.localRevoked
    );

    console.log("✓ Electron, Android, and Chrome runtime adapters Pair over Circuit Relay v2");
    console.log("✓ live Clips gossip through v1 framing across all three runtimes");
    console.log("✓ missed delivery repairs through history without clipboard application");
    console.log("✓ Device Revocation converges and disables the revoked identity");
    console.log("✓ reservation loss and finite lease expiry");
    console.log("✓ Signed Peer Record refresh and offline Active Member reconnect");
    console.log("✓ DCUtR attempt preserves relayed application traffic when no direct path is available");
  } finally {
    if (a) await stopPeer(a).catch(() => undefined);
    if (b) await stopPeer(b).catch(() => undefined);
    if (c) await stopPeer(c).catch(() => undefined);
    await relay.stop();
    if (previousLease === undefined) delete process.env.RENDEZVOUS_RECORD_TTL_MS;
    else process.env.RENDEZVOUS_RECORD_TTL_MS = previousLease;
  }
}

function hasConnectionPath(peer: HarnessPeer, remotePeerId: string, path: "relay" | "direct"): boolean {
  const info = peer.transport.getPeerConnectionInfo?.().find((entry) => entry.peerId === remotePeerId);
  return path === "relay" ? info?.hasRelay === true : info?.hasDirect === true;
}

async function stopPeer(peer: HarnessPeer): Promise<void> {
  peer.membershipReconciler.stop();
  await peer.historyReconciliation.stop();
  await peer.clipboardSync.stop();
  await peer.transport.stop();
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
