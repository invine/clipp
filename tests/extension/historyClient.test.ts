import { createHistoryClient } from "../../apps/extension/src/historyClient";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Chrome History snapshots", () => {
  it("keeps unknown History distinct from empty after an initial read failure", async () => {
    const replies = [
      Promise.reject(new Error("history storage unavailable")),
      Promise.resolve({
        ok: true,
        snapshot: {
          sessionId: "worker",
          revision: 0,
          clips: [],
          pinnedIds: [],
        },
      }),
    ];
    const client = createHistoryClient({
      send: () => replies.shift()!,
      subscribe: () => () => undefined,
    });

    await client.start();
    expect(client.getState()).toMatchObject({
      loading: false,
      refreshError: "history storage unavailable",
      snapshot: null,
    });
    await client.refresh();
    expect(client.getState()).toMatchObject({
      refreshError: null,
      snapshot: { clips: [] },
    });
    client.stop();
  });

  it("keeps the newer retained snapshot when bootstrap and invalidation overlap", async () => {
    const first = deferred<unknown>();
    const replies = [
      first.promise,
      Promise.resolve({
        ok: true,
        snapshot: {
          sessionId: "worker",
          revision: 2,
          clips: [{ id: "new", content: "new" }],
          pinnedIds: [],
        },
      }),
    ];
    let onMessage: (message: unknown) => void = () => undefined;
    const client = createHistoryClient({
      send: () => replies.shift()!,
      subscribe: (listener) => {
        onMessage = listener;
        return () => undefined;
      },
    });

    const start = client.start();
    onMessage({ type: "historyChanged", sessionId: "worker", revision: 2 });
    await Promise.resolve();
    first.resolve({
      ok: true,
      snapshot: {
        sessionId: "worker",
        revision: 1,
        clips: [{ id: "old" }],
        pinnedIds: [],
      },
    });
    await start;
    await client.refresh();
    expect(client.getState().snapshot?.clips.map((clip) => clip.id)).toEqual([
      "new",
    ]);
    client.stop();
  });

  it("preserves known clips and reports refresh failure, then accepts a new worker session", async () => {
    const replies = [
      Promise.resolve({
        ok: true,
        snapshot: {
          sessionId: "old",
          revision: 3,
          clips: [{ id: "kept" }],
          pinnedIds: [],
        },
      }),
      Promise.reject(new Error("worker unavailable")),
      Promise.resolve({
        ok: true,
        snapshot: { sessionId: "new", revision: 0, clips: [], pinnedIds: [] },
      }),
      Promise.resolve({
        ok: true,
        snapshot: {
          sessionId: "old",
          revision: 99,
          clips: [{ id: "stale" }],
          pinnedIds: [],
        },
      }),
    ];
    let onMessage: (message: unknown) => void = () => undefined;
    const client = createHistoryClient({
      send: () => replies.shift()!,
      subscribe: (listener) => {
        onMessage = listener;
        return () => undefined;
      },
    });
    await client.start();
    await client.refresh();
    expect(client.getState()).toMatchObject({
      refreshError: "worker unavailable",
      snapshot: { clips: [{ id: "kept" }] },
    });
    await client.refresh();
    expect(client.getState().snapshot).toMatchObject({
      sessionId: "new",
      clips: [],
    });
    onMessage({ type: "historyChanged", sessionId: "old", revision: 99 });
    await Promise.resolve();
    expect(client.getState().snapshot?.sessionId).toBe("new");
    client.stop();
  });
});
