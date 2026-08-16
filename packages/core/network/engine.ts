import { createClipboardNode } from "./node.js";
import { multiaddr } from "@multiformats/multiaddr";
import { EventBus } from "./events.js";
import { toU8 } from "./bytes.js";
import { closeMessageStream, guardMessageStream, writeMessageStream } from "./messageStream.js";
import { CLIP_PROTOCOL, HISTORY_PROTOCOL } from "./protocol.js";
import { inspectPairingFrame, PAIRING_MAX_FRAME_BYTES, PAIRING_PROTOCOL } from "../pairing/protocol.js";
import { decodeMembershipFrame, MEMBERSHIP_MAX_FRAME_BYTES, MEMBERSHIP_PROTOCOL } from "../membership/reconciliation.js";
import { createPairingRejectionReporter } from "../pairing/diagnostics.js";
import { ensureLegacyMultiaddrApi, getPeerIdFromMultiaddr } from "./multiaddrCompat.js";
import { listRendezvousPeers, registerOnRendezvous } from "./rendezvous.js";
import type {
  MessagingTransport,
  MessageHandler,
  PeerConnectionInfo,
  PeerConnectionPath,
  RelayConnectionInfo,
} from "../messaging/transport.js";
import * as log from "../logger.js";

type Libp2pNode = any;

