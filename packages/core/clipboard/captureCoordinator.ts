import { DEFAULT_CLIP_SHARING_LIFETIME_MS, isCanonicalPeerId, type Clip } from "../models/Clip";
import type { ClipHistoryStore, HistoryAcceptance } from "../history/store";
import { HistoryPolicyError } from "../history/types";
import { normalizeClipboardContent } from "./normalize";
import { createSerializedExecutor } from "./serial";
import * as log from "../logger";

export type ClipHistoryAcceptance = HistoryAcceptance;
export type ClipHistoryWriter = Pick<ClipHistoryStore, "accept">;
export type ClipCaptureOptions = {
  shareNow?: boolean;
};

export type ClipCaptureDiagnostic =
  | "clip_id_collision_exhausted"
  | "invalid_capture"
  | "clip_too_large"
  | "pending_capture_too_large"
  | "pending_capture_storage_error"
  | "pending_capture_storage_recovered"
  | "pending_capture_dropped"
  | "live_delivery_failed";

export type ClipCaptureDiagnosticDetails = {
  clipId?: string;
  encodedBytes?: number;
  pendingCount?: number;
};

export type ClipCaptureCoordinator = {
  baseline(value: string): Promise<void>;
  observe(value: string): Promise<Clip | null>;
  capture(value: string, options?: ClipCaptureOptions): Promise<Clip | null>;
  writeRemote(clip: Clip, write: (value: string) => Promise<void>, readBack?: () => Promise<string>): Promise<void>;
  baselineValue(): string | undefined;
  pending(): readonly Clip[];
  discardPending(): Promise<void>;
  clearHistory(clearDurable: () => Promise<void>): Promise<void>;
  retryPending(): Promise<void>;
  start(): void;
  stop(): void;
  onRecovered(cb: (clip: Clip, options?: ClipCaptureOptions) => void | Promise<void>): void;
};

