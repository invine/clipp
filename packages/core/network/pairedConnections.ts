import * as log from "../logger.js";
import type { MessagingTransport } from "../messaging/transport.js";

export const DEFAULT_PAIRED_PEER_RECONNECT_INTERVAL_MS = 30_000;

export type PairedPeer = {
  deviceId: string;
  multiaddr?: string;
  multiaddrs?: string[];
};

export type PairedPeerConnectionManager = {
  start(): void;
  stop(): void;
  reconnectNow(): Promise<void>;
};

export type PairedPeerConnectionManagerOptions = {
  transport: MessagingTransport;
  getPairedPeers: () => Promise<PairedPeer[]>;
  intervalMs?: number;
};

export function createPairedPeerConnectionManager(
  options: PairedPeerConnectionManagerOptions
): PairedPeerConnectionManager {
  const intervalMs = options.intervalMs ?? DEFAULT_PAIRED_PEER_RECONNECT_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let connecting = false;

  async function reconnectNow(): Promise<void> {
    if (connecting) return;
    connecting = true;
    try {
      const peers = await options.getPairedPeers();
      const connected = new Set(options.transport.getConnectedPeers());
      await Promise.all(peers.map((peer) => connectPeer(peer, connected)));
    } catch (err) {
      log.debug("Paired peer reconnect pass failed", err);
    } finally {
      connecting = false;
    }
  }

  async function connectPeer(peer: PairedPeer, connected: Set<string>): Promise<void> {
    if (!peer?.deviceId) return;
    const connectionInfo = options.transport
      .getPeerConnectionInfo?.()
      ?.find((info) => info.peerId === peer.deviceId);
    const relayOnly = connectionInfo?.hasRelay === true && connectionInfo.hasDirect !== true;
    if (connected.has(peer.deviceId) && !relayOnly) return;

    const allTargets = peerConnectionTargets(peer);
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
      void reconnectNow();
      timer = setInterval(() => {
        void reconnectNow();
      }, intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
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
  if (target.includes("/webrtc") && !target.includes("/p2p-webrtc-star")) return "direct";
  if (target.includes("/p2p-circuit") || target.includes("/p2p-webrtc-star")) return "relay";
  if (target.startsWith("/")) return "direct";
  return "unknown";
}
