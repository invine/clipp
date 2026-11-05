import {
  performAutoSyncAction,
  performAutoSyncSettingsAction,
} from "../../../packages/core/runtime/autoSyncAction";
import { createSettingsHandler } from "../../../packages/core/runtime/settingsAuthority";

it("orders the dedicated action behind generic settings writes on one authority", async () => {
  const persisted = new Map<string, unknown>();
  let current = true;
  let liveExchange = true;
  let historyReconciliation = true;
  const applied: boolean[] = [];
  let beginFirstWrite!: () => void;
  let releaseFirstWrite!: () => void;
  const firstWriteStarted = new Promise<void>((resolve) => {
    beginFirstWrite = resolve;
  });
  const holdFirstWrite = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  const settings = createSettingsHandler({
    storage: {
      get: async <T>(key: string) => persisted.get(key) as T | undefined,
      set: async (key, value) => {
        if (key === "autoSync" && value === false) {
          beginFirstWrite();
          await holdFirstWrite;
        }
        persisted.set(key, value);
      },
    },
    applyAutoSync: (value) => {
      current = value;
      liveExchange = value;
      historyReconciliation = value;
      applied.push(value);
    },
    applyLogLevel: () => {},
    publish: async () => {},
  });
  await settings.read();

  const genericWrite = settings.write({ autoSync: false });
  await firstWriteStarted;
  const dedicatedAction = performAutoSyncSettingsAction(true, settings, {
    current: () => current,
    reconcile: async () => {},
  });
  releaseFirstWrite();

  const [genericResult, actionResult] = await Promise.all([
    genericWrite,
    dedicatedAction,
  ]);
  expect(genericResult).toMatchObject({
    status: "applied",
    snapshot: { state: { autoSync: false } },
  });
  expect(actionResult).toEqual({ status: "applied", autoSync: true });
  expect(persisted.get("autoSync")).toBe(true);
  expect((await settings.read()).state.autoSync).toBe(true);
  expect({ current, liveExchange, historyReconciliation }).toEqual({
    current: true,
    liveExchange: true,
    historyReconciliation: true,
  });
  expect(applied.indexOf(false)).toBeLessThan(applied.lastIndexOf(true));
});

it("keeps confirmed persistence distinct from a failed settings publication", async () => {
  const persisted = new Map<string, unknown>();
  let current = true;
  const settings = createSettingsHandler({
    storage: {
      get: async <T>(key: string) => persisted.get(key) as T | undefined,
      set: async (key, value) => {
        persisted.set(key, value);
      },
    },
    applyAutoSync: (value) => {
      current = value;
    },
    applyLogLevel: () => {},
    publish: async () => {
      throw new Error("settings_publication_unavailable");
    },
  });
  await settings.read();

  const result = await performAutoSyncSettingsAction(false, settings, {
    current: () => current,
    reconcile: async () => {},
  });

  expect(result).toEqual({
    status: "partial",
    autoSync: false,
    error: "settings_publication_unavailable",
  });
  expect(persisted.get("autoSync")).toBe(false);
  expect((await settings.read()).state.autoSync).toBe(false);
});

it.each([false, true])(
  "keeps the last confirmed policy when both write and read-back are unavailable (%s)",
  async (enabled) => {
    const previous = !enabled;
    const persisted = new Map<string, unknown>([["autoSync", previous]]);
    let current = previous;
    let commitAttempted = false;
    const settings = createSettingsHandler({
      storage: {
        get: async <T>(key: string) => {
          if (commitAttempted) throw new Error("readback_unavailable");
          return persisted.get(key) as T | undefined;
        },
        set: async () => {
          commitAttempted = true;
          throw new Error("write_ack_unavailable");
        },
      },
      applyAutoSync: (value) => {
        current = value;
      },
      applyLogLevel: () => {},
      publish: async () => {},
    });
    await settings.read();

    const result = await performAutoSyncSettingsAction(enabled, settings, {
      current: () => current,
      reconcile: async () => {},
    });

    expect(result).toEqual({
      status: "unconfirmed",
      autoSync: previous,
      error: "write_ack_unavailable",
    });
    expect(persisted.get("autoSync")).toBe(previous);
    expect(current).toBe(previous);
  }
);

it("keeps a lost acknowledgement uncertain after settings read-back confirms persistence", async () => {
  const persisted = new Map<string, unknown>([["autoSync", true]]);
  let current = true;
  let failNextWrite = true;
  const settings = createSettingsHandler({
    storage: {
      get: async <T>(key: string) => persisted.get(key) as T | undefined,
      set: async (key, value) => {
        persisted.set(key, value);
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error("write_ack_lost");
        }
      },
    },
    applyAutoSync: (value) => {
      current = value;
    },
    applyLogLevel: () => {},
    publish: async () => {},
  });
  await settings.read();

  const result = await performAutoSyncSettingsAction(false, settings, {
    current: () => current,
    reconcile: async () => {},
  });

  expect(result).toEqual({
    status: "unconfirmed",
    autoSync: false,
    error: "write_ack_lost",
  });
  expect(persisted.get("autoSync")).toBe(false);
  expect(current).toBe(false);
});

it("keeps a persisted Auto Sync value when publication fails and reports its partial outcome", async () => {
  let value = true;
  const result = await performAutoSyncAction(false, {
    set: async (next) => {
      value = next;
      return value;
    },
    current: () => value,
    reconcile: async () => {
      throw new Error("publication_failed");
    },
  });
  expect(result).toEqual({
    status: "partial",
    autoSync: false,
    error: "publication_failed",
  });
});
it("reports an unconfirmed persistence failure and rejects invalid intent without applying it", async () => {
  const operations = {
    set: jest.fn(async (): Promise<boolean> => {
      throw new Error("storage_failed");
    }),
    current: () => true,
    reconcile: async () => {},
  };
  expect(await performAutoSyncAction(false, operations)).toEqual({
    status: "unconfirmed",
    autoSync: true,
    error: "storage_failed",
  });
  operations.set.mockClear();
  expect(
    await performAutoSyncAction(undefined as unknown as boolean, operations)
  ).toMatchObject({ status: "rejected", autoSync: true });
  expect(operations.set).not.toHaveBeenCalled();
});
it("refreshes the actual stored preference after an acknowledgement fails following persistence", async () => {
  let persisted = true,
    current = true;
  const result = await performAutoSyncAction(false, {
    set: async (value) => {
      persisted = value;
      throw new Error("acknowledgement_lost");
    },
    current: () => current,
    recover: async () => {
      current = persisted;
    },
    reconcile: async () => {},
  });
  expect(result).toMatchObject({
    status: "unconfirmed",
    autoSync: false,
    error: "acknowledgement_lost",
  });
});
it("overlapping valid preference writes apply in submission order at the owning persistence path", async () => {
  const { createAutoSyncPreference } =
    await import("../../../packages/core/runtime/autoSyncPreference");
  let persisted = false;
  let release!: () => void;
  const preference = createAutoSyncPreference({
    storage: {
      get: async <T>() => persisted as T,
      set: async (_key, value) => {
        if (value === true)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        persisted = value === true;
      },
    },
  });
  const first = preference.set(true);
  await Promise.resolve();
  const second = preference.set(false);
  release();
  await Promise.all([first, second]);
  expect(await preference.load()).toBe(false);
});
