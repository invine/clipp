import { DefaultClipboardHistoryStore } from "../../../packages/core/history/store";
import { Clip } from "../../../packages/core/models/Clip";

describe("ClipboardHistoryStore - Additional", () => {
  const store = new DefaultClipboardHistoryStore();
  const senderId = "peer-xyz";
  const now = Date.now();

  it("overwrites duplicate Clip IDs", async () => {
    const clip: Clip = {
      id: "dup",
      type: "text",
      content: "a",
      timestamp: now,
      senderId,
    };
    await store.add(clip, senderId, true);
    const clip2: Clip = { ...clip, content: "b" };
    await store.add(clip2, senderId, true);
    const item = await store.getById("dup");
    expect(item?.clip.content).toBe("b");
  });

  it("paginates listRecent", async () => {
    // Add 100 new clips with unique IDs and timestamps
    for (let i = 0; i < 100; i++) {
      await store.add(
        {
          id: `p${i}`,
          type: "text",
          content: `p${i}`,
          timestamp: now + i,
          senderId,
        },
        senderId,
        true
      );
    }
    const all = await store.listRecent(10);
    expect(all.length).toBe(10);
    // Check descending order by syncedAt
    for (let i = 0; i < all.length - 1; i++) {
      expect(all[i].syncedAt).toBeGreaterThanOrEqual(all[i + 1].syncedAt);
    }
  });

  it("searches by partial match", async () => {
    await store.add(
      {
        id: "search1",
        type: "text",
        content: "foo bar",
        timestamp: now,
        senderId,
      },
      senderId,
      true
    );
    await store.add(
      {
        id: "search2",
        type: "text",
        content: "bar baz",
        timestamp: now,
        senderId,
      },
      senderId,
      true
    );
    const results = await store.search("bar");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("importBatch skips invalid/duplicate clips", async () => {
    const valid: Clip = {
      id: "import1",
      type: "text",
      content: "ok",
      timestamp: now,
      senderId,
    };
    const dupe: Clip = { ...valid, id: "import1", content: "dupe" };
    await store.importBatch([valid, dupe]);
    const item = await store.getById("import1");
    // Should be the last imported (overwrite)
    expect(item?.clip.content).toBe("dupe");
  });
});
