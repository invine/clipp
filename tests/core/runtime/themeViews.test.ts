import { createSettingsHandler } from "../../../packages/core/runtime/settingsAuthority";
import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";

it("concurrent views keep a shared theme through unrelated writes, lost replies, stale publications and reopen", async () => {
  const values = new Map<string, unknown>();
  const listeners = new Set<(message: unknown) => void>();
  const handler = createSettingsHandler({
    sessionId: "current",
    storage: {
      get: async <T>(key: string) => values.get(key) as T | undefined,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async (snapshot) => {
      for (const listener of listeners)
        listener({ type: "settingsState", snapshot });
    },
  });
  let loseReply = false;
  const port = {
    send: async (message: { type: string; settings?: unknown }) => {
      if (message.type === "getSettings")
        return { ok: true, snapshot: await handler.read() };
      const result = await handler.write(message.settings);
      if (loseReply) throw new Error("reply_lost");
      return result;
    },
    subscribe: (listener: (message: unknown) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const popup = createSettingsClient(port),
    options = createSettingsClient(port);
  await Promise.all([popup.start(), options.start()]);
  const original = popup.getState().snapshot;
  await Promise.all([
    popup.save({ theme: "dark" }),
    options.save({ autoSync: false }),
  ]);
  loseReply = true;
  await options.save({ theme: "light" });
  for (const listener of listeners)
    listener({ type: "settingsState", snapshot: original });
  expect(popup.getState()).toMatchObject({
    snapshot: { state: { theme: "light", autoSync: false } },
  });
  expect(options.getState()).toMatchObject({
    snapshot: { state: { theme: "light", autoSync: false } },
    feedback: { status: "unconfirmed", fields: ["theme"] },
    recoveryRequired: false,
  });
  options.stop();
  const reopened = createSettingsClient(port);
  await reopened.start();
  expect(reopened.getState()).toMatchObject({
    snapshot: { state: { theme: "light", autoSync: false } },
    feedback: null,
  });
});

it("treats an old-session save reply as unconfirmed after the current authority changes", async () => {
  const snapshot = (sessionId: string, theme: "light" | "dark") => ({
    sessionId,
    revision: 1,
    state: { theme, autoSync: true, logLevel: "info" },
  });
  let onMessage!: (message: unknown) => void;
  let answerWrite!: (response: unknown) => void;
  let current = snapshot("old", "light");
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot: current }
        : new Promise((resolve) => {
            answerWrite = resolve;
          }),
    subscribe: (listener) => {
      onMessage = listener;
      return () => {};
    },
  });
  await client.start();
  const save = client.save({ theme: "dark" });
  current = snapshot("new", "light");
  onMessage({ type: "settingsState", snapshot: current });
  await client.refresh();
  answerWrite({ status: "applied", snapshot: snapshot("old", "dark") });
  await save;
  expect(client.getState()).toMatchObject({
    snapshot: { sessionId: "new", state: { theme: "light" } },
    feedback: { status: "unconfirmed" },
    pending: false,
  });
});

it("concurrent views share applied custom retention and lifetime across a lost reply and stale bootstrap", async () => {
  const { MemoryHistoryStore } =
    await import("../../../packages/core/history/store");
  const { createLocalRetentionPreference } =
    await import("../../../packages/core/runtime/localRetentionPreference");
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      values.set(key, value);
    },
  };
  const retention = createLocalRetentionPreference({
    storage,
    history: new MemoryHistoryStore(),
    publish: async () => {},
  });
  // eslint-disable-next-line no-unused-vars
  const listeners = new Set<(message: unknown) => void>();
  const handler = createSettingsHandler({
    storage,
    retention,
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async (snapshot) => {
      for (const listener of listeners)
        listener({ type: "settingsState", snapshot });
    },
  });
  let loseReply = false;
  const port = {
    send: async (message: { type: string; settings?: unknown }) => {
      if (message.type === "getSettings")
        return { ok: true, snapshot: await handler.read() };
      const result = await handler.write(message.settings);
      if (loseReply) throw new Error("reply_lost");
      return result;
    },
    // eslint-disable-next-line no-unused-vars
    subscribe: (listener: (message: unknown) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const popup = createSettingsClient(port),
    options = createSettingsClient(port);
  await Promise.all([popup.start(), options.start()]);
  const old = popup.getState().snapshot;
  await Promise.all([
    popup.save({ localRetentionMs: 1250.5 }),
    options.save({ sharingLifetimeMs: 5001 }),
  ]);
  loseReply = true;
  await options.save({ sharingLifetimeMs: 7003 });
  for (const listener of listeners)
    listener({ type: "settingsState", snapshot: old });
  for (const client of [popup, options])
    expect(client.getState().snapshot?.state).toMatchObject({
      localRetentionMs: 1250.5,
      sharingLifetimeMs: 7003,
      autoSync: true,
    });
  expect(options.getState().feedback).toMatchObject({ status: "unconfirmed" });
  popup.stop();
  options.stop();
});
