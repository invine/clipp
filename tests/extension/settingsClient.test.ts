import { createSettingsClient } from "../../apps/extension/src/settingsClient";
import { createSettingsHandler } from "../../apps/extension/src/settingsHandler";

it("two open views converge after an external save and a lost reply", async () => {
  const values = new Map<string, unknown>();
  const listeners = new Set<(message: unknown) => void>();
  const handler = createSettingsHandler({
    sessionId: "worker-1",
    storage: {
      get: async <T>(key: string) => values.get(key) as T | undefined,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish: async (snapshot) => {
      listeners.forEach((listener) =>
        listener({ type: "settingsState", snapshot })
      );
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
  const popup = createSettingsClient(port);
  const options = createSettingsClient(port);
  await Promise.all([popup.start(), options.start()]);
  await popup.save({ autoSync: false });
  loseReply = true;
  await options.save({ logLevel: "warn" });

  expect(popup.getState().snapshot?.state).toEqual({
    autoSync: false,
    logLevel: "warn",
  });
  expect(options.getState()).toMatchObject({
    snapshot: { state: { autoSync: false, logLevel: "warn" } },
    feedback: { status: "unconfirmed" },
  });
});

it("does not replace a newer publication with delayed bootstrap", async () => {
  let answerBootstrap!: (value: unknown) => void;
  let onMessage!: (message: unknown) => void;
  const client = createSettingsClient({
    send: () =>
      new Promise((resolve) => {
        answerBootstrap = resolve;
      }),
    subscribe: (listener) => {
      onMessage = listener;
      return () => {};
    },
  });
  const loading = client.start();
  const newer = {
    sessionId: "worker-1",
    revision: 2,
    state: { autoSync: false, logLevel: "warn" as const },
  };
  onMessage({ type: "settingsState", snapshot: newer });
  answerBootstrap({
    ok: true,
    snapshot: {
      sessionId: "worker-1",
      revision: 1,
      state: { autoSync: true, logLevel: "info" },
    },
  });
  await loading;

  expect(client.getState().snapshot).toEqual(newer);
});

it("does not switch back to an old worker after accepting a new worker publication", async () => {
  let answerOldRefresh!: (value: unknown) => void;
  let onMessage!: (message: unknown) => void;
  let reads = 0;
  const client = createSettingsClient({
    send: async () => {
      reads += 1;
      if (reads === 1) {
        return {
          ok: true,
          snapshot: {
            sessionId: "worker-B",
            revision: 1,
            state: { autoSync: false, logLevel: "info" },
          },
        };
      }
      return new Promise((resolve) => {
        answerOldRefresh = resolve;
      });
    },
    subscribe: (listener) => {
      onMessage = listener;
      return () => {};
    },
  });
  await client.start();
  const oldRefresh = client.refresh();
  const newer = {
    sessionId: "worker-B",
    revision: 2,
    state: { autoSync: false, logLevel: "warn" as const },
  };
  onMessage({ type: "settingsState", snapshot: newer });
  answerOldRefresh({
    ok: true,
    snapshot: {
      sessionId: "worker-A",
      revision: 99,
      state: { autoSync: true, logLevel: "debug" },
    },
  });
  await oldRefresh;

  expect(client.getState().snapshot).toEqual(newer);
});

it("accepts a current worker handshake and rejects replies from a retired worker", async () => {
  const snapshots = [
    {
      sessionId: "worker-A",
      revision: 3,
      state: { autoSync: true, logLevel: "info" },
    },
    {
      sessionId: "worker-B",
      revision: 1,
      state: { autoSync: false, logLevel: "warn" },
    },
    {
      sessionId: "worker-A",
      revision: 4,
      state: { autoSync: true, logLevel: "debug" },
    },
  ];
  const client = createSettingsClient({
    send: async () => ({ ok: true, snapshot: snapshots.shift() }),
    subscribe: () => () => {},
  });
  await client.start();
  await client.refresh();
  await client.refresh();

  expect(client.getState().snapshot).toEqual({
    sessionId: "worker-B",
    revision: 1,
    state: { autoSync: false, logLevel: "warn" },
  });
});

it("does not let a duplicate old-session publication block a current-worker handshake", async () => {
  let answerRestart!: (value: unknown) => void;
  let onMessage!: (message: unknown) => void;
  const old = {
    sessionId: "worker-A",
    revision: 4,
    state: { autoSync: true, logLevel: "info" as const },
  };
  let reads = 0;
  const client = createSettingsClient({
    send: async () => {
      reads += 1;
      return reads === 1
        ? { ok: true, snapshot: old }
        : new Promise((resolve) => {
            answerRestart = resolve;
          });
    },
    subscribe: (listener) => {
      onMessage = listener;
      return () => {};
    },
  });
  await client.start();
  const reconnect = client.refresh();
  onMessage({ type: "settingsState", snapshot: old });
  answerRestart({
    ok: true,
    snapshot: {
      sessionId: "worker-B",
      revision: 1,
      state: { autoSync: false, logLevel: "warn" },
    },
  });
  await reconnect;

  expect(client.getState().snapshot).toMatchObject({
    sessionId: "worker-B",
    state: { autoSync: false, logLevel: "warn" },
  });
});

it("keeps rejected-save feedback beside the applied value", async () => {
  const snapshot = {
    sessionId: "worker-1",
    revision: 1,
    state: { autoSync: true, logLevel: "info" as const },
  };
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot }
        : { status: "rejected", snapshot, error: "storage_denied" },
    subscribe: () => () => {},
  });
  await client.start();
  await client.save({ autoSync: false });

  expect(client.getState()).toMatchObject({
    snapshot: { state: { autoSync: true } },
    feedback: { status: "rejected", error: "storage_denied" },
  });
});
