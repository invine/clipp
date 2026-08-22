import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeClipboardService,
  createRuntimeConformanceHarness,
  createRuntimeOrchestrator,
} from "../../../packages/core/runtime";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { HistoryPolicyError } from "../../../packages/core/history/types";
import type {
  RuntimeAdapter,
  RuntimePlatformAdapterDependencies,
  RuntimeCapabilities,
} from "../../../packages/core/runtime";

type ConformanceIdentity = { deviceId: string };
type ConformanceState = { launches: number };
type ConformancePublicState = { launches: number };
type AdapterFactory = typeof createElectronRuntimeAdapter<
  ConformanceIdentity,
  ConformanceState,
  ConformancePublicState
>;

async function expectAdapterConformance(
  factory: AdapterFactory,
  capabilities: RuntimeCapabilities,
  expected: RuntimeCapabilities
) {
  const harness = createRuntimeConformanceHarness<
    ConformanceIdentity,
    ConformanceState,
    ConformancePublicState
  >({
    capabilities,
    initialIdentity: { deviceId: "device-a" },
    initialApplicationState: { launches: 0 },
    initialClipboardText: "captured text",
    getPublicState: async ({ state }) => ({ launches: (await state.read()).launches }),
  });
  const durable = new Map<string, unknown>([
    ["identity", { deviceId: "device-a" }],
    ["application-state", { launches: 0 }],
  ]);
  const storage = {
    get: async <Value>(key: string) => durable.get(key) as Value | undefined,
    set: async <Value>(key: string, value: Value) => {
      durable.set(key, structuredClone(value));
    },
    remove: async (key: string) => {
      durable.delete(key);
    },
  };
  const nativePorts: Pick<
    RuntimePlatformAdapterDependencies<
      ConformanceIdentity,
      ConformanceState,
      ConformancePublicState
    >,
    "clipboard" | "notifications" | "lifecycle" | "network" | "clock"
  > = {
    clipboard: harness.adapter.clipboard,
    notifications: harness.adapter.notifications,
    lifecycle: harness.adapter.lifecycle,
    network: harness.adapter.network,
    clock: harness.adapter.clock,
  };
  let relayAddresses = ["/dns4/relay.example.com/tcp/443/wss/p2p/relay"];
  const updateRelayAddresses = jest.fn(async (addresses: string[]) => {
    relayAddresses = [...addresses];
    return relayAddresses;
  });
  let adapter!: RuntimeAdapter<ConformanceIdentity, ConformanceState, ConformancePublicState>;
  adapter = factory({
    ...nativePorts,
    storage,
    identityKey: "identity",
    applicationStateKey: "application-state",
    initialApplicationState: () => ({ launches: 0 }),
    publicState: {
      read: async () => ({ launches: (await adapter.state.read()).launches }),
      publish: harness.adapter.publicState.publish,
    },
    relays: {
      readAddresses: async () => relayAddresses,
      updateAddresses: updateRelayAddresses,
    },
  });
  let selectedNotification: string | null = null;
  let shutdown = false;
  adapter.notifications.onSelect((id) => {
    selectedNotification = id;
  });
  adapter.lifecycle.onShutdown(() => {
    shutdown = true;
  });

  await adapter.state.transact((state) => ({
    state: { launches: state.launches + 1 },
    result: undefined,
  }));
  await adapter.notifications.show({ id: "notice", title: "Notice", body: "Body" });
  await adapter.network.send("/clipp/conformance/1.0.0", "device-b", new Uint8Array([1]));
  await adapter.publicState.publish(await adapter.publicState.read());
  await harness.selectNotification("notice");
  await harness.shutdown();

  const readText = jest.fn(adapter.clipboard.readText);
  const clipboard = createRuntimeClipboardService({
    capabilities: adapter.capabilities,
    getSenderId: () => "device-a",
    readText,
    writeText: adapter.clipboard.writeText,
    pollIntervalMs: 60_000,
  });
  clipboard.start();
  await new Promise((resolve) => setImmediate(resolve));
  clipboard.stop();

  expect(adapter.capabilities).toEqual(expected);
  expect(adapter.relays.mode).toBe(expected.relayConfiguration);
  expect(await adapter.relays.readAddresses()).toEqual(relayAddresses);
  if (adapter.relays.mode === "editable") {
    await adapter.relays.updateAddresses(["/dns4/new-relay.example.com/tcp/443/wss/p2p/relay"]);
    expect(updateRelayAddresses).toHaveBeenCalledTimes(1);
  } else {
    expect("updateAddresses" in adapter.relays).toBe(false);
    expect(updateRelayAddresses).not.toHaveBeenCalled();
  }
  expect(await adapter.identity.load()).toEqual({ deviceId: "device-a" });
  expect(await adapter.state.read()).toEqual({ launches: 1 });
  expect(harness.observed.notifications).toHaveLength(1);
  expect(harness.observed.protocolTraffic).toHaveLength(1);
  expect(harness.observed.publicStates).toEqual([{ launches: 1 }]);
  expect(selectedNotification).toBe("notice");
  expect(shutdown).toBe(true);
  expect(readText).toHaveBeenCalledTimes(
    adapter.capabilities.clipboardCapture === "polling" ? 1 : 0
  );
}

