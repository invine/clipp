import {
  MAX_RETENTION_MS,
  MemoryHistoryStore,
  RETENTION_MS,
  startHistoryRetentionCleanup,
} from "../../../packages/core/history/store";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import { Clip } from "../../../packages/core/models/Clip";
import { runHistoryBackendConformance } from "./backendConformance";

runHistoryBackendConformance("In-memory", () => ({ backend: new InMemoryHistoryBackend() }));

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

  it("returns the normalized retention setting applied by shared policy", async () => {
    const localHistory = new MemoryHistoryStore();

    await expect(localHistory.setRetention(MAX_RETENTION_MS + 1)).resolves.toBe(
      MAX_RETENTION_MS,
    );
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

  it("atomically rejects a Clip covered by a durable local suppression", async () => {
    const backend = new InMemoryHistoryBackend();
    const firstStore = new MemoryHistoryStore(backend);
    const secondStore = new MemoryHistoryStore(backend);
    const clip = {
      id: "00000000-0000-4000-8000-000000000011",
      type: "text" as const,
      content: "do not restore",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: 1_000,
      shareExpiresAt: 86_401_000,
    };

    await firstStore.suppress(clip.id, Date.now() + 1_000);

    await expect(secondStore.accept(clip)).resolves.toMatchObject({
      kind: "locally-suppressed",
      clip,
      liveHandled: false,
    });
    await expect(secondStore.getById(clip.id)).resolves.toBeNull();
  });

  it("locally deletes a still-shareable Clip with a suppression tombstone", async () => {
    const clip = {
      id: "00000000-0000-4000-8000-000000000013",
      type: "text" as const,
      content: "delete me",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: Date.now(),
      shareExpiresAt: Date.now() + 60_000,
    };
    await history.accept(clip);

    await history.remove(clip.id);

    await expect(history.getById(clip.id)).resolves.toBeNull();
    await expect(history.accept(clip)).resolves.toMatchObject({ kind: "locally-suppressed" });
  });

  it("keeps pinned Clips through retention, then atomically applies policy on unpin", async () => {
    let now = 10_000;
    const localHistory = new MemoryHistoryStore(new InMemoryHistoryBackend(), {
      now: () => now,
      retentionMs: 1_000,
    });
    const clip = sampleClip(1, "pinned");
    await localHistory.accept(clip);
    await localHistory.setPinned(clip.id, true);
    now += 1_001;

    await localHistory.pruneExpired();
    await expect(localHistory.getById(clip.id)).resolves.toMatchObject({ pinned: true });

    await localHistory.setPinned(clip.id, false);
    await expect(localHistory.getById(clip.id)).resolves.toBeNull();
    await expect(localHistory.accept(clip)).resolves.toMatchObject({ kind: "locally-suppressed" });
  });

  it("sets durable local pin state through the shared history contract", async () => {
    const backend = new InMemoryHistoryBackend();
    const firstRuntime = new MemoryHistoryStore(backend);
    const clip = sampleClip(Date.now(), "set-pin");
    await firstRuntime.accept(clip);

    await expect(firstRuntime.setPinned(clip.id, true)).resolves.toEqual([clip.id]);
    await expect(new MemoryHistoryStore(backend).pinnedIds()).resolves.toEqual([clip.id]);
    await expect(firstRuntime.setPinned(clip.id, false)).resolves.toEqual([]);
  });

  it("keeps Chrome-style pins session-only while applying policy during the session", async () => {
    const backend = new InMemoryHistoryBackend();
    let now = 1_000;
    const session = new MemoryHistoryStore(backend, {
      now: () => now,
      retentionMs: 100,
      pinPersistence: "session",
    });
    const pinned = sampleClip(now, "session-pin");
    await session.accept(pinned);

    await expect(session.setPinned(pinned.id, true)).resolves.toEqual([pinned.id]);
    await expect(session.setPinned(pinned.id, true)).resolves.toEqual([pinned.id]);
    now += 101;
    await session.pruneExpired();
    await expect(session.getById(pinned.id)).resolves.toMatchObject({ pinned: true });

    const restartedSession = new MemoryHistoryStore(backend, {
      now: () => now,
      retentionMs: 100,
      pinPersistence: "session",
    });
    await expect(restartedSession.pinnedIds()).resolves.toEqual([]);
    await restartedSession.pruneExpired();
    await expect(restartedSession.getById(pinned.id)).resolves.toBeNull();
  });

  it("reports automatic cleanup failure and supports an explicit retry", async () => {
    const storageError = new Error("storage unavailable");
    const pruneExpired = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(storageError)
      .mockResolvedValue(undefined);
    const errors: Array<unknown | null> = [];

    const cleanup = startHistoryRetentionCleanup(
      { pruneExpired },
      60_000,
      (error) => errors.push(error),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(errors).toEqual([storageError]);
    await cleanup.retry();
    expect(errors).toEqual([storageError, null]);
    cleanup.stop();
  });

  it("gives new local Clips capacity priority and suppresses rejected historical imports", async () => {
    const localHistory = new MemoryHistoryStore(new InMemoryHistoryBackend(), {
      maxUnpinnedClips: 1,
      maxUnpinnedBytes: 10_000,
    });
    const shareExpiresAt = Date.now() + 60_000;
    const retained = { ...sampleClip(20, "00000000-0000-4000-8000-000000000020"), shareExpiresAt };
    const local = { ...sampleClip(10, "00000000-0000-4000-8000-000000000010"), shareExpiresAt };
    const historical = { ...sampleClip(5, "00000000-0000-4000-8000-000000000005"), shareExpiresAt };
    await localHistory.accept(retained);

    await expect(localHistory.accept(local)).resolves.toMatchObject({ kind: "newly-stored" });
    await expect(localHistory.getById(retained.id)).resolves.toBeNull();
    await localHistory.importBatch([historical]);

    await expect(localHistory.getById(historical.id)).resolves.toBeNull();
    await expect(localHistory.accept(historical)).resolves.toMatchObject({ kind: "locally-suppressed" });
  });

  it("fails Clear History atomically when the required tombstones exceed capacity", async () => {
    const localHistory = new MemoryHistoryStore(new InMemoryHistoryBackend(), {
      maxSuppressionRecords: 1,
      maxSuppressionBytes: 10_000,
    });
    const first = sampleClip(Date.now(), "clear-first");
    const second = sampleClip(Date.now() + 1, "clear-second");
    await localHistory.accept(first);
    await localHistory.accept(second);

    await expect(localHistory.clearAll()).rejects.toMatchObject({ code: "suppression_capacity" });
    await expect(localHistory.getById(first.id)).resolves.not.toBeNull();
    await expect(localHistory.getById(second.id)).resolves.not.toBeNull();
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
