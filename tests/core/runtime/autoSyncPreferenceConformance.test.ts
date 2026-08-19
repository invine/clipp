import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeConformanceHarness,
  RUNTIME_CAPABILITIES,
} from "../../../packages/core/runtime";
import {
  createAutoSyncPreference,
  type AutoSyncPreference,
} from "../../../packages/core/runtime/autoSyncPreference";
import type { KVStorageBackend } from "../../../packages/core/trust";

type Identity = { deviceId: string };
type EmptyState = Record<string, never>;
type AdapterFactory = typeof createElectronRuntimeAdapter<Identity, EmptyState, EmptyState>;

describe.each([
  ["Desktop", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron],
  ["Mobile", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android],
  ["Extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension],
] as const)("%s Auto Sync preference", (_name, factory, capabilities) => {
  it("defaults enabled and survives identity replacement plus runtime restart", async () => {
    const values = new Map<string, unknown>();
    const storage: KVStorageBackend = {
      get: async <Value>(key: string) => structuredClone(values.get(key)) as Value | undefined,
      set: async <Value>(key: string, value: Value) => { values.set(key, structuredClone(value)); },
      remove: async (key: string) => { values.delete(key); },
    };
    const first = createAdapter(factory as AdapterFactory, capabilities, storage);
    const firstPreference = createAutoSyncPreference({ storage });

    expect(await firstPreference.load()).toBe(true);
    await first.identity.save({ deviceId: "old-identity" });
    expect(await firstPreference.set(false)).toBe(false);
    await first.identity.clear();
    await first.identity.save({ deviceId: "replacement-identity" });

    const restarted = createAdapter(factory as AdapterFactory, capabilities, storage);
    const restartedPreference: AutoSyncPreference = createAutoSyncPreference({ storage });
    expect(await restarted.identity.load()).toEqual({ deviceId: "replacement-identity" });
    expect(await restartedPreference.load()).toBe(false);
  });
});

function createAdapter(
  factory: AdapterFactory,
  capabilities: (typeof RUNTIME_CAPABILITIES)[keyof typeof RUNTIME_CAPABILITIES],
  storage: KVStorageBackend,
) {
  const harness = createRuntimeConformanceHarness<Identity, EmptyState, EmptyState>({
    capabilities,
    initialIdentity: { deviceId: "initial" },
    initialApplicationState: {},
    initialClipboardText: "",
    getPublicState: async () => ({}),
  });
  return factory({
    storage,
    identityKey: "identity",
    applicationStateKey: "application-state",
    initialApplicationState: () => ({}),
    clipboard: harness.adapter.clipboard,
    notifications: harness.adapter.notifications,
    lifecycle: harness.adapter.lifecycle,
    network: harness.adapter.network,
    clock: harness.adapter.clock,
    publicState: harness.adapter.publicState,
    relays: {
      readAddresses: async () => [],
      ...(capabilities.relayConfiguration === "editable"
        ? { updateAddresses: async (addresses: string[]) => addresses }
        : {}),
    },
  });
}
