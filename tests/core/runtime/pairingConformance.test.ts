import type { MessageHandler, MessagingTransport } from "../../../packages/core/messaging/transport";
import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending";
import { decodePairingFrame, encodePairingFrame, encodeTrustRequestEnvelope, encodeTrustRequestPayload, PAIRING_PROTOCOL } from "../../../packages/core/pairing/protocol";
import { createPairingSession } from "../../../packages/core/pairing/session";
import type { DeviceMembershipAdmissions } from "../../../packages/core/pairing/membership";
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
type State = { admittedPeerIds?: string[]; revokedPeerIds?: string[] };
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
  ports: Pick<RuntimePlatformAdapterDependencies<Identity, State, PublicState>, "clipboard" | "notifications" | "lifecycle" | "network" | "clock" | "publicState">,
  initialApplicationState: State = {},
): RuntimeAdapter<Identity, State, PublicState> {
  return factory({
    ...ports,
    storage,
    identityKey: "identity",
    applicationStateKey: "application-state",
    initialApplicationState: () => initialApplicationState,
    relays: {
      readAddresses: async () => [],
      ...(capabilities.relayConfiguration === "editable"
        ? { updateAddresses: async (addresses: string[]) => addresses }
        : {}),
    },
  });
}

function createAuthenticatedTransportPair(leftPeerId: string, rightPeerId: string) {
  const handlers = {
    left: new Map<string, MessageHandler[]>(),
    right: new Map<string, MessageHandler[]>(),
  };
  const traffic: Array<{ from: string; to: string; protocol: string; data: Uint8Array }> = [];
  const blocked = new Set<"left" | "right">();
  const makeTransport = (side: "left" | "right", peerId: string, remotePeerId: string): MessagingTransport => ({
    start: async () => undefined,
    stop: async () => undefined,
    async send(protocol, target, data) {
      if (target !== remotePeerId) throw new Error("wrong_authenticated_target");
      traffic.push({ from: peerId, to: remotePeerId, protocol, data: Uint8Array.from(data) });
      if (blocked.has(side)) throw new Error("delivery_failed");
      const remote = side === "left" ? handlers.right : handlers.left;
      await Promise.all((remote.get(protocol) ?? []).map((handler) => Promise.resolve(handler(peerId, Uint8Array.from(data)))));
    },
    connect: async () => undefined,
    onMessage(protocol, handler) {
      handlers[side].set(protocol, [...(handlers[side].get(protocol) ?? []), handler]);
    },
    onPeerConnected: () => undefined,
    onPeerDisconnected: () => undefined,
    onSelfPeerUpdate: () => undefined,
    getConnectedPeers: () => [remotePeerId],
  });
  return {
    left: makeTransport("left", leftPeerId, rightPeerId),
    right: makeTransport("right", rightPeerId, leftPeerId),
    traffic,
    block(side: "left" | "right") { blocked.add(side); },
    unblock(side: "left" | "right") { blocked.delete(side); },
  };
}

