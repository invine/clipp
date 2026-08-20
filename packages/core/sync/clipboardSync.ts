import type { ClipboardService, LocalClipOptions } from "../clipboard/service";
import type { ClipHistoryStore } from "../history/store";
import { clipsHaveEqualImmutableFields, isClipAcceptable, validateClip, type Clip } from "../models/Clip";
import type { LiveClipGossip } from "./liveClipGossip";
import * as log from "../logger";

export type ClipboardSyncManagerOptions = {
  clipboard: ClipboardService;
  history: ClipHistoryStore;
  getLocalDeviceId: () => Promise<string>;
  now?: () => number;
  autoSync?: boolean;
  /** Coordinates history reconciliation when the persisted preference changes. */
  onAutoSyncChanged?: (enabled: boolean) => void;
  /** v1 live delivery. The authenticated sender is supplied out-of-band. */
  liveGossip?: LiveClipGossip;
  /** Rechecked immediately before a received live Clip is durably accepted. */
  isActiveMember?: (peerId: string) => Promise<boolean>;
};

export interface ClipboardSyncManager {
  start(): void;
  startLocalOnly(): void;
  stop(): Promise<void>;
  bindLiveGossip(liveGossip: LiveClipGossip): void;
  setAutoSync(enabled: boolean): void;
  isAutoSync(): boolean;
}

export function createClipboardSyncManager(
  options: ClipboardSyncManagerOptions
): ClipboardSyncManager {
  const now = options.now ?? Date.now;
  let running = false;
  let networkingEnabled = false;
  let autoSync = options.autoSync ?? true;
  let autoSyncGeneration = 0;

  let localIdPromise: Promise<string> | null = null;
  const inFlightRemote = new Set<string>();

  let currentLiveGossip: LiveClipGossip | null = null;
  const boundLiveGossip = new WeakSet<object>();
  let localCaptureQueue = Promise.resolve();
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
    const generation = autoSyncGeneration;
    try {
      const accepted = await options.history.accept(clip, { liveHandled: true });
      if (accepted.kind === "immutable-conflict" || accepted.kind === "locally-suppressed") return;
    } catch (err) {
      log.warn("Failed to store local clip", err);
      return;
    }
    if (!networkingEnabled || (!autoSync && !captureOptions?.shareNow)) return;
    if (!isClipAcceptable(clip, now())) return;
    const liveGossip = currentLiveGossip;
    if (liveGossip) {
      const shareNow = captureOptions?.shareNow === true;
      void forwardLiveClip(clip, undefined, shareNow, shareNow ? undefined : generation);
    }
  }

  async function isLiveSideEffectEligible(
    clip: Clip,
    from?: string,
    allowAutoSyncOverride = false,
    expectedAutoSyncGeneration?: number,
  ): Promise<boolean> {
    const generationChanged = (): boolean =>
      expectedAutoSyncGeneration !== undefined && expectedAutoSyncGeneration !== autoSyncGeneration;
    if (generationChanged() || !running || !networkingEnabled || (!autoSync && !allowAutoSyncOverride) || !isClipAcceptable(clip, now())) return false;
    if (from && options.isActiveMember && !(await options.isActiveMember(from))) return false;
    if (generationChanged() || (!autoSync && !allowAutoSyncOverride)) return false;
    try {
      const retained = await options.history.getById(clip.id);
      return !generationChanged()
        && (autoSync || allowAutoSyncOverride)
        && Boolean(retained && clipsHaveEqualImmutableFields(retained.clip, clip));
    } catch (error) {
      log.warn("Failed to recheck Clip before live side effect", error);
      return false;
    }
  }

  async function forwardLiveClip(
    clip: Clip,
    immediateSender?: string,
    allowAutoSyncOverride = false,
    expectedAutoSyncGeneration?: number,
  ): Promise<void> {
    const liveGossip = currentLiveGossip;
    if (!liveGossip || !(await isLiveSideEffectEligible(
      clip,
      undefined,
      allowAutoSyncOverride,
      expectedAutoSyncGeneration,
    ))) return;
    await liveGossip.forward(clip, immediateSender, allowAutoSyncOverride);
  }

  async function handleIncomingLiveClip(from: string, clip: Clip): Promise<void> {
    if (!running || !networkingEnabled || !autoSync || !validateClip(clip) || !isClipAcceptable(clip, now())) return;
    const generation = autoSyncGeneration;
    const localId = await getLocalId();
    if (from === localId || inFlightRemote.has(clip.id)) return;
    inFlightRemote.add(clip.id);
    try {
      // The source peer is libp2p-authenticated by LiveClipGossip. This is a
      // second check immediately before atomic persistence, covering revocation
      // that races with stream receipt.
      if (options.isActiveMember && !(await options.isActiveMember(from))) return;
      if (!running || !autoSync || generation !== autoSyncGeneration || !isClipAcceptable(clip, now())) return;
      let accepted;
      try {
        accepted = await options.history.accept(clip, { liveHandled: true, admissionPriority: true });
      } catch (error) {
        log.warn("Failed to store live Clip", error);
        return;
      }
      if (accepted.kind === "immutable-conflict" || accepted.kind === "locally-suppressed") return;
      if (accepted.kind === "newly-stored") void forwardLiveClip(clip, from, false, generation);
      if (!accepted.liveHandled) return;
      try {
        await options.clipboard.writeRemoteClip(clip, async () =>
          await isLiveSideEffectEligible(clip, from, false, generation)
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

  function enqueueLocalClip(clip: Clip, captureOptions?: LocalClipOptions): void {
    const next = localCaptureQueue.then(
      () => handleLocalClip(clip, captureOptions),
      () => handleLocalClip(clip, captureOptions),
    );
    localCaptureQueue = next.then(() => undefined, () => undefined);
  }

  options.clipboard.onLocalClip((clip, captureOptions) => {
    enqueueLocalClip(clip, captureOptions);
  });

  function bindLiveGossip(liveGossip: LiveClipGossip): void {
    currentLiveGossip = liveGossip;
    liveGossip.setAutoSync(autoSync);
    const object = liveGossip as unknown as object;
    if (!boundLiveGossip.has(object)) {
      boundLiveGossip.add(object);
      liveGossip.onClip(({ from, clip }) => enqueueIncomingLiveClip(from, clip));
    }
    if (running && networkingEnabled) liveGossip.start();
  }

  if (options.liveGossip) bindLiveGossip(options.liveGossip);

  return {
    start() {
      running = true;
      networkingEnabled = true;
      currentLiveGossip?.start();
      options.clipboard.start();
    },
    startLocalOnly() {
      running = true;
      networkingEnabled = false;
      currentLiveGossip?.stop();
      options.clipboard.start();
    },
    async stop() {
      running = false;
      networkingEnabled = false;
      currentLiveGossip?.stop();
      options.clipboard.stop();
      await Promise.all([localCaptureQueue, liveReceiveQueue]);
      inFlightRemote.clear();
    },
    bindLiveGossip,
    setAutoSync(enabled: boolean) {
      if (autoSync === enabled) return;
      autoSync = enabled;
      autoSyncGeneration += 1;
      currentLiveGossip?.setAutoSync(enabled);
      options.onAutoSyncChanged?.(enabled);
    },
    isAutoSync() {
      return autoSync;
    },
  };
}
