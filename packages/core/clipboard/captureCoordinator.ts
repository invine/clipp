import { DEFAULT_CLIP_SHARING_LIFETIME_MS, type Clip } from "../models/Clip";
import { normalizeClipboardContent } from "./normalize";

export type ClipHistoryAcceptance = {
  kind: "newly-stored" | "exact-duplicate" | "immutable-conflict" | "locally-suppressed";
  clip: Clip;
  liveHandled: boolean;
};

export interface ClipHistoryWriter {
  accept(clip: Clip, options?: { liveHandled?: boolean }): Promise<ClipHistoryAcceptance>;
}

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
  onDiagnostic?: (diagnostic: "clip_id_collision_exhausted" | "invalid_capture") => void;
}): ClipCaptureCoordinator {
  let baseline: string | undefined;
  const pending: Clip[] = [];
  let operation = Promise.resolve();
  const serialize = async <Result>(work: () => Promise<Result>): Promise<Result> => {
    const next = operation.then(work, work);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };
  const store = async (clip: Clip): Promise<ClipHistoryAcceptance | null> => {
    try {
      return await options.history.accept(clip, { liveHandled: true });
    } catch {
      if (pending.length < 100) pending.push(clip);
      return null;
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
      return value.length === 0 ? null : captureUnserialized(value);
    }),
    capture: async (value) => serialize(async () => {
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
    pending: () => pending.slice(),
    retryPending: async () => serialize(async () => {
      for (let index = 0; index < pending.length;) {
        const clip = pending[index];
        try {
          const accepted = await options.history.accept(clip, { liveHandled: true });
          if (accepted.kind === "newly-stored") await options.onStored?.(clip);
          pending.splice(index, 1);
        } catch {
          index += 1;
        }
      }
    }),
  };
}
