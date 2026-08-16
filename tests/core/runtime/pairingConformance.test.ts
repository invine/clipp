import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending";
import { encodePairingFrame, encodeTrustRequestEnvelope, encodeTrustRequestPayload, PAIRING_PROTOCOL } from "../../../packages/core/pairing/protocol";
import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target";
import { encodePairingTarget } from "../../../packages/core/pairing/v2";
import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeConformanceHarness,
  createRuntimeNetworkProxy,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimePlatformAdapterDependencies,
} from "../../../packages/core/runtime";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { createObservedRuntimeTransport } from "./observedTransport";

type Identity = { deviceId: string };
type State = Record<string, never>;
type PublicState = Record<string, never>;
type AdapterFactory = typeof createElectronRuntimeAdapter<Identity, State, PublicState>;

const initiatorPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

function createStorage() {
  const values = new Map<string, unknown>();
  return {
    get: async <Value>(key: string) => values.get(key) as Value | undefined,
    set: async <Value>(key: string, value: Value) => void values.set(key, structuredClone(value)),
    remove: async (key: string) => void values.delete(key),
  };
}

function createAdapter(
  factory: AdapterFactory,
  capabilities: RuntimeCapabilities,
  storage: ReturnType<typeof createStorage>,
  ports: Pick<RuntimePlatformAdapterDependencies<Identity, State, PublicState>, "clipboard" | "notifications" | "lifecycle" | "network" | "clock" | "publicState">
): RuntimeAdapter<Identity, State, PublicState> {
  return factory({
    ...ports,
    storage,
    identityKey: "identity",
    applicationStateKey: "application-state",
    initialApplicationState: () => ({}),
    relays: {
      readAddresses: async () => [],
      ...(capabilities.relayConfiguration === "editable"
        ? { updateAddresses: async (addresses: string[]) => addresses }
        : {}),
    },
  });
}

