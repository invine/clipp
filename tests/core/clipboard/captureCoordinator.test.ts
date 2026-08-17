import {
  createClipCaptureCoordinator,
  type ClipHistoryAcceptance,
  type ClipHistoryWriter,
} from "../../../packages/core/clipboard/captureCoordinator";
import type { Clip } from "../../../packages/core/models/Clip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

function validUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function acceptingHistory(): ClipHistoryWriter & { clips: Clip[] } {
  const clips: Clip[] = [];
  return {
    clips,
    accept: async (clip): Promise<ClipHistoryAcceptance> => {
      const existing = clips.find((item) => item.id === clip.id);
      if (existing) return { kind: "exact-duplicate", clip: existing, liveHandled: false };
      clips.push(clip);
      return { kind: "newly-stored", clip, liveHandled: true };
    },
  };
}

describe("Clip capture coordinator", () => {
  it("baselines startup and empty observations without creating Clips", async () => {
    const history = acceptingHistory();
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(1),
    });

    await coordinator.baseline("already copied");
    await coordinator.observe("already copied");
    await coordinator.observe("");

    expect(history.clips).toEqual([]);
    expect(coordinator.baselineValue()).toBe("");
  });

  it("captures exact text after an intervening change and persists it before publishing", async () => {
    const events: Clip[] = [];
    const history = acceptingHistory();
    const ids = [validUuid(2), validUuid(3)];
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => ids.shift()!,
      onStored: async (clip) => {
        expect(history.clips).toContain(clip);
        events.push(clip);
      },
    });

    await coordinator.baseline("one");
    await coordinator.observe("two");
    await coordinator.observe("  one\n");

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      originPeerId,
      capturedAt: 1_000,
      shareExpiresAt: 1_000 + 24 * 60 * 60 * 1_000,
      type: "text",
      content: "  one\n",
    });
  });

  it("classifies only an untrimmed HTTP(S) URL and preserves its original text", async () => {
    const history = acceptingHistory();
    const ids = [validUuid(6), validUuid(7)];
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => ids.shift()!,
    });

    await coordinator.capture("https://example.test/a path");
    await coordinator.capture(" https://example.test/ ");

    expect(history.clips.map((clip) => clip.content)).toEqual([
      "https://example.test/a path",
      " https://example.test/ ",
    ]);
  });

  it("retries candidate UUID conflicts without changing the other immutable fields", async () => {
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockResolvedValueOnce({ kind: "immutable-conflict", clip: {} as Clip, liveHandled: false })
        .mockResolvedValueOnce({ kind: "newly-stored", clip: {} as Clip, liveHandled: true }),
    };
    const ids = [validUuid(4), validUuid(5)];
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => ids.shift()!,
    });

    await coordinator.capture("value");

    const calls = (history.accept as jest.Mock).mock.calls.map(([clip]) => clip as Clip);
    expect(calls.map((clip) => clip.id)).toEqual([validUuid(4), validUuid(5)]);
    expect(calls[0]).toMatchObject({ originPeerId, capturedAt: 1_000, shareExpiresAt: 86_401_000, type: "text", content: "value" });
    expect(calls[1]).toMatchObject({ originPeerId, capturedAt: 1_000, shareExpiresAt: 86_401_000, type: "text", content: "value" });
  });

  it("keeps the same immutable Clip pending after storage failure and retries it later", async () => {
    const stored: Clip[] = [];
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockRejectedValueOnce(new Error("storage unavailable"))
        .mockImplementation(async (clip) => {
          stored.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        }),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(8),
    });

    await expect(coordinator.capture("queued")).resolves.toBeNull();
    expect(coordinator.pending()).toHaveLength(1);
    await coordinator.retryPending();

    expect(stored).toEqual([expect.objectContaining({ id: validUuid(8), content: "queued" })]);
    expect(coordinator.pending()).toEqual([]);
  });
});
