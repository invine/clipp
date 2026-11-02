import { createSettingsHandler } from "../../../packages/core/runtime/settingsAuthority";

it("applies and reopens a custom Clip Sharing Lifetime without overwriting Auto Sync", async () => {
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      values.set(key, value);
    },
  };
  const make = () =>
    createSettingsHandler({
      storage,
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });
  const owner = make();
  expect((await owner.read()).state).toMatchObject({
    sharingLifetimeMs: 86400000,
  });
  expect(await owner.write({ sharingLifetimeMs: 5001 })).toMatchObject({
    status: "applied",
    snapshot: { state: { sharingLifetimeMs: 5001, autoSync: true } },
  });
  await owner.write({ autoSync: false });
  expect((await make().read()).state).toMatchObject({
    sharingLifetimeMs: 5001,
    autoSync: false,
  });
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2592000001])(
  "rejects invalid sharing lifetime %s without changing applied value",
  async (value) => {
    const values = new Map<string, unknown>([["sharingLifetimeMs", 5001]]);
    const storage = {
      get: async <T>(key: string) => values.get(key) as T | undefined,
      set: async <T>(key: string, value: T) => {
        values.set(key, value);
      },
    };
    const owner = createSettingsHandler({
      storage,
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });
    expect(await owner.write({ sharingLifetimeMs: value })).toMatchObject({
      status: "rejected",
      snapshot: { state: { sharingLifetimeMs: 5001 } },
    });
  }
);

it("uses the unchanged applied lifetime after a rejected persistence operation", async () => {
  const values = new Map<string, unknown>([["sharingLifetimeMs", 5001]]);
  let applied = 0;
  const owner = createSettingsHandler({
    storage: {
      get: async <T>(key: string) => values.get(key) as T | undefined,
      set: async () => {
        throw new Error("save_failed");
      },
    },
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    applySharingLifetime: (value) => {
      applied = value;
    },
    publish: async () => {},
  });
  expect(await owner.write({ sharingLifetimeMs: 7003 })).toMatchObject({
    status: "rejected",
    snapshot: { state: { sharingLifetimeMs: 5001 } },
  });
  expect(applied).toBe(5001);
});
