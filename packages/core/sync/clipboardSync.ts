import type { ClipboardService } from "../clipboard/service";
import type { ClipHistoryStore } from "../history/store";
import type { ClipMessage } from "../protocols/clip";
import { validateClip, type Clip } from "../models/Clip";
import * as log from "../logger";

export type MessagingPort = {
  broadcast(msg: ClipMessage): Promise<void>;
  onMessage(cb: (msg: ClipMessage) => void): void;
};

export type ClipboardSyncControllerOptions = {
  clipboard: ClipboardService;
  history: ClipHistoryStore;
  getLocalDeviceId: () => Promise<string>;
  now?: () => number;
  autoSync?: boolean;
  messaging?: MessagingPort;
};

export interface ClipboardSyncController {
  start(): void;
  stop(): void;
  bindMessaging(messaging: MessagingPort): void;
  setAutoSync(enabled: boolean): void;
  isAutoSync(): boolean;
}

export function createClipboardSyncController(
  options: ClipboardSyncControllerOptions
): ClipboardSyncController {
  const now = options.now ?? Date.now;
  let running = false;
  let autoSync = options.autoSync ?? true;

  let localIdPromise: Promise<string> | null = null;
  const inFlightRemote = new Set<string>();

  let currentMessaging: MessagingPort | null = null;
  const boundMessaging = new WeakSet<object>();

  // TODO: why not set localIdPromise right away?
  async function getLocalId(): Promise<string> {
    if (!localIdPromise) {
      localIdPromise = (async () => await options.getLocalDeviceId())();
    }
    return await localIdPromise;
  }

  async function handleLocalClip(clip: Clip): Promise<void> {
    if (!running) return;
    const localId = await getLocalId();
    try {
      await options.history.add(clip, localId, true);
    } catch (err) {
      log.warn("Failed to store local clip", err);
    }
    if (!autoSync) return;
    const messaging = currentMessaging;
    if (!messaging) return;
    const msg: ClipMessage = {
      type: "CLIP",
      from: localId,
      clip,
      sentAt: now(),
    };
    try {
      await messaging.broadcast(msg);
    } catch (err) {
      log.warn("Failed to broadcast clip", err);
    }
  }

  async function handleIncomingMessage(msg: ClipMessage): Promise<void> {
    if (!running) return;
    if (!msg || msg.type !== "CLIP") return;
    const clip = msg.clip;
    if (!validateClip(clip)) return;

    const localId = await getLocalId();
    if (msg.from === localId) return;

    if (inFlightRemote.has(clip.id)) return;
    inFlightRemote.add(clip.id);
    try {
      try {
        const existing = await options.history.getById(clip.id);
        if (existing) return;
      } catch (err) {
        log.warn("Failed to check history for clip", err);
      }

      try {
        await options.history.add(clip, msg.from, false);
      } catch (err) {
        log.warn("Failed to store remote clip", err);
      }

      try {
        await options.clipboard.writeRemoteClip(clip);
      } catch (err) {
        log.warn("Failed to apply remote clip to clipboard", err);
      }
    } finally {
      inFlightRemote.delete(clip.id);
    }
  }

  options.clipboard.onLocalClip((clip) => {
    void handleLocalClip(clip);
  });

  function bindMessaging(messaging: MessagingPort): void {
    currentMessaging = messaging;
    const obj = messaging as unknown as object;
    if (boundMessaging.has(obj)) return;
    boundMessaging.add(obj);
    messaging.onMessage((msg) => {
      void handleIncomingMessage(msg);
    });
  }

  if (options.messaging) {
    bindMessaging(options.messaging);
  }

  return {
    start() {
      running = true;
      options.clipboard.start();
    },
    stop() {
      running = false;
      inFlightRemote.clear();
      options.clipboard.stop();
    },
    bindMessaging,
    setAutoSync(enabled: boolean) {
      autoSync = enabled;
    },
    isAutoSync() {
      return autoSync;
    },
  };
}
