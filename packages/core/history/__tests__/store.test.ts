import { DefaultClipboardHistoryStore } from "../store";
import { Clip } from "../../models/Clip";

describe("ClipboardHistoryStore", () => {
  const store = new DefaultClipboardHistoryStore();
  const senderId = "peer-xyz";
  const now = Date.now();
  const clip: Clip = {
    id: "clip-1",
    type: "text",
    content: "hello",
    timestamp: now,
    senderId,
  };

  it("add and getById", async () => {
    await store.add(clip, senderId, true);
    const item = await store.getById(clip.id);
    expect(item?.clip.content).toBe("hello");
  });

  it("listRecent returns added item", async () => {
    const items = await store.listRecent();
    expect(items.length).toBeGreaterThan(0);
  });

  it("search finds by content", async () => {
    const results = await store.search("hello");
    expect(results.length).toBeGreaterThan(0);
  });

  it("exportAll returns all clips", async () => {
    const all = await store.exportAll();
    expect(all[0].id).toBe(clip.id);
  });

  it("importBatch adds new clips", async () => {
    const newClip = { ...clip, id: "clip-2", content: "world" };
    await store.importBatch([newClip]);
    const item = await store.getById("clip-2");
    expect(item?.clip.content).toBe("world");
  });

  it("pruneExpired removes old items", async () => {
    // Add an expired item
    const oldClip = {
      ...clip,
      id: "clip-old",
      timestamp: now - 366 * 24 * 60 * 60 * 1000,
    };
    await store.add(oldClip, senderId, false);
    await store.pruneExpired();
    const item = await store.getById("clip-old");
    expect(item).toBeNull();
  });
});
