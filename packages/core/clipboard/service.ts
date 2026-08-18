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
  writeRemoteClip(clip: Clip, beforeWrite?: () => Promise<boolean>): Promise<void>;
  /** Drops captures that never reached durable history, after a successful Clear History. */
  discardPending?(): Promise<void>;
  /**
   * Manually process a clipboard text value as if it were read by the watcher.
   * Useful for environments where the background script cannot directly read
   * from the clipboard (e.g. Chrome MV3 service workers).
   */
  processLocalText(text: string, options?: LocalClipOptions): Promise<void>;
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

export type ManualClipboardOptions = ClipboardServiceBaseOptions;

/**
 * Polling clipboard service: reads from the system clipboard on an interval.
 * Callers must provide `readText` (and optionally `writeText`).
 */
export function createPollingClipboardService(
  options: PollingClipboardOptions
): ClipboardService {
  return createClipboardService({
    ...options,
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
    readText: async () => "",
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
    readText: ClipboardReadFn;
    pollIntervalMs: number;
  }
): ClipboardService {
  const read: ClipboardReadFn = options.readText;
  const write: ClipboardWriteFn = options.writeText ?? (async () => { });
  const getSenderId: GetSenderIdFn = options.getSenderId;
  const now = options.now;
  const makeId = options.makeId;
  const pollIntervalMs = options.pollIntervalMs;

  const localHandlers: Array<(clip: Clip, options?: LocalClipOptions) => void> = [];
  const remoteHandlers: Array<(c: Clip) => void> = [];
  let lastLocal: Clip | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let baseline: string | undefined;
  const serialize = createSerializedExecutor();

  options.captureCoordinator?.onRecovered((clip, captureOptions) => {
    lastLocal = clip;
    localHandlers.forEach((handler) => handler(clip, captureOptions));
  });

  async function processLocalText(text: string, captureOptions?: LocalClipOptions): Promise<void> {
    log.debug("Processing local clipboard text");
    if (options.captureCoordinator) {
      const clip = await options.captureCoordinator.capture(text, captureOptions);
      if (clip) {
        lastLocal = clip;
        localHandlers.forEach((handler) => handler(clip, captureOptions));
      }
      return;
    }
    const senderId = await Promise.resolve(getSenderId());
    if (!text) return;
    const clip = normalizeClipboardContent(text, senderId, { now, makeId });
    if (!clip) return;
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    lastLocal = clip;
    localHandlers.forEach((handler) => handler(clip, captureOptions));
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
          if (clip) {
            lastLocal = clip;
            localHandlers.forEach((handler) => handler(clip));
          }
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
        await options.captureCoordinator.writeRemote(clip, write, read);
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
    writeRemoteClip,
    discardPending: options.captureCoordinator
      ? () => options.captureCoordinator!.discardPending()
      : undefined,
  };
}
