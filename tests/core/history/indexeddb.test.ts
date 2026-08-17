import { indexedDB } from "fake-indexeddb";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { MemoryHistoryStore } from "../../../packages/core/history/store";

const clip = {
  id: "00000000-0000-4000-8000-000000000012",
  type: "text" as const,
  content: "atomic",
  originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
  capturedAt: 1_000,
  shareExpiresAt: 86_401_000,
};

describe("IndexedDB history acceptance", () => {
  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
  });

  it("serializes competing stores and preserves durable suppression", async () => {
    const backend = new IndexedDBHistoryBackend();
    const first = new MemoryHistoryStore(backend);
    const second = new MemoryHistoryStore(backend);

    const outcomes = await Promise.all([first.accept(clip), second.accept(clip)]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      "exact-duplicate",
      "newly-stored",
    ]);

    await first.suppress(clip.id, Date.now() + 1_000);
    await expect(second.accept(clip)).resolves.toMatchObject({ kind: "locally-suppressed" });
  });
});
