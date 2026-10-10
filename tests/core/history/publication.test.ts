import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { Clip } from "../../../packages/core/models/Clip";

function clip(id: string, capturedAt = 1): Clip {
  return {
    id,
    type: "text",
    content: id,
    originPeerId: "me",
    capturedAt,
    shareExpiresAt: capturedAt + 60_000,
  };
}

describe("History publication", () => {
  it("signals retained changes while keeping onNew specific to additions", async () => {
    const history = new MemoryHistoryStore(undefined, {
      pinPersistence: "session",
      maxUnpinnedClips: 1,
    });
    const changes: number[] = [];
    const additions: string[] = [];
    history.onChanged((revision) => changes.push(revision));
    history.onNew((item) => additions.push(item.clip.id));

    await history.accept(clip("first"));
    await history.setPinned("first", true);
    await history.accept(clip("second", 2));
    await history.setPinned("first", false);
    await history.remove("second");

    expect(additions).toEqual(["first", "second"]);
    expect(changes).toEqual([1, 2, 3, 4, 5]);
    await expect(history.snapshot()).resolves.toMatchObject({
      revision: 5,
      clips: [],
      pinnedIds: [],
    });
  });

  it("does not signal failed mutations or duplicate accepts", async () => {
    const history = new MemoryHistoryStore();
    const changes: number[] = [];
    history.onChanged((revision) => changes.push(revision));
    await history.accept(clip("one"));
    await history.accept(clip("one"));
    await expect(history.setRetention(-1)).rejects.toThrow();
    expect(changes).toEqual([1]);
  });

  it("signals cleanup of retained rows when a new accept is locally suppressed", async () => {
    let now = 1_000;
    const history = new MemoryHistoryStore(undefined, {
      now: () => now,
      retentionMs: 100,
      maxUnpinnedBytes: 250,
    });
    const changes: number[] = [];
    const additions: string[] = [];
    history.onChanged((revision) => changes.push(revision));
    history.onNew((item) => additions.push(item.clip.id));

    await expect(history.accept(clip("old"))).resolves.toMatchObject({
      kind: "newly-stored",
    });
    now = 1_101;
    await expect(
      history.accept(
        { ...clip("large"), content: "x".repeat(500) },
        { admissionPriority: false }
      )
    ).resolves.toMatchObject({ kind: "locally-suppressed" });

    await expect(history.snapshot()).resolves.toMatchObject({
      clips: [],
      revision: 2,
    });
    expect(changes).toEqual([1, 2]);
    expect(additions).toEqual(["old"]);
  });
});