function concatBytes(parts: Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export type Libp2pMessagingOptions = {
  peerId?: any;
  privateKey?: any;
  bootstrapList?: string[];
  relayAddresses?: string[];
  enableWebRTCStar?: boolean;
  enableWebRTCDirect?: boolean;
  enableDCUtR?: boolean;
  enableTcp?: boolean;
  enableRelayReservations?: boolean;
  dialTimeoutMs?: number;
  enableRendezvous?: boolean;
  rendezvousTopic?: string;
  rendezvousIntervalMs?: number;
  rendezvousTimeoutMs?: number;
  relayReservationRetryMs?: number;
  allowInsecureBrowserDials?: boolean;
  isPeerKnown?(peerId: string): Promise<boolean>;
};

const DEFAULT_RENDEZVOUS_TOPIC = "clipp";
const DEFAULT_RENDEZVOUS_INTERVAL_MS = 30_000;

type PeerConnectionDescription = {
  peerId: string | null;
  addr: string | null;
  path: PeerConnectionPath;
  direction?: string;
  status?: string;
  streams?: number;
};

class Libp2pMessagingTransport implements MessagingTransport {
  private node: Libp2pNode | null = null;
  private started = false;
  private lastSelfMultiaddrsKey: string | null = null;

  private readonly handlersByProtocol = new Map<string, MessageHandler[]>();
  private readonly connectBus = new EventBus<string>();
  private readonly disconnectBus = new EventBus<string>();
  private readonly relayConnectionBus = new EventBus<void>();
  private readonly selfPeerUpdateBus = new EventBus<string[]>();

  private readonly relayPeerIds: Set<string>;
  private readonly relayAddrSet: Set<string>;
  private readonly discoveryDialing = new Set<string>();
  private readonly connectedPeerIds = new Set<string>();
  private readonly observedConnectionPaths = new Map<string, Set<PeerConnectionPath>>();
  private readonly relayDialPeerIds = new Set<string>();
  private readonly relayUpgradeLoggedPeerIds = new Set<string>();
  private rendezvousTimer: ReturnType<typeof setInterval> | null = null;
  private rendezvousRunning = false;
  private rendezvousRelays: string[] = [];
  private relayReservationRetryTimer: ReturnType<typeof setInterval> | null = null;
  private relayReservationRunning = false;
  private readonly reportPairingRejection = createPairingRejectionReporter({
    emit: (diagnostic) => log.warn(diagnostic.event, diagnostic),
  });

  constructor(private readonly opts: Libp2pMessagingOptions = {}) {
    this.relayPeerIds = buildRelayPeerIdSet(opts.relayAddresses || []);
    this.relayAddrSet = new Set((opts.relayAddresses || []).map(String));
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.node = await createClipboardNode({
      peerId: this.opts.peerId,
      privateKey: this.opts.privateKey,
      bootstrapList: this.opts.bootstrapList,
      relayAddresses: this.opts.relayAddresses,
      enableWebRTCStar: this.opts.enableWebRTCStar,
      enableWebRTCDirect: this.opts.enableWebRTCDirect,
      enableDCUtR: this.opts.enableDCUtR,
      enableTcp: this.opts.enableTcp,
      enableRelayReservations: this.opts.enableRelayReservations,
      allowInsecureBrowserDials: this.opts.allowInsecureBrowserDials,
    });

    this.node.addEventListener("peer:connect", (evt: any) => {
      const detail = evt?.detail;
      const peerId = safePeerId(detail?.remotePeer ?? detail?.peer ?? detail);
      if (!peerId) return;
      if (this.isRelayConnection(detail)) {
        this.relayConnectionBus.emit();
        return;
      }
      this.markPeerConnected(peerId);
    });
    this.node.addEventListener("peer:disconnect", (evt: any) => {
      const detail = evt?.detail;
      const peerId = safePeerId(detail?.remotePeer ?? detail?.peer ?? detail);
      if (!peerId) return;
      if (this.isRelayConnection(detail)) {
        this.relayConnectionBus.emit();
        return;
      }
      this.markPeerDisconnected(peerId);
    });
    this.node.addEventListener("self:peer:update", () => {
      this.emitSelfPeerUpdate();
      if (this.rendezvousRelays.length > 0) {
        void this.runRendezvous(this.rendezvousRelays);
      }
    });
    this.node.addEventListener("peer:discovery", (evt: any) => {
      void this.handleDiscoveredPeer(evt?.detail);
    });
    this.node.addEventListener("connection:open", (evt: any) => {
      const detail = evt?.detail;
      if (this.isRelayConnection(detail)) {
        this.relayConnectionBus.emit();
        return;
      }
      this.observePeerConnection(detail, "connection:open");
    });
    this.node.addEventListener("connection:close", (evt: any) => {
      const detail = evt?.detail;
      if (this.isRelayConnection(detail)) {
        this.relayConnectionBus.emit();
        return;
      }
      this.logPeerConnectionClosed(detail);
    });

    const handler = (protocol: string) => this.handleIncoming(protocol);
    this.node.handle(CLIP_PROTOCOL, handler(CLIP_PROTOCOL), { runOnLimitedConnection: true });
    this.node.handle(PAIRING_PROTOCOL, handler(PAIRING_PROTOCOL), { runOnLimitedConnection: true });
    this.node.handle(MEMBERSHIP_PROTOCOL, handler(MEMBERSHIP_PROTOCOL), { runOnLimitedConnection: true });
    this.node.handle(HISTORY_PROTOCOL, handler(HISTORY_PROTOCOL), { runOnLimitedConnection: true });

    await this.node.start();
    this.started = true;

    // Best-effort: dial relays if explicitly configured.
    const relays = this.relayDialAddresses(this.opts.relayAddresses || []);
    log.info("Relay reservation setup", {
      configuredRelays: this.opts.relayAddresses || [],
      circuitRelays: relays,
      enableRelayReservations: this.opts.enableRelayReservations !== false,
    });
    await this.connectRelays(relays);
    await this.ensureRelayReservations(relays);
    this.startRelayReservationRetry(relays);
    this.startRendezvous(relays);
    this.emitSelfPeerUpdate();

    log.info("Messaging transport started");
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.stopRendezvous();
    this.stopRelayReservationRetry();
    await this.node?.stop?.();
    this.node = null;
    this.started = false;
    this.connectedPeerIds.clear();
    this.observedConnectionPaths.clear();
    this.relayDialPeerIds.clear();
    this.relayUpgradeLoggedPeerIds.clear();
    log.info("Messaging transport stopped");
  }

  async send(protocol: string, target: string, data: Uint8Array): Promise<void> {
    if (!this.node || !this.started) {
      throw new Error("messaging_not_started");
    }

    const peerId = await this.targetPeerId(target);
    const context = {
      protocol,
      target,
      peerId,
      targetPath: connectionPathForAddr(target),
      bytes: data?.length ?? 0,
    };
    log.debug("Messaging send requested", context);

    try {
      const stream = guardMessageStream(await this.openStream(protocol, target));

      await writeMessageStream(stream, data);
      await closeMessageStream(stream, { ignoreClosedDataChannel: true });
      if (peerId) this.logPeerConnectionSnapshot(peerId, "send completed", context);
      log.debug("Messaging send completed", context);
    } catch (err: any) {
      log.warn("Messaging send failed", {
        ...context,
        error: err?.message || err,
      });
      throw err;
    }
  }

  async connect(target: string): Promise<void> {
    if (!this.node || !this.started) {
      throw new Error("messaging_not_started");
    }
    if (!target || typeof target !== "string") {
      throw new Error("invalid_target");
    }

    const peerId = await this.targetPeerId(target);
    const targetPath = connectionPathForAddr(target);
    const dialContext = {
      peerId,
      target,
      targetPath,
      viaRelay: targetPath === "relay",
    };
    log.debug("Peer dial requested", dialContext);
    if (peerId && targetPath === "relay") {
      this.relayDialPeerIds.add(peerId);
    }

    const existing = peerId ? this.peerConnectionSummary(peerId) : null;
    if (peerId && existing && (existing.hasDirect || targetPath !== "direct")) {
      this.logPeerConnectionSnapshot(peerId, "dial skipped: already connected", dialContext);
      this.markPeerConnected(peerId, true);
      return;
    }

    let dialedConnection: any;
    if (target.startsWith("/")) {
      dialedConnection = await this.node.dial(ensureLegacyMultiaddrApi(multiaddr(target)), this.dialOptions());
      this.observePeerConnection(dialedConnection, "dial result", dialContext);
      if (peerId) this.logPeerConnectionSnapshot(peerId, "dial completed", dialContext);
      if (peerId) this.markPeerConnected(peerId, true);
      return;
    }

    dialedConnection = await this.node.dial(await peerIdObjectForTarget(target), this.dialOptions());
    this.observePeerConnection(dialedConnection, "dial result", dialContext);
    if (peerId) this.logPeerConnectionSnapshot(peerId, "dial completed", dialContext);
    if (peerId) this.markPeerConnected(peerId, true);
  }

  async disconnect(peerId: string): Promise<void> {
    if (!this.node || !this.started) return;
    await this.node.hangUp?.(await peerIdObjectForTarget(peerId));
  }

  onMessage(protocol: string, cb: MessageHandler): void {
    const list = this.handlersByProtocol.get(protocol) || [];
    list.push(cb);
    this.handlersByProtocol.set(protocol, list);
    if (list.length === 1) {
      log.debug("Registered protocol handler", { protocol });
    }
  }

  onPeerConnected(cb: (peerId: string) => void): void {
    this.connectBus.on(cb);
  }

  onPeerDisconnected(cb: (peerId: string) => void): void {
    this.disconnectBus.on(cb);
  }

  onRelayConnectionChanged(cb: () => void): void {
    this.relayConnectionBus.on(cb);
  }

  onSelfPeerUpdate(cb: (multiaddrs: string[]) => void): void {
    this.selfPeerUpdateBus.on(cb);
  }

  getConnectedPeers(): string[] {
    if (!this.node || !this.started || typeof this.node.getConnections !== "function") {
      return [];
    }
    const peers = new Set(this.connectedPeerIds);
    this.node
      .getConnections()
      .filter((c: any) => !this.isRelayConnection(c))
      .map((c: any) => safePeerId(c?.remotePeer))
      .filter(Boolean)
      .forEach((peerId: string) => peers.add(peerId));
    return Array.from(peers);
  }

  getSelfMultiaddrs(): string[] {
    if (!this.node || !this.started) {
      return [];
    }
    return this.selfMultiaddrs();
  }

  getPeerConnectionInfo(): PeerConnectionInfo[] {
    if (!this.node || !this.started || typeof this.node.getConnections !== "function") {
      return [];
    }

    const byPeer = new Map<string, PeerConnectionDescription[]>();
    for (const peerId of this.connectedPeerIds) {
      byPeer.set(peerId, []);
    }

    try {
      const conns = this.node.getConnections() || [];
      conns
        .filter((c: any) => !this.isRelayConnection(c))
        .map((c: any) => describeConnection(c))
        .forEach((conn: PeerConnectionDescription) => {
          if (!conn.peerId) return;
          const list = byPeer.get(conn.peerId) || [];
          list.push(conn);
          byPeer.set(conn.peerId, list);
        });
    } catch {
      // return whatever explicit successful dials have recorded
    }

    for (const [peerId, paths] of this.observedConnectionPaths.entries()) {
      if (!this.connectedPeerIds.has(peerId)) continue;
      const active = byPeer.get(peerId) || [];
      if (active.length > 0) continue;
      byPeer.set(
        peerId,
        Array.from(paths).map((path) => ({
          peerId,
          addr: null,
          path,
        }))
      );
    }

    return Array.from(byPeer.entries()).map(([peerId, connections]) =>
      summarizePeerConnectionInfo(peerId, connections)
    );
  }

  getRelayConnectionInfo(): RelayConnectionInfo[] {
    const relays = this.opts.relayAddresses || [];
    if (!relays.length) return [];

    if (!this.node || !this.started || typeof this.node.getConnections !== "function") {
      return relays.map((address) => summarizeRelayConnectionInfo(address, [], true));
    }

    let connections: PeerConnectionDescription[] = [];
    try {
      connections = (this.node.getConnections() || [])
        .filter((conn: any) => this.isRelayConnection(conn))
        .map((conn: any) => describeConnection(conn));
    } catch {
      connections = [];
    }

    return relays.map((address) => summarizeRelayConnectionInfo(address, connections, false));
  }

  async getSignedPeerRecord(): Promise<Uint8Array> {
    if (!this.node || !this.started) throw new Error("messaging_not_started");
    const existing = await this.node.peerStore?.get?.(this.node.peerId);
    if (existing?.peerRecordEnvelope instanceof Uint8Array) return Uint8Array.from(existing.peerRecordEnvelope);
    const { PeerRecord, RecordEnvelope } = await import("@libp2p/peer-record");
    const envelope = await RecordEnvelope.seal(
      new PeerRecord({ peerId: this.node.peerId, multiaddrs: this.node.getMultiaddrs(), seqNumber: BigInt(Date.now()) }),
      this.node.privateKey
    );
    return Uint8Array.from(envelope.marshal());
  }

  async importSignedPeerRecord(expectedPeerId: string, record: Uint8Array): Promise<void> {
    if (!this.node || !this.started) throw new Error("messaging_not_started");
    const peerId = await peerIdObjectForTarget(expectedPeerId);
    const imported = await this.node.peerStore?.consumePeerRecord?.(record, peerId);
    if (imported !== true) throw new Error("invalid_signed_peer_record");
  }

  private async openStream(protocol: string, target: string): Promise<any> {
    if (!this.node) {
      throw new Error("messaging_not_started");
    }
    const options = this.openStreamOptions();
    if (target.startsWith("/")) {
      return await this.node.dialProtocol(ensureLegacyMultiaddrApi(multiaddr(target)), protocol, options);
    }

    const existing = this.findConnectionByPeerId(target);
    if (existing?.newStream) {
      return await existing.newStream(protocol, options);
    }

    throw new Error("peer_not_connected");
  }

  private async handleDiscoveredPeer(peer: any): Promise<void> {
    const peerId = safePeerId(peer?.id ?? peer?.peerId ?? peer);
    if (!peerId || this.discoveryDialing.has(peerId)) {
      return;
    }
    const existing = this.peerConnectionSummary(peerId);
    if (existing?.hasDirect) return;

    const allTargets = discoveredPeerTargets(peer, peerId);
    const targets = existing?.hasRelay ? allTargets.filter(isDirectConnectionTarget) : allTargets;
    if (targets.length === 0) {
      log.debug("Discovered peer has no dialable addresses", {
        peerId,
        relayOnly: existing?.hasRelay === true,
        discoveredTargets: allTargets,
      });
      return;
    }

    this.discoveryDialing.add(peerId);
    log.debug("Discovered peer", { peerId, targets });
    try {
      for (const target of targets) {
        try {
          await this.connect(target);
          return;
        } catch (err: any) {
          log.debug("Discovered peer dial failed", {
            peerId,
            target,
            error: err?.message || err,
          });
        }
      }
    } finally {
      this.discoveryDialing.delete(peerId);
    }
  }

  private startRendezvous(relays: string[]): void {
    if (this.opts.enableRendezvous === false || relays.length === 0 || this.rendezvousTimer) {
      return;
    }
    this.rendezvousRelays = relays;
    void this.runRendezvous(relays);
    this.rendezvousTimer = setInterval(() => {
      void this.runRendezvous(relays);
    }, this.opts.rendezvousIntervalMs ?? DEFAULT_RENDEZVOUS_INTERVAL_MS);
  }

  private stopRendezvous(): void {
    this.rendezvousRelays = [];
    if (!this.rendezvousTimer) return;
    clearInterval(this.rendezvousTimer);
    this.rendezvousTimer = null;
  }

  private startRelayReservationRetry(relays: string[]): void {
    if (
      this.opts.enableRelayReservations === false ||
      relays.length === 0 ||
      this.relayReservationRetryTimer
    ) {
      return;
    }
    this.relayReservationRetryTimer = setInterval(() => {
      void this.ensureRelayReservations(relays);
    }, this.opts.relayReservationRetryMs ?? 15_000);
  }

  private stopRelayReservationRetry(): void {
    if (!this.relayReservationRetryTimer) return;
    clearInterval(this.relayReservationRetryTimer);
    this.relayReservationRetryTimer = null;
  }

  private async runRendezvous(relays: string[]): Promise<void> {
    if (!this.node || !this.started || this.rendezvousRunning) return;
    this.rendezvousRunning = true;
    try {
      const selfPeerId = safePeerId(this.node.peerId);
      const selfAddrs = this.selfMultiaddrs();
      if (!selfPeerId) return;
      const topic = this.opts.rendezvousTopic ?? DEFAULT_RENDEZVOUS_TOPIC;
      const rendezvousOptions = {
        timeoutMs: this.opts.rendezvousTimeoutMs ?? this.opts.dialTimeoutMs ?? 12_000,
        dialOptions: this.dialOptions(),
        log: (...args: any[]) => log.debug(...args),
      };

      for (const relay of relays) {
        if (selfAddrs.length > 0) {
          await registerOnRendezvous(this.node, relay, topic, selfAddrs, rendezvousOptions);
        } else {
          log.debug("Rendezvous registration skipped: no self multiaddrs", { relay, topic });
        }

        const peers = await listRendezvousPeers(this.node, relay, topic, rendezvousOptions);
        for (const peer of peers) {
          if (!peer.peer || peer.peer === selfPeerId || this.relayPeerIds.has(peer.peer)) continue;
          await this.handleDiscoveredPeer({ id: peer.peer, multiaddrs: peer.addrs });
        }
      }
    } catch (err: any) {
      log.debug("Rendezvous discovery pass failed", { error: err?.message || err });
    } finally {
      this.rendezvousRunning = false;
    }
  }

  private openStreamOptions(): { runOnLimitedConnection: true; signal?: AbortSignal } {
    return this.dialOptions();
  }

  private dialOptions(): { runOnLimitedConnection: true; signal?: AbortSignal } {
    const dialTimeoutMs = this.opts.dialTimeoutMs ?? 12_000;
    const supportsTimeout =
      typeof AbortSignal !== "undefined" &&
      typeof (AbortSignal as any).timeout === "function";
    return {
      runOnLimitedConnection: true,
      ...(supportsTimeout ? { signal: (AbortSignal as any).timeout(dialTimeoutMs) } : {}),
    };
  }

  private async targetPeerId(target: string): Promise<string | null> {
    if (target.startsWith("/")) {
      try {
        return getPeerIdFromMultiaddr(multiaddr(target)) || null;
      } catch {
        return null;
      }
    }
    try {
      return (await peerIdObjectForTarget(target)).toString();
    } catch {
      return target;
    }
  }

  private findConnectionByPeerId(peerId: string): any | null {
    try {
      const conns = this.node?.getConnections?.() || [];
      return conns.find((c: any) => safePeerId(c?.remotePeer) === peerId) || null;
    } catch {
      return null;
    }
  }

  private markPeerConnected(peerId: string, forceEmit = false): void {
    if (!peerId || this.relayPeerIds.has(peerId)) return;
    const wasConnected = this.connectedPeerIds.has(peerId);
    this.connectedPeerIds.add(peerId);
    if (!wasConnected || forceEmit) {
      this.connectBus.emit(peerId);
    }
  }

  private markPeerDisconnected(peerId: string): void {
    if (!peerId || this.relayPeerIds.has(peerId)) return;
    this.connectedPeerIds.delete(peerId);
    this.disconnectBus.emit(peerId);
  }

  private observePeerConnection(
    conn: any,
    source: string,
    context?: Record<string, unknown>
  ): void {
    const detail = describeConnection(conn);
    if (!detail.peerId || this.relayPeerIds.has(detail.peerId)) return;
    const previous = this.observedConnectionPaths.get(detail.peerId) ?? new Set<PeerConnectionPath>();
    const hadRelay = previous.has("relay");
    const hadDirect = previous.has("direct");
    if (detail.path !== "unknown") {
      previous.add(detail.path);
      this.observedConnectionPaths.set(detail.peerId, previous);
    }

    log.debug("Peer connection observed", {
      ...context,
      ...detail,
      source,
      observedPaths: Array.from(previous),
      afterRelayDial: this.relayDialPeerIds.has(detail.peerId),
    });

    if (
      detail.path === "direct" &&
      hadRelay &&
      !hadDirect &&
      !this.relayUpgradeLoggedPeerIds.has(detail.peerId)
    ) {
      this.relayUpgradeLoggedPeerIds.add(detail.peerId);
      log.info("Peer connection upgraded from relay to direct", {
        peerId: detail.peerId,
        directAddr: detail.addr,
        source,
        afterRelayDial: this.relayDialPeerIds.has(detail.peerId),
      });
    }
    this.markPeerConnected(detail.peerId, true);
  }

  private logPeerConnectionClosed(conn: any): void {
    const detail = describeConnection(conn);
    if (!detail.peerId || this.relayPeerIds.has(detail.peerId)) return;
    const remainingConnections = this.describeActivePeerConnections(detail.peerId);
    log.debug("Peer connection closed", {
      ...detail,
      remainingConnections,
    });
    if (remainingConnections.length === 0) {
      this.markPeerDisconnected(detail.peerId);
    } else {
      this.markPeerConnected(detail.peerId, true);
    }
  }

  private logPeerConnectionSnapshot(
    peerId: string,
    reason: string,
    context?: Record<string, unknown>
  ): void {
    const activeConnections = this.describeActivePeerConnections(peerId);
    const activePaths = Array.from(new Set(activeConnections.map((c) => c.path)));
    const observed = this.observedConnectionPaths.get(peerId) ?? new Set<PeerConnectionPath>();
    activePaths.forEach((path) => {
      if (path !== "unknown") observed.add(path);
    });
    if (observed.size > 0) this.observedConnectionPaths.set(peerId, observed);
    const hasRelay = activePaths.includes("relay");
    const hasDirect = activePaths.includes("direct");
    const afterRelayDial = this.relayDialPeerIds.has(peerId);
    const payload = {
      peerId,
      reason,
      activePaths,
      hasRelay,
      hasDirect,
      afterRelayDial,
      activeConnections,
      ...context,
    };

    if (afterRelayDial && hasDirect && !this.relayUpgradeLoggedPeerIds.has(peerId)) {
      this.relayUpgradeLoggedPeerIds.add(peerId);
      log.info("Peer has direct connection after relay dial", payload);
      return;
    }

    if (context?.viaRelay === true) {
      log.info("Peer relay dial connection status", payload);
      return;
    }

    log.debug("Peer connection snapshot", payload);
  }

  private describeActivePeerConnections(peerId: string): PeerConnectionDescription[] {
    try {
      const conns = this.node?.getConnections?.() || [];
      return conns
        .filter((c: any) => safePeerId(c?.remotePeer) === peerId)
        .map((c: any) => describeConnection(c));
    } catch {
      return [];
    }
  }

  private peerConnectionSummary(peerId: string): PeerConnectionInfo | null {
    const activeConnections = this.describeActivePeerConnections(peerId);
    const observed = this.observedConnectionPaths.get(peerId) ?? new Set<PeerConnectionPath>();
    const observedConnections = Array.from(observed).map((path) => ({
      peerId,
      addr: null,
      path,
    }));
    const connections = [...activeConnections, ...observedConnections];
    return connections.length > 0 ? summarizePeerConnectionInfo(peerId, connections) : null;
  }

  private handleIncoming(protocol: string) {
    return async (data: any) => {
      const stream = data?.stream ?? data;
      const conn = data?.connection ?? (stream as any)?.connection;
      const from = safePeerId(
        (conn as any)?.remotePeer ?? (stream as any)?.remotePeer ?? (conn as any)?.remotePeerId
      );
      let derivedFrom: string | null = null;
      if (!from) {
        log.warn("Incoming stream missing peer id", {
          protocol,
          dataKeys: data ? Object.keys(data).sort() : undefined,
          stream: describeStream(stream),
        });
      }

      const handlers = this.handlersByProtocol.get(protocol);
      if (!handlers || handlers.length === 0) {
        log.debug("No handlers for incoming protocol", { protocol, from });
        return;
      }

      const iterable = getStreamIterable(stream);
      if (!iterable) {
        if (protocol === PAIRING_PROTOCOL) {
          const connectionPath = describeConnection(conn).path;
          const path = connectionPath === "relay" ? "relayed" : connectionPath === "direct" ? "direct" : "unknown";
          this.reportPairingRejection({ reason: "invalid_framing", authenticatedPeerId: from ?? undefined, frameSize: 0, messageType: "unknown", connectionPath: path });
          await this.closeInvalidPairingConnection(from, conn);
        }
        log.warn("Incoming stream missing async iterator", {
          protocol,
          from,
          dataKeys: data ? Object.keys(data).sort() : undefined,
          stream: describeStream(stream),
        });
        return;
      }

      try {
        log.debug("Incoming protocol stream", { protocol, from });
        if (protocol === PAIRING_PROTOCOL) {
          // Pairing is intentionally one authenticated, bounded frame per stream.
          const connectionPath = describeConnection(conn).path;
          const path = connectionPath === "relay" ? "relayed" : connectionPath === "direct" ? "direct" : "unknown";
          if (!from) {
            this.reportPairingRejection({ reason: "authenticated_identity_mismatch", frameSize: 0, messageType: "unknown", connectionPath: path });
            await this.closeInvalidPairingConnection(from, conn);
            return;
          }
          const chunks: Uint8Array[] = [];
          let size = 0;
          for await (const chunk of iterable) {
            const bytes = toU8(chunk);
            if (!bytes) {
              this.reportPairingRejection({ reason: "invalid_framing", authenticatedPeerId: from, frameSize: size, messageType: "unknown", connectionPath: path });
              await this.closeInvalidPairingConnection(from, conn);
              return;
            }
            size += bytes.length;
            if (size > PAIRING_MAX_FRAME_BYTES + 10) {
              this.reportPairingRejection({ reason: "oversized_frame", authenticatedPeerId: from, frameSize: size, messageType: "unknown", connectionPath: path });
              await this.closeInvalidPairingConnection(from, conn);
              return;
            }
            chunks.push(bytes);
          }
          const frame = concatBytes(chunks, size);
          const inspected = inspectPairingFrame(frame);
          if (!inspected.ok) {
            this.reportPairingRejection({ reason: inspected.reason, authenticatedPeerId: from, frameSize: size, messageType: "unknown", connectionPath: path });
            await this.closeInvalidPairingConnection(from, conn);
            return;
          }
          for (const handler of handlers) handler(from, frame);
          return;
        }
        if (protocol === MEMBERSHIP_PROTOCOL) {
          // Like Pairing, Membership Reconciliation is exactly one bounded
          // length-prefixed protobuf view per short-lived stream.
          if (!from) return;
          const chunks: Uint8Array[] = [];
          let size = 0;
          for await (const chunk of iterable) {
            const bytes = toU8(chunk);
            if (!bytes) return;
            size += bytes.length;
            if (size > MEMBERSHIP_MAX_FRAME_BYTES + 10) return;
            chunks.push(bytes);
          }
          const frame = concatBytes(chunks, size);
          if (!decodeMembershipFrame(frame)) return;
          for (const handler of handlers) handler(from, frame);
          return;
        }
        for await (const chunk of iterable) {
          const buf = toU8(chunk);
          if (!buf || buf.length === 0) {
            log.debug("Incoming chunk empty or not bytes", {
              protocol,
              from,
              type: typeof chunk,
              ctor: (chunk as any)?.constructor?.name,
            });
            continue;
          }
          let msgFrom = from ?? derivedFrom;
          if (!msgFrom) {
            derivedFrom = deriveFromPayload(buf);
            msgFrom = derivedFrom;
            if (!msgFrom) {
              log.warn("Incoming message missing peer id and payload from", { protocol });
              continue;
            }
            log.debug("Derived peer id from payload", { protocol, from: msgFrom });
          }
          for (const h of handlers) h(msgFrom, buf);
        }
      } catch (err: any) {
        if (protocol === PAIRING_PROTOCOL) {
          const connectionPath = describeConnection(conn).path;
          const path = connectionPath === "relay" ? "relayed" : connectionPath === "direct" ? "direct" : "unknown";
          this.reportPairingRejection({ reason: "invalid_framing", authenticatedPeerId: from ?? undefined, frameSize: 0, messageType: "unknown", connectionPath: path });
          await this.closeInvalidPairingConnection(from, conn);
        }
        log.debug("Incoming stream failed", { protocol, from, error: err?.message || err });
      }
    };
  }

  private async closeInvalidPairingConnection(peerId: string | null, conn: any): Promise<void> {
    try {
      if (peerId && await (this.opts.isPeerKnown?.(peerId) ?? Promise.resolve(false))) return;
      if (peerId) await this.disconnect(peerId);
      else await conn?.close?.();
    } catch {
      // The invalid stream is already closed; connection cleanup is best-effort.
    }
  }

  private async connectRelays(relays: string[]) {
    if (!this.node || !relays.length) return;
    for (const addr of relays) {
      try {
        const ma = ensureLegacyMultiaddrApi(multiaddr(addr));
        await this.node.dial(ma, this.dialOptions());
      } catch (err: any) {
        log.warn("Relay dial failed", { addr, error: err?.message || err });
      }
    }
  }

  private async ensureRelayReservations(relays: string[]): Promise<void> {
    const selfAddrs = this.selfMultiaddrs();
    const hasRelayReservationAddress = selfAddrs.some((addr) => addr.includes("/p2p-circuit"));
    const skipReason = !this.node
      ? "node_missing"
      : !this.started
      ? "transport_not_started"
      : this.opts.enableRelayReservations === false
      ? "reservations_disabled"
      : !relays.length
      ? "no_circuit_relays"
      : this.relayReservationRunning
      ? "reservation_already_running"
      : hasRelayReservationAddress
      ? "reservation_address_already_present"
      : null;

    if (skipReason) {
      log.info("Relay reservation skipped", {
        reason: skipReason,
        relays,
        selfAddrs,
        configuredRelays: this.opts.relayAddresses || [],
      });
      return;
    }

    const transportManager = this.node?.components?.transportManager;
    if (typeof transportManager?.listen !== "function") {
      log.debug("Relay reservation retry skipped: transport manager unavailable");
      return;
    }

    const circuitAddrs = relays
      .filter((relay) => !relay.includes("/p2p-webrtc-star"))
      .map((relay) => `${relay.replace(/\/+$/, "")}/p2p-circuit`);
    if (circuitAddrs.length === 0) return;

    this.relayReservationRunning = true;
    try {
      await this.closeEmptyRelayListeners();
      log.info("Ensuring relay reservations", { relays: circuitAddrs });
      await transportManager.listen(
        circuitAddrs.map((addr) => ensureLegacyMultiaddrApi(multiaddr(addr)))
      );
      if (!this.hasRelayReservationAddress()) {
        await this.closeEmptyRelayListeners();
        log.warn("Relay reservation did not produce a circuit address", { relays: circuitAddrs });
      } else {
        log.info("Relay reservation address available", { selfAddrs: this.selfMultiaddrs() });
      }
      this.emitSelfPeerUpdate();
    } catch (err: any) {
      log.warn("Relay reservation retry failed", {
        relays: circuitAddrs,
        error: err?.message || err,
      });
    } finally {
      this.relayReservationRunning = false;
    }
  }

  private hasRelayReservationAddress(): boolean {
    return this.selfMultiaddrs().some((addr) => addr.includes("/p2p-circuit"));
  }

  private async closeEmptyRelayListeners(): Promise<void> {
    const listeners = this.node?.components?.transportManager?.getListeners?.() ?? [];
    await Promise.all(
      listeners
        .filter((listener: any) => listener?.constructor?.name === "CircuitRelayTransportListener")
        .filter((listener: any) => {
          try {
            return (listener.getAddrs?.() ?? []).length === 0;
          } catch {
            return false;
          }
        })
        .map(async (listener: any) => {
          try {
            await listener.close?.();
          } catch {
            // ignore listener cleanup failures
          }
        })
    );
  }

  private relayDialAddresses(relays: string[]): string[] {
    return relays.filter((addr) => !String(addr).includes("/p2p-webrtc-star"));
  }

  private emitSelfPeerUpdate(): void {
    try {
      const unique = this.selfMultiaddrs();
      const key = [...unique].sort().join("\n");
      if (key === this.lastSelfMultiaddrsKey) return;
      this.lastSelfMultiaddrsKey = key;
      this.selfPeerUpdateBus.emit(unique);
    } catch {
      // ignore
    }
  }

  private selfMultiaddrs(): string[] {
    const addrs = this.node?.getMultiaddrs?.() ?? [];
    const list = Array.isArray(addrs)
      ? addrs.map((a: any) => (typeof a?.toString === "function" ? a.toString() : String(a)))
      : [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const a of list) {
      if (typeof a !== "string" || a.length === 0) continue;
      if (seen.has(a)) continue;
      seen.add(a);
      unique.push(a);
    }
    return unique;
  }

  private isRelayConnection(conn: any): boolean {
    const pid = safePeerId(conn?.remotePeer);
    const addrStr = conn?.remoteAddr?.toString?.();
    if (pid) return this.relayPeerIds.has(pid);
    if (addrStr) {
      if (this.relayAddrSet.has(addrStr)) return true;
      try {
        const addrPeerId = getPeerIdFromMultiaddr(multiaddr(addrStr));
        if (addrPeerId && this.relayPeerIds.has(addrPeerId)) return true;
      } catch {
        // ignore unparsable connection addr
      }
    }
    return false;
  }
}

export function createLibp2pMessagingTransport(options?: Libp2pMessagingOptions): MessagingTransport {
  return new Libp2pMessagingTransport(options);
}

function safePeerId(peer: any): string | null {
  if (!peer) return null;
  try {
    if (typeof peer === "string") return peer;
    if (typeof peer.toString === "function") return peer.toString();
  } catch {
    // ignore
  }
  return null;
}

function buildRelayPeerIdSet(relays: string[]) {
  const set = new Set<string>();
  for (const addr of relays || []) {
    const pid = relayPeerIdForAddress(addr);
    if (pid) set.add(pid);
  }
  return set;
}

function relayPeerIdForAddress(addr: string): string | null {
  try {
    return getPeerIdFromMultiaddr(multiaddr(addr)) ?? null;
  } catch {
    return null;
  }
}

async function peerIdObjectForTarget(target: string): Promise<any> {
  const { deviceIdToPeerIdObject } = await import("./peerId.js");
  return await deviceIdToPeerIdObject(target);
}

function discoveredPeerTargets(peer: any, peerId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (target: any) => {
    const value = typeof target?.toString === "function" ? target.toString() : String(target || "");
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  const addrs = Array.isArray(peer?.multiaddrs)
    ? peer.multiaddrs
    : Array.isArray(peer?.addrs)
      ? peer.addrs
      : [];
  addrs.forEach(add);
  add(peerId);
  return out;
}

function describeConnection(conn: any): PeerConnectionDescription {
  const peerId = safePeerId(conn?.remotePeer ?? conn?.remotePeerId ?? conn?.peer);
  const addr = typeof conn?.remoteAddr?.toString === "function" ? conn.remoteAddr.toString() : null;
  return {
    peerId,
    addr,
    path: connectionPathForConnection(conn, addr),
    direction: conn?.stat?.direction,
    status: typeof conn?.status === "string" ? conn.status : undefined,
    streams: Array.isArray(conn?.streams) ? conn.streams.length : undefined,
  };
}

function summarizePeerConnectionInfo(
  peerId: string,
  connections: PeerConnectionDescription[]
): PeerConnectionInfo {
  const hasDirect = connections.some((conn) => conn.path === "direct");
  const hasRelay = connections.some((conn) => conn.path === "relay");
  const addrs = dedupeStrings(
    connections
      .map((conn) => conn.addr)
      .filter((addr): addr is string => typeof addr === "string" && addr.length > 0)
  );
  return {
    peerId,
    path: hasDirect ? "direct" : hasRelay ? "relay" : "unknown",
    hasDirect,
    hasRelay,
    addrs,
  };
}

function summarizeRelayConnectionInfo(
  address: string,
  connections: PeerConnectionDescription[],
  transportUnavailable: boolean
): RelayConnectionInfo {
  const peerId = relayPeerIdForAddress(address);
  const matching = connections.filter((conn) => {
    if (peerId && conn.peerId === peerId) return true;
    return conn.addr === address;
  });
  const addrs = dedupeStrings(
    matching
      .map((conn) => conn.addr)
      .filter((addr): addr is string => typeof addr === "string" && addr.length > 0)
  );

  return {
    address,
    peerId,
    status: matching.length > 0 ? "connected" : transportUnavailable || !peerId ? "unknown" : "disconnected",
    addrs,
  };
}

function connectionPathForAddr(addr: unknown): PeerConnectionPath {
  const value = typeof (addr as any)?.toString === "function" ? (addr as any).toString() : String(addr || "");
  if (!value) return "unknown";
  if (isWebRTCConnectionAddress(value)) return "direct";
  if (value.includes("/p2p-circuit")) return "relay";
  if (value.startsWith("/")) return "direct";
  return "unknown";
}

function connectionPathForConnection(conn: any, addr: unknown): PeerConnectionPath {
  if (conn?.limits != null) return "relay";
  return connectionPathForAddr(addr);
}

function isDirectConnectionTarget(target: string): boolean {
  return connectionPathForAddr(target) === "direct";
}

function isWebRTCConnectionAddress(addr: string): boolean {
  return addr.includes("/webrtc") && !addr.includes("/p2p-webrtc-star");
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function getStreamIterable(stream: any): AsyncIterable<any> | undefined {
  if (!stream) return undefined;
  if (typeof (stream as any)[Symbol.asyncIterator] === "function") {
    return stream as any;
  }
  const source = (stream as any)?.source;
  if (source && typeof source[Symbol.asyncIterator] === "function") {
    return source;
  }
  const inner = (stream as any)?.stream;
  if (inner && typeof inner[Symbol.asyncIterator] === "function") {
    return inner;
  }
  return undefined;
}

function describeStream(stream: any) {
  if (!stream) return { missing: true };
  const keys = Object.keys(stream || {});
  const inner = (stream as any)?.stream;
  return {
    ctor: stream?.constructor?.name,
    keys,
    hasSink: typeof stream.sink === "function",
    hasWrite: typeof stream.write === "function",
    hasSend: typeof stream.send === "function",
    hasSource: Boolean((stream as any)?.source),
    hasIterable: typeof (stream as any)[Symbol.asyncIterator] === "function",
    inner: inner
      ? {
          ctor: inner?.constructor?.name,
          keys: Object.keys(inner || {}),
          hasSink: typeof inner.sink === "function",
          hasWrite: typeof inner.write === "function",
          hasSend: typeof inner.send === "function",
          hasSource: Boolean((inner as any)?.source),
          hasIterable: typeof (inner as any)[Symbol.asyncIterator] === "function",
        }
      : undefined,
  };
}

function deriveFromPayload(buf: Uint8Array): string | null {
  try {
    const raw = new TextDecoder().decode(buf);
    const parsed = JSON.parse(raw);
    return typeof parsed?.from === "string" && parsed.from.length > 0 ? parsed.from : null;
  } catch {
    return null;
  }
}
