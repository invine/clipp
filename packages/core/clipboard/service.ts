import { normalizeClipboardContent } from "./normalize";
import { Clip } from "../models/Clip";
import { ClipType } from "../models/enums";
import type { ClipCaptureCoordinator, ClipCaptureOptions } from "./captureCoordinator";
import { createSerializedExecutor } from "./serial";
import * as log from "../logger";

export interface ClipboardService {
  start(): void;
  stop(): void;
  onLocalClip(cb: (clip: Clip, options?: LocalClipOptions) => void): void;
  onRemoteClipWritten(cb: (clip: Clip) => void): void;
  reuseLocalClip(clip: Clip): Promise<Clip | null>;
  writeRemoteClip(clip: Clip, beforeWrite?: () => Promise<boolean>): Promise<void>;
  /** Drops captures that never reached durable history, after a successful Clear History. */
  discardPending?(): Promise<void>;
  /** Serializes durable Clear History with pending capture retries. */
  clearHistory(clearDurable: () => Promise<void>): Promise<void>;
  dismissHistoryError?(): void;
  /**
   * Manually process a clipboard text value as if it were read by the watcher.
   * Useful for environments where the background script cannot directly read
   * from the clipboard (e.g. Chrome MV3 service workers).
   */
  processLocalText(text: string, options?: LocalClipOptions): Promise<Clip | null>;
}

/** Delivery intent for an explicitly initiated local capture. */
export type LocalClipOptions = ClipCaptureOptions;

export type ClipboardReadFn = () => Promise<string>;
export type ClipboardWriteFn = (text: string) => Promise<void>;
export type GetSenderIdFn = () => string | Promise<string>;

export type ClipboardServiceBaseOptions = {
  getSenderId: GetSenderIdFn;
  writeText?: ClipboardWriteFn;
  now?: () => number;
  makeId?: () => string;
  captureCoordinator?: ClipCaptureCoordinator;
};

export type PollingClipboardOptions = ClipboardServiceBaseOptions & {
  readText: ClipboardReadFn;
  pollIntervalMs?: number;
};

export type ManualClipboardOptions = ClipboardServiceBaseOptions & {
  readText?: ClipboardReadFn;
};

/**
 * Polling clipboard service: reads from the system clipboard on an interval.
 * Callers must provide `readText` (and optionally `writeText`).
 */
export function createPollingClipboardService(
  options: PollingClipboardOptions
): ClipboardService {
  return createClipboardService({
    ...options,
    captureMode: "polling",
    readBackAvailable: true,
    pollIntervalMs: options.pollIntervalMs ?? 2000,
  });
}

/**
 * Manual clipboard service: does not poll. Local clips must be fed via
 * `processLocalText(text)`. Useful in environments that cannot read the
 * clipboard (e.g. Chrome MV3 service worker).
 */
export function createManualClipboardService(
  options: ManualClipboardOptions
): ClipboardService {
  const svc = createClipboardService({
    ...options,
    captureMode: "manual",
    readBackAvailable: options.readText !== undefined,
    readText: options.readText ?? (async () => ""),
    pollIntervalMs: 0,
  });
  return {
    ...svc,
    // The shared service starts capture recovery but still never polls.
    start: svc.start,
    stop: svc.stop,
  };
}

