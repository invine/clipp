import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";

it("reports a missing settings subscription and retries the owning connection when the bridge becomes available", async () => {
  let available = false;
  let onMessage: ((message: unknown) => void) | undefined;
  const client = createSettingsClient({
    send: async () => ({
      ok: true,
      snapshot: {
        sessionId: "current",
        revision: 1,
        state: { theme: "light", autoSync: true, logLevel: "info" },
      },
    }),
    subscribe: (listener) => {
      if (!available) throw new Error("bridge_unavailable");
      onMessage = listener;
      return () => {
        onMessage = undefined;
      };
    },
  });
  await expect(client.start()).resolves.toBeUndefined();
  expect(client.getState()).toMatchObject({
    snapshot: null,
    loading: false,
    refreshing: false,
    refreshError: "bridge_unavailable",
  });
  available = true;
  await client.refresh();
  expect(client.getState()).toMatchObject({
    snapshot: { state: { theme: "light" } },
    refreshError: null,
  });
  onMessage?.({
    type: "settingsState",
    snapshot: {
      sessionId: "current",
      revision: 2,
      state: { theme: "dark", autoSync: true, logLevel: "info" },
    },
  });
  expect(client.getState().snapshot?.state.theme).toBe("dark");
  client.stop();
});

it("keeps a closed appearance owner unsubscribed when its pending save reply is lost", async () => {
  const snapshot = {
    sessionId: "current",
    revision: 1,
    state: { theme: "light", autoSync: true, logLevel: "info" },
  };
  const listeners = new Set<(message: unknown) => void>();
  let rejectSave!: (error: Error) => void;
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot }
        : new Promise((_resolve, reject) => {
            rejectSave = reject;
          }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  await client.start();
  const saving = client.save({ theme: "dark" });
  client.stop();
  const stopped = client.getState();
  rejectSave(new Error("reply_lost"));
  await saving;

  expect(listeners.size).toBe(0);
  expect(client.getState()).toEqual(stopped);
});

it.each(["applied", "lost"])(
  "preserves a restarted appearance owner and its current save after a retired %s reply",
  async (outcome) => {
    let current = {
      sessionId: "old",
      revision: 1,
      state: { theme: "system", autoSync: true, logLevel: "info" },
    };
    const writes: Array<{
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }> = [];
    const listeners = new Set<(message: unknown) => void>();
    const client = createSettingsClient({
      send: async (message) =>
        message.type === "getSettings"
          ? { ok: true, snapshot: current }
          : new Promise((resolve, reject) => {
              writes.push({ resolve, reject });
            }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    await client.start();
    const retiredListener = [...listeners][0];
    const oldSave = client.save({ theme: "dark" });
    client.stop();
    current = { ...current, sessionId: "new" };
    await client.start();
    const currentSave = client.save({ theme: "light" });
    const beforeRetiredCompletion = client.getState();
    retiredListener({
      type: "settingsState",
      snapshot: {
        ...current,
        revision: 99,
        state: { ...current.state, theme: "dark" },
      },
    });
    if (outcome === "lost") writes[0].reject(new Error("reply_lost"));
    else
      writes[0].resolve({
        status: "applied",
        snapshot: {
          sessionId: "old",
          revision: 2,
          state: { ...current.state, theme: "dark" },
        },
      });
    await oldSave;
    expect(client.getState()).toEqual(beforeRetiredCompletion);
    expect(listeners.size).toBe(1);
    writes[1].resolve({
      status: "applied",
      snapshot: {
        ...current,
        revision: 2,
        state: { ...current.state, theme: "light" },
      },
    });
    await currentSave;
    expect(client.getState()).toMatchObject({
      snapshot: { sessionId: "new", state: { theme: "light" } },
      pending: false,
      recoveryRequired: false,
      feedback: { status: "applied" },
    });
    client.stop();
    expect(listeners.size).toBe(0);
  }
);

it("allows an explicit refresh after stop while ignoring the retired bootstrap", async () => {
  const replies: Array<(value: unknown) => void> = [];
  const listeners = new Set<(message: unknown) => void>();
  const client = createSettingsClient({
    send: () =>
      new Promise((resolve) => {
        replies.push(resolve);
      }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  const retiredBootstrap = client.start();
  client.stop();
  const refresh = client.refresh();
  const response = (sessionId: string, theme: string) => ({
    ok: true,
    snapshot: {
      sessionId,
      revision: 1,
      state: { theme, autoSync: true, logLevel: "info" },
    },
  });
  replies[1](response("new", "dark"));
  await refresh;
  replies[0](response("old", "light"));
  await retiredBootstrap;
  expect(client.getState()).toMatchObject({
    snapshot: { sessionId: "new", state: { theme: "dark" } },
    refreshing: false,
    loading: false,
  });
  expect(listeners.size).toBe(1);
  client.stop();
});
