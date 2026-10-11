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
