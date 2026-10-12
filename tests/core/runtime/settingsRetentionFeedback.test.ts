import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";
import type { SettingsSnapshot } from "../../../packages/core/runtime/settingsAuthority";

const snapshot = (
  revision: number,
  retentionError: string | null
): SettingsSnapshot => ({
  sessionId: "authority",
  revision,
  state: {
    theme: "system",
    autoSync: true,
    logLevel: "info",
    sharingLifetimeMs: 86400000,
    localRetentionMs: 0,
    retentionError,
  },
});

it("removes a confirmed retention failure from every live client when its authority acknowledges recovery", async () => {
  // eslint-disable-next-line no-unused-vars
  const listeners = new Set<(message: unknown) => void>();
  let current = snapshot(1, null);
  const port = {
    send: async (message: { type: string }) => {
      if (message.type === "getSettings")
        return { ok: true, snapshot: current };
      current = snapshot(current.revision + 1, "retention_persistence_failed");
      for (const listener of listeners)
        listener({ type: "settingsState", snapshot: current });
      return {
        status: "partial",
        snapshot: current,
        error: "retention_persistence_failed",
      };
    },
    // eslint-disable-next-line no-unused-vars
    subscribe: (listener: (message: unknown) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const a = createSettingsClient(port),
    b = createSettingsClient(port);
  await Promise.all([a.start(), b.start()]);
  await a.save({ localRetentionMs: 0 });
  await b.save({ localRetentionMs: 0 });
  expect(a.getState().feedback?.status).toBe("partial");
  expect(b.getState().feedback?.status).toBe("partial");
  current = snapshot(4, null);
  for (const listener of listeners)
    listener({ type: "settingsState", snapshot: current });
  for (const client of [a, b]) {
    expect(client.getState().snapshot?.state.retentionError).toBeNull();
    expect(client.getState().feedback).toBeNull();
    client.stop();
  }
});

it("does not revive a recovered retention failure from a delayed write reply or stale publication", async () => {
  let current = snapshot(1, null),
    // eslint-disable-next-line no-unused-vars
    publish!: (message: unknown) => void;
  // eslint-disable-next-line no-unused-vars
  let answer!: (value: unknown) => void;
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot: current }
        : new Promise((resolve) => {
            answer = resolve;
          }),
    subscribe: (listener) => {
      publish = listener;
      return () => {};
    },
  });
  await client.start();
  const write = client.save({ localRetentionMs: 0 });
  const failed = snapshot(2, "retention_persistence_failed");
  publish({ type: "settingsState", snapshot: failed });
  current = snapshot(3, null);
  publish({ type: "settingsState", snapshot: current });
  answer({
    status: "partial",
    snapshot: failed,
    error: "retention_persistence_failed",
  });
  await write;
  publish({ type: "settingsState", snapshot: failed });
  expect(client.getState()).toMatchObject({
    snapshot: { revision: 3 },
    feedback: null,
    pending: false,
  });
  client.stop();
});

it("preserves unrelated, mixed-field and validation failures when retention alone recovers", async () => {
  for (const [patch, status, error] of [
    [{ theme: "dark" }, "rejected", "theme_persistence_failed"],
    [
      { localRetentionMs: 0, sharingLifetimeMs: 5001 },
      "partial",
      "retention_persistence_failed",
    ],
    [{ localRetentionMs: -1 }, "rejected", "invalid_settings"],
  ] as const) {
    // eslint-disable-next-line no-unused-vars
    let publish!: (message: unknown) => void;
    const client = createSettingsClient({
      send: async (message) =>
        message.type === "getSettings"
          ? { ok: true, snapshot: snapshot(1, null) }
          : {
              status,
              error,
              snapshot: snapshot(2, "retention_persistence_failed"),
            },
      subscribe: (listener) => {
        publish = listener;
        return () => {};
      },
    });
    await client.start();
    await client.save(patch);
    publish({ type: "settingsState", snapshot: snapshot(3, null) });
    expect(client.getState().feedback).toMatchObject({ status, error });
    client.stop();
  }
});

it("refresh can acknowledge retention recovery while a newer pending write keeps its own fields", async () => {
  let current = snapshot(1, null),
    // eslint-disable-next-line no-unused-vars
    answer!: (value: unknown) => void;
  let delay = false;
  const client = createSettingsClient({
    send: async (message) => {
      if (message.type === "getSettings")
        return { ok: true, snapshot: current };
      if (delay)
        return new Promise((resolve) => {
          answer = resolve;
        });
      current = snapshot(2, "retention_persistence_failed");
      return {
        status: "partial",
        error: "retention_persistence_failed",
        snapshot: current,
      };
    },
    subscribe: () => () => {},
  });
  await client.start();
  await client.save({ localRetentionMs: 0 });
  current = snapshot(3, null);
  await client.refresh();
  expect(client.getState().feedback).toBeNull();
  delay = true;
  const pending = client.save({ theme: "dark" });
  current = snapshot(4, null);
  await client.refresh();
  expect(client.getState()).toMatchObject({
    pending: true,
    pendingFields: ["theme"],
    feedback: null,
  });
  answer({ status: "rejected", error: "new_theme_failure", snapshot: current });
  await pending;
  expect(client.getState().feedback).toMatchObject({
    status: "rejected",
    error: "new_theme_failure",
    fields: ["theme"],
  });
  client.stop();
});
