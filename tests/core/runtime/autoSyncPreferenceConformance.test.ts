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
import { openDatabase, SQLiteKVStore } from "../../../apps/electron/src/storage";
import {
  ChromeStorageBackend,
  type ChromeStorageArea,
} from "../../../apps/extension/src/chromeStorage";
import {
  LocalStorageBackend,
  type CapacitorPreferencesStore,
} from "../../../apps/android/src/storage";

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

describe("Auto Sync runtime backend persistence", () => {
  const sqliteBindingAvailable = (() => {
    try {
      const database = openDatabase(":memory:");
      database.close();
      return true;
    } catch (error) {
      if (String(error).includes("NODE_MODULE_VERSION")) return false;
      throw error;
    }
  })();
  const itWithSQLite = sqliteBindingAvailable ? it : it.skip;

  itWithSQLite("survives Electron SQLite restart and identity replacement", async () => {
    const database = openDatabase(":memory:");
    try {
      await expectPreferenceSurvivesIdentityReplacement(
        createElectronRuntimeAdapter,
        RUNTIME_CAPABILITIES.electron,
        new SQLiteKVStore(database),
        () => new SQLiteKVStore(database),
      );
    } finally {
      database.close();
    }
  });

  it("survives Chrome storage restart and identity replacement", async () => {
    const values = new Map<string, unknown>();
    const storageArea = chromeStorageArea(values);
    await expectPreferenceSurvivesIdentityReplacement(
      createChromeExtensionRuntimeAdapter,
      RUNTIME_CAPABILITIES.chromeExtension,
      new ChromeStorageBackend(storageArea),
      () => new ChromeStorageBackend(storageArea),
    );
  });

  it("survives Capacitor Preferences restart and identity replacement", async () => {
    const values = new Map<string, string>();
    const preferences: CapacitorPreferencesStore = {
      get: async ({ key }) => ({ value: values.get(key) ?? null }),
      set: async ({ key, value }) => { values.set(key, value); },
      remove: async ({ key }) => { values.delete(key); },
    };
    const prefix = "auto-sync-conformance:";
    await expectPreferenceSurvivesIdentityReplacement(
      createAndroidRuntimeAdapter,
      RUNTIME_CAPABILITIES.android,
      new LocalStorageBackend(prefix, preferences),
      () => new LocalStorageBackend(prefix, preferences),
    );
  });

  it("does not publish a preference whose durable write failed", async () => {
    const values = new Map<string, unknown>();
    const storageArea = chromeStorageArea(values);
    storageArea.set = (_items, callback) => { callback(); };
    const preference = createAutoSyncPreference({ storage: new ChromeStorageBackend(
      storageArea,
      () => "preference_persistence_failed",
    ) });

    await expect(preference.set(false)).rejects.toThrow("preference_persistence_failed");
    expect(values.has("autoSync")).toBe(false);
  });
});

async function expectPreferenceSurvivesIdentityReplacement(
  factory: AdapterFactory,
  capabilities: (typeof RUNTIME_CAPABILITIES)[keyof typeof RUNTIME_CAPABILITIES],
  storage: KVStorageBackend,
  restartStorage: () => KVStorageBackend,
): Promise<void> {
  const first = createAdapter(factory, capabilities, storage);
  const preference = createAutoSyncPreference({ storage });
  await first.identity.save({ deviceId: "old-identity" });
  await preference.set(false);

  await first.identity.clear();
  await first.identity.save({ deviceId: "replacement-identity" });

  const restartedStorage = restartStorage();
  const restarted = createAdapter(factory, capabilities, restartedStorage);
  expect(await restarted.identity.load()).toEqual({ deviceId: "replacement-identity" });
  await expect(createAutoSyncPreference({ storage: restartedStorage }).load()).resolves.toBe(false);
}

function chromeStorageArea(values: Map<string, unknown>): ChromeStorageArea {
  return {
    get(keys: string[], callback: (result: Record<string, unknown>) => void) {
      callback(Object.fromEntries(keys
        .filter((key) => values.has(key))
        .map((key) => [key, structuredClone(values.get(key))])));
    },
    set(items: Record<string, unknown>, callback: () => void) {
      for (const [key, value] of Object.entries(items)) values.set(key, structuredClone(value));
      callback();
    },
    remove(key: string, callback: () => void) {
      values.delete(key);
      callback();
    },
  };
}

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
