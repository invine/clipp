import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { Clip } from "../../../packages/core/models/Clip";


describe("History concurrency", () => {
  it("handles concurrent adds", async () => {
    const store = new MemoryHistoryStore();
    jest.useFakeTimers();
    const adds: Promise<void>[] = [];
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      const clip: Clip = { id: `c${i}`, type: "text", content: "x", originPeerId: "me", capturedAt: now + i, shareExpiresAt: now + 86_400_000, timestamp: now + i, senderId: "me" };
      adds.push(store.add(clip, "me", true));
    }
    jest.runAllTimers();
    await Promise.all(adds);
    const res = await store.query({ limit: 100 });
    expect(res.length).toBe(100);
    jest.useRealTimers();
  });
});
