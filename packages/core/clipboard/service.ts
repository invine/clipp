import { createWatcher } from "./watcher";
import { createWriter } from "./writer";
import { normalizeClipboardContent } from "./normalize";
import { DefaultClipboardHistoryStore } from "../history/store";
import { Clip } from "../models/Clip";
import { ClipType } from "../models/enums";
import * as chromePlatform from "./platform/chrome";
import * as androidPlatform from "./platform/android";

export interface ClipboardService {
  start(): void;
  stop(): void;
  onLocalClip(cb: (clip: Clip) => void): void;
  onRemoteClipWritten(cb: (clip: Clip) => void): void;
  writeRemoteClip(clip: Clip): Promise<void>;
  getLastLocalClip(): Clip | undefined;
  setAutoSync(enabled: boolean): void;
  isAutoSync(): boolean;
}

interface Options {
  pollIntervalMs?: number;
  sendClip?: (clip: Clip) => Promise<void>;
}

export function createClipboardService(
  platform: "chrome" | "android",
  options: Options = {}
): ClipboardService {
  const read = platform === "chrome" ? chromePlatform.readText : androidPlatform.readText;
  const write = platform === "chrome" ? chromePlatform.writeText : androidPlatform.writeText;

  const watcher = createWatcher(read, options.pollIntervalMs ?? 2000);
  const writer = createWriter(write);
  const history = new DefaultClipboardHistoryStore();
  const localHandlers: Array<(c: Clip) => void> = [];
  const remoteHandlers: Array<(c: Clip) => void> = [];
  const seenRemote = new Set<string>();
  let lastLocal: Clip | undefined;
  let autoSync = true;
  const sendClip = options.sendClip ?? (async () => {});

  watcher.onChange(async (text) => {
    const clip = normalizeClipboardContent(text, "local");
    if (!clip) return;
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    lastLocal = clip;
    await history.add(clip, "local", true);
    localHandlers.forEach((h) => h(clip));
    if (autoSync) {
      await sendClip(clip);
    }
  });

  async function writeRemoteClip(clip: Clip): Promise<void> {
    if (clip.id === lastLocal?.id) return;
    if (seenRemote.has(clip.id)) return;
    seenRemote.add(clip.id);
    if (clip.type !== ClipType.Text && clip.type !== ClipType.Url) return;
    await writer.write(clip);
    await history.add(clip, clip.senderId, false);
    remoteHandlers.forEach((h) => h(clip));
  }

  return {
    start: () => watcher.start(),
    stop: () => watcher.stop(),
    onLocalClip: (cb) => localHandlers.push(cb),
    onRemoteClipWritten: (cb) => remoteHandlers.push(cb),
    writeRemoteClip,
    getLastLocalClip: () => lastLocal,
    setAutoSync: (enabled) => {
      autoSync = enabled;
    },
    isAutoSync: () => autoSync,
  };
}
