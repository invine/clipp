import { isClipAcceptable, type Clip } from "../models/Clip.js";
import type { MembershipStatus } from "../pairing/membership.js";
import { LIVE_CLIP_PROTOCOL, decodeLiveClipFrame, encodeLiveClipFrame } from "../protocols/liveClip.js";
import type { MessagingTransport } from "../messaging/transport.js";
import * as log from "../logger.js";

export type LiveClipGossip = {
  start(): void;
  stop(): void;
  setAutoSync(enabled: boolean): void;
  /** Returns the number of eligible connected peers to which delivery was attempted. */
  forward(clip: Clip, immediateSender?: string, allowAutoSyncOverride?: boolean): Promise<number>;
  onClip(listener: (incoming: { from: string; clip: Clip }) => void): void;
  onPeerConnected(listener: (peerId: string) => void): void;
};

/**
 * The live transport boundary. It accepts authority only from libp2p's
 * authenticated connection identity and never from the frame payload.
 */
export function createLiveClipGossip(options: {
  transport: Pick<MessagingTransport, "send" | "onMessage" | "getConnectedPeers">
    & Partial<Pick<MessagingTransport, "onPeerConnected">>;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  now?: () => number;
}): LiveClipGossip {
  const now = options.now ?? Date.now;
  const listeners: Array<(incoming: { from: string; clip: Clip }) => void> = [];
  const peerConnectedListeners: Array<(peerId: string) => void> = [];
  let started = false;
  let stopped = false;
  let autoSync = true;
  let autoSyncGeneration = 0;

  const isActive = async (peerId: string): Promise<boolean> =>
    await options.membershipStatus(peerId) === "active";

  const receive = async (from: string, frame: Uint8Array): Promise<void> => {
    if (stopped || !autoSync) return;
    const generation = autoSyncGeneration;
    const decoded = decodeLiveClipFrame(frame);
    if (!decoded || !isClipAcceptable(decoded.clip, now())) return;
    // This check is deliberately immediately before publication to the
    // history-acceptance consumer; payload data never establishes authority.
    if (!(await isActive(from)) || stopped || !autoSync || generation !== autoSyncGeneration) return;
    for (const listener of listeners) listener({ from, clip: decoded.clip });
  };

  const sendTo = async (
    peerId: string,
    clip: Clip,
    allowAutoSyncOverride = false,
    expectedAutoSyncGeneration?: number,
  ): Promise<boolean> => {
    const generationChanged = (): boolean =>
      expectedAutoSyncGeneration !== undefined && expectedAutoSyncGeneration !== autoSyncGeneration;
    if (generationChanged() || stopped || (!autoSync && !allowAutoSyncOverride) || !isClipAcceptable(clip, now())) return false;
    if (!(await isActive(peerId)) || generationChanged() || stopped || (!autoSync && !allowAutoSyncOverride)) return false;
    try {
      await options.transport.send(LIVE_CLIP_PROTOCOL, peerId, encodeLiveClipFrame({ clip }));
    } catch (error) {
      // A peer's failure is isolated from the other connected Active Members.
      log.warn("Live Clip delivery failed", { peerId, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  };

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onMessage(LIVE_CLIP_PROTOCOL, (from, frame) => { void receive(from, frame); });
      options.transport.onPeerConnected?.((peerId) => {
        for (const listener of peerConnectedListeners) listener(peerId);
      });
    },
    stop(): void { stopped = true; },
    setAutoSync(enabled): void {
      if (autoSync === enabled) return;
      autoSync = enabled;
      autoSyncGeneration += 1;
    },
    async forward(clip, immediateSender, allowAutoSyncOverride = false): Promise<number> {
      if (stopped || (!autoSync && !allowAutoSyncOverride) || !isClipAcceptable(clip, now())) return 0;
      const generation = allowAutoSyncOverride ? undefined : autoSyncGeneration;
      // Reject an oversized frame before creating any recipient side effect.
      try {
        encodeLiveClipFrame({ clip });
      } catch (error) {
        log.warn("Live Clip not eligible for delivery", {
          reason: error instanceof Error ? error.message : "encoding_failed",
        });
        return 0;
      }
      const peers = options.transport.getConnectedPeers().filter((peerId) => peerId !== immediateSender);
      const offered = await Promise.all(peers.map((peerId) =>
        sendTo(peerId, clip, allowAutoSyncOverride, generation)
      ));
      return offered.filter(Boolean).length;
    },
    onClip(listener): void { listeners.push(listener); },
    onPeerConnected(listener): void { peerConnectedListeners.push(listener); },
  };
}
