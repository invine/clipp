import { isClipAcceptable, type Clip } from "../models/Clip.js";
import type { MembershipStatus } from "../pairing/membership.js";
import { LIVE_CLIP_PROTOCOL, decodeLiveClipFrame, encodeLiveClipFrame } from "../protocols/liveClip.js";
import type { MessagingTransport } from "../messaging/transport.js";
import * as log from "../logger.js";

export type LiveClipGossip = {
  start(): void;
  stop(): void;
  forward(clip: Clip, immediateSender?: string): Promise<void>;
  onClip(listener: (incoming: { from: string; clip: Clip }) => void): void;
};

/**
 * The live transport boundary. It accepts authority only from libp2p's
 * authenticated connection identity and never from the frame payload.
 */
export function createLiveClipGossip(options: {
  transport: Pick<MessagingTransport, "send" | "onMessage" | "getConnectedPeers">;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  now?: () => number;
}): LiveClipGossip {
  const now = options.now ?? Date.now;
  const listeners: Array<(incoming: { from: string; clip: Clip }) => void> = [];
  let started = false;
  let stopped = false;

  const isActive = async (peerId: string): Promise<boolean> =>
    await options.membershipStatus(peerId) === "active";

  const receive = async (from: string, frame: Uint8Array): Promise<void> => {
    if (stopped) return;
    const decoded = decodeLiveClipFrame(frame);
    if (!decoded || !isClipAcceptable(decoded.clip, now())) return;
    // This check is deliberately immediately before publication to the
    // history-acceptance consumer; payload data never establishes authority.
    if (!(await isActive(from)) || stopped) return;
    for (const listener of listeners) listener({ from, clip: decoded.clip });
  };

  const sendTo = async (peerId: string, clip: Clip): Promise<void> => {
    if (stopped || !isClipAcceptable(clip, now()) || !(await isActive(peerId)) || stopped) return;
    try {
      await options.transport.send(LIVE_CLIP_PROTOCOL, peerId, encodeLiveClipFrame({ clip }));
    } catch (error) {
      // A peer's failure is isolated from the other connected Active Members.
      log.warn("Live Clip delivery failed", { peerId, error: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onMessage(LIVE_CLIP_PROTOCOL, (from, frame) => { void receive(from, frame); });
    },
    stop(): void { stopped = true; },
    async forward(clip, immediateSender): Promise<void> {
      if (stopped || !isClipAcceptable(clip, now())) return;
      // Reject an oversized frame before creating any recipient side effect.
      try {
        encodeLiveClipFrame({ clip });
      } catch (error) {
        log.warn("Live Clip not eligible for delivery", {
          reason: error instanceof Error ? error.message : "encoding_failed",
        });
        return;
      }
      const peers = options.transport.getConnectedPeers().filter((peerId) => peerId !== immediateSender);
      await Promise.all(peers.map((peerId) => sendTo(peerId, clip)));
    },
    onClip(listener): void { listeners.push(listener); },
  };
}
