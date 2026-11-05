import type { IdentityRotationCaptureCleanup } from "../clipboard/captureCoordinator";
import type { ClipboardService, LocalClipOptions } from "../clipboard/service";
import type { ClipHistoryStore } from "../history/store";
import {
  clipsHaveEqualImmutableFields,
  isClipAcceptable,
  validateClip,
  type Clip,
} from "../models/Clip";
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
  /** Android uses this durable post-acceptance result to bound clipboard recovery. */
  onLiveClipboardApplication?: (
    clip: Clip,
    result: "applied" | "failed"
  ) => void | Promise<void>;
};

export interface ClipboardSyncManager {
  start(): void;
  startLocalOnly(): void;
  activateNetwork(): void;
  retireNetwork(): void;
  stop(): Promise<void>;
  prepareIdentityRotationCleanup(): Promise<IdentityRotationCaptureCleanup>;
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
  const inFlightRemote = new Map<string, LiveClipGossip>();

  let currentLiveGossip: LiveClipGossip | null = null;
  const boundLiveGossip = new WeakSet<object>();
  let localCaptureQueue = Promise.resolve();
  let liveReceiveQueue = Promise.resolve();
  let shareNowQueue = Promise.resolve();

  // TODO: why not set localIdPromise right away?
  async function getLocalId(): Promise<string> {
    if (!localIdPromise) {
      localIdPromise = (async () => await options.getLocalDeviceId())();
    }
    return await localIdPromise;
  }

  async function handleLocalClip(
    clip: Clip,
    captureOptions?: LocalClipOptions
  ): Promise<void> {
    if (!running) return;
    const generation = autoSyncGeneration;
    try {
      const accepted = await options.history.accept(clip, {
        liveHandled: true,
        shareNowPending: captureOptions?.shareNow === true,
      });
      if (
        accepted.kind === "immutable-conflict" ||
        accepted.kind === "locally-suppressed"
      )
        return;
    } catch (err) {
      log.warn("Failed to store local clip", err);
      return;
    }
    if (!networkingEnabled || (!autoSync && !captureOptions?.shareNow)) return;
    if (!isClipAcceptable(clip, now())) {
      if (captureOptions?.shareNow)
        await options.history.completeShareNow(clip.id);
      return;
    }
    const liveGossip = currentLiveGossip;
    if (liveGossip) {
      const shareNow = captureOptions?.shareNow === true;
      if (shareNow) await offerShareNow(clip, liveGossip);
      else void forwardLiveClip(clip, undefined, false, generation, liveGossip);
    }
  }