describe("shared runtime seam", () => {
  it("publishes pending history failures until durable storage recovers", async () => {
    let storageAvailable = false;
    const historyErrors: Array<string | null> = [];
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      makeId: (() => {
        let id = 0;
        return () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`;
      })(),
      history: {
        accept: async (clip) => {
          if (!storageAvailable) throw new Error("storage unavailable");
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
      onHistoryErrorChanged: (error) => {
        historyErrors.push(error);
      },
    });
    clipboard.start();

    await clipboard.processLocalText?.("queued");
    clipboard.dismissHistoryError?.();
    expect(historyErrors).toEqual(["pending_capture_failed"]);
    storageAvailable = true;
    await clipboard.processLocalText?.("stored");

    expect(historyErrors).toEqual(["pending_capture_failed", null]);
    await clipboard.stop();
  });

  it("publishes a content-free error when a Clip exceeds local capacity", async () => {
    const historyErrors: Array<string | null> = [];
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      makeId: () => "00000000-0000-4000-8000-000000000099",
      history: {
        accept: async () => {
          throw new HistoryPolicyError("clip_capacity");
        },
      },
      onHistoryErrorChanged: (error) => {
        historyErrors.push(error);
      },
    });
    clipboard.start();

    await clipboard.processLocalText?.("secret clipboard content");

    expect(historyErrors).toEqual(["clip_too_large"]);
    expect(JSON.stringify(historyErrors)).not.toContain("secret clipboard content");
    clipboard.dismissHistoryError?.();
    expect(historyErrors).toEqual(["clip_too_large", null]);
    await clipboard.stop();
  });

  it("keeps a pending-storage error visible when a later oversized candidate is dropped", async () => {
    const historyErrors: Array<string | null> = [];
    let nextId = 200;
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      pendingMaxBytes: 500,
      history: { accept: async () => { throw new Error("storage unavailable"); } },
      onHistoryErrorChanged: (error) => { historyErrors.push(error); },
    });
    clipboard.start();

    await clipboard.processLocalText("queued");
    await clipboard.processLocalText("x".repeat(1_000));
    clipboard.dismissHistoryError?.();

    expect(historyErrors).toEqual([
      "pending_capture_failed",
      "pending_capture_failed",
    ]);
    await clipboard.stop();
  });

  it("keeps a pending-storage error visible when a later Clip exceeds history capacity", async () => {
    const historyErrors: Array<string | null> = [];
    let accepts = 0;
    let nextId = 210;
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      history: {
        accept: async () => {
          accepts += 1;
          if (accepts >= 3) throw new HistoryPolicyError("clip_capacity");
          throw new Error("storage unavailable");
        },
      },
      onHistoryErrorChanged: (error) => { historyErrors.push(error); },
    });
    clipboard.start();

    await clipboard.processLocalText("queued");
    await clipboard.processLocalText("too large for history");
    clipboard.dismissHistoryError?.();

    expect(historyErrors).toEqual([
      "pending_capture_failed",
      "pending_capture_failed",
    ]);
    await clipboard.stop();
  });

  it("distinguishes an oversized pending candidate when no older capture is queued", async () => {
    const historyErrors: Array<string | null> = [];
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      makeId: () => "00000000-0000-4000-8000-000000000220",
      pendingMaxBytes: 1,
      history: { accept: async () => { throw new Error("storage unavailable"); } },
      onHistoryErrorChanged: (error) => { historyErrors.push(error); },
    });
    clipboard.start();

    await clipboard.processLocalText("too large for pending storage");

    expect(historyErrors).toEqual(["pending_capture_too_large"]);
    await clipboard.stop();
  });

  it("assembles orchestration with observable runtime adapters", async () => {
    const received: Array<{ from: string; data: Uint8Array }> = [];
    const harness = createRuntimeConformanceHarness({
      capabilities: RUNTIME_CAPABILITIES.electron,
      initialApplicationState: { launches: 0 },
      initialIdentity: { deviceId: "device-a" },
      getPublicState: async ({ state, identity }) => ({
        launches: (await state.read()).launches,
        deviceId: (await identity.load())?.deviceId ?? null,
      }),
    });
    const runtime = createRuntimeOrchestrator({
      adapter: harness.adapter,
      start: async (runtimeContext) => {
        runtimeContext.notifications.onSelect(() => runtimeContext.lifecycle.openApprovalView());
        runtimeContext.network.onMessage("/clipp/test/1.0.0", (from, data) => {
          received.push({ from, data });
        });
        await runtimeContext.state.transact((current) => ({
          state: { launches: current.launches + 1 },
          result: undefined,
        }));
        await runtimeContext.clipboard.writeText("remote clip");
        await runtimeContext.network.send("/clipp/test/1.0.0", "device-b", new Uint8Array([1, 2]));
        await runtimeContext.notifications.show({
          id: "pairing-device-b",
          title: "Pairing request",
          body: "Device B wants to pair.",
        });
      },
    });
    let timerFired = false;
    runtime.context().clock.setTimeout(() => {
      timerFired = true;
    }, 500);

    await runtime.start();
    harness.advanceTimeBy(499);
    expect(timerFired).toBe(false);
    harness.advanceTimeBy(1);
    expect(timerFired).toBe(true);

    expect(harness.observed.clipboardWrites).toEqual(["remote clip"]);
    expect(harness.observed.protocolTraffic).toEqual([
      {
        protocol: "/clipp/test/1.0.0",
        target: "device-b",
        data: new Uint8Array([1, 2]),
      },
    ]);
    expect(harness.observed.notifications).toEqual([
      expect.objectContaining({ id: "pairing-device-b" }),
    ]);
    await harness.selectNotification("pairing-device-b");
    expect(harness.observed.approvalViewsOpened).toBe(1);
    harness.receiveProtocol("/clipp/test/1.0.0", "device-b", new Uint8Array([3, 4]));
    expect(received).toEqual([{ from: "device-b", data: new Uint8Array([3, 4]) }]);
    expect(harness.observed.publicStates).toEqual([
      { launches: 1, deviceId: "device-a" },
    ]);
    expect(await harness.restart().adapter.state.read()).toEqual({ launches: 1 });

    await harness.shutdown();
    expect(runtime.status()).toBe("stopped");
  });

  it.each([
    ["electron", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron, {
      platform: "electron",
      clipboardCapture: "polling",
      relayConfiguration: "editable",
      pinPersistence: "durable",
      notificationApi: "electron",
      postRotationClipboardCapture: "baseline-current",
      liveClipboardApplicationRecovery: "none",
    }],
    ["android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android, {
      platform: "android",
      clipboardCapture: "polling",
      relayConfiguration: "fixed",
      pinPersistence: "durable",
      notificationApi: "capacitor",
      postRotationClipboardCapture: "baseline-current",
      liveClipboardApplicationRecovery: "one-resume-retry",
    }],
    ["chrome-extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension, {
      platform: "chrome-extension",
      clipboardCapture: "explicit-input",
      relayConfiguration: "fixed",
      pinPersistence: "session",
      notificationApi: "chrome",
      postRotationClipboardCapture: "deferred",
      liveClipboardApplicationRecovery: "none",
    }],
  ] as const)("conforms the %s runtime adapter", async (_platform, factory, capabilities, expected) => {
    await expectAdapterConformance(factory as AdapterFactory, capabilities, expected);
  });
});
