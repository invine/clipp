import { createClipboardNode } from "./node.js";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { EventBus } from "./events.js";
import type { ClipboardMessage } from "./types.js";
import { createTrustManager, MemoryStorageBackend, TrustManager, type TrustedDevice } from "../trust/index.js";
import { sendTrustRequest } from "./probeUtils.js";
import { listRendezvousPeers, registerOnRendezvous, type RendezvousRecord } from "./rendezvous.js";
import * as log from "../logger.js";

export interface MessagingLayer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(peerId: string, msg: ClipboardMessage): Promise<void>;
  broadcast(msg: ClipboardMessage): Promise<void>;
  pairWithPeer(target: PairingTarget, opts?: PairingOptions): Promise<PairingResult>;
  restoreTrustedPeers(peers: TrustedDevice[], opts?: RestoreOptions): Promise<RestoreResult[]>;
  onMessage(cb: (msg: ClipboardMessage) => void): void;
  onPeerConnected(cb: (peerId: string) => void): void;
  onPeerDisconnected(cb: (peerId: string) => void): void;
  getConnectedPeers(): string[];
  onRelayStatusChange(cb: (connected: boolean) => void): void;
  isRelayConnected(): boolean;
}

export type PairingTarget = {
  addrs: string[];
  peerId?: string;
  rendezvousRelays?: string[];
  rendezvousTopic?: string;
};

export type PairingOptions = {
  payload?: any;
  allowRelay?: boolean;
  upgradeTimeoutMs?: number;
  directDialTimeoutMs?: number;
  relayDialTimeoutMs?: number;
};

export type PairingResult = {
  ok: boolean;
  via?: "direct" | "relay";
  addr?: string;
  ack?: any;
  error?: string;
};

export type RestoreOptions = {
  rendezvousRelays?: string[];
  rendezvousTopic?: string;
  directDialTimeoutMs?: number;
  relayDialTimeoutMs?: number;
  upgradeTimeoutMs?: number;
};

export type RestoreResult = {
  peerId: string;
  connected: boolean;
  via?: "direct" | "relay";
  addr?: string;
  error?: string;
};

const PROTOCOL = "/clipboard/1.0.0";

