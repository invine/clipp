import * as log from "../logger.js";
import type { MessagingTransport } from "../messaging/transport.js";
import { verifiedSignedPeerRecordMultiaddrs } from "./peerRecords.js";

export const DEFAULT_PAIRED_PEER_RECONNECT_INTERVAL_MS = 30_000;

export type PairedPeer = {
  deviceId: string;
  multiaddr?: string;
  multiaddrs?: string[];
};

export type PairedPeerConnectionManager = {
  start(): void;
  stop(): Promise<void>;
  reconnectNow(): Promise<void>;
};

export type PairedPeerConnectionManagerOptions = {
  transport: MessagingTransport;
  getPairedPeers: () => Promise<PairedPeer[]>;
  intervalMs?: number;
};

/** Adapts the membership-owned Active Device list to reconnect targets. */
export function activeMemberReconnectPeers(
  membership: Pick<import("../trust/identity.js").IdentityManager, "activeDevices">
): () => Promise<PairedPeer[]> {
  return async () => (await membership.activeDevices()).map(({ deviceId }) => ({ deviceId }));
}

export function createPairedPeerConnectionManager(
  options: PairedPeerConnectionManagerOptions
): PairedPeerConnectionManager {
  const intervalMs = options.intervalMs ?? DEFAULT_PAIRED_PEER_RECONNECT_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let reconnectOperation: Promise<void> | undefined;

  function reconnectNow(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (reconnectOperation) return reconnectOperation;
    reconnectOperation = (async () => {
      const peers = await options.getPairedPeers();
      if (stopped) return;
      const connected = new Set(options.transport.getConnectedPeers());
      await Promise.all(peers.map((peer) => connectPeer(peer, connected)));
    })().catch((err) => {
      log.debug("Paired peer reconnect pass failed", err);
    }).finally(() => { reconnectOperation = undefined; });
    return reconnectOperation;
  }

  async function connectPeer(peer: PairedPeer, connected: Set<string>): Promise<void> {
    if (stopped || !peer?.deviceId) return;
    const connectionInfo = options.transport
      .getPeerConnectionInfo?.()
      ?.find((info) => info.peerId === peer.deviceId);
    const relayOnly = connectionInfo?.hasRelay === true && connectionInfo.hasDirect !== true;
    if (connected.has(peer.deviceId) && !relayOnly) return;

    // An Active Member is permitted to refresh only its own exact record. This
    // repairs stale reachability after an offline interval without ambient
    // discovery or another Pairing ceremony.
    let refreshedTargets: string[] = [];
    if (!relayOnly) {
      await options.transport.refreshPeerRecord?.(peer.deviceId).catch((error) => {
        log.debug("Paired peer exact lookup failed; using known reachability", {
          peerId: peer.deviceId,
          error: errorMessage(error),
        });
      });
      if (stopped) return;
      const refreshedRecord = await options.transport
        .getSignedPeerRecordFor?.(peer.deviceId)
        .catch(() => undefined);
      if (refreshedRecord) {
        refreshedTargets = await verifiedSignedPeerRecordMultiaddrs(
          refreshedRecord,
          peer.deviceId
        ).catch(() => []);
      }
    }
    if (stopped) return;

    const allTargets = peerConnectionTargets({
      ...peer,
      multiaddrs: [...refreshedTargets, ...(peer.multiaddrs ?? [])],
    });
    const targets = relayOnly ? allTargets.filter(isDirectConnectionTarget) : allTargets;
    if (targets.length === 0) {
      log.debug("Paired peer reconnect skipped: no target", {
        peerId: peer.deviceId,
        relayOnly,
        targets: allTargets,
      });
      return;
    }

    let lastError: unknown;
    for (const target of targets) {
      if (stopped) return;
      try {
        await options.transport.connect(target);
        log.debug("Paired peer reconnect succeeded", {
          peerId: peer.deviceId,
          target,
        });
        return;
      } catch (err) {
        lastError = err;
      }
    }

    log.debug("Paired peer reconnect failed", {
      peerId: peer.deviceId,
      targets,
      error: errorMessage(lastError),
    });
  }

  return {
    start() {
      if (timer) return;
      stopped = false;
      void reconnectNow();
      timer = setInterval(() => {
        void reconnectNow();
      }, intervalMs);
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      await reconnectOperation;
    },
    reconnectNow,
  };
}

export function peerConnectionTargets(peer: PairedPeer): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (target: unknown) => {
    if (typeof target !== "string") return;
    const trimmed = target.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  if (Array.isArray(peer.multiaddrs)) peer.multiaddrs.forEach(add);
  add(peer.multiaddr);
  add(peer.deviceId);
  return out.sort((a, b) => targetDialPriority(a) - targetDialPriority(b));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "unknown_error");
}

function isDirectConnectionTarget(target: string): boolean {
  return targetPath(target) === "direct";
}

function targetDialPriority(target: string): number {
  const path = targetPath(target);
  if (path === "direct" && target.includes("/webrtc")) return 0;
  if (path === "direct") return 1;
  if (path === "relay") return 2;
  return 3;
}

function targetPath(target: string): "direct" | "relay" | "unknown" {
  if (!target) return "unknown";
  if (target.includes("/webrtc")) return "direct";
  if (target.includes("/p2p-circuit")) return "relay";
  if (target.startsWith("/")) return "direct";
  return "unknown";
}
