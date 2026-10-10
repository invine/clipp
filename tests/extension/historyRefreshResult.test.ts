import { createHistoryClient } from "../../apps/extension/src/historyClient";

describe("Chrome History refresh confirmation", () => {
  it("confirms only a newly accepted snapshot after a failed read", async () => {
    const replies = [
      {
        ok: true,
        snapshot: {
          sessionId: "worker",
          revision: 1,
          clips: [],
          pinnedIds: [],
        },
      },
      { ok: false, error: "read failed" },
      {
        ok: true,
        snapshot: {
          sessionId: "worker",
          revision: 2,
          clips: [],
          pinnedIds: [],
        },
      },
    ];
    const client = createHistoryClient({
      send: async () => replies.shift(),
      subscribe: () => () => undefined,
    });
    await client.start();
    expect(await client.refresh()).toBe(false);
    expect(client.getState().refreshError).toBe("read failed");
    expect(await client.refresh()).toBe(true);
    expect(client.getState().snapshot?.revision).toBe(2);
    client.stop();
  });
});