  async function isLiveSideEffectEligible(
    clip: Clip,
    from?: string,
    allowAutoSyncOverride = false,
    expectedAutoSyncGeneration?: number,
    expectedLiveGossip?: LiveClipGossip
  ): Promise<boolean> {
    const generationChanged = (): boolean =>
      expectedAutoSyncGeneration !== undefined &&
      expectedAutoSyncGeneration !== autoSyncGeneration;
    if (
      (expectedLiveGossip && currentLiveGossip !== expectedLiveGossip) ||
      generationChanged() ||
      !running ||
      !networkingEnabled ||
      (!autoSync && !allowAutoSyncOverride) ||
      !isClipAcceptable(clip, now())
    )
      return false;
    if (from && options.isActiveMember && !(await options.isActiveMember(from)))
      return false;
    if (
      (expectedLiveGossip && currentLiveGossip !== expectedLiveGossip) ||
      generationChanged() ||
      (!autoSync && !allowAutoSyncOverride)
    )
      return false;
    try {
      const retained = await options.history.getById(clip.id);
      return (
        (!expectedLiveGossip || currentLiveGossip === expectedLiveGossip) &&
        !generationChanged() &&
        (autoSync || allowAutoSyncOverride) &&
        Boolean(retained && clipsHaveEqualImmutableFields(retained.clip, clip))
      );
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
    expectedLiveGossip?: LiveClipGossip
  ): Promise<number> {
    const liveGossip = expectedLiveGossip ?? currentLiveGossip;
    if (
      !liveGossip ||
      !(await isLiveSideEffectEligible(
        clip,
        undefined,
        allowAutoSyncOverride,
        expectedAutoSyncGeneration,
        liveGossip
      ))
    )
      return 0;
    return await liveGossip.forward(
      clip,
      immediateSender,
      allowAutoSyncOverride
    );
  }

  async function offerShareNow(
    clip: Clip,
    liveGossip: LiveClipGossip
  ): Promise<void> {
    const offered = await forwardLiveClip(
      clip,
      undefined,
      true,
      undefined,
      liveGossip
    );
    if (offered > 0) await options.history.completeShareNow(clip.id);
  }

  async function drainPendingShareNow(): Promise<void> {
    const liveGossip = currentLiveGossip;
    if (!liveGossip || !running || !networkingEnabled) return;
    const pending = (await options.history.query())
      .filter((item) => item.shareNowPending === true)
      .sort((left, right) => left.clip.capturedAt - right.clip.capturedAt);
    for (const item of pending) {
      if (currentLiveGossip !== liveGossip || !running || !networkingEnabled)
        return;
      if (!isClipAcceptable(item.clip, now())) {
        await options.history.completeShareNow(item.clip.id);
        continue;
      }
      await offerShareNow(item.clip, liveGossip);
    }
  }

  function enqueuePendingShareNow(): void {
    const next = shareNowQueue.then(drainPendingShareNow, drainPendingShareNow);
    shareNowQueue = next.then(
      () => undefined,
      () => undefined
    );
  }

  async function handleIncomingLiveClip(
    liveGossip: LiveClipGossip,
    from: string,
    clip: Clip
  ): Promise<void> {
    if (
      currentLiveGossip !== liveGossip ||
      !running ||
      !networkingEnabled ||
      !autoSync ||
      !validateClip(clip) ||
      !isClipAcceptable(clip, now())
    )
      return;
    const generation = autoSyncGeneration;
    const localId = await getLocalId();
    if (
      currentLiveGossip !== liveGossip ||
      from === localId ||
      inFlightRemote.get(clip.id) === liveGossip
    )
      return;
    inFlightRemote.set(clip.id, liveGossip);
    try {
      // The source peer is libp2p-authenticated by LiveClipGossip. This is a
      // second check immediately before atomic persistence, covering revocation
      // that races with stream receipt.
      if (options.isActiveMember && !(await options.isActiveMember(from)))
        return;
      if (
        currentLiveGossip !== liveGossip ||
        !running ||
        !networkingEnabled ||
        !autoSync ||
        generation !== autoSyncGeneration ||
        !isClipAcceptable(clip, now())
      )
        return;
      let accepted;
      try {
        accepted = await options.history.accept(clip, {
          liveHandled: true,
          admissionPriority: true,
        });
      } catch (error) {
        log.warn("Failed to store live Clip", error);
        return;
      }
      if (
        currentLiveGossip !== liveGossip ||
        !running ||
        !networkingEnabled ||
        !autoSync ||
        generation !== autoSyncGeneration
      )
        return;
      if (
        accepted.kind === "immutable-conflict" ||
        accepted.kind === "locally-suppressed"
      )
        return;
      if (accepted.kind === "newly-stored")
        void forwardLiveClip(clip, from, false, generation, liveGossip);
      if (!accepted.liveHandled) return;
      let applied = false;
      try {
        applied = await options.clipboard.writeRemoteClip(
          clip,
          async () =>
            await isLiveSideEffectEligible(
              clip,
              from,
              false,
              generation,
              liveGossip
            )
        );
      } catch (error) {
        try {
          await options.onLiveClipboardApplication?.(clip, "failed");
        } catch (markerError) {
          log.warn(
            "Failed to persist live Clip application recovery",
            markerError
          );
        }
        log.warn("Failed to apply live Clip to clipboard", error);
      }
      if (applied) {
        try {
          await options.onLiveClipboardApplication?.(clip, "applied");
        } catch (error) {
          log.warn("Failed to clear live Clip application recovery", error);
        }
      }
    } finally {
      if (inFlightRemote.get(clip.id) === liveGossip)
        inFlightRemote.delete(clip.id);
    }
  }

  function enqueueIncomingLiveClip(
    liveGossip: LiveClipGossip,
    from: string,
    clip: Clip
  ): void {
    const next = liveReceiveQueue.then(
      () => handleIncomingLiveClip(liveGossip, from, clip),
      () => handleIncomingLiveClip(liveGossip, from, clip)
    );
    liveReceiveQueue = next.then(
      () => undefined,
      () => undefined
    );
  }

  function enqueueLocalClip(
    clip: Clip,
    captureOptions?: LocalClipOptions
  ): void {
    const next = localCaptureQueue.then(
      () => handleLocalClip(clip, captureOptions),
      () => handleLocalClip(clip, captureOptions)
    );
    localCaptureQueue = next.then(
      () => undefined,
      () => undefined
    );
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
      liveGossip.onClip(({ from, clip }) =>
        enqueueIncomingLiveClip(liveGossip, from, clip)
      );
      liveGossip.onPeerConnected(() => {
        if (currentLiveGossip === liveGossip) enqueuePendingShareNow();
      });
    }
    if (running && networkingEnabled) {
      liveGossip.start();
      enqueuePendingShareNow();
    }
  }

  if (options.liveGossip) bindLiveGossip(options.liveGossip);

  function activateNetwork(): void {
    if (!running) {
      running = true;
      options.clipboard.start();
    }
    networkingEnabled = true;
    currentLiveGossip?.start();
    enqueuePendingShareNow();
  }

  function retireNetwork(): void {
    networkingEnabled = false;
    currentLiveGossip?.stop();
  }

  async function stop(): Promise<void> {
    running = false;
    networkingEnabled = false;
    currentLiveGossip?.stop();
    await options.clipboard.stop();
    await Promise.all([localCaptureQueue, liveReceiveQueue, shareNowQueue]);
    inFlightRemote.clear();
  }

  return {
    start() {
      if (!running) {
        running = true;
        options.clipboard.start();
      }
      activateNetwork();
    },
    startLocalOnly() {
      if (!running) {
        running = true;
        options.clipboard.start();
      }
      retireNetwork();
    },
    activateNetwork,
    retireNetwork,
    stop,
    async prepareIdentityRotationCleanup() {
      await stop();
      return (
        (await options.clipboard.prepareIdentityRotationCleanup?.()) ?? {
          rollback: async () => undefined,
        }
      );
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
