import { initHistorySync } from "../../../packages/core/history/sync";
import { MemoryHistoryStore, RETENTION_MS } from "../../../packages/core/history/store";
import { Clip } from "../../../packages/core/models/Clip";


function mockTrustManager() {
  const listeners: Record<string, Function[]> = {};
  return {
    on(event: string, cb: any) {
      (listeners[event] ||= []).push(cb);
    },
    emit(event: string, payload: any) {
      (listeners[event] || []).forEach((cb) => cb(payload));
    },
  } as any;
}

describe("history sync", () => {
  it("auto push on approval", async () => {
    const history = new MemoryHistoryStore();
    const send = jest.fn(async () => {});
    const messaging = { send, onMessage: (_cb: any) => {} } as any;
    const identity = { get: async () => ({ deviceId: "me" }) } as any;
    const trust = mockTrustManager();
    initHistorySync(messaging, identity, trust, history);
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const clip: Clip = { id: `${i}`, type: "text", content: "x", timestamp: now, senderId: "me" };
      await history.add(clip, "me", true);
    }
    trust.emit("approved", { deviceId: "peer" });
    await new Promise((r) => setImmediate(r));
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    const [target, arg] = send.mock.calls[0] as any;
    expect(target).toBe("peer");
    expect(arg.type).toBe("sync-history");
    expect(arg.from).toBe("me");
    expect(arg.payload.length).toBe(3);
  });

  it("import batch dedup", async () => {
    const history = new MemoryHistoryStore();
    const messaging = {
      send: jest.fn(),
      onMessage: (cb: any) => {
        cb({
          type: "sync-history",
          from: "peer",
          sentAt: Date.now(),
          payload: [{ id: "1", type: "text", content: "a", timestamp: Date.now(), senderId: "r" }],
        });
      },
    } as any;
    const identity = { get: async () => ({ deviceId: "me" }) } as any;
    const trust = mockTrustManager();
    initHistorySync(messaging, identity, trust, history);
    await history.importBatch([{ id: "1", type: "text", content: "a", timestamp: Date.now(), senderId: "r" }]);
    const all = await history.query({});
    expect(all.length).toBe(1);
  });

  it("idempotent re-sync", async () => {
    const history = new MemoryHistoryStore();
    const send = jest.fn();
    const messaging = { send, onMessage: (_cb: any) => {} } as any;
    const identity = { get: async () => ({ deviceId: "me" }) } as any;
    const trust = mockTrustManager();
    initHistorySync(messaging, identity, trust, history);
    trust.emit("approved", { deviceId: "peer" });
    trust.emit("approved", { deviceId: "peer" });
    expect(send).toHaveBeenCalledTimes(0); // no clips
  });

  it("large history chunking", async () => {
    const history = new MemoryHistoryStore();
    const send = jest.fn(async () => {});
    const messaging = { send, onMessage: (_cb: any) => {} } as any;
    const identity = { get: async () => ({ deviceId: "me" }) } as any;
    const trust = mockTrustManager();
    initHistorySync(messaging, identity, trust, history);
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      await history.add({ id: `c${i}`, type: "text", content: "x", timestamp: now, senderId: "me" }, "me", true);
    }
    trust.emit("approved", { deviceId: "peer" });
    await new Promise((r) => setImmediate(r));
    const calls = send.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    for (const c of send.mock.calls) {
      const msg = (c as any)[1] as any;
      const size = JSON.stringify(msg).length;
      expect(size).toBeLessThanOrEqual(500 * 1024);
      expect(msg.payload.length).toBeLessThanOrEqual(100);
    }
  });
});
