import { performAutoSyncAction } from "../../../packages/core/runtime/autoSyncAction";
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
