import { DEFAULT_CLIP_SHARING_LIFETIME_MS, type Clip } from "../models/Clip";
import type { ClipHistoryStore, HistoryAcceptance } from "../history/store";
import { normalizeClipboardContent } from "./normalize";

export type ClipHistoryAcceptance = HistoryAcceptance;
export type ClipHistoryWriter = Pick<ClipHistoryStore, "accept">;

export type ClipCaptureCoordinator = {
  baseline(value: string): Promise<void>;
  observe(value: string): Promise<Clip | null>;
  capture(value: string): Promise<Clip | null>;
  writeRemote(clip: Clip, write: (value: string) => Promise<void>, readBack?: () => Promise<string>): Promise<void>;
  baselineValue(): string | undefined;
  pending(): readonly Clip[];
  retryPending(): Promise<void>;
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
  pendingRetryLimit?: number;
  onDiagnostic?: (diagnostic:
    | "clip_id_collision_exhausted"
    | "invalid_capture"
    | "pending_capture_dropped"
    | "pending_retry_exhausted") => void;
}): ClipCaptureCoordinator {
  let baseline: string | undefined;
  const pending: Array<{ clip: Clip; bytes: number; retries: number }> = [];
  let pendingBytes = 0;
  const pendingMaxClips = options.pendingMaxClips ?? 100;
  const pendingMaxBytes = options.pendingMaxBytes ?? 10 * 1024 * 1024;
  const pendingRetryLimit = options.pendingRetryLimit ?? 3;
  let operation = Promise.resolve();
  const serialize = async <Result>(work: () => Promise<Result>): Promise<Result> => {
    const next = operation.then(work, work);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };
  const store = async (clip: Clip): Promise<HistoryAcceptance | null> => {
    try {
      return await options.history.accept(clip, { liveHandled: true });
    } catch {
      const bytes = new TextEncoder().encode(JSON.stringify(clip)).byteLength;
      if (bytes > pendingMaxBytes || pendingMaxClips <= 0) {
        options.onDiagnostic?.("pending_capture_dropped");
        return null;
      }
      while (pending.length > 0 && (pending.length >= pendingMaxClips || pendingBytes + bytes > pendingMaxBytes)) {
        const discarded = pending.shift()!;
        pendingBytes -= discarded.bytes;
        options.onDiagnostic?.("pending_capture_dropped");
      }
      pending.push({ clip, bytes, retries: 0 });
      pendingBytes += bytes;
      return null;
    }
  };
  const retryPendingUnserialized = async (): Promise<void> => {
    for (let index = 0; index < pending.length;) {
      const capture = pending[index];
      try {
        const accepted = await options.history.accept(capture.clip, { liveHandled: true });
        if (accepted.kind === "newly-stored") await options.onStored?.(capture.clip);
        pending.splice(index, 1);
        pendingBytes -= capture.bytes;
      } catch {
        capture.retries += 1;
        if (capture.retries >= pendingRetryLimit) {
          pending.splice(index, 1);
          pendingBytes -= capture.bytes;
          options.onDiagnostic?.("pending_retry_exhausted");
        } else {
          index += 1;
        }
      }
    }
  };
  const captureUnserialized = async (value: string): Promise<Clip | null> => {
    if (value.length === 0) return null;
    const immutable = {
      originPeerId: await options.originPeerId(),
      capturedAt: (options.now ?? Date.now)(),
      sharingLifetimeMs: options.sharingLifetimeMs?.() ?? DEFAULT_CLIP_SHARING_LIFETIME_MS,
    };
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
      const accepted = await store(clip);
      if (!accepted) return null;
      if (accepted.kind === "newly-stored") {
        await options.onStored?.(clip);
        return clip;
      }
      if (accepted.kind === "exact-duplicate") return accepted.clip;
    }
    options.onDiagnostic?.("clip_id_collision_exhausted");
    return null;
  };

  return {
    baseline: async (value) => { await serialize(async () => { baseline = value; }); },
    observe: async (value) => serialize(async () => {
      if (value === baseline) return null;
      baseline = value;
      await retryPendingUnserialized();
      return value.length === 0 ? null : captureUnserialized(value);
    }),
    capture: async (value) => serialize(async () => {
      await retryPendingUnserialized();
      const result = await captureUnserialized(value);
      baseline = value;
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
    retryPending: async () => serialize(retryPendingUnserialized),
  };
}
