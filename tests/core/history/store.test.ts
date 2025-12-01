import { MemoryHistoryStore, RETENTION_MS } from "../../../packages/core/history/store";
import { Clip } from "../../../packages/core/models/Clip";

describe("ClipHistoryStore", () => {
  const history = new MemoryHistoryStore();
  const sender = "me";

  function sampleClip(ts: number, id = `c${ts}`): Clip {
    return { id, type: "text", content: `clip-${id}`, timestamp: ts, senderId: sender };
  }

  beforeEach(async () => {
    await history.clearAll();
  });

  it("add -> retrieve", async () => {
    const now = Date.now();
    const clip = sampleClip(now, "a1");
    await history.add(clip, sender, true);
    const got = await history.getById("a1");
    expect(got).not.toBeNull();
  });

  it("retention", async () => {
    const oldTs = Date.now() - RETENTION_MS - 1000;
    const oldClip = sampleClip(oldTs, "old");
    await history.add(oldClip, sender, true);
    await history.pruneExpired();
    const res = await history.getById("old");
    expect(res).toBeNull();
  });

  it("query by type and search", async () => {
    const now = Date.now();
    await history.add({ ...sampleClip(now + 1, "t1"), type: "text", content: "hello" }, sender, true);
    await history.add({ ...sampleClip(now + 2, "u1"), type: "url", content: "https://openai.com" }, sender, true);
    const results = await history.query({ search: "openai" });
    expect(results.length).toBe(1);
    expect(results[0].clip.type).toBe("url");
  });

  it("dedup", async () => {
    const now = Date.now();
    const clip = sampleClip(now + 3, "d1");
    await history.add(clip, sender, true);
    await history.add(clip, sender, true);
    const items = await history.query({});
    const count = items.filter((i) => i.clip.id === "d1").length;
    expect(count).toBe(1);
  });

  it("clears all clips", async () => {
    const now = Date.now();
    await history.add(sampleClip(now + 4, "c1"), sender, true);
    await history.add(sampleClip(now + 5, "c2"), sender, true);
    await history.clearAll();
    const items = await history.query();
    expect(items.length).toBe(0);
  });
});
