import { isClipAcceptable, validateClip, type Clip } from "../models/Clip.js";
import type { ClipHistoryStore } from "../history/store.js";
import type { StreamingMessagingTransport } from "../messaging/transport.js";
import {
  HISTORY_MAX_FRAME_BYTES,
  HISTORY_PROTOCOL,
  HISTORY_REQUEST_PROTOCOL,
  HISTORY_STREAM_IDLE_TIMEOUT_MS,
  encodeHistoryBatchFrame,
  encodeHistoryRequestFrame,
  readHistoryRequest,
  readHistorySnapshot,
} from "../protocols/history.js";
import type { MembershipStatus } from "../pairing/membership.js";
import * as log from "../logger.js";

export type HistoryReconciliation = {
  start(): void;
  stop(): Promise<void>;
  snapshotTo(peerId: string): Promise<void>;
  setAutoSync(enabled: boolean): void;
};

type OutboundSnapshotState = {
  controller: AbortController;
  generation: number;
  pending: boolean;
  restartAfterCompletion: boolean;
};

export function createHistoryReconciliation(options: {
  transport: Pick<StreamingMessagingTransport, "getConnectedPeers" | "onPeerConnected" | "sendStream" | "onStream">;
  history: Pick<ClipHistoryStore, "accept" | "getById" | "query">;
  getLocalDeviceId: () => Promise<string>;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  onMembershipChanged?: (listener: () => void) => () => void;
  now?: () => number;
  maximumFrameBytes?: number;
  streamIdleTimeoutMs?: number;
  autoSync?: boolean;
}): HistoryReconciliation {
  const now = options.now ?? Date.now;
  const maximumFrameBytes = options.maximumFrameBytes ?? HISTORY_MAX_FRAME_BYTES;
  const streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? HISTORY_STREAM_IDLE_TIMEOUT_MS;
  const outbound = new Map<string, OutboundSnapshotState>();
  const outboundRequests = new Set<AbortController>();
  const inbound = new Set<string>();
  const inboundOperations = new Set<Promise<void>>();
  let started = false;
  let stopped = false;
  let autoSync = options.autoSync ?? true;
  let autoSyncGeneration = 0;
  let stopMembershipListener: (() => void) | undefined;

  const isActive = async (peerId: string): Promise<boolean> =>
    await options.membershipStatus(peerId) === "active";

  const canExchange = (generation = autoSyncGeneration): boolean =>
    !stopped && autoSync && generation === autoSyncGeneration;

  const isActiveForExchange = async (peerId: string, generation: number): Promise<boolean> => {
    if (!canExchange(generation)) return false;
    const active = await isActive(peerId);
    return active && canExchange(generation);
  };

  async function *snapshotFrames(peerId: string, generation: number): AsyncIterable<Uint8Array> {
    const items = await options.history.query();
    const ids = items
      .map((item) => item.clip)
      .sort(compareSnapshotClips)
      .map((clip) => clip.id);
    let batch: Clip[] = [];
    for (const id of ids) {
      if (!(await isActiveForExchange(peerId, generation))) return;
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
      if (activeSnapshot.generation === autoSyncGeneration) activeSnapshot.pending = true;
      else activeSnapshot.restartAfterCompletion = true;
      return;
    }
    const state: OutboundSnapshotState = {
      controller: new AbortController(),
      generation: autoSyncGeneration,
      pending: false,
      restartAfterCompletion: false,
    };
    outbound.set(peerId, state);
    try {
      if (peerId === await options.getLocalDeviceId() || !(await isActiveForExchange(peerId, state.generation))) return;
      while (canExchange(state.generation)) {
        try {
          await options.transport.sendStream(
            HISTORY_PROTOCOL,
            peerId,
            snapshotFrames(peerId, state.generation),
            { signal: state.controller.signal, idleTimeoutMs: streamIdleTimeoutMs },
          );
        } catch (error) {
          state.pending = false;
          if (!state.controller.signal.aborted) {
            log.warn("History snapshot delivery failed", { peerId, error: errorMessage(error) });
          }
          return;
        }
        if (!canExchange(state.generation) || !state.pending) return;
        state.pending = false;
      }
    } catch (error) {
      log.warn("History snapshot delivery failed", { peerId, error: errorMessage(error) });
    } finally {
      outbound.delete(peerId);
      if (state.restartAfterCompletion && canExchange()) void snapshotTo(peerId);
    }
  }

  async function requestSnapshotFrom(peerId: string): Promise<void> {
    const generation = autoSyncGeneration;
    if (!canExchange(generation)
      || peerId === await options.getLocalDeviceId()
      || !(await isActiveForExchange(peerId, generation))) return;
    const controller = new AbortController();
    outboundRequests.add(controller);
    try {
      await options.transport.sendStream(HISTORY_REQUEST_PROTOCOL, peerId, (async function *() {
        if (canExchange(generation)) yield encodeHistoryRequestFrame();
      })(), { signal: controller.signal, idleTimeoutMs: streamIdleTimeoutMs });
    } catch (error) {
      if (!controller.signal.aborted) {
        log.warn("History request delivery failed", { peerId, error: errorMessage(error) });
      }
    } finally {
      outboundRequests.delete(controller);
    }
  }

  async function receive(from: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    if (!canExchange()) return;
    const generation = autoSyncGeneration;
    if (inbound.has(from)) {
      log.warn("History snapshot busy", { peerId: from });
      throw new Error("history_snapshot_busy");
    }
    inbound.add(from);
    let imported = false;
    let failure: unknown;
    let storageFailed = false;
    try {
      if (!(await isActiveForExchange(from, generation))) throw new Error("history_sender_inactive");
      for await (const batch of readHistorySnapshot(chunks, maximumFrameBytes)) {
        if (!(await isActiveForExchange(from, generation))) throw new Error("history_sender_inactive");
        for (const clip of batch.clips) {
          if (!(await isActiveForExchange(from, generation))) throw new Error("history_sender_inactive");
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

  function trackInbound(from: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    const operation = receive(from, chunks).finally(() => {
      inboundOperations.delete(operation);
    });
    inboundOperations.add(operation);
    return operation;
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
    const generation = autoSyncGeneration;
    if (!(await isActiveForExchange(from, generation))) return;
    await readHistoryRequest(chunks);
    if (await isActiveForExchange(from, generation)) await snapshotTo(from);
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onStream(HISTORY_REQUEST_PROTOCOL, receiveRequest);
      options.transport.onStream(HISTORY_PROTOCOL, trackInbound);
      options.transport.onPeerConnected((peerId) => { void snapshotTo(peerId); });
      stopMembershipListener = options.onMembershipChanged?.(snapshotConnected);
      snapshotConnected();
    },
    async stop(): Promise<void> {
      stopped = true;
      for (const state of outbound.values()) state.controller.abort();
      for (const controller of outboundRequests) controller.abort();
      await Promise.allSettled([...inboundOperations]);
      inbound.clear();
      outbound.clear();
      outboundRequests.clear();
      stopMembershipListener?.();
      stopMembershipListener = undefined;
    },
    snapshotTo,
    setAutoSync(enabled: boolean): void {
      if (autoSync === enabled) return;
      autoSync = enabled;
      autoSyncGeneration += 1;
      if (!enabled) {
        for (const state of outbound.values()) {
          state.pending = false;
          state.controller.abort();
        }
        for (const controller of outboundRequests) controller.abort();
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
