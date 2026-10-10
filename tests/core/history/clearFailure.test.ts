import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import type { Clip } from "../../../packages/core/models/Clip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

function clip(id: string, capturedAt: number): Clip {
  return {
    id,
    type: "text",
    content: id,
    originPeerId,
    capturedAt,
    shareExpiresAt: capturedAt + 86_400_000,
  };
}

it("publishes a reconciliation after failed durable Clear without claiming deletion", async () => {
  const history = new MemoryHistoryStore(new InMemoryHistoryBackend(), {
    maxSuppressionRecords: 1,
    maxSuppressionBytes: 10_000,
  });
  const first = clip("00000000-0000-4000-8000-000000000301", Date.now());
  const second = clip("00000000-0000-4000-8000-000000000302", Date.now() + 1);
  await history.accept(first);
  await history.accept(second);
  const revisions: number[] = [];
  history.onChanged((revision) => revisions.push(revision));

  await expect(history.clearAll()).rejects.toMatchObject({
    code: "suppression_capacity",
  });

  expect(revisions).toHaveLength(1);
  expect((await history.snapshot()).clips.map((item) => item.id)).toEqual([
    second.id,
    first.id,
  ]);
});
