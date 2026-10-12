import {
  LocalStorageBackend,
  type CapacitorPreferencesStore,
} from "../../apps/android/src/storage";
import { createSettingsHandler } from "../../packages/core/runtime/settingsAuthority";
import { createLocalRetentionPreference } from "../../packages/core/runtime/localRetentionPreference";
import { MemoryHistoryStore } from "../../packages/core/history/store";

async function fixture(
  run: (
    // eslint-disable-next-line no-unused-vars
    preferences: CapacitorPreferencesStore,
    // eslint-disable-next-line no-unused-vars
    recover: () => void
  ) => Promise<void>
) {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const web = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => web.get(key) ?? null,
      setItem: (key: string, value: string) => {
        web.set(key, value);
      },
      removeItem: (key: string) => {
        web.delete(key);
      },
    },
  });
  const native = new Map<string, string>();
  let writable = false;
  const preferences: CapacitorPreferencesStore = {
    get: async ({ key }) => ({ value: native.get(key) ?? null }),
    set: async ({ key, value }) => {
      if (!writable) throw new Error("native_write_failed");
      native.set(key, value);
    },
    remove: async () => {},
  };
  try {
    await run(preferences, () => {
      writable = true;
    });
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

/** Fixture for the prior adapter's actual durable fallback policy: native null, failed native set, web set/read. */
function previousAdapter(
  prefix: string,
  preferences: CapacitorPreferencesStore
) {
  return {
    set: async <T>(key: string, value: T) => {
      try {
        await preferences.set({
          key: prefix + key,
          value: JSON.stringify(value),
        });
      } catch {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      }
    },
    get: async <T>(key: string): Promise<T | undefined> => {
      const native = (await preferences.get({ key: prefix + key })).value;
      const raw = native ?? localStorage.getItem(prefix + key);
      return raw === null ? undefined : JSON.parse(raw);
    },
  };
}

it.each([0, 1250.5])(
  "preserves legacy accepted retention %s and theme through upgrade/reopen and a failed new write",
  async (value) => {
    await fixture(async (preferences, recover) => {
      const legacy = previousAdapter("upgrade:", preferences);
      await legacy.set("localRetentionMs", value);
      await legacy.set("theme", "dark");
      expect(await legacy.get("localRetentionMs")).toBe(value);
      const make = () => {
        const storage = new LocalStorageBackend("upgrade:", preferences);
        const retention = createLocalRetentionPreference({
          storage,
          history: new MemoryHistoryStore(),
          publish: async () => {},
        });
        return {
          storage,
          settings: createSettingsHandler({
            storage,
            retention,
            applyAutoSync: () => {},
            applyLogLevel: () => {},
            publish: async () => {},
          }),
        };
      };
      const first = make();
      expect((await first.settings.read()).state).toMatchObject({
        localRetentionMs: value,
        theme: "dark",
      });
      expect(
        await first.settings.write({ localRetentionMs: 7003 })
      ).toMatchObject({
        status: "partial",
        snapshot: { state: { localRetentionMs: 7003 } },
      });
      expect((await make().settings.read()).state).toMatchObject({
        localRetentionMs: value,
        theme: "dark",
      });
      recover();
      expect(
        await first.settings.write({ localRetentionMs: 7003, theme: "light" })
      ).toMatchObject({ status: "applied" });
      expect((await make().settings.read()).state).toMatchObject({
        localRetentionMs: 7003,
        theme: "light",
      });
    });
  }
);

it("binds a successful native preference and refuses stale fallback after native read failure", async () => {
  await fixture(async (preferences, recover) => {
    const legacy = previousAdapter("binding:", preferences);
    await legacy.set("sharingLifetimeMs", 5001);
    const storage = new LocalStorageBackend("binding:", preferences);
    expect(await storage.get("sharingLifetimeMs")).toBe(5001);
    await expect(storage.set("sharingLifetimeMs", 7003)).rejects.toThrow(
      "preference_persistence_unavailable"
    );
    expect(
      await new LocalStorageBackend("binding:", preferences).get(
        "sharingLifetimeMs"
      )
    ).toBe(5001);
    recover();
    await storage.set("sharingLifetimeMs", 7003);
    expect(await storage.get("sharingLifetimeMs")).toBe(7003);
    const read = preferences.get;
    preferences.get = async () => {
      throw new Error("native_read_failed");
    };
    await expect(storage.get("sharingLifetimeMs")).rejects.toThrow(
      "preference_read_unavailable"
    );
    preferences.get = read;
    expect(await storage.get("sharingLifetimeMs")).toBe(7003);
    expect(
      await new LocalStorageBackend("binding:", preferences).get(
        "sharingLifetimeMs"
      )
    ).toBe(7003);
  });
});

it("keeps an existing non-null native value ahead of accepted old fallback data", async () => {
  await fixture(async (preferences, recover) => {
    const legacy = previousAdapter("native-wins:", preferences);
    await legacy.set("localRetentionMs", 0);
    recover();
    await preferences.set({
      key: "native-wins:localRetentionMs",
      value: "7003",
    });
    expect(
      await new LocalStorageBackend("native-wins:", preferences).get(
        "localRetentionMs"
      )
    ).toBe(7003);
  });
});
