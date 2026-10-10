import { createSettingsHandler } from "../../apps/extension/src/settingsHandler";

describe("Chrome settings handler", () => {
  it("changing log level after another view disables Auto Sync preserves both applied fields", async () => {
    const persisted = new Map<string, unknown>();
    let liveAutoSync = true;
    let liveLogLevel = "info";
    const published: unknown[] = [];
    const handler = createSettingsHandler({
      storage: {
        get: async <T>(key: string) => persisted.get(key) as T | undefined,
        set: async (key, value) => {
          persisted.set(key, value);
        },
      },
      applyAutoSync: (value) => {
        liveAutoSync = value;
      },
      applyLogLevel: (value) => {
        liveLogLevel = value;
      },
      publish: async (snapshot) => {
        published.push(snapshot);
      },
    });

    await handler.read();
    await handler.write({ autoSync: false });
    const result = await handler.write({ logLevel: "warn" });

    expect(result).toMatchObject({
      status: "applied",
      snapshot: { state: { autoSync: false, logLevel: "warn" } },
    });
    expect(await handler.read()).toMatchObject({
      state: { autoSync: false, logLevel: "warn" },
    });
    expect({
      liveAutoSync,
      liveLogLevel,
      lastPublication: published.at(-1),
    }).toMatchObject({
      liveAutoSync: false,
      liveLogLevel: "warn",
      lastPublication: { state: { autoSync: false, logLevel: "warn" } },
    });
  });

  it("reports a partial save when a later field cannot persist", async () => {
    const persisted = new Map<string, unknown>();
    const handler = createSettingsHandler({
      storage: {
        get: async <T>(key: string) => persisted.get(key) as T | undefined,
        set: async (key, value) => {
          if (key === "logLevel") throw new Error("disk_full");
          persisted.set(key, value);
        },
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });

    const result = await handler.write({ autoSync: false, logLevel: "warn" });

    expect(result).toMatchObject({
      status: "partial",
      snapshot: { state: { autoSync: false, logLevel: "info" } },
    });
  });

  it("serializes overlapping writes so the last applied value wins", async () => {
    const persisted = new Map<string, unknown>();
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let blocked = false;
    const handler = createSettingsHandler({
      storage: {
        get: async <T>(key: string) => persisted.get(key) as T | undefined,
        set: async (key, value) => {
          if (!blocked) {
            blocked = true;
            await firstBlocked;
          }
          persisted.set(key, value);
        },
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });

    const first = handler.write({ autoSync: false });
    const second = handler.write({ autoSync: true });
    releaseFirst();
    await Promise.all([first, second]);

    expect((await handler.read()).state.autoSync).toBe(true);
  });

  it("keeps the applied value after a rejected storage write", async () => {
    const handler = createSettingsHandler({
      storage: {
        get: async <T>() => undefined as T | undefined,
        set: async () => {
          throw new Error("storage_denied");
        },
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });

    const result = await handler.write({ autoSync: false });

    expect(result).toMatchObject({
      status: "rejected",
      error: "storage_denied",
      snapshot: { state: { autoSync: true } },
    });
  });

  it("reports an applied write when publication fails after persistence", async () => {
    const persisted = new Map<string, unknown>();
    const handler = createSettingsHandler({
      storage: {
        get: async <T>(key: string) => persisted.get(key) as T | undefined,
        set: async (key, value) => {
          persisted.set(key, value);
        },
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {
        throw new Error("publication_unavailable");
      },
    });

    const result = await handler.write({ autoSync: false });

    expect(result).toMatchObject({
      status: "applied",
      warning: "publication_unavailable",
      snapshot: { state: { autoSync: false } },
    });
  });
});