export function createClipCaptureCoordinator(options: {
  history: ClipHistoryWriter;
  originPeerId: () => string | Promise<string>;
  now?: () => number;
  makeId?: () => string;
  sharingLifetimeMs?: () => number;
  onStored?: (clip: Clip) => void | Promise<void>;
  pendingMaxClips?: number;
  pendingMaxBytes?: number;
  onDiagnostic?: (diagnostic: ClipCaptureDiagnostic, details?: ClipCaptureDiagnosticDetails) => void;
}): ClipCaptureCoordinator {
  let baseline: string | undefined;
  const pending: Array<{ clip: Clip; bytes: number; options?: ClipCaptureOptions }> = [];
  let pendingBytes = 0;
  const pendingMaxClips = options.pendingMaxClips ?? 100;
  const pendingMaxBytes = options.pendingMaxBytes ?? 10 * 1024 * 1024;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let retryDelayMs = 1_000;
  const recoveredListeners: Array<(clip: Clip, options?: ClipCaptureOptions) => void | Promise<void>> = [];
  const serialize = createSerializedExecutor();
  let schedulePendingRetry = (): void => {};
  const store = async (clip: Clip, captureOptions?: ClipCaptureOptions): Promise<HistoryAcceptance | null> => {
    try {
      return await options.history.accept(clip, { liveHandled: true });
    } catch (error) {
      if (error instanceof HistoryPolicyError && error.code === "clip_capacity") {
        options.onDiagnostic?.("clip_too_large", { pendingCount: pending.length });
        return null;
      }
      const bytes = new TextEncoder().encode(JSON.stringify(clip)).byteLength;
      if (bytes > pendingMaxBytes || pendingMaxClips <= 0) {
        const details = { clipId: clip.id, encodedBytes: bytes, pendingCount: pending.length };
        log.warn("Pending clipboard capture dropped", details);
        options.onDiagnostic?.("pending_capture_too_large", details);
        return null;
      }
      while (pending.length > 0 && (pending.length >= pendingMaxClips || pendingBytes + bytes > pendingMaxBytes)) {
        const discarded = pending.shift()!;
        pendingBytes -= discarded.bytes;
        const details = { clipId: discarded.clip.id, encodedBytes: discarded.bytes, pendingCount: pending.length };
        log.warn("Pending clipboard capture evicted", details);
        options.onDiagnostic?.("pending_capture_dropped", details);
      }
      pending.push({ clip, bytes, options: captureOptions });
      pendingBytes += bytes;
      options.onDiagnostic?.("pending_capture_storage_error");
      schedulePendingRetry();
      return null;
    }
  };
  const retryPendingUnserialized = async (): Promise<void> => {
    const hadPendingCaptures = pending.length > 0;
    let newestCurrentRecovered: { clip: Clip; options?: ClipCaptureOptions } | undefined;
    const capacityRejected: ClipCaptureDiagnosticDetails[] = [];
    for (let index = 0; index < pending.length;) {
      const capture = pending[index];
      try {
        const accepted = await options.history.accept(capture.clip, { liveHandled: true });
        pending.splice(index, 1);
        pendingBytes -= capture.bytes;
        if (accepted.kind === "newly-stored" && capture.clip.content === baseline) {
          newestCurrentRecovered = { clip: capture.clip, options: capture.options };
        }
      } catch (error) {
        if (error instanceof HistoryPolicyError && error.code === "clip_capacity") {
          pending.splice(index, 1);
          pendingBytes -= capture.bytes;
          const details = {
            clipId: capture.clip.id,
            encodedBytes: capture.bytes,
            pendingCount: pending.length,
          };
          log.warn("Pending clipboard capture exceeds history capacity", details);
          capacityRejected.push(details);
          continue;
        }
        index += 1;
      }
    }
    if (newestCurrentRecovered) {
      for (const listener of recoveredListeners) {
        try {
          await listener(newestCurrentRecovered.clip, newestCurrentRecovered.options);
        } catch {
          options.onDiagnostic?.("live_delivery_failed");
        }
      }
    }
    if (pending.length === 0) {
      retryDelayMs = 1_000;
      if (hadPendingCaptures) options.onDiagnostic?.("pending_capture_storage_recovered");
    }
    for (const details of capacityRejected) {
      options.onDiagnostic?.("clip_too_large", { ...details, pendingCount: pending.length });
    }
    schedulePendingRetry();
  };
  schedulePendingRetry = () => {
    if (!running || retryTimer || pending.length === 0) return;
    const delayMs = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void serialize(retryPendingUnserialized);
    }, delayMs);
  };
  const captureUnserialized = async (value: string, captureOptions?: ClipCaptureOptions): Promise<Clip | null> => {
    if (value.length === 0) return null;
    const immutable = {
      originPeerId: await options.originPeerId(),
      capturedAt: (options.now ?? Date.now)(),
      sharingLifetimeMs: options.sharingLifetimeMs?.() ?? DEFAULT_CLIP_SHARING_LIFETIME_MS,
    };
    if (!isCanonicalPeerId(immutable.originPeerId)) {
      options.onDiagnostic?.("invalid_capture");
      return null;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clip = normalizeClipboardContent(value, immutable.originPeerId, {
        now: () => immutable.capturedAt,
        makeId: options.makeId,
        sharingLifetimeMs: immutable.sharingLifetimeMs,
      });
      if (!clip) {
        options.onDiagnostic?.("invalid_capture");
        return null;
      }
      const accepted = await store(clip, captureOptions);
      if (!accepted) return null;
      if (accepted.kind === "newly-stored") {
        try {
          await options.onStored?.(clip);
        } catch {
          options.onDiagnostic?.("live_delivery_failed");
        }
        return clip;
      }
      if (accepted.kind === "exact-duplicate") return accepted.clip;
    }
    options.onDiagnostic?.("clip_id_collision_exhausted");
    return null;
  };
  const discardPendingUnserialized = (): void => {
    const hadPendingCaptures = pending.length > 0;
    pending.splice(0, pending.length);
    pendingBytes = 0;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    if (hadPendingCaptures) options.onDiagnostic?.("pending_capture_storage_recovered");
  };

  return {
    baseline: async (value) => { await serialize(async () => { baseline = value; }); },
    observe: async (value) => serialize(async () => {
      if (value === baseline) return null;
      baseline = value;
      await retryPendingUnserialized();
      return value.length === 0 ? null : captureUnserialized(value);
    }),
    capture: async (value, captureOptions) => serialize(async () => {
      baseline = value;
      await retryPendingUnserialized();
      const result = await captureUnserialized(value, captureOptions);
      return result;
    }),
    writeRemote: async (clip, write, readBack) => serialize(async () => {
      await write(clip.content);
      if (!readBack) {
        baseline = clip.content;
        return;
      }
      try { baseline = await readBack(); } catch { baseline = undefined; }
    }),
    baselineValue: () => baseline,
    pending: () => pending.map((capture) => capture.clip),
    discardPending: async () => serialize(async () => discardPendingUnserialized()),
    clearHistory: async (clearDurable) => serialize(async () => {
      await clearDurable();
      discardPendingUnserialized();
    }),
    retryPending: async () => serialize(retryPendingUnserialized),
    start: () => {
      running = true;
      schedulePendingRetry();
    },
    stop: () => {
      running = false;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
    },
    onRecovered: (listener) => recoveredListeners.push(listener),
  };
}
