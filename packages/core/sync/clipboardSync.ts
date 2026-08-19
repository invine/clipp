import type { ClipboardService, LocalClipOptions } from "../clipboard/service";
import type { ClipHistoryStore } from "../history/store";
import type { HistoryItem } from "../models/HistoryItem";
import {
  createClipMessage,
  type ClipMessage,
} from "../protocols/clip";
import { clipsHaveEqualImmutableFields, isClipAcceptable, validateClip, type Clip } from "../models/Clip";
import type { LiveClipGossip } from "./liveClipGossip";
import * as log from "../logger";

export type MessagingPort = {
  broadcast(msg: ClipMessage): Promise<void>;
  onMessage(cb: (msg: ClipMessage) => void): void;
};

export type ClipboardSyncManagerOptions = {
  clipboard: ClipboardService;
  history: ClipHistoryStore;
  getLocalDeviceId: () => Promise<string>;
  now?: () => number;
  autoSync?: boolean;
  /** v1 live delivery. The authenticated sender is supplied out-of-band. */
  liveGossip?: LiveClipGossip;
  /** Rechecked immediately before a received live Clip is durably accepted. */
  isActiveMember?: (peerId: string) => Promise<boolean>;
  /** @deprecated Legacy JSON clip messaging, retained only for transition tests. */
  messaging?: MessagingPort;
};

export interface ClipboardSyncManager {
  start(): void;
  stop(): void;
  bindMessaging(messaging: MessagingPort): void;
  bindLiveGossip(liveGossip: LiveClipGossip): void;
  setAutoSync(enabled: boolean): void;
  isAutoSync(): boolean;
}

