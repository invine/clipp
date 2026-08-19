import { isClipAcceptable, validateClip, type Clip } from "../models/Clip.js";
import type { ClipHistoryStore } from "../history/store.js";
import type { StreamingMessagingTransport } from "../messaging/transport.js";
import { HISTORY_MAX_FRAME_BYTES, HISTORY_PROTOCOL, encodeHistoryBatchFrame, readHistorySnapshot } from "../protocols/history.js";
import type { MembershipStatus } from "../pairing/membership.js";
import * as log from "../logger.js";

export type HistoryReconciliation = {
  start(): void;
  stop(): void;
  snapshotTo(peerId: string): Promise<void>;
};

export function createHistoryReconciliation(options: {
  transport: Pick<StreamingMessagingTransport, "getConnectedPeers" | "onPeerConnected" | "sendStream" | "onStream">;
  history: Pick<ClipHistoryStore, "accept" | "getById" | "query">;
  getLocalDeviceId: () => Promise<string>;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  onMembershipChanged?: (listener: () => void) => () => void;
  now?: () => number;
  maximumFrameBytes?: number;
}): HistoryReconciliation {
  const now = options.now ?? Date.now;
  const maximumFrameBytes = options.maximumFrameBytes ?? HISTORY_MAX_FRAME_BYTES;
  const outbound = new Set<string>();
  const inbound = new Set<string>();
  let started = false;
  let stopped = false;
  let stopMembershipListener: (() => void) | undefined;

  const isActive = async (peerId: string): Promise<boolean> =>
    await options.membershipStatus(peerId) === "active";

  async function *snapshotFrames(peerId: string): AsyncIterable<Uint8Array> {
    const items = await options.history.query();
    const ids = items
      .map((item) => item.clip)
      .sort(compareSnapshotClips)
      .map((clip) => clip.id);
    let batch: Clip[] = [];
    for (const id of ids) {
      if (!(await isActive(peerId))) return;
      let retained;
      try {
        retained = await options.history.getById(id);
      } catch (error) {
        log.warn("History snapshot read failed", { clipId: id, error: errorMessage(error) });
        continue;
      }
      const clip = retained?.clip;
      if (!clip || !validateClip(clip) || !isClipAcceptable(clip, now())) continue;
      try {
        encodeHistoryBatchFrame({ clips: [clip] }, maximumFrameBytes);
      } catch (error) {
        log.warn("History snapshot skipped ineligible Clip", { clipId: id, error: errorMessage(error) });
        continue;
      }
      const candidate = [...batch, clip];
      try {
        encodeHistoryBatchFrame({ clips: candidate }, maximumFrameBytes);
        batch = candidate;
      } catch {
        if (batch.length > 0) yield encodeHistoryBatchFrame({ clips: batch }, maximumFrameBytes);
        batch = [clip];
      }
    }
    if (batch.length > 0) yield encodeHistoryBatchFrame({ clips: batch }, maximumFrameBytes);
  }

  async function snapshotTo(peerId: string): Promise<void> {
    if (stopped || outbound.has(peerId) || peerId === await options.getLocalDeviceId() || !(await isActive(peerId))) return;
    outbound.add(peerId);
    try {
      await options.transport.sendStream(HISTORY_PROTOCOL, peerId, snapshotFrames(peerId));
    } catch (error) {
      log.warn("History snapshot delivery failed", { peerId, error: errorMessage(error) });
    } finally {
      outbound.delete(peerId);
    }
  }

  async function receive(from: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    if (stopped) return;
    if (inbound.has(from)) {
      log.warn("History snapshot busy", { peerId: from });
      throw new Error("history_snapshot_busy");
    }
    inbound.add(from);
    let imported = false;
    let failure: unknown;
    let storageFailed = false;
    try {
      if (!(await isActive(from))) throw new Error("history_sender_inactive");
      for await (const batch of readHistorySnapshot(chunks, maximumFrameBytes)) {
        for (const clip of batch.clips) {
          if (!(await isActive(from))) throw new Error("history_sender_inactive");
          if (!validateClip(clip) || !isClipAcceptable(clip, now())) continue;
          let accepted;
          try {
            accepted = await options.history.accept(clip, { liveHandled: false, admissionPriority: false });
          } catch (error) {
            storageFailed = true;
            log.warn("History snapshot storage failed", { peerId: from, clipId: clip.id, error: errorMessage(error) });
            throw error;
          }
          if (accepted.kind === "newly-stored") imported = true;
        }
      }
    } catch (error) {
      if (!storageFailed) {
        const message = errorMessage(error);
        if (message === "history_sender_inactive") log.warn("History snapshot sender inactive", { peerId: from });
        else log.warn("History snapshot framing failed", { peerId: from, error: message });
      }
      failure = error;
    } finally {
      inbound.delete(from);
    }
    if (imported) {
      const peers = options.transport.getConnectedPeers().filter((peerId) => peerId !== from);
      const propagation = Promise.all(peers.map((peerId) => snapshotTo(peerId)));
      if (failure) {
        void propagation;
        throw failure;
      }
      await propagation;
    }
    if (failure) throw failure;
  }

  function snapshotConnected(): void {
    for (const peerId of options.transport.getConnectedPeers()) void snapshotTo(peerId);
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onStream(HISTORY_PROTOCOL, receive);
      options.transport.onPeerConnected((peerId) => { void snapshotTo(peerId); });
      stopMembershipListener = options.onMembershipChanged?.(snapshotConnected);
      snapshotConnected();
    },
    stop(): void {
      stopped = true;
      inbound.clear();
      outbound.clear();
      stopMembershipListener?.();
      stopMembershipListener = undefined;
    },
    snapshotTo,
  };
}

function compareSnapshotClips(left: Clip, right: Clip): number {
  return right.capturedAt - left.capturedAt || compareRawUuidBytes(left.id, right.id);
}

function compareRawUuidBytes(left: string, right: string): number {
  const leftHex = left.replace(/-/g, "");
  const rightHex = right.replace(/-/g, "");
  return leftHex < rightHex ? -1 : leftHex > rightHex ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