async function expectPairingConformance(factory: AdapterFactory, capabilities: RuntimeCapabilities) {
  const storage = createStorage();
  const firstHarness = createRuntimeConformanceHarness<Identity, State, PublicState>({
    capabilities,
    initialApplicationState: {},
    now: 1_000,
    getPublicState: async () => ({}),
  });
  const imported: Array<{ peerId: string; record: Uint8Array }> = [];
  const connected: string[] = [];
  const network: MessagingTransport = {
    ...firstHarness.adapter.network,
    async importSignedPeerRecord(peerId, record) {
      imported.push({ peerId, record: Uint8Array.from(record) });
    },
    async connect(peerId) {
      connected.push(peerId);
    },
  };
  const adapter = createAdapter(factory, capabilities, storage, {
    clipboard: firstHarness.adapter.clipboard,
    notifications: firstHarness.adapter.notifications,
    lifecycle: firstHarness.adapter.lifecycle,
    network,
    clock: firstHarness.adapter.clock,
    publicState: firstHarness.adapter.publicState,
  });
  const requested: string[] = [];
  const targetText = encodePairingTarget({
    targetPeerId,
    signedPeerRecord: new Uint8Array([1, 2, 3]),
    deviceNameHint: "Desktop",
  });

  await importPairingTargetAndRequest({
    text: targetText,
    network: adapter.network,
    request: async (peerId) => {
      requested.push(peerId);
      return new Uint8Array([1]);
    },
  });

  expect(imported).toEqual([{ peerId: targetPeerId, record: new Uint8Array([1, 2, 3]) }]);
  expect(connected).toEqual([targetPeerId]);
  expect(requested).toEqual([targetPeerId]);

  const store = createKVPendingTrustRequestStore({ storage, key: "pairing-pending" });
  const coordinator = createPendingTrustRequestCoordinator({
    localPeerId: async () => targetPeerId,
    store,
    notifications: adapter.notifications,
    lifecycle: adapter.lifecycle,
    clock: adapter.clock,
    verify: async () => true,
    validityWindowMs: 100,
    clockSkewAllowanceMs: 0,
  });
  await coordinator.start();
  const request = encodePairingFrame({
    kind: "request",
    envelope: encodeTrustRequestEnvelope({
      signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 1n, issuedAtUnixMs: 1_000n }),
      signature: new Uint8Array([1]),
    }),
  });
  await coordinator.receive(initiatorPeerId, request);
  expect(firstHarness.observed.notifications).toEqual([
    expect.objectContaining({ id: `pairing-request-${initiatorPeerId}` }),
  ]);
  await firstHarness.selectNotification(`pairing-request-${initiatorPeerId}`);
  expect(firstHarness.observed.approvalViewsOpened).toBe(1);

  const restartedHarness = firstHarness.restart();
  const restartedAdapter = createAdapter(factory, capabilities, storage, {
    clipboard: restartedHarness.adapter.clipboard,
    notifications: restartedHarness.adapter.notifications,
    lifecycle: restartedHarness.adapter.lifecycle,
    network: restartedHarness.adapter.network,
    clock: restartedHarness.adapter.clock,
    publicState: restartedHarness.adapter.publicState,
  });
  const restartedCoordinator = createPendingTrustRequestCoordinator({
    localPeerId: async () => targetPeerId,
    store: createKVPendingTrustRequestStore({ storage, key: "pairing-pending" }),
    notifications: restartedAdapter.notifications,
    lifecycle: restartedAdapter.lifecycle,
    clock: restartedAdapter.clock,
    verify: async () => true,
    validityWindowMs: 100,
    clockSkewAllowanceMs: 0,
  });
  await restartedCoordinator.start();
  expect(restartedHarness.observed.notifications).toEqual([
    expect.objectContaining({ id: `pairing-request-${initiatorPeerId}` }),
  ]);

  restartedHarness.advanceTimeBy(100);
  await new Promise((resolve) => setImmediate(resolve));
  expect(restartedHarness.observed.dismissedNotifications).toEqual([]);
  await expect(restartedCoordinator.list()).resolves.toHaveLength(1);

  restartedHarness.advanceTimeBy(1);
  await new Promise((resolve) => setImmediate(resolve));
  expect(restartedHarness.observed.dismissedNotifications).toEqual([
    `pairing-request-${initiatorPeerId}`,
  ]);
  await expect(restartedCoordinator.list()).resolves.toEqual([]);
}

describe("Pairing runtime-adapter conformance", () => {
  it.each([
    ["electron", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron],
    ["android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android],
    ["chrome-extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension],
  ] as const)("supports Pairing import and durable approval lifecycle on %s", async (_name, factory, capabilities) => {
    await expectPairingConformance(factory as AdapterFactory, capabilities);
  });

  it("routes each Pairing frame once after the Electron transport is replaced", () => {
    const initial = createObservedRuntimeTransport();
    const replacement = createObservedRuntimeTransport();
    let current = initial.transport;
    const network = createRuntimeNetworkProxy(() => current);
    const harness = createRuntimeConformanceHarness<Identity, State, PublicState>({
      capabilities: RUNTIME_CAPABILITIES.electron,
      initialApplicationState: {},
      getPublicState: async () => ({}),
    });
    const adapter = createAdapter(createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron, createStorage(), {
      clipboard: harness.adapter.clipboard,
      notifications: harness.adapter.notifications,
      lifecycle: harness.adapter.lifecycle,
      network,
      clock: harness.adapter.clock,
      publicState: harness.adapter.publicState,
    });
    const received: string[] = [];
    adapter.network.onMessage(PAIRING_PROTOCOL, (from) => received.push(from));

    initial.receive(PAIRING_PROTOCOL, "initial-peer", new Uint8Array([1]));
    current = replacement.transport;
    network.bindCurrent();
    replacement.receive(PAIRING_PROTOCOL, "replacement-peer", new Uint8Array([1]));

    expect(received).toEqual(["initial-peer", "replacement-peer"]);
  });
});