export function createClipboardSyncManager(
  options: ClipboardSyncManagerOptions
): ClipboardSyncManager {
  const now = options.now ?? Date.now;
  let running = false;
  let autoSync = options.autoSync ?? true;

  let localIdPromise: Promise<string> | null = null;
  const inFlightRemote = new Set<string>();

  let currentMessaging: MessagingPort | null = null;
  const boundMessaging = new WeakSet<object>();
  let currentLiveGossip: LiveClipGossip | null = null;
  const boundLiveGossip = new WeakSet<object>();
  let liveReceiveQueue = Promise.resolve();

  // TODO: why not set localIdPromise right away?
  async function getLocalId(): Promise<string> {
    if (!localIdPromise) {
      localIdPromise = (async () => await options.getLocalDeviceId())();
    }
    return await localIdPromise;
  }

  async function handleLocalClip(clip: Clip, captureOptions?: LocalClipOptions): Promise<void> {
    if (!running) return;
    const localId = await getLocalId();
    try {
      if ("accept" in options.history && typeof options.history.accept === "function") {
        const accepted = await options.history.accept(clip, { liveHandled: true });
        if (accepted.kind === "immutable-conflict" || accepted.kind === "locally-suppressed") return;
      } else {
        await options.history.add(clip, localId, true);
      }
    } catch (err) {
      log.warn("Failed to store local clip", err);
      return;
    }
    if (!autoSync && !captureOptions?.shareNow) return;
    if (!isClipAcceptable(clip, now())) return;
    const liveGossip = currentLiveGossip;
    if (liveGossip) {
      void forwardLiveClip(clip, undefined, captureOptions?.shareNow === true);
      return;
    }
    const messaging = currentMessaging;
    if (!messaging) return;
    const msg: ClipMessage = createClipMessage({
      from: localId,
      clip,
      sentAt: now(),
    });
    try {
      await messaging.broadcast(msg);
    } catch (err) {
      log.warn("Failed to broadcast clip", err);
    }
  }

  async function handleIncomingMessage(msg: ClipMessage): Promise<void> {
    if (!running) return;
    if (!msg || msg.type !== "clip") return;
    const clip = msg.payload.clip;
    if (!validateClip(clip)) return;

    const localId = await getLocalId();
    if (msg.from === localId) return;

    if (inFlightRemote.has(clip.id)) return;
    inFlightRemote.add(clip.id);
    try {
      try {
        if ("accept" in options.history && typeof options.history.accept === "function") {
          const accepted = await options.history.accept(clip, { liveHandled: true });
          if (accepted.kind !== "newly-stored" && !accepted.liveHandled) return;
        } else {
          const existing = await options.history.getById(clip.id);
          if (existing) return;
          await options.history.add(clip, msg.from, false);
        }
      } catch (err) {
        log.warn("Failed to store remote clip", err);
        return;
      }

      try {
        await options.clipboard.writeRemoteClip(clip, async () => {
          // The service evaluates this within its serialized write just before
          // touching the platform clipboard, closing Delete/Clear's queue race.
          let retained: HistoryItem | null;
          try {
            retained = await options.history.getById(clip.id);
          } catch (err) {
            log.warn("Failed to recheck remote clip before clipboard application", err);
            return false;
          }
          return Boolean(retained && clipsHaveEqualImmutableFields(retained.clip, clip));
        });
      } catch (err) {
        log.warn("Failed to apply remote clip to clipboard", err);
      }
    } finally {
      inFlightRemote.delete(clip.id);
    }
  }

  async function isLiveSideEffectEligible(clip: Clip, from?: string, allowAutoSyncOverride = false): Promise<boolean> {
    if (!running || (!autoSync && !allowAutoSyncOverride) || !isClipAcceptable(clip, now())) return false;
    if (from && options.isActiveMember && !(await options.isActiveMember(from))) return false;
    try {
      const retained = await options.history.getById(clip.id);
      return Boolean(retained && clipsHaveEqualImmutableFields(retained.clip, clip));
    } catch (error) {
      log.warn("Failed to recheck Clip before live side effect", error);
      return false;
    }
  }

  async function forwardLiveClip(clip: Clip, immediateSender?: string, allowAutoSyncOverride = false): Promise<void> {
    const liveGossip = currentLiveGossip;
    if (!liveGossip || !(await isLiveSideEffectEligible(clip, undefined, allowAutoSyncOverride))) return;
    await liveGossip.forward(clip, immediateSender);
  }

  async function handleIncomingLiveClip(from: string, clip: Clip): Promise<void> {
    if (!running || !validateClip(clip) || !isClipAcceptable(clip, now())) return;
    const localId = await getLocalId();
    if (from === localId || inFlightRemote.has(clip.id)) return;
    inFlightRemote.add(clip.id);
    try {
      // The source peer is libp2p-authenticated by LiveClipGossip. This is a
      // second check immediately before atomic persistence, covering revocation
      // that races with stream receipt.
      if (options.isActiveMember && !(await options.isActiveMember(from))) return;
      let accepted;
      try {
        accepted = await options.history.accept(clip, { liveHandled: true, admissionPriority: true });
      } catch (error) {
        log.warn("Failed to store live Clip", error);
        return;
      }
      if (accepted.kind === "immutable-conflict" || accepted.kind === "locally-suppressed") return;
      if (accepted.kind === "newly-stored") void forwardLiveClip(clip, from);
      if (!accepted.liveHandled) return;
      try {
        await options.clipboard.writeRemoteClip(clip, async () =>
          await isLiveSideEffectEligible(clip, from)
        );
      } catch (error) {
        // The durable record remains and there is deliberately no automatic retry.
        log.warn("Failed to apply live Clip to clipboard", error);
      }
    } finally {
      inFlightRemote.delete(clip.id);
    }
  }

  function enqueueIncomingLiveClip(from: string, clip: Clip): void {
    const next = liveReceiveQueue.then(
      () => handleIncomingLiveClip(from, clip),
      () => handleIncomingLiveClip(from, clip),
    );
    liveReceiveQueue = next.then(() => undefined, () => undefined);
  }

  options.clipboard.onLocalClip((clip, captureOptions) => {
    void handleLocalClip(clip, captureOptions);
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

  function bindLiveGossip(liveGossip: LiveClipGossip): void {
    currentLiveGossip = liveGossip;
    const object = liveGossip as unknown as object;
    if (!boundLiveGossip.has(object)) {
      boundLiveGossip.add(object);
      liveGossip.onClip(({ from, clip }) => enqueueIncomingLiveClip(from, clip));
    }
    if (running) liveGossip.start();
  }

  if (options.messaging) {
    bindMessaging(options.messaging);
  }
  if (options.liveGossip) bindLiveGossip(options.liveGossip);

  return {
    start() {
      running = true;
      currentLiveGossip?.start();
      options.clipboard.start();
    },
    stop() {
      running = false;
      inFlightRemote.clear();
      currentLiveGossip?.stop();
      options.clipboard.stop();
    },
    bindMessaging,
    bindLiveGossip,
    setAutoSync(enabled: boolean) {
      autoSync = enabled;
    },
    isAutoSync() {
      return autoSync;
    },
  };
}
