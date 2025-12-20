import { createClipboardNode } from "./node.js";
import { multiaddr } from "@multiformats/multiaddr";
import { EventBus } from "./events.js";
import { toU8 } from "./bytes.js";
import { CLIP_PROTOCOL, CLIP_TRUST_PROTOCOL, HISTORY_PROTOCOL } from "./protocol.js";
import type { MessagingTransport, MessageHandler } from "../messaging/transport.js";
import * as log from "../logger.js";

type Libp2pNode = any;

export type Libp2pMessagingOptions = {
  peerId?: any;
  privateKey?: any;
  bootstrapList?: string[];
  relayAddresses?: string[];
};

class Libp2pMessagingTransport implements MessagingTransport {
  private node: Libp2pNode | null = null;
  private started = false;
  private lastSelfMultiaddrsKey: string | null = null;

  private readonly handlersByProtocol = new Map<string, MessageHandler[]>();
  private readonly connectBus = new EventBus<string>();
  private readonly disconnectBus = new EventBus<string>();
  private readonly selfPeerUpdateBus = new EventBus<string[]>();

  private readonly relayPeerIds: Set<string>;
  private readonly relayAddrSet: Set<string>;

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
    });

    this.node.addEventListener("peer:connect", (evt: any) => {
      const detail = evt?.detail;
      const peerId = safePeerId(detail?.remotePeer ?? detail?.peer ?? detail);
      if (!peerId) return;
      if (this.isRelayConnection(detail)) return;
      this.connectBus.emit(peerId);
    });
    this.node.addEventListener("peer:disconnect", (evt: any) => {
      const detail = evt?.detail;
      const peerId = safePeerId(detail?.remotePeer ?? detail?.peer ?? detail);
      if (!peerId) return;
      if (this.isRelayConnection(detail)) return;
      this.disconnectBus.emit(peerId);
    });
    this.node.addEventListener("self:peer:update", () => {
      this.emitSelfPeerUpdate();
    });

    const handler = (protocol: string) => this.handleIncoming(protocol);
    this.node.handle(CLIP_PROTOCOL, handler(CLIP_PROTOCOL), { runOnLimitedConnection: true });
    this.node.handle(CLIP_TRUST_PROTOCOL, handler(CLIP_TRUST_PROTOCOL), { runOnLimitedConnection: true });
    this.node.handle(HISTORY_PROTOCOL, handler(HISTORY_PROTOCOL), { runOnLimitedConnection: true });

    await this.node.start();

    // Best-effort: dial relays if explicitly configured.
    await this.connectRelays(this.opts.relayAddresses || []);
    this.emitSelfPeerUpdate();

    this.started = true;
    log.info("Messaging transport started");
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.node?.stop?.();
    this.node = null;
    this.started = false;
    log.info("Messaging transport stopped");
  }

  async send(protocol: string, target: string, data: Uint8Array): Promise<void> {
    if (!this.node || !this.started) {
      throw new Error("messaging_not_started");
    }

    const stream = await this.openStream(protocol, target);

    const ok = typeof stream?.send === "function" ? stream.send(data) : false;
    if (ok === false && typeof stream?.onDrain === "function") {
      await stream.onDrain();
    }
    if (typeof stream?.close === "function") {
      await stream.close();
    }
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

  onSelfPeerUpdate(cb: (multiaddrs: string[]) => void): void {
    this.selfPeerUpdateBus.on(cb);
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

  private async openStream(protocol: string, target: string): Promise<any> {
    if (!this.node) {
      throw new Error("messaging_not_started");
    }
    if (target.startsWith("/")) {
      return await this.node.dialProtocol(multiaddr(target), protocol, { runOnLimitedConnection: true });
    }

    const existing = this.findConnectionByPeerId(target);
    if (existing?.newStream) {
      return await existing.newStream(protocol, { runOnLimitedConnection: true });
    }

    throw new Error("peer_not_connected");
  }

  private findConnectionByPeerId(peerId: string): any | null {
    try {
      const conns = this.node?.getConnections?.() || [];
      return conns.find((c: any) => safePeerId(c?.remotePeer) === peerId) || null;
    } catch {
      return null;
    }
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
        log.debug("Incoming stream failed", { protocol, from, error: err?.message || err });
      }
    };
  }

  private async connectRelays(relays: string[]) {
    if (!this.node || !relays.length) return;
    for (const addr of relays) {
      try {
        const ma = multiaddr(addr);
        await this.node.dial(ma, { runOnLimitedConnection: true });
      } catch (err: any) {
        log.warn("Relay dial failed", { addr, error: err?.message || err });
      }
    }
  }

  private emitSelfPeerUpdate(): void {
    try {
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
      const key = Array.from(seen).sort().join("\n");
      if (key === this.lastSelfMultiaddrsKey) return;
      this.lastSelfMultiaddrsKey = key;
      this.selfPeerUpdateBus.emit(unique);
    } catch {
      // ignore
    }
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
    try {
      const ma = multiaddr(addr);
      const pid = getPeerIdFromMultiaddr(ma);
      if (pid) set.add(pid);
    } catch {
      // ignore invalid relay addr
    }
  }
  return set;
}

type MultiaddrWithPeerId = ReturnType<typeof multiaddr> & { getPeerId?: () => string };

function getPeerIdFromMultiaddr(addr: any): string | undefined {
  const pid = (addr as MultiaddrWithPeerId).getPeerId?.();
  return pid || undefined;
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
