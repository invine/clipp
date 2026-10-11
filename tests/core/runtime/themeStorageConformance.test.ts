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
