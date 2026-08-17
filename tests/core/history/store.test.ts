import { MemoryHistoryStore, RETENTION_MS } from "../../../packages/core/history/store";
import { Clip } from "../../../packages/core/models/Clip";

describe("ClipHistoryStore", () => {
  const history = new MemoryHistoryStore();
  const sender = "me";

  function sampleClip(ts: number, id = `c${ts}`): Clip {
    return { id, type: "text", content: `clip-${id}`, originPeerId: sender, capturedAt: ts, shareExpiresAt: ts + 86_400_000, timestamp: ts, senderId: sender };
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

  it("does not use origin capture time as local retention time", async () => {
    const oldTs = Date.now() - RETENTION_MS - 1000;
    const oldClip = sampleClip(oldTs, "old");
    await history.add(oldClip, sender, true);
    await history.pruneExpired();
    const res = await history.getById("old");
    expect(res).not.toBeNull();
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

  it("atomically distinguishes exact duplicates from immutable conflicts", async () => {
    const clip = {
      id: "00000000-0000-4000-8000-000000000010",
      type: "text" as const,
      content: "first",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: 1_000,
      shareExpiresAt: 86_401_000,
    };
    expect((await history.accept(clip)).kind).toBe("newly-stored");
    expect((await history.accept(clip, { liveHandled: true }))).toMatchObject({
      kind: "exact-duplicate",
      liveHandled: true,
    });
    expect((await history.accept({ ...clip, content: "conflict" }))).toMatchObject({
      kind: "immutable-conflict",
      clip: expect.objectContaining({ content: "first" }),
    });
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
