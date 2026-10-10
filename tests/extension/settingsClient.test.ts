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
