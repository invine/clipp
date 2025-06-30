import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { Clip } from "../../../packages/core/models/Clip";


describe("History concurrency", () => {
  it("handles concurrent adds", async () => {
    const store = new MemoryHistoryStore();
    jest.useFakeTimers();
    const adds: Promise<void>[] = [];
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      const clip: Clip = { id: `c${i}`, type: "text", content: "x", timestamp: now + i, senderId: "me" };
      adds.push(store.add(clip, "me", true));
    }
    const q = store.query({ limit: 100 });
    jest.runAllTimers();
    await Promise.all(adds);
    const res = await q;
    expect(res.length).toBe(100);
    jest.useRealTimers();
  });
});
