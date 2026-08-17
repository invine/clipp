import { normalizeClipboardContent } from "./normalize";
import { Clip } from "../models/Clip";
import { ClipType } from "../models/enums";
import type { ClipCaptureCoordinator } from "./captureCoordinator";
import * as log from "../logger";

export interface ClipboardService {
  start(): void;
  stop(): void;
  onLocalClip(cb: (clip: Clip) => void): void;
  onRemoteClipWritten(cb: (clip: Clip) => void): void;
  writeRemoteClip(clip: Clip): Promise<void>;
  /**
   * Manually process a clipboard text value as if it were read by the watcher.
   * Useful for environments where the background script cannot directly read
   * from the clipboard (e.g. Chrome MV3 service workers).
   */
  processLocalText(text: string): Promise<void>;
}

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
    start: () => {
      // no-op: manual mode never polls
    },
    stop: () => {
      // no-op: manual mode never polls
    },
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

  const localHandlers: Array<(c: Clip) => void> = [];
  const remoteHandlers: Array<(c: Clip) => void> = [];
  let lastLocal: Clip | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let baseline: string | undefined;
  let operation = Promise.resolve();
  const serialize = async <Result>(work: () => Promise<Result>): Promise<Result> => {
    const next = operation.then(work, work);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };

  async function processLocalText(text: string): Promise<void> {
    log.debug("Processing local clipboard text");
    if (options.captureCoordinator) {
      const clip = await options.captureCoordinator.capture(text);
      if (clip) {
        lastLocal = clip;
        localHandlers.forEach((handler) => handler(clip));
      }
      return;
    }
    const senderId = await Promise.resolve(getSenderId());
    if (!text) return;
    const clip = normalizeClipboardContent(text, senderId, { now, makeId });
    if (!clip) return;
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    lastLocal = clip;
    localHandlers.forEach((h) => h(clip));
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

  async function writeRemoteClip(clip: Clip): Promise<void> {
    log.debug("Writing remote clip", clip.id);
    if (clip.id === lastLocal?.id) return;
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    log.debug("Writing clip to clipboard");
    await serialize(async () => {
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
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    onLocalClip: (cb) => localHandlers.push(cb),
    onRemoteClipWritten: (cb) => remoteHandlers.push(cb),
    processLocalText,
    writeRemoteClip,
  };
}
