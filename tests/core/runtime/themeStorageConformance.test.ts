import { createSettingsHandler } from "../../../packages/core/runtime/settingsAuthority";
import {
  LocalStorageBackend,
  type CapacitorPreferencesStore,
} from "../../../apps/android/src/storage";
import {
  ChromeStorageBackend,
  type ChromeStorageArea,
} from "../../../apps/extension/src/chromeStorage";
import {
  openDatabase,
  SQLiteKVStore,
} from "../../../apps/electron/src/storage";
import type { KVStorageBackend } from "../../../packages/core/trust";

function owner(storage: KVStorageBackend) {
  return createSettingsHandler({
    storage,
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async () => {},
  });
}
const adapters = {
  Electron: () => {
    const db = openDatabase(":memory:");
    return { make: () => new SQLiteKVStore(db), close: () => db.close() };
  },
  Android: () => {
    const values = new Map<string, string>();
    const preferences: CapacitorPreferencesStore = {
      get: async ({ key }) => ({ value: values.get(key) ?? null }),
      set: async ({ key, value }) => {
        values.set(key, value);
      },
      remove: async ({ key }) => {
        values.delete(key);
      },
    };
    return {
      make: () => new LocalStorageBackend("theme-conformance:", preferences),
      close: () => {},
    };
  },
  Chrome: () => {
    const values: Record<string, unknown> = {};
    const area: ChromeStorageArea = {
      get: (_keys, callback) => callback({ ...values }),
      set: (patch, callback) => {
        Object.assign(values, patch);
        callback();
      },
      remove: (key, callback) => {
        delete values[key];
        callback();
      },
    };
    return { make: () => new ChromeStorageBackend(area), close: () => {} };
  },
};

describe.each(Object.entries(adapters))(
  "%s installation appearance",
  (_name, adapter) => {
    it("reopens the applied preference through the actual runtime store and ignores invalid stored values", async () => {
      const fixture = adapter();
      try {
        const first = owner(fixture.make());
        expect((await first.read()).state.theme).toBe("system");
        expect(await first.write({ theme: "dark" })).toMatchObject({
          status: "applied",
        });
        expect((await owner(fixture.make()).read()).state.theme).toBe("dark");
        await fixture.make().set("theme", "sepia");
        expect((await owner(fixture.make()).read()).state.theme).toBe("system");
      } finally {
        fixture.close();
      }
    });
  }
);

it("rejects an Android theme save when only volatile fallback is available", async () => {
  const preferences: CapacitorPreferencesStore = {
    get: async () => ({ value: null }),
    set: async () => {
      throw new Error("native_store_denied");
    },
    remove: async () => {},
  };
  const make = () => new LocalStorageBackend("theme-failure:", preferences);
  expect(await owner(make()).write({ theme: "dark" })).toMatchObject({
    status: "rejected",
    snapshot: { state: { theme: "system" } },
  });
  expect((await owner(make()).read()).state.theme).toBe("system");
  expect(await owner(make()).write({ autoSync: false })).toMatchObject({
    status: "applied",
    snapshot: { state: { autoSync: false } },
  });
});

it("reopens Android theme through the existing web fallback when native Preferences is unavailable", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  });
  const preferences: CapacitorPreferencesStore = {
    get: async () => {
      throw new Error("native_unavailable");
    },
    set: async () => {
      throw new Error("native_unavailable");
    },
    remove: async () => {},
  };
  try {
    const make = () =>
      new LocalStorageBackend("theme-web-fallback:", preferences);
    expect(await owner(make()).write({ theme: "light" })).toMatchObject({
      status: "applied",
    });
    expect((await owner(make()).read()).state.theme).toBe("light");
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe.each(Object.entries(adapters))(
  "%s Clip Sharing Lifetime installation persistence",
  (_name, adapter) => {
    it("reopens custom lifetime and rejects unsupported durations through the actual adapter", async () => {
      const fixture = adapter();
      try {
        const first = owner(fixture.make());
        expect((await first.read()).state.sharingLifetimeMs).toBe(86400000);
        expect(await first.write({ sharingLifetimeMs: 5001 })).toMatchObject({
          status: "applied",
        });
        expect(
          (await owner(fixture.make()).read()).state.sharingLifetimeMs
        ).toBe(5001);
        expect(
          await first.write({ sharingLifetimeMs: 2592000000 })
        ).toMatchObject({ status: "applied" });
        for (const value of [0, -1, 1.5, 2592000001]) {
          expect(await first.write({ sharingLifetimeMs: value })).toMatchObject(
            { status: "rejected" }
          );
          expect((await first.read()).state.sharingLifetimeMs).toBe(2592000000);
        }
        await fixture.make().set("sharingLifetimeMs", "forever");
        expect(
          (await owner(fixture.make()).read()).state.sharingLifetimeMs
        ).toBe(86400000);
      } finally {
        fixture.close();
      }
    });
  }
);

it("does not confirm Android Clip Sharing Lifetime in volatile fallback storage", async () => {
  const preferences: CapacitorPreferencesStore = {
    get: async () => ({ value: null }),
    set: async () => {
      throw new Error("native_store_denied");
    },
    remove: async () => {},
  };
  const settings = owner(
    new LocalStorageBackend("sharing-failure:", preferences)
  );
  expect(await settings.write({ sharingLifetimeMs: 5001 })).toMatchObject({
    status: "rejected",
    snapshot: { state: { sharingLifetimeMs: 86400000 } },
  });
});

it("shows Android applied retention and committed cleanup when durable preference saving is unavailable", async () => {
  const { createLocalRetentionPreference } =
    await import("../../../packages/core/runtime/localRetentionPreference");
  const { MemoryHistoryStore } =
    await import("../../../packages/core/history/store");
  const preferences: CapacitorPreferencesStore = {
    get: async () => ({ value: null }),
    set: async () => {
      throw new Error("native_store_denied");
    },
    remove: async () => {},
  };
  const storage = new LocalStorageBackend("retention-failure:", preferences);
  const history = new MemoryHistoryStore(undefined, { now: () => 1000 });
  const retention = createLocalRetentionPreference({
    storage,
    history,
    publish: async () => {},
  });
  const settings = createSettingsHandler({
    storage,
    retention,
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async () => {},
  });
  await settings.read();
  await history.accept({
    id: "00000000-0000-4000-8000-000000000951",
    type: "text",
    content: "local",
    originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
    capturedAt: 1000,
    shareExpiresAt: 86401000,
  });
  expect(await settings.write({ localRetentionMs: 0 })).toMatchObject({
    status: "partial",
    snapshot: {
      state: {
        localRetentionMs: 0,
        retentionError: "preference_persistence_unavailable",
      },
    },
  });
  expect(await history.exportAll()).toEqual([]);
});