function createAdapterMembership(
  adapter: RuntimeAdapter<Identity, State, PublicState>,
  options: { failAdmission?(): boolean } = {},
): DeviceMembershipAdmissions {
  return {
    async membershipStatus(peerId) {
      const state = await adapter.state.read();
      if (state.revokedPeerIds?.includes(peerId)) return "revoked";
      return state.admittedPeerIds?.includes(peerId) ? "active" : "unknown";
    },
    async admit(peerId) {
      return adapter.state.transact((state) => {
        if (state.revokedPeerIds?.includes(peerId)) return { state, result: "revoked" as const };
        if (state.admittedPeerIds?.includes(peerId)) return { state, result: "already-active" as const };
        if (options.failAdmission?.()) throw new Error("storage_failed");
        return {
          state: { ...state, admittedPeerIds: [...(state.admittedPeerIds ?? []), peerId] },
          result: "admitted" as const,
        };
      });
    },
  };
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
    membership: { membershipStatus: async () => "unknown", admit: async () => "admitted" },
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
    membership: { membershipStatus: async () => "unknown", admit: async () => "admitted" },
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

async function expectPairingDecisionConformance(factory: AdapterFactory, capabilities: RuntimeCapabilities) {
  const initiatorHarness = createRuntimeConformanceHarness<Identity, State, PublicState>({
    capabilities,
    initialApplicationState: {},
    now: 1_000,
    getPublicState: async () => ({}),
  });
  const targetHarness = createRuntimeConformanceHarness<Identity, State, PublicState>({
    capabilities,
    initialApplicationState: {},
    now: 1_000,
    getPublicState: async () => ({}),
  });
  const paired = createAuthenticatedTransportPair(initiatorPeerId, targetPeerId);
  const initiatorAdapter = createAdapter(factory, capabilities, createStorage(), {
    clipboard: initiatorHarness.adapter.clipboard,
    notifications: initiatorHarness.adapter.notifications,
    lifecycle: initiatorHarness.adapter.lifecycle,
    network: paired.left,
    clock: initiatorHarness.adapter.clock,
    publicState: initiatorHarness.adapter.publicState,
  }, { admittedPeerIds: [initiatorPeerId], revokedPeerIds: [] });
  const targetStorage = createStorage();
  const targetAdapter = createAdapter(factory, capabilities, targetStorage, {
    clipboard: targetHarness.adapter.clipboard,
    notifications: targetHarness.adapter.notifications,
    lifecycle: targetHarness.adapter.lifecycle,
    network: paired.right,
    clock: targetHarness.adapter.clock,
    publicState: targetHarness.adapter.publicState,
  }, { admittedPeerIds: [targetPeerId], revokedPeerIds: [] });
  const initiatorMembership = createAdapterMembership(initiatorAdapter);
  const targetMembership = createAdapterMembership(targetAdapter);
  const coordinator = createPendingTrustRequestCoordinator({
    localPeerId: async () => targetPeerId,
    store: createKVPendingTrustRequestStore({ storage: targetStorage, key: "pairing-decisions" }),
    notifications: targetAdapter.notifications,
    lifecycle: targetAdapter.lifecycle,
    clock: targetAdapter.clock,
    verify: async () => true,
    membership: targetMembership,
    sendResponse: (peerId, frame) => targetAdapter.network.send(PAIRING_PROTOCOL, peerId, frame),
    responseIdentity: async () => ({ deviceName: "Desktop", nameRevision: 0n }),
  });
  const session = createPairingSession({
    identity: async () => ({ peerId: initiatorPeerId, deviceName: "Mobile", nameRevision: 1 }),
    send: (peerId, frame) => initiatorAdapter.network.send(PAIRING_PROTOCOL, peerId, frame),
    sign: async () => new Uint8Array([1]),
    verify: async () => true,
    membership: initiatorMembership,
    clock: initiatorAdapter.clock,
  });
  targetAdapter.network.onMessage(PAIRING_PROTOCOL, (from, frame) => coordinator.receive(from, frame) as unknown as void);
  initiatorAdapter.network.onMessage(PAIRING_PROTOCOL, (from, frame) => session.receiveResponse(from, frame) as unknown as void);
  await coordinator.start();

  await session.request(targetPeerId);
  const rejectedRequest = decodePairingFrame(paired.traffic[0].data);
  if (!rejectedRequest || rejectedRequest.kind !== "request") throw new Error("missing_request");
  await coordinator.decide(initiatorPeerId, "rejected");
  expect(await initiatorAdapter.state.read()).toEqual({ admittedPeerIds: [initiatorPeerId], revokedPeerIds: [] });
  expect(await targetAdapter.state.read()).toEqual({ admittedPeerIds: [targetPeerId], revokedPeerIds: [] });

  await session.request(targetPeerId);
  const acceptedRequest = decodePairingFrame(paired.traffic[2].data);
  if (!acceptedRequest || acceptedRequest.kind !== "request") throw new Error("missing_request");
  await coordinator.decide(initiatorPeerId, "accepted");
  expect(await initiatorAdapter.state.read()).toEqual({ admittedPeerIds: [initiatorPeerId, targetPeerId], revokedPeerIds: [] });
  expect(await targetAdapter.state.read()).toEqual({ admittedPeerIds: [targetPeerId, initiatorPeerId], revokedPeerIds: [] });
  expect(paired.traffic.every((entry) => entry.protocol === PAIRING_PROTOCOL)).toBe(true);
  const responses = paired.traffic.map((entry) => decodePairingFrame(entry.data)).filter((frame) => frame?.kind === "response");
  expect(responses.map((frame) => frame?.kind === "response" ? frame.response.decision : null)).toEqual(["rejected", "accepted"]);
  expect(responses[0]?.kind === "response" && responses[0].response.requestEnvelope).toEqual(rejectedRequest.envelope);
  expect(responses[1]?.kind === "response" && responses[1].response.requestEnvelope).toEqual(acceptedRequest.envelope);
}

async function expectPairingFailureConformance(factory: AdapterFactory, capabilities: RuntimeCapabilities) {
  const initiatorHarness = createRuntimeConformanceHarness<Identity, State, PublicState>({
    capabilities, initialApplicationState: {}, now: 1_000, getPublicState: async () => ({}),
  });
  const targetHarness = createRuntimeConformanceHarness<Identity, State, PublicState>({
    capabilities, initialApplicationState: {}, now: 1_000, getPublicState: async () => ({}),
  });
  const paired = createAuthenticatedTransportPair(initiatorPeerId, targetPeerId);
  const initiatorStorage = createStorage();
  const targetStorage = createStorage();
  const initiatorAdapter = createAdapter(factory, capabilities, initiatorStorage, {
    clipboard: initiatorHarness.adapter.clipboard,
    notifications: initiatorHarness.adapter.notifications,
    lifecycle: initiatorHarness.adapter.lifecycle,
    network: paired.left,
    clock: initiatorHarness.adapter.clock,
    publicState: initiatorHarness.adapter.publicState,
  }, { admittedPeerIds: [initiatorPeerId], revokedPeerIds: [] });
  const targetAdapter = createAdapter(factory, capabilities, targetStorage, {
    clipboard: targetHarness.adapter.clipboard,
    notifications: targetHarness.adapter.notifications,
    lifecycle: targetHarness.adapter.lifecycle,
    network: paired.right,
    clock: targetHarness.adapter.clock,
    publicState: targetHarness.adapter.publicState,
  }, { admittedPeerIds: [targetPeerId], revokedPeerIds: [] });
  let failTargetAdmission = true;
  const initiatorMembership = createAdapterMembership(initiatorAdapter);
  const targetMembership = createAdapterMembership(targetAdapter, { failAdmission: () => failTargetAdmission });
  const store = createKVPendingTrustRequestStore({ storage: targetStorage, key: "pairing-failures" });
  const coordinator = createPendingTrustRequestCoordinator({
    localPeerId: async () => targetPeerId,
    store,
    notifications: targetAdapter.notifications,
    lifecycle: targetAdapter.lifecycle,
    clock: targetAdapter.clock,
    verify: async () => true,
    membership: targetMembership,
    sendResponse: (peerId, frame) => targetAdapter.network.send(PAIRING_PROTOCOL, peerId, frame),
    responseIdentity: async () => ({ deviceName: "Desktop", nameRevision: 0n }),
  });
  const session = createPairingSession({
    identity: async () => ({ peerId: initiatorPeerId, deviceName: "Mobile", nameRevision: 1 }),
    send: (peerId, frame) => initiatorAdapter.network.send(PAIRING_PROTOCOL, peerId, frame),
    sign: async () => new Uint8Array([1]),
    verify: async () => true,
    membership: initiatorMembership,
    clock: initiatorAdapter.clock,
  });
  targetAdapter.network.onMessage(PAIRING_PROTOCOL, (from, frame) => coordinator.receive(from, frame) as unknown as void);
  initiatorAdapter.network.onMessage(PAIRING_PROTOCOL, (from, frame) => session.receiveResponse(from, frame) as unknown as void);
  await coordinator.start();

  await session.request(targetPeerId);
  await expect(coordinator.decide(initiatorPeerId, "accepted")).rejects.toThrow("storage_failed");
  expect(await targetAdapter.state.read()).toEqual({ admittedPeerIds: [targetPeerId], revokedPeerIds: [] });
  await expect(store.list()).resolves.toHaveLength(1);
  expect(paired.traffic).toHaveLength(1);

  failTargetAdmission = false;
  paired.block("right");
  await expect(coordinator.decide(initiatorPeerId, "accepted")).resolves.toBe(true);
  expect(await targetMembership.membershipStatus(initiatorPeerId)).toBe("active");
  expect(await initiatorMembership.membershipStatus(targetPeerId)).toBe("unknown");
  await expect(store.list()).resolves.toEqual([]);

  paired.unblock("right");
  await session.request(targetPeerId);
  expect(await initiatorMembership.membershipStatus(targetPeerId)).toBe("active");

  await initiatorAdapter.state.transact((state) => ({
    state: { ...state, revokedPeerIds: [...(state.revokedPeerIds ?? []), targetPeerId] },
    result: undefined,
  }));
  await session.request(targetPeerId);
  expect(await initiatorMembership.membershipStatus(targetPeerId)).toBe("revoked");
  expect(session.waiting()).toHaveLength(1);
}

describe("Pairing runtime-adapter conformance", () => {
  it.each([
    ["electron", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron],
    ["android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android],
    ["chrome-extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension],
  ] as const)("supports Pairing import and durable approval lifecycle on %s", async (_name, factory, capabilities) => {
    await expectPairingConformance(factory as AdapterFactory, capabilities);
  });

  it.each([
    ["electron", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron],
    ["android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android],
    ["chrome-extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension],
  ] as const)("commits accepted Pairing and leaves rejected Pairing unchanged on %s", async (_name, factory, capabilities) => {
    await expectPairingDecisionConformance(factory as AdapterFactory, capabilities);
  });

  it.each([
    ["electron", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron],
    ["android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android],
    ["chrome-extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension],
  ] as const)("preserves durable Pairing semantics across storage, delivery, and revocation failures on %s", async (_name, factory, capabilities) => {
    await expectPairingFailureConformance(factory as AdapterFactory, capabilities);
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
