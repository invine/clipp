import { createLocalRetentionPreference } from "../../../packages/core/runtime/localRetentionPreference";
import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import type { Clip } from "../../../packages/core/models/Clip";

it("publishes actual cleanup despite a later preference persistence failure, then retries the applied value", async () => {
  const history = new MemoryHistoryStore(new InMemoryHistoryBackend(), {
    now: () => 1000,
  });
  const clip: Clip = {
    id: "00000000-0000-4000-8000-000000000920",
    type: "text",
    content: "retained",
    originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
    capturedAt: 1000,
    shareExpiresAt: 86401000,
  };
  await history.accept(clip);
  let fail = true;
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      if (fail) throw new Error("persistence_failed");
      values.set(key, value);
    },
  };
  const owner = createLocalRetentionPreference({
    storage,
    history,
    publish: async () => {},
  });
  // No missing-default migration write is needed to load the applied default.
  await owner.load();
  expect(await owner.set(0)).toMatchObject({
    status: "partial",
    value: 0,
    error: "persistence_failed",
  });
  expect(await owner.read()).toMatchObject({
    value: 0,
    persistenceError: "persistence_failed",
  });
  expect(await history.exportAll()).toEqual([]);
  await history.importBatch([clip]);
  expect(await history.exportAll()).toEqual([]);
  fail = false;
  expect(await owner.set(0)).toMatchObject({ status: "applied", value: 0 });
  expect(
    (
      await createLocalRetentionPreference({
        storage,
        history,
        publish: async () => {},
      }).load()
    ).value
  ).toBe(0);
});

it("preserves valid nonpreset policy, pins and the first-store deadline, and normalizes a frozen settings patch", async () => {
  const { createSettingsHandler } =
    await import("../../../packages/core/runtime/settingsAuthority");
  let now = 1000;
  const history = new MemoryHistoryStore(new InMemoryHistoryBackend(), {
    now: () => now,
  });
  const values = new Map<string, unknown>([["localRetentionMs", 1250.5]]);
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      values.set(key, value);
    },
  };
  const preference = createLocalRetentionPreference({
    storage,
    history,
    publish: async () => {},
  });
  const settings = createSettingsHandler({
    storage,
    retention: preference,
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async () => {},
  });
  expect((await settings.read()).state.localRetentionMs).toBe(1250.5);
  const original: Clip = {
    id: "00000000-0000-4000-8000-000000000921",
    type: "text",
    content: "pinned",
    originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
    capturedAt: 1000,
    shareExpiresAt: 86401000,
  };
  await history.accept(original);
  await history.setPinned(original.id, true);
  now = 100000;
  await settings.write({ localRetentionMs: 0 });
  expect(await history.exportAll()).toEqual([original]);
  await history.setPinned(original.id, false);
  expect(await history.exportAll()).toEqual([]);
  const patch = Object.freeze({ localRetentionMs: 31536000001 });
  expect(await settings.write(patch)).toMatchObject({
    status: "applied",
    snapshot: { state: { localRetentionMs: 31536000000 } },
  });
  expect(patch.localRetentionMs).toBe(31536000001);
});

it("keeps cleanup and preference writes serialized across overlapping saves", async () => {
  const history = new MemoryHistoryStore();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let blocked!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    blocked = resolve;
  });
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      if (value === 5001) {
        blocked();
        await gate;
      }
      values.set(key, value);
    },
  };
  const owner = createLocalRetentionPreference({
    storage,
    history,
    publish: async () => {},
  });
  await owner.load();
  const first = owner.set(5001);
  await firstWrite;
  const second = owner.set(7003);
  release();
  await Promise.all([first, second]);
  expect((await owner.read()).value).toBe(7003);
  expect(
    (
      await createLocalRetentionPreference({
        storage,
        history,
        publish: async () => {},
      }).load()
    ).value
  ).toBe(7003);
});

it("retains history and prior policy when atomic cleanup fails, then exposes a rejected save", async () => {
  const { createSettingsHandler } =
    await import("../../../packages/core/runtime/settingsAuthority");
  const backend = new InMemoryHistoryBackend();
  const history = new MemoryHistoryStore(backend, { now: () => 1000 });
  const storage = {
    get: async <T>(): Promise<T | undefined> => undefined,
    set: async () => {},
  };
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
  const clip: Clip = {
    id: "00000000-0000-4000-8000-000000000922",
    type: "text",
    content: "unchanged",
    originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
    capturedAt: 1000,
    shareExpiresAt: 86401000,
  };
  await history.accept(clip);
  const apply = backend.applyHistoryMutation.bind(backend);
  backend.applyHistoryMutation = async () => {
    throw new Error("atomic_cleanup_failed");
  };
  expect(await settings.write({ localRetentionMs: 0 })).toMatchObject({
    status: "rejected",
    snapshot: {
      state: {
        localRetentionMs: 2592000000,
        retentionError: "atomic_cleanup_failed",
      },
    },
  });
  expect(await history.exportAll()).toEqual([clip]);
  backend.applyHistoryMutation = apply;
  expect(await settings.write({ localRetentionMs: 0 })).toMatchObject({
    status: "applied",
  });
  expect(await history.exportAll()).toEqual([]);
});
