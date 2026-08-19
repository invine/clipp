import { isClipAcceptable, validateClip, type Clip } from "../models/Clip.js";
import type { ClipHistoryStore } from "../history/store.js";
import type { StreamingMessagingTransport } from "../messaging/transport.js";
import {
  HISTORY_MAX_FRAME_BYTES,
  HISTORY_PROTOCOL,
  HISTORY_REQUEST_PROTOCOL,
  encodeHistoryBatchFrame,
  encodeHistoryRequestFrame,
  readHistoryRequest,
  readHistorySnapshot,
} from "../protocols/history.js";
import type { MembershipStatus } from "../pairing/membership.js";
import * as log from "../logger.js";

export type HistoryReconciliation = {
  start(): void;
  stop(): void;
  snapshotTo(peerId: string): Promise<void>;
  setAutoSync(enabled: boolean): void;
};

export function createHistoryReconciliation(options: {
  transport: Pick<StreamingMessagingTransport, "getConnectedPeers" | "onPeerConnected" | "sendStream" | "onStream">;
  history: Pick<ClipHistoryStore, "accept" | "getById" | "query">;
  getLocalDeviceId: () => Promise<string>;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  onMembershipChanged?: (listener: () => void) => () => void;
  now?: () => number;
  maximumFrameBytes?: number;
  autoSync?: boolean;
}): HistoryReconciliation {
  const now = options.now ?? Date.now;
  const maximumFrameBytes = options.maximumFrameBytes ?? HISTORY_MAX_FRAME_BYTES;
  const outbound = new Map<string, { pending: boolean }>();
  const inbound = new Set<string>();
  let started = false;
  let stopped = false;
  let autoSync = options.autoSync ?? true;
  let autoSyncGeneration = 0;
  let stopMembershipListener: (() => void) | undefined;

  const isActive = async (peerId: string): Promise<boolean> =>
    await options.membershipStatus(peerId) === "active";

  const canExchange = (): boolean => !stopped && autoSync;

  async function *snapshotFrames(peerId: string, generation: number): AsyncIterable<Uint8Array> {
    const items = await options.history.query();
    const ids = items
      .map((item) => item.clip)
      .sort(compareSnapshotClips)
      .map((clip) => clip.id);
    let batch: Clip[] = [];
    for (const id of ids) {
      if (!canExchange() || generation !== autoSyncGeneration || !(await isActive(peerId))) return;
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
    if (batch.length > 0 && canExchange() && generation === autoSyncGeneration) {
      yield encodeHistoryBatchFrame({ clips: batch }, maximumFrameBytes);
    }
  }

  async function snapshotTo(peerId: string): Promise<void> {
    if (!canExchange()) return;
    const activeSnapshot = outbound.get(peerId);
    if (activeSnapshot) {
      activeSnapshot.pending = true;
      return;
    }
    const state = { pending: false };
    outbound.set(peerId, state);
    try {
      if (peerId === await options.getLocalDeviceId() || !(await isActive(peerId))) return;
      while (canExchange()) {
        const generation = autoSyncGeneration;
        try {
          await options.transport.sendStream(HISTORY_PROTOCOL, peerId, snapshotFrames(peerId, generation));
        } catch (error) {
          state.pending = false;
          log.warn("History snapshot delivery failed", { peerId, error: errorMessage(error) });
          return;
        }
        if (!canExchange() || generation !== autoSyncGeneration || !state.pending) return;
        state.pending = false;
      }
    } catch (error) {
      log.warn("History snapshot delivery failed", { peerId, error: errorMessage(error) });
    } finally {
      outbound.delete(peerId);
    }
  }

  async function requestSnapshotFrom(peerId: string): Promise<void> {
    if (!canExchange() || peerId === await options.getLocalDeviceId() || !(await isActive(peerId))) return;
    try {
      await options.transport.sendStream(HISTORY_REQUEST_PROTOCOL, peerId, (async function *() {
        yield encodeHistoryRequestFrame();
      })());
    } catch (error) {
      log.warn("History request delivery failed", { peerId, error: errorMessage(error) });
    }
  }

  async function receive(from: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    if (!canExchange()) return;
    if (inbound.has(from)) {
      log.warn("History snapshot busy", { peerId: from });
      throw new Error("history_snapshot_busy");
    }
    inbound.add(from);
    let imported = false;
    let failure: unknown;
    let storageFailed = false;
    try {
      if (!canExchange() || !(await isActive(from))) throw new Error("history_sender_inactive");
      for await (const batch of readHistorySnapshot(chunks, maximumFrameBytes)) {
        if (!canExchange() || !(await isActive(from))) throw new Error("history_sender_inactive");
        for (const clip of batch.clips) {
          if (!canExchange() || !(await isActive(from))) throw new Error("history_sender_inactive");
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
        void propagation.catch((error) => {
          log.warn("History snapshot propagation failed", { peerId: from, error: errorMessage(error) });
        });
        throw failure;
      }
      await propagation;
    }
    if (failure) throw failure;
  }

  function snapshotConnected(): void {
    if (!canExchange()) return;
    for (const peerId of options.transport.getConnectedPeers()) void snapshotTo(peerId);
  }

  function requestConnected(): void {
    if (!canExchange()) return;
    for (const peerId of options.transport.getConnectedPeers()) void requestSnapshotFrom(peerId);
  }

  async function receiveRequest(from: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    if (!canExchange() || !(await isActive(from))) return;
    await readHistoryRequest(chunks);
    if (canExchange() && await isActive(from)) await snapshotTo(from);
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onStream(HISTORY_REQUEST_PROTOCOL, receiveRequest);
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
    setAutoSync(enabled: boolean): void {
      if (autoSync === enabled) return;
      autoSync = enabled;
      autoSyncGeneration += 1;
      if (!enabled) {
        for (const state of outbound.values()) state.pending = false;
        return;
      }
      snapshotConnected();
      requestConnected();
    },
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