class Libp2pMessagingLayer implements MessagingLayer {
  private node: any;
  private readonly trust: TrustManager;
  private readonly messageBus = new EventBus<ClipboardMessage>();
  private readonly connectBus = new EventBus<string>();
  private readonly disconnectBus = new EventBus<string>();
  private readonly relayStatusBus = new EventBus<boolean>();
  private readonly rendezvousTopic: string;
  private readonly rendezvousRelays: string[];
  private readonly rendezvousRegisterIntervalMs: number;
  private readonly defaultDirectDialTimeoutMs: number;
  private readonly defaultRelayDialTimeoutMs: number;
  private readonly relayPeerIds: Set<string>;
  private readonly relayAddrSet: Set<string>;
  private rendezvousTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private opts: {
      peerId?: any;
      privateKey?: any;
      bootstrapList?: string[];
      relayAddresses?: string[];
      trustStore?: TrustManager;
      rendezvousTopic?: string;
      rendezvousRegisterIntervalMs?: number;
      directDialTimeoutMs?: number;
      relayDialTimeoutMs?: number;
    } = {}
  ) {
    this.trust = opts.trustStore || createTrustManager(new MemoryStorageBackend());
    this.rendezvousTopic = opts.rendezvousTopic || "default";
    this.rendezvousRelays = opts.relayAddresses || [];
    this.rendezvousRegisterIntervalMs = opts.rendezvousRegisterIntervalMs ?? 30_000;
    this.defaultDirectDialTimeoutMs = opts.directDialTimeoutMs ?? 8_000;
    this.defaultRelayDialTimeoutMs = opts.relayDialTimeoutMs ?? 12_000;
    this.relayPeerIds = buildRelayPeerIdSet(this.rendezvousRelays);
    this.relayAddrSet = new Set((this.rendezvousRelays || []).map((a) => a?.toString?.() ?? String(a)));
  }

  async start() {
    if (this.started) return;
    this.node = await createClipboardNode({
      peerId: this.opts.peerId,
      privateKey: this.opts.privateKey,
      bootstrapList: this.opts.bootstrapList,
      relayAddresses: this.opts.relayAddresses,
    });
    this.node.addEventListener("peer:connect", (evt: any) => {
      const detail = evt?.detail;
      const peerId = safePeerId(detail?.remotePeer ?? detail?.peer ?? detail);
      if (!peerId) {
        log.debug("peer:connect missing peer id", { detailKeys: Object.keys(detail || {}) });
        return;
      }
      if (this.isRelayConnection(detail)) {
        log.debug("peer:connect (relay)", {
          peerId,
          addr: detail?.remoteAddr?.toString?.() ?? detail?.connection?.remoteAddr?.toString?.(),
        });
        this.relayStatusBus.emit(true);
        return;
      }
      this.connectBus.emit(peerId);
      log.info("Peer connected", peerId, {
        remoteAddr: detail?.remoteAddr?.toString?.() ?? detail?.connection?.remoteAddr?.toString?.(),
        limited: detail?.stat?.limited ?? detail?.stat?.status === "limited",
        streams: detail?.streams?.map?.((s: any) => s?.stream?.protocol || s?.protocol || s?.toString?.()) || [],
      });
    });
    this.node.addEventListener("peer:disconnect", (evt: any) => {
      const detail = evt?.detail;
      const peerId = safePeerId(detail?.remotePeer ?? detail?.peer ?? detail);
      if (!peerId) {
        log.debug("peer:disconnect missing peer id", { detailKeys: Object.keys(detail || {}) });
        return;
      }
      if (this.isRelayConnection(detail)) {
        log.debug("peer:disconnect (relay)", {
          peerId,
          addr: detail?.remoteAddr?.toString?.() ?? detail?.connection?.remoteAddr?.toString?.(),
        });
        this.relayStatusBus.emit(this.isRelayConnected());
        return;
      }
      this.disconnectBus.emit(peerId);
      log.info("Peer disconnected", peerId, {
        remoteAddr: detail?.remoteAddr?.toString?.() ?? detail?.connection?.remoteAddr?.toString?.(),
        limited: detail?.stat?.limited ?? detail?.stat?.status === "limited",
        streams: detail?.streams?.map?.((s: any) => s?.stream?.protocol || s?.protocol || s?.toString?.()) || [],
      });
    });
    this.node.addEventListener("connection:open", (evt: any) => {
      const conn = evt?.detail;
      log.debug("connection:open", safeConn(conn));
    });
    this.node.addEventListener("connection:close", (evt: any) => {
      const conn = evt?.detail;
      log.debug("connection:close", safeConn(conn));
    });
    this.node.addEventListener("stream:open", (evt: any) => {
      const detail = evt?.detail || evt;
      log.debug("stream:open", {
        peer: safePeerId(detail?.remotePeer ?? detail?.connection?.remotePeer),
        proto: detail?.protocol,
        dir: detail?.direction,
        conn: safeConn(detail?.connection),
      });
    });
    this.node.addEventListener("stream:close", (evt: any) => {
      const detail = evt?.detail || evt;
      log.debug("stream:close", {
        peer: safePeerId(detail?.remotePeer ?? detail?.connection?.remotePeer),
        proto: detail?.protocol,
        dir: detail?.direction,
        conn: safeConn(detail?.connection),
      });
    });
    this.node.handle(
      PROTOCOL,
      async (stream: any, connection?: any) => {
        try {
          // libp2p passes (stream, connection); fall back to evt-style shape if needed
          const conn = connection ?? (stream as any)?.connection;
          const streamInfo = describeStream(stream);
          const connInfo = safeConn(conn);
          const iterable = getStreamIterable(stream);
          log.debug("clipboard:incoming stream", {
            remotePeer: safePeerId(conn?.remotePeer) ?? safePeerId((stream as any)?.remotePeer),
            remoteAddr: conn?.remoteAddr?.toString?.() ?? (stream as any)?.remoteAddr?.toString?.(),
            timeline: conn?.timeline,
            limited: conn?.stat?.limited ?? conn?.stat?.status === "limited" ?? !!conn?.limits,
            streamDir: (stream as any)?.direction,
            streamProto: (stream as any)?.protocol,
            connStreams: conn?.streams?.map?.((s: any) => s?.protocol || s?.stream?.protocol) || [],
            connStat: connInfo,
            stream: streamInfo,
            hasSource: iterable !== null,
          });
        if (!iterable) {
          log.debug("clipboard:incoming stream has no iterable source", { stream: streamInfo, conn: connInfo });
          return;
        }
        let received = 0;
        for await (const chunk of iterable) {
          try {
            const buf = normalizeChunk(chunk);
            const raw = new TextDecoder().decode(buf);
            log.debug("clipboard:raw chunk received", {
              remotePeer: safePeerId(conn?.remotePeer),
              len: buf?.length ?? 0,
              preview: raw.slice(0, 160),
            });
            const msg: ClipboardMessage = JSON.parse(raw);
            received += 1;
            log.debug("clipboard:message received", {
              remotePeer: safePeerId(conn?.remotePeer),
              type: msg?.type,
              from: (msg as any)?.from,
              keys: typeof msg === "object" && msg !== null ? Object.keys(msg) : [],
            });
            if (msg.type === "trust-request" || msg.type === "trust-ack") {
              this.messageBus.emit(msg);
              log.debug("clipboard:trust message dispatched", { type: msg.type, from: msg.from });
              continue;
            }
            if (await this.trust.isTrusted(msg.from)) {
              this.messageBus.emit(msg);
              log.debug("clipboard:trusted message dispatched", { type: msg.type, from: msg.from });
            } else {
              log.debug("clipboard:message dropped (untrusted)", { from: msg.from, type: msg.type });
            }
          } catch (err: any) {
            log.debug("clipboard:failed to handle incoming message", {
              remotePeer: safePeerId(conn?.remotePeer),
              error: err?.message || err,
            });
          }
        }
        log.debug("clipboard:incoming stream closed", {
          remotePeer: safePeerId(conn?.remotePeer) ?? safePeerId((stream as any)?.remotePeer),
          remoteAddr: conn?.remoteAddr?.toString?.() ?? (stream as any)?.remoteAddr?.toString?.(),
          connStreams: conn?.streams?.map?.((s: any) => s?.protocol || s?.stream?.protocol) || [],
          received,
          stream: streamInfo,
          connStat: connInfo,
          limited: conn?.stat?.limited ?? conn?.limits != null,
        });
      } catch (err: any) {
        log.error("clipboard:handler failed", err?.message || err, err);
      }
    },
      { runOnLimitedConnection: true }
    );
    await this.node.start();
    await this.connectRelays();
    await this.registerSelfOnRendezvous();
    this.startRendezvousRefresh();
    this.started = true;
    log.info("Messaging layer started");
  }

  async stop() {
    if (!this.started) return;
    if (this.rendezvousTimer) {
      clearInterval(this.rendezvousTimer);
      this.rendezvousTimer = null;
    }
    await this.node.stop();
    this.started = false;
    this.relayStatusBus.emit(false);
    log.info("Messaging layer stopped");
  }

  async sendMessage(target: string, msg: ClipboardMessage) {
    log.debug("Sending message to", target);
    let conn: any;
    const isPeerId = typeof target === "string" && !target.startsWith("/");
    try {
      if (isPeerId) {
        const existing = this.node.getConnections?.(target)?.[0];
        if (existing?.newStream) {
          conn = await existing.newStream(PROTOCOL, { runOnLimitedConnection: true });
        } else {
          conn = await this.node.dialProtocol(target, PROTOCOL, { runOnLimitedConnection: true });
        }
      } else {
        const addr: Multiaddr = typeof target === "string" ? multiaddr(target) : target;
        conn = await this.node.dialProtocol(addr, PROTOCOL, { runOnLimitedConnection: true });
      }
      await writeToStream(conn, new TextEncoder().encode(JSON.stringify(msg)));
    } catch (err: any) {
      log.warn("sendMessage failed", { target, error: err?.message || err });
      throw err;
    }
  }

  async broadcast(msg: ClipboardMessage) {
    const peers = this.getConnectedPeers();
    log.debug("Broadcasting message to", peers.length, "peers");
    await Promise.all(peers.map((p) => this.sendMessage(p, msg)));
  }

  onMessage(cb: (msg: ClipboardMessage) => void) {
    this.messageBus.on(cb);
  }
  onPeerConnected(cb: (peerId: string) => void) {
    this.connectBus.on(cb);
  }
  onPeerDisconnected(cb: (peerId: string) => void) {
    this.disconnectBus.on(cb);
  }
  onRelayStatusChange(cb: (connected: boolean) => void) {
    this.relayStatusBus.on(cb);
  }
  getConnectedPeers(): string[] {
    if (!this.node || !this.started || typeof this.node.getConnections !== "function") {
      return [];
    }
    return this.node
      .getConnections()
      .filter((c: any) => !this.isRelayConnection(c))
      .map((c: any) => safePeerId(c?.remotePeer))
      .filter(Boolean) as string[];
  }
  isRelayConnected(): boolean {
    if (!this.node || !this.started || typeof this.node.getConnections !== "function") {
      return false;
    }
    try {
      return this.node.getConnections().some((c: any) => this.isRelayConnection(c));
    } catch {
      return false;
    }
  }

  /**
   * UC1: Pair with a peer using direct-first, relay-fallback semantics.
   */
  async pairWithPeer(target: PairingTarget, opts: PairingOptions = {}): Promise<PairingResult> {
    await this.start();
    const allowRelay = opts.allowRelay !== false;
    const directTimeout = opts.directDialTimeoutMs ?? this.defaultDirectDialTimeoutMs;
    const relayTimeout = opts.relayDialTimeoutMs ?? this.defaultRelayDialTimeoutMs;
    const payload = opts.payload ?? (await this.trust.getLocalIdentity());
    const topic = target.rendezvousTopic || this.rendezvousTopic;
    const relayHints = target.rendezvousRelays || this.rendezvousRelays;
    await this.registerSelfOnRendezvous(relayHints, topic);

    const parsed = this.parseAddrs(target.addrs, target.peerId);
    const peerId = target.peerId || parsed.peerId;

    for (const addr of parsed.direct) {
      const ack = await this.tryTrustRequest(addr, payload, directTimeout, false);
      if (ack) {
        log.info("Pairing succeeded via direct dial", { addr: addr.toString(), ack });
        return { ok: true, via: "direct", addr: addr.toString(), ack };
      } else {
        log.debug("Pairing direct dial returned no ack", { addr: addr.toString() });
      }
    }

    if (allowRelay) {
      await this.ensureRelayReservations(relayHints);
      const relayAddrs = parsed.relay.length ? parsed.relay : this.buildCircuitAddrs(relayHints, peerId);
      for (const addr of relayAddrs) {
        const ack = await this.tryTrustRequest(addr, payload, relayTimeout, true);
        if (ack) {
          const upgradeAddrs = this.collectUpgradeCandidates(parsed.direct, ack);
          if (upgradeAddrs.length && peerId) {
            void this.tryDirectUpgrade(peerId, upgradeAddrs, opts.upgradeTimeoutMs ?? 10_000);
          }
          log.info("Pairing succeeded via relay", { addr: addr.toString() });
          return { ok: true, via: "relay", addr: addr.toString(), ack };
        } else {
          log.debug("Pairing relay dial returned no ack", { addr: addr.toString() });
        }
      }
    }

    log.warn("Pairing failed: no address reached");
    return { ok: false, error: "dial_failed" };
  }

  /**
   * UC2: Reconnect to already trusted peers without re-sending trust requests.
   */
  async restoreTrustedPeers(peers: TrustedDevice[], opts: RestoreOptions = {}): Promise<RestoreResult[]> {
    await this.start();
    const topic = opts.rendezvousTopic || this.rendezvousTopic;
    const rendezvousRelays = opts.rendezvousRelays || this.rendezvousRelays;
    const directTimeout = opts.directDialTimeoutMs ?? this.defaultDirectDialTimeoutMs;
    const relayTimeout = opts.relayDialTimeoutMs ?? this.defaultRelayDialTimeoutMs;

    await this.registerSelfOnRendezvous(rendezvousRelays, topic);
    const rendezvousMap = await this.fetchRendezvousCandidates(rendezvousRelays, topic);

    const results: RestoreResult[] = [];
    for (const peer of peers) {
      const peerId = this.extractPeerIdFromAddrs(peer.multiaddrs || []) || peer.deviceId;
      const existing = this.getExistingConnection(peerId);
      if (existing) {
        results.push({ peerId, connected: true, via: existing.isRelay ? "relay" : "direct", addr: existing.addr });
        continue;
      }

      const addrs = [
        ...(peer.multiaddrs || []),
        ...(rendezvousMap.get(peerId)?.addrs || []),
      ];
      const parsed = this.parseAddrs(addrs, peerId);

      const directHit = await this.dialFirst(parsed.direct, directTimeout);
      if (directHit) {
        results.push({ peerId, connected: true, via: "direct", addr: directHit.toString() });
        continue;
      }

      await this.ensureRelayReservations(rendezvousRelays);
      const relayAddrs = parsed.relay.length ? parsed.relay : this.buildCircuitAddrs(rendezvousRelays, peerId);
      const relayHit = await this.dialFirst(relayAddrs, relayTimeout);
      if (relayHit) {
        if (parsed.direct.length) {
          void this.tryDirectUpgrade(peerId, parsed.direct, opts.upgradeTimeoutMs ?? 10_000);
        }
        results.push({ peerId, connected: true, via: "relay", addr: relayHit.toString() });
        continue;
      }

      results.push({ peerId, connected: false, error: "dial_failed" });
    }
    return results;
  }

  private startRendezvousRefresh() {
    if (this.rendezvousRelays.length === 0 || this.rendezvousRegisterIntervalMs <= 0) return;
    if (this.rendezvousTimer) return;
    this.rendezvousTimer = setInterval(() => {
      void this.registerSelfOnRendezvous().catch((err) =>
        log.debug("Rendezvous refresh failed", err?.message || err)
      );
    }, this.rendezvousRegisterIntervalMs);
  }

  private async registerSelfOnRendezvous(relays = this.rendezvousRelays, topic = this.rendezvousTopic) {
    if (!relays.length) return;
    const addrs = this.node?.getMultiaddrs?.().map((a: any) => a.toString()) || [];
    log.debug("rendezvous:register:start", { relays, topic, addrs });
    await Promise.all(
      relays.map((relay) =>
        registerOnRendezvous(this.node, relay, topic, addrs, (...args: any[]) => log.debug(...args))
      )
    );
  }

  private async fetchRendezvousCandidates(relays: string[], topic: string) {
    const map = new Map<string, RendezvousRecord>();
    for (const relay of relays) {
      const peers = await listRendezvousPeers(this.node, relay, topic, (...args: any[]) => log.debug(...args));
      for (const peer of peers) {
        const existing = map.get(peer.peer);
        if (existing) {
          existing.addrs = this.dedupeStrings([...existing.addrs, ...peer.addrs]);
        } else {
          map.set(peer.peer, { ...peer, addrs: this.dedupeStrings(peer.addrs) });
        }
      }
    }
    return map;
  }

  private parseAddrs(addrs: string[], peerIdHint?: string) {
    const direct: Multiaddr[] = [];
    const relay: Multiaddr[] = [];
    let peerId = peerIdHint;
    for (const addr of addrs || []) {
      try {
        const ma = multiaddr(addr);
        if (!peerId && typeof ma.getPeerId === "function") {
          peerId = ma.getPeerId();
        }
        if (this.isRelayAddr(ma)) relay.push(ma);
        else direct.push(ma);
      } catch {
        // ignore invalid
      }
    }
    return {
      peerId,
      direct: this.dedupeMultiaddrs(direct),
      relay: this.dedupeMultiaddrs(relay),
    };
  }

  private isRelayAddr(addr: Multiaddr | undefined) {
    if (!addr) return false;
    try {
      return addr.toString().includes("/p2p-circuit");
    } catch {
      return false;
    }
  }

  private dedupeStrings(values: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  private dedupeMultiaddrs(values: Multiaddr[]) {
    const seen = new Set<string>();
    const out: Multiaddr[] = [];
    for (const v of values) {
      const key = v.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }

  private extractPeerIdFromAddrs(addrs: string[]) {
    for (const addr of addrs || []) {
      try {
        const ma = multiaddr(addr);
        if (typeof ma.getPeerId === "function") {
          const pid = ma.getPeerId();
          if (pid) return pid;
        }
      } catch {
        // ignore
      }
    }
    return undefined;
  }

  private buildCircuitAddrs(relays: string[], peerId?: string): Multiaddr[] {
    if (!peerId) return [];
    const out: Multiaddr[] = [];
    for (const relay of relays || []) {
      try {
        const base = multiaddr(relay);
        const circuit = base.encapsulate("/p2p-circuit");
        out.push(peerId ? circuit.encapsulate(`/p2p/${peerId}`) : circuit);
      } catch {
        // ignore invalid relay
      }
    }
    return this.dedupeMultiaddrs(out);
  }

  private getExistingConnection(peerId: string) {
    if (this.isRelayPeer(peerId)) return null;
    try {
      const conns = this.node?.getConnections?.(peerId) || [];
      const direct = conns.find((c: any) => !this.isRelayAddr(c?.remoteAddr));
      if (direct) {
        return { addr: direct.remoteAddr?.toString?.(), isRelay: false };
      }
      const relayConn = conns.find((c: any) => this.isRelayAddr(c?.remoteAddr));
      if (relayConn) {
        return { addr: relayConn.remoteAddr?.toString?.(), isRelay: true };
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async dialWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("dial_timeout")), Math.max(1, timeoutMs));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async tryTrustRequest(
    addr: Multiaddr,
    payload: any,
    timeoutMs: number,
    allowLimited: boolean
  ) {
    log.debug("trust-request:attempt", {
      addr: addr.toString(),
      allowLimited,
      timeoutMs,
    });
    try {
      return await this.dialWithTimeout(
        () =>
          sendTrustRequest(this.node, addr, payload, {
            allowLimited,
            logger: (...args: any[]) => log.debug(...args),
          }),
        timeoutMs
      );
    } catch (err: any) {
      log.debug("trust-request dial failed", { addr: addr.toString(), error: err?.message || err });
      return undefined;
    }
  }

  private async dialFirst(addrs: Multiaddr[], timeoutMs: number): Promise<Multiaddr | null> {
    for (const addr of addrs) {
      try {
        const allowLimited = this.isRelayAddr(addr);
        await this.dialWithTimeout(
          () => this.node.dial(addr, { runOnLimitedConnection: allowLimited }),
          timeoutMs
        );
        return addr;
      } catch (err: any) {
        log.debug("dial attempt failed", { addr: addr.toString(), error: err?.message || err });
      }
    }
    return null;
  }

  private async ensureRelayReservations(relays = this.rendezvousRelays) {
    log.debug("ensureRelayReservations", { relays, nodeAddrs: this.node?.getMultiaddrs?.()?.map((a: any) => a.toString()) });
    if (!relays.length) return;
    await this.connectRelays(relays);
  }

  private collectUpgradeCandidates(existingDirect: Multiaddr[], ack: any): Multiaddr[] {
    const out: Multiaddr[] = [...existingDirect];
    const payloadAddrs: string[] = [];
    if (ack?.payload?.multiaddrs && Array.isArray(ack.payload.multiaddrs)) {
      payloadAddrs.push(...ack.payload.multiaddrs);
    }
    if (ack?.payload?.multiaddr && typeof ack.payload.multiaddr === "string") {
      payloadAddrs.push(ack.payload.multiaddr);
    }
    const parsed = this.parseAddrs(payloadAddrs);
    out.push(...parsed.direct);
    return this.dedupeMultiaddrs(out).filter((ma) => !this.isRelayAddr(ma));
  }

  private async tryDirectUpgrade(peerId: string, addrs: Multiaddr[], timeoutMs: number) {
    const limit = timeoutMs ?? this.defaultDirectDialTimeoutMs;
    for (const addr of addrs) {
      try {
        await this.dialWithTimeout(() => this.node.dial(addr), limit);
        const conn = this.getExistingConnection(peerId);
        if (conn && !conn.isRelay) {
          log.info("Direct upgrade succeeded", { peerId, addr: addr.toString() });
          return;
        }
      } catch (err: any) {
        log.debug("Direct upgrade dial failed", { addr: addr.toString(), error: err?.message || err });
      }
    }
    log.debug("Direct upgrade attempts finished without success", { peerId });
  }

  private async connectRelays(relays = this.opts.relayAddresses || []) {
    log.debug("connectRelays:start", { relays, nodeAddrs: this.node?.getMultiaddrs?.()?.map((a: any) => a.toString()) });
    for (const addr of relays) {
      try {
        const ma = multiaddr(addr);
        log.info("Dialing relay", ma.toString());
        await this.node.dial(ma, { runOnLimitedConnection: true });
        log.info("Relay dial succeeded", ma.toString());
        log.debug("relay:multiaddrs-after-dial", {
          relay: ma.toString(),
          nodeAddrs: this.node?.getMultiaddrs?.()?.map((a: any) => a.toString()),
        });
      } catch (err: any) {
        log.warn("Relay dial failed", addr, err?.message || err);
      }
    }
  }

  private isRelayPeer(peerId: string) {
    return this.relayPeerIds.has(peerId);
  }

  private isRelayConnection(conn: any): boolean {
    const pid = safePeerId(conn?.remotePeer);
    const addrStr = conn?.remoteAddr?.toString?.();
    if (pid && this.relayPeerIds.has(pid)) return true;
    if (addrStr) {
      for (const rid of this.relayPeerIds) {
        if (addrStr.includes(`/p2p/${rid}`)) return true;
      }
      if (this.relayAddrSet.has(addrStr)) return true;
    }
    return false;
  }
}

export function createMessagingLayer(options?: {
  peerId?: any;
  privateKey?: any;
  bootstrapList?: string[];
  relayAddresses?: string[];
  trustStore?: TrustManager;
  rendezvousTopic?: string;
  rendezvousRegisterIntervalMs?: number;
  directDialTimeoutMs?: number;
  relayDialTimeoutMs?: number;
}): MessagingLayer {
  return new Libp2pMessagingLayer(options);
}

export { PROTOCOL };

function safePeerId(peer: any): string | null {
  if (!peer) return null;
  try {
    if (typeof peer === "string") return peer;
    if (typeof peer === "object" && typeof peer.type === "string" && typeof peer.toString === "function") {
      return peer.toString();
    }
    if (typeof peer.toString === "function") return peer.toString();
  } catch {
    // ignore
  }
  return null;
}

function safeConn(conn: any) {
  if (!conn) return undefined;
  try {
    return {
      stat: conn.stat,
      timeline: conn.timeline,
      remotePeer: safePeerId(conn.remotePeer),
      remoteAddr: conn.remoteAddr?.toString?.(),
      streams: conn.streams?.map?.((s: any) => s?.protocol || s?.stream?.protocol),
      limits: conn.limits,
    };
  } catch {
    return undefined;
  }
}

function getStreamIterable(stream: any): AsyncIterable<Uint8Array> | null {
  if (!stream) return null;
  if (stream.source && typeof stream.source[Symbol.asyncIterator] === "function") return stream.source;
  if (typeof stream[Symbol.asyncIterator] === "function") return stream;
  const inner = (stream as any).stream;
  if (inner?.source && typeof inner.source[Symbol.asyncIterator] === "function") return inner.source;
  if (inner && typeof inner[Symbol.asyncIterator] === "function") return inner;
  return null;
}

async function writeToStream(stream: any, data: Uint8Array, opts: { end?: boolean } = {}) {
  if (!stream) throw new Error("No stream provided");
  const shouldEnd = opts.end === true;

  const sinkTarget =
    typeof stream.sink === "function"
      ? stream
      : stream?.stream && typeof stream.stream.sink === "function"
      ? stream.stream
      : null;
  if (sinkTarget) {
    const iterable = (async function* () {
      yield data;
    })();
    await sinkTarget.sink(iterable);
    if (shouldEnd && typeof sinkTarget.close === "function") {
      await sinkTarget.close();
    }
    return;
  }

  const writeTarget =
    typeof stream.write === "function"
      ? stream
      : stream?.stream && typeof stream.stream.write === "function"
      ? stream.stream
      : null;
  if (writeTarget) {
    await writeTarget.write(data);
    if (shouldEnd) {
      if (typeof writeTarget.closeWrite === "function") {
        await writeTarget.closeWrite();
      } else if (typeof writeTarget.close === "function") {
        await writeTarget.close();
      }
    }
    return;
  }

  const sendTarget =
    typeof stream.send === "function"
      ? stream
      : stream?.stream && typeof stream.stream.send === "function"
      ? stream.stream
      : null;
  if (sendTarget) {
    sendTarget.send(data);
    if (shouldEnd) {
      if (typeof sendTarget.closeWrite === "function") {
        await sendTarget.closeWrite();
      } else if (typeof sendTarget.close === "function") {
        await sendTarget.close();
      }
    }
    return;
  }

  throw new Error("stream is not writable (sink/write/send missing)");
}

function describeStream(stream: any) {
  if (!stream) return undefined;
  try {
    const inner = (stream as any)?.stream ?? stream;
    return {
      ctor: inner?.constructor?.name,
      keys: Object.keys(inner || {}),
      protocol: inner?.protocol,
      direction: inner?.direction,
      hasSource: Boolean(inner?.source),
      hasAsyncIterator: typeof inner?.[Symbol.asyncIterator] === "function",
      hasSink: typeof inner?.sink === "function",
      hasSend: typeof inner?.send === "function",
      hasWrite: typeof inner?.write === "function",
      chunkType: inner?.source ? inner?.source?.constructor?.name : undefined,
    };
  } catch {
    return undefined;
  }
}

function normalizeChunk(chunk: any): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk?.subarray) return chunk.subarray();
  if (chunk?.buffer && typeof chunk.byteOffset === "number" && typeof chunk.byteLength === "number") {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  try {
    return Uint8Array.from(chunk as any);
  } catch {
    return new Uint8Array();
  }
}

function buildRelayPeerIdSet(relays: string[]) {
  const set = new Set<string>();
  for (const addr of relays || []) {
    try {
      const ma = multiaddr(addr);
      const pid = ma.getPeerId?.();
      if (pid) set.add(pid);
    } catch {
      // ignore invalid relay addr
    }
  }
  return set;
}
