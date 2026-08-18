import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { HistoryStorageBackend } from "../../../packages/core/history/types";

type BackendHarness = {
  backend: HistoryStorageBackend;
  close?(): void | Promise<void>;
};

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

function clip(id: string, capturedAt: number) {
  return {
    id,
    type: "text" as const,
    content: `clip-${id}`,
    originPeerId,
    capturedAt,
    shareExpiresAt: Date.now() + 60_000,
  };
}

export function runHistoryBackendConformance(
  name: string,
  createHarness: () => BackendHarness | Promise<BackendHarness>,
  registerSuite: typeof describe = describe,
): void {
  registerSuite(`${name} atomic history conformance`, () => {
    async function withHarness(run: (backend: HistoryStorageBackend) => Promise<void>): Promise<void> {
      const harness = await createHarness();
      try {
        await harness.backend.clearAll();
        await run(harness.backend);
      } finally {
        await harness.close?.();
      }
    }

    it("distinguishes exact duplicates from immutable conflicts", async () => {
      await withHarness(async (backend) => {
        const history = new MemoryHistoryStore(backend);
        const original = clip("00000000-0000-4000-8000-000000000101", 1);

        await expect(history.accept(original)).resolves.toMatchObject({ kind: "newly-stored" });
        await expect(history.accept(original)).resolves.toMatchObject({ kind: "exact-duplicate" });
        await expect(history.accept({ ...original, content: "conflict" })).resolves.toMatchObject({
          kind: "immutable-conflict",
          clip: expect.objectContaining({ content: original.content }),
        });
      });
    });

    it("makes local suppression visible to another store instance", async () => {
      await withHarness(async (backend) => {
        const first = new MemoryHistoryStore(backend);
        const second = new MemoryHistoryStore(backend);
        const suppressed = clip("00000000-0000-4000-8000-000000000102", 2);
        await first.accept(suppressed);

        await first.remove(suppressed.id);

        await expect(second.getById(suppressed.id)).resolves.toBeNull();
        await expect(second.accept(suppressed)).resolves.toMatchObject({ kind: "locally-suppressed" });
      });
    });

    it("preserves durable pins when the store is recreated", async () => {
      await withHarness(async (backend) => {
        const first = new MemoryHistoryStore(backend);
        const pinned = clip("00000000-0000-4000-8000-000000000103", 3);
        await first.accept(pinned);

        await first.setPinned(pinned.id, true);

        await expect(new MemoryHistoryStore(backend).pinnedIds()).resolves.toEqual([pinned.id]);
      });
    });

    it("commits capacity eviction and its suppression together", async () => {
      await withHarness(async (backend) => {
        const history = new MemoryHistoryStore(backend, {
          maxUnpinnedClips: 1,
          maxUnpinnedBytes: 10_000,
        });
        const older = clip("00000000-0000-4000-8000-000000000104", 4);
        const newer = clip("00000000-0000-4000-8000-000000000105", 5);
        await history.accept(older);

        await history.accept(newer);

        await expect(history.getById(older.id)).resolves.toBeNull();
        await expect(new MemoryHistoryStore(backend).accept(older)).resolves.toMatchObject({
          kind: "locally-suppressed",
        });
      });
    });

    it("leaves history unchanged when required clear tombstones exceed capacity", async () => {
      await withHarness(async (backend) => {
        const history = new MemoryHistoryStore(backend, {
          maxSuppressionRecords: 1,
          maxSuppressionBytes: 10_000,
        });
        const first = clip("00000000-0000-4000-8000-000000000106", 6);
        const second = clip("00000000-0000-4000-8000-000000000107", 7);
        await history.accept(first);
        await history.accept(second);

        await expect(history.clearAll()).rejects.toMatchObject({ code: "suppression_capacity" });
        await expect(history.getById(first.id)).resolves.not.toBeNull();
        await expect(history.getById(second.id)).resolves.not.toBeNull();
      });
    });
  });
}
