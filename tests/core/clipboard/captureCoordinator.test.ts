import {
  createClipCaptureCoordinator,
  type ClipHistoryAcceptance,
  type ClipHistoryWriter,
} from "../../../packages/core/clipboard/captureCoordinator";
import type { Clip } from "../../../packages/core/models/Clip";
import { HistoryPolicyError } from "../../../packages/core/history/types";
import * as log from "../../../packages/core/logger";

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

  it("rejects a capture when the runtime identity is not a canonical Peer ID", async () => {
    const diagnostics: string[] = [];
    const coordinator = createClipCaptureCoordinator({
      history: acceptingHistory(),
      originPeerId: async () => "LZM",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    await expect(coordinator.capture("value")).resolves.toBeNull();
    expect(diagnostics).toEqual(["invalid_capture"]);
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

  it("writes a retained Clip before creating a new Local Clip with current immutable fields", async () => {
    const order: string[] = [];
    const history = acceptingHistory();
    const coordinator = createClipCaptureCoordinator({
      history: {
        accept: async (clip, options) => {
          order.push("persist");
          return history.accept(clip, options);
        },
      },
      originPeerId: async () => originPeerId,
      now: () => 4_000,
      makeId: () => validUuid(21),
      sharingLifetimeMs: () => 5_000,
      onStored: () => { order.push("publish"); },
    });

    const reused = await coordinator.reuse(
      "exact retained content\n",
      async () => { order.push("write"); },
      async () => "platform read-back",
    );

    expect(order).toEqual(["write", "persist", "publish"]);
    expect(reused).toMatchObject({
      id: validUuid(21),
      originPeerId,
      capturedAt: 4_000,
      shareExpiresAt: 9_000,
      content: "exact retained content\n",
    });
    expect(coordinator.baselineValue()).toBe("platform read-back");
  });

  it("does not create a Clip when an explicit retained-Clip write fails", async () => {
    const history = acceptingHistory();
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(22),
    });

    await expect(coordinator.reuse("retained", async () => {
      throw new Error("clipboard unavailable");
    })).rejects.toThrow("clipboard unavailable");

    expect(history.clips).toEqual([]);
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

  it("retries an exact UUID collision so every explicit capture remains a distinct event", async () => {
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockImplementationOnce(async (clip) => ({ kind: "exact-duplicate", clip, liveHandled: true }))
        .mockImplementationOnce(async (clip) => ({ kind: "newly-stored", clip, liveHandled: true })),
    };
    const ids = [validUuid(23), validUuid(24)];
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => ids.shift()!,
    });

    const clip = await coordinator.capture("same clipboard", { shareNow: true });

    expect(clip?.id).toBe(validUuid(24));
    expect((history.accept as jest.Mock).mock.calls).toHaveLength(2);
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

  it("retries UUID collisions with pending Clips so explicit events remain distinct", async () => {
    const ids = [validUuid(25), validUuid(25), validUuid(26)];
    const coordinator = createClipCaptureCoordinator({
      history: { accept: async () => { throw new Error("storage unavailable"); } },
      originPeerId: async () => originPeerId,
      makeId: () => ids.shift()!,
    });

    await coordinator.capture("first pending", { shareNow: true });
    await coordinator.capture("second pending", { shareNow: true });

    expect(coordinator.pending().map((clip) => clip.id)).toEqual([
      validUuid(25),
      validUuid(26),
    ]);
  });

  it("does not recover an older Share Now event when the newest recovered Clip is no longer current", async () => {
    let storageAvailable = false;
    let nextId = 500;
    const recovered: Array<{ clip: Clip; shareNow?: boolean }> = [];
    const coordinator = createClipCaptureCoordinator({
      history: {
        accept: async (clip) => {
          if (!storageAvailable) throw new Error("storage unavailable");
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
      originPeerId: async () => originPeerId,
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
    });
    coordinator.onRecovered((clip, options) => {
      recovered.push({ clip, shareNow: options?.shareNow });
    });

    await coordinator.capture("older current value", { shareNow: true });
    await coordinator.capture("newest pending value");
    await coordinator.baseline("older current value");
    storageAvailable = true;
    await coordinator.retryPending();

    expect(recovered).toEqual([]);
    expect(coordinator.pending()).toEqual([]);
  });

  it("re-enters the live path when a pending capture was committed before storage reported failure", async () => {
    const recovered: Clip[] = [];
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockRejectedValueOnce(new Error("storage response lost"))
        .mockImplementation(async (clip) => ({ kind: "exact-duplicate", clip, liveHandled: false })),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(18),
    });
    coordinator.onRecovered((clip) => { recovered.push(clip); });

    await coordinator.capture("committed before failure");
    await coordinator.retryPending();

    expect(recovered).toEqual([expect.objectContaining({ id: validUuid(18), content: "committed before failure" })]);
    expect(coordinator.pending()).toEqual([]);
  });

  it("drops a pending Clip when retry proves it exceeds history capacity", async () => {
    const diagnostics: string[] = [];
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockRejectedValueOnce(new Error("storage unavailable"))
        .mockRejectedValueOnce(new HistoryPolicyError("clip_capacity")),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(15),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    await coordinator.capture("queued until capacity is known");
    await coordinator.retryPending();

    expect(coordinator.pending()).toEqual([]);
    expect(diagnostics).toEqual([
      "pending_capture_storage_error",
      "pending_capture_storage_recovered",
      "clip_too_large",
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Pending clipboard capture exceeds history capacity",
      expect.objectContaining({ clipId: validUuid(15), encodedBytes: expect.any(Number) }),
    );
    warn.mockRestore();
  });

  it("uses the final queue length after mixed capacity rejection and recovery", async () => {
    const diagnostics: Array<{ code: string; pendingCount?: number }> = [];
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    const recovered: Clip[] = [];
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockRejectedValueOnce(new Error("first unavailable"))
        .mockRejectedValueOnce(new Error("first still unavailable"))
        .mockRejectedValueOnce(new Error("second unavailable"))
        .mockRejectedValueOnce(new HistoryPolicyError("clip_capacity"))
        .mockImplementationOnce(async (clip) => {
          recovered.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        }),
    };
    const ids = [validUuid(16), validUuid(17)];
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => ids.shift()!,
      onDiagnostic: (diagnostic, details) => diagnostics.push({ code: diagnostic, pendingCount: details?.pendingCount }),
    });
    await coordinator.capture("first");
    await coordinator.capture("second");

    await coordinator.retryPending();

    expect(recovered).toEqual([expect.objectContaining({ id: validUuid(17) })]);
    expect(coordinator.pending()).toEqual([]);
    expect(diagnostics.slice(-2)).toEqual([
      { code: "pending_capture_storage_recovered", pendingCount: undefined },
      { code: "clip_too_large", pendingCount: 0 },
    ]);
    warn.mockRestore();
  });

  it("retries a locally suppressed UUID with a fresh candidate ID", async () => {
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockResolvedValueOnce({ kind: "locally-suppressed", clip: {} as Clip, liveHandled: false })
        .mockImplementation(async (clip) => ({ kind: "newly-stored", clip, liveHandled: true })),
    };
    const ids = [validUuid(9), validUuid(10)];
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => ids.shift()!,
    });

    await coordinator.capture("value");

    expect((history.accept as jest.Mock).mock.calls.map(([clip]) => (clip as Clip).id)).toEqual([
      validUuid(9),
      validUuid(10),
    ]);
  });

  it("bounds pending storage failures by encoded Clip size", async () => {
    const diagnostics: Array<{ code: string; clipId?: string; encodedBytes?: number }> = [];
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    const coordinator = createClipCaptureCoordinator({
      history: { accept: async () => { throw new Error("storage unavailable"); } },
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(11),
      pendingMaxBytes: 1,
      onDiagnostic: (diagnostic, details) => diagnostics.push({ code: diagnostic, ...details }),
    });

    await coordinator.capture("too large for the configured queue");

    expect(coordinator.pending()).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "pending_capture_too_large",
        clipId: validUuid(11),
        encodedBytes: expect.any(Number),
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Pending clipboard capture dropped",
      expect.objectContaining({ clipId: validUuid(11), encodedBytes: expect.any(Number) }),
    );
    warn.mockRestore();
  });

  it("serializes Clear History with an in-flight pending retry", async () => {
    let releaseRetry: (() => void) | undefined;
    const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
    const durable: Clip[] = [];
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockRejectedValueOnce(new Error("storage unavailable"))
        .mockImplementation(async (clip) => {
          await retryGate;
          durable.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        }),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(14),
    });
    await coordinator.capture("queued");

    const retry = coordinator.retryPending();
    const clear = coordinator.clearHistory(async () => { durable.splice(0, durable.length); });
    releaseRetry?.();
    await Promise.all([retry, clear]);

    expect(durable).toEqual([]);
    expect(coordinator.pending()).toEqual([]);
  });

  it("retries a pending immutable Clip with capped backoff while active", async () => {
    jest.useFakeTimers();
    const recovered: Clip[] = [];
    const history: ClipHistoryWriter = {
      accept: jest
        .fn<Promise<ClipHistoryAcceptance>, [Clip]>()
        .mockRejectedValueOnce(new Error("storage unavailable"))
        .mockImplementation(async (clip) => ({ kind: "newly-stored", clip, liveHandled: true })),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(12),
    });
    coordinator.onRecovered((clip) => { recovered.push(clip); });
    coordinator.start();

    await coordinator.capture("queued");
    await jest.advanceTimersByTimeAsync(1_000);

    expect(recovered).toEqual([expect.objectContaining({ id: validUuid(12), content: "queued" })]);
    expect(coordinator.pending()).toEqual([]);
    coordinator.stop();
    jest.useRealTimers();
  });

  it("does not turn a post-storage notification failure into a storage retry", async () => {
    const diagnostics: string[] = [];
    const coordinator = createClipCaptureCoordinator({
      history: acceptingHistory(),
      originPeerId: async () => originPeerId,
      now: () => 1_000,
      makeId: () => validUuid(13),
      onStored: async () => { throw new Error("delivery unavailable"); },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    await expect(coordinator.capture("durable")).resolves.toMatchObject({ id: validUuid(13) });
    expect(coordinator.pending()).toEqual([]);
    expect(diagnostics).toEqual(["live_delivery_failed"]);
  });
});
