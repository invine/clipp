import { createSettingsHandler } from "../../apps/extension/src/settingsHandler";

it("uses System for absent/invalid installation preferences and reopens an explicit choice without replacing unrelated settings", async () => {
  const values = new Map<string, unknown>([["theme", "sepia"]]);
  const make = () =>
    createSettingsHandler({
      storage: {
        get: async <T>(key: string) => values.get(key) as T | undefined,
        set: async (key, value) => {
          values.set(key, value);
        },
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });
  const owner = make();
  expect((await owner.read()).state).toMatchObject({ theme: "system" });
  const themeSave = owner.write({ theme: "light" } as any);
  const syncSave = owner.write({ autoSync: false });
  await Promise.all([themeSave, syncSave]);
  expect((await make().read()).state).toMatchObject({
    theme: "light",
    autoSync: false,
    logLevel: "info",
  });
  expect(await owner.write({ theme: "sepia" } as any)).toMatchObject({
    status: "rejected",
    snapshot: { state: { theme: "light" } },
  });
});

it("does not report a confirmed save when persistence acknowledges without applying the requested theme", async () => {
  const owner = createSettingsHandler({
    storage: {
      get: async <T>() => undefined as T | undefined,
      set: async () => {},
    },
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async () => {},
  });
  expect(await owner.write({ theme: "dark" })).toMatchObject({
    status: "rejected",
    snapshot: { state: { theme: "system" } },
  });
});

it("preserves applied appearance after a rejected write and labels failed read-back unconfirmed", async () => {
  let readFails = false;
  let writeFails = true;
  const owner = createSettingsHandler({
    storage: {
      get: async <T>(key: string) => {
        if (readFails) throw new Error("read_failed");
        return (key === "theme" ? "light" : undefined) as T | undefined;
      },
      set: async () => {
        if (writeFails) throw new Error("disk_full");
        readFails = true;
      },
    },
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async () => {},
  });
  expect(await owner.write({ theme: "dark" })).toMatchObject({
    status: "rejected",
    snapshot: { state: { theme: "light" } },
  });
  writeFails = false;
  expect(await owner.write({ theme: "dark" })).toMatchObject({
    status: "unconfirmed",
    snapshot: { state: { theme: "light" } },
  });
});