function createClipboardService(
  options: ClipboardServiceBaseOptions & {
    captureMode: "polling" | "manual";
    readBackAvailable: boolean;
    readText: ClipboardReadFn;
    pollIntervalMs: number;
  }
): ClipboardService {
  const read: ClipboardReadFn = options.readText;
  const write: ClipboardWriteFn = options.writeText ?? (async () => { });
  const getSenderId: GetSenderIdFn = options.getSenderId;
  const now = options.now;
  const makeId = options.makeId;
  const captureMode = options.captureMode;
  const readBackAvailable = options.readBackAvailable;
  const pollIntervalMs = options.pollIntervalMs;

  const localHandlers: Array<(clip: Clip, options?: LocalClipOptions) => void> = [];
  const remoteHandlers: Array<(c: Clip) => void> = [];
  let lastLocal: Clip | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let baseline: string | undefined;
  const serialize = createSerializedExecutor();

  options.captureCoordinator?.onRecovered((clip, captureOptions) => {
    publishLocalClip(clip, captureOptions);
  });

  function publishLocalClip(clip: Clip, captureOptions?: LocalClipOptions): void {
    lastLocal = clip;
    localHandlers.forEach((handler) => handler(clip, captureOptions));
  }

  async function processLocalText(text: string, captureOptions?: LocalClipOptions): Promise<Clip | null> {
    log.debug("Processing local clipboard text");
    if (options.captureCoordinator) {
      const pendingBefore = captureOptions?.shareNow
        ? new Set(options.captureCoordinator.pending().map((clip) => clip.id))
        : undefined;
      const clip = captureMode === "manual" && !captureOptions?.shareNow
        ? await options.captureCoordinator.observe(text)
        : await options.captureCoordinator.capture(text, captureOptions);
      if (
        captureOptions?.shareNow
        && !clip
        && !options.captureCoordinator.pending().some((pendingClip) => !pendingBefore?.has(pendingClip.id))
      ) {
        throw new Error("clip_capture_failed");
      }
      if (clip) publishLocalClip(clip, captureOptions);
      return clip;
    }
    const senderId = await Promise.resolve(getSenderId());
    if (!text) return null;
    const clip = normalizeClipboardContent(text, senderId, { now, makeId });
    if (!clip || (clip.type !== ClipType.Text && clip.type !== ClipType.Url)) {
      if (captureOptions?.shareNow) throw new Error("clip_capture_failed");
      return null;
    }
    publishLocalClip(clip, captureOptions);
    return clip;
  }

  async function checkOnce(): Promise<void> {
    try {
      await serialize(async () => {
        const text = await read();
        if (options.captureCoordinator) {
          const clip = baseline === undefined
            ? (await options.captureCoordinator.baseline(text), null)
            : await options.captureCoordinator.observe(text);
          baseline = text;
          if (clip) publishLocalClip(clip);
          return;
        }
        if (baseline === undefined) {
          baseline = text;
          return;
        }
        if (text === baseline) return;
        baseline = text;
        if (!text) return;
        log.debug("Clipboard changed");
        await processLocalText(text);
      });
    } catch {
      // ignore read errors
    }
  }

  async function writeRemoteClip(clip: Clip, beforeWrite?: () => Promise<boolean>): Promise<void> {
    log.debug("Writing remote clip", clip.id);
    if (clip.id === lastLocal?.id) return;
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    log.debug("Writing clip to clipboard");
    await serialize(async () => {
      if (beforeWrite && !(await beforeWrite())) return;
      if (options.captureCoordinator) {
        await options.captureCoordinator.writeRemote(
          clip,
          write,
          readBackAvailable ? read : undefined,
        );
        remoteHandlers.forEach((handler) => handler(clip));
        return;
      }
      await write(clip.content);
      try {
        baseline = await read();
      } catch {
        // The next successful observation establishes a safe baseline without capture.
        baseline = undefined;
      }
      remoteHandlers.forEach((h) => h(clip));
    });
  }

  async function reuseLocalClip(clip: Clip): Promise<Clip | null> {
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return null;
    return serialize(async () => {
      if (options.captureCoordinator) {
        const reused = await options.captureCoordinator.reuse(
          clip.content,
          write,
          readBackAvailable ? read : undefined,
        );
        baseline = options.captureCoordinator.baselineValue();
        if (reused) publishLocalClip(reused);
        return reused;
      }
      await write(clip.content);
      try { baseline = await read(); } catch { baseline = undefined; }
      return processLocalText(clip.content);
    });
  }

  return {
    start: () => {
      log.info("Clipboard service started");
      options.captureCoordinator?.start();
      if (timer) return;
      if (pollIntervalMs <= 0) return;
      void (async () => {
        await checkOnce();
        timer = setInterval(() => {
          void checkOnce();
        }, pollIntervalMs);
      })();
    },
    stop: () => {
      log.info("Clipboard service stopped");
      options.captureCoordinator?.stop();
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    onLocalClip: (cb) => localHandlers.push(cb),
    onRemoteClipWritten: (cb) => remoteHandlers.push(cb),
    processLocalText,
    reuseLocalClip,
    writeRemoteClip,
    clearHistory: options.captureCoordinator
      ? (clearDurable) => options.captureCoordinator!.clearHistory(clearDurable)
      : (clearDurable) => clearDurable(),
    discardPending: options.captureCoordinator
      ? () => options.captureCoordinator!.discardPending()
      : undefined,
  };
}
