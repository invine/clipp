import { createWatcher } from "./watcher";
import { ClipboardWriteFn, createWriter } from "./writer";
import { normalizeClipboardContent } from "./normalize";
import { MemoryHistoryStore } from "../history/store";
import { Clip } from "../models/Clip";
import { ClipType } from "../models/enums";
import * as chromePlatform from "./platform/chrome";
import * as androidPlatform from "./platform/android";
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
  getLastLocalClip(): Clip | undefined;
  setAutoSync(enabled: boolean): void;
  isAutoSync(): boolean;
}

interface Options {
  pollIntervalMs?: number;
  sendClip?: (clip: Clip) => Promise<void>;
  readText?: () => Promise<string>;
  writeText?: ClipboardWriteFn;
}

export function createClipboardService(
  platform: "chrome" | "android" | "custom",
  options: Options = {}
): ClipboardService {
  const read =
    options.readText ||
    (platform === "chrome"
      ? chromePlatform.readText
      : platform === "android"
      ? androidPlatform.readText
      : async () => "");
  const write =
    options.writeText ||
    (platform === "chrome"
      ? chromePlatform.writeText
      : platform === "android"
      ? androidPlatform.writeText
      : async () => {});

  const watcher = createWatcher(read, options.pollIntervalMs ?? 2000);
  const writer = createWriter(write);
  const history = new MemoryHistoryStore();
  const localHandlers: Array<(c: Clip) => void> = [];
  const remoteHandlers: Array<(c: Clip) => void> = [];
  const seenRemote = new Set<string>();
  let lastLocal: Clip | undefined;
  let autoSync = true;
  const sendClip = options.sendClip ?? (async () => {});

  async function processLocalText(text: string): Promise<void> {
    log.debug("Processing local clipboard text");
    const clip = normalizeClipboardContent(text, "local");
    if (!clip) return;
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    lastLocal = clip;
    await history.add(clip, "local", true);
    localHandlers.forEach((h) => h(clip));
    if (autoSync) {
      await sendClip(clip);
    }
  }

  watcher.onChange(async (text) => {
    await processLocalText(text);
  });

  async function writeRemoteClip(clip: Clip): Promise<void> {
    log.debug("Writing remote clip", clip.id);
    if (clip.id === lastLocal?.id) return;
    if (seenRemote.has(clip.id)) return;
    seenRemote.add(clip.id);
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    await writer.write(clip);
    await history.add(clip, clip.senderId, false);
    remoteHandlers.forEach((h) => h(clip));
  }

  return {
    start: () => {
      log.info("Clipboard service started");
      watcher.start();
    },
    stop: () => {
      log.info("Clipboard service stopped");
      watcher.stop();
    },
    onLocalClip: (cb) => localHandlers.push(cb),
    onRemoteClipWritten: (cb) => remoteHandlers.push(cb),
    processLocalText,
    writeRemoteClip,
    getLastLocalClip: () => lastLocal,
    setAutoSync: (enabled) => {
      autoSync = enabled;
    },
    isAutoSync: () => autoSync,
  };
}
