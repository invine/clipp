import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeClipboardService,
  createRuntimeConformanceHarness,
  createRuntimeOrchestrator,
} from "../../../packages/core/runtime";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import type {
  RuntimeAdapter,
  RuntimeAdapterPorts,
  RuntimeCapabilities,
} from "../../../packages/core/runtime";

type ConformanceIdentity = { deviceId: string };
type ConformanceState = { launches: number };
type ConformancePublicState = { launches: number };
type AdapterFactory = (
  ports: RuntimeAdapterPorts<ConformanceIdentity, ConformanceState, ConformancePublicState>
) => RuntimeAdapter<ConformanceIdentity, ConformanceState, ConformancePublicState>;

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
  const { capabilities: _fakeCapabilities, ...ports } = harness.adapter;
  const adapter = factory(ports);
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
    }],
    ["android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android, {
      platform: "android",
      clipboardCapture: "polling",
      relayConfiguration: "fixed",
      pinPersistence: "durable",
      notificationApi: "capacitor",
      postRotationClipboardCapture: "baseline-current",
    }],
    ["chrome-extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension, {
      platform: "chrome-extension",
      clipboardCapture: "explicit-input",
      relayConfiguration: "fixed",
      pinPersistence: "session",
      notificationApi: "chrome",
      postRotationClipboardCapture: "deferred",
    }],
  ] as const)("conforms the %s runtime adapter", async (_platform, factory, capabilities, expected) => {
    await expectAdapterConformance(factory as AdapterFactory, capabilities, expected);
  });
});
