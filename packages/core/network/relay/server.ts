import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { circuitRelayServer, type CircuitRelayService } from "@libp2p/circuit-relay-v2";
import { enable as enableLibp2pDebug } from "@libp2p/logger";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { createLibp2p, type Libp2p } from "libp2p";
import type { Connection } from "@libp2p/interface";
import { peerIdFromMultihash } from "@libp2p/peer-id";
import * as Digest from "multiformats/hashes/digest";
import { defaultLogger } from "@libp2p/logger";
import { FaultTolerance } from "@libp2p/interface-transport";
import { privateKeyFromProtobuf, privateKeyFromRaw, type PrivateKey } from "@libp2p/crypto/keys";
import { ping } from "@libp2p/ping";

// Node 20 may not yet have Promise.withResolvers; provide a polyfill so libp2p deps can run.
if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function withResolversPolyfill<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

type RelayServices = { circuitRelay: CircuitRelayService; ping: any };
type RelayNode = Libp2p<RelayServices>;
type RendezvousTopic = string;
type RendezvousRecord = { peer: string; addrs: string[]; lastSeen: number };

export interface WebsocketRelayOptions {
  listen?: Array<string | Multiaddr>;
  host?: string;
  port?: number;
  announce?: Array<string | Multiaddr>;
  statusIntervalMs?: number;
  maxReservations?: number;
  reservationTtlMs?: number;
  debugNamespaces?: string;
  enableWebRTC?: boolean;
}

export interface StartedRelay {
  node: RelayNode;
  stop: () => Promise<void>;
}

/**
 * Start a libp2p circuit-relay server reachable over WebSockets.
 * Returns the started node along with a stop helper that cleans up timers and listeners.
 */
export async function startWebsocketRelay(options: WebsocketRelayOptions = {}): Promise<StartedRelay> {
  const debugNamespaces =
    options.debugNamespaces ??
    process.env.LIBP2P_DEBUG ??
    process.env.DEBUG ??
    "libp2p:circuit-relay:*,libp2p:connection-manager:*,libp2p:upgrader:*";

  enableLibp2pDebug(debugNamespaces);
  log("Libp2p debug namespaces enabled", { namespaces: debugNamespaces });

  const listenAddrs = toMultiaddrs(
    options.listen && options.listen.length > 0 ? options.listen : buildDefaultListen(options.host, options.port)
  );
  const announceAddrs = toMultiaddrs(options.announce);
  const statusIntervalMs = coerceNumber(options.statusIntervalMs, 15_000);
  const maxReservations = coerceNumber(options.maxReservations, 500);
  const reservationTtl = coerceNumber(options.reservationTtlMs, 2 * 60 * 60 * 1000);
  const privateKey = loadPrivateKeyFromEnv();
  const enableWebRTC =
    typeof options.enableWebRTC === "boolean"
      ? options.enableWebRTC
      : coerceBool(process.env.RELAY_ENABLE_WEBRTC, false);
  const webrtcTransport = enableWebRTC ? await loadWebRTCTransport() : undefined;

  const node = await createLibp2p<RelayServices>({
    ...(privateKey ? { privateKey } : {}),
    logger: defaultLogger(),
    addresses: {
      listen: listenAddrs,
      announce: announceAddrs,
      announceFilter: (addrs) => addrs,
    },
    transports: [withLogger(webSockets()), ...(webrtcTransport ? [webrtcTransport] : [])],
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      circuitRelay: circuitRelayServer({
        reservations: {
          maxReservations,
          reservationTtl,
        },
      }),
    },
  });

  patchUpgraderConnectionFallbacks(node, [
    (node as any).components?.upgrader,
    (node as any).upgrader,
    (node as any).components?.connectionManager?.upgrader,
  ]);
  const removeNodeListeners = instrumentNode(node);
  const removeRelayInstrumentation = instrumentRelayService(node.services.circuitRelay, statusIntervalMs);
  const stopRendezvous = registerRendezvous(node);

  const info = {
    peerId: node.peerId.toString(),
    listen: node.getMultiaddrs().map(String),
    announce: announceAddrs.map(String),
    privateKey: privateKey ? "provided" : "generated",
  };
  log("Websocket relay started", info);

  return {
    node,
    stop: async () => {
      removeRelayInstrumentation?.();
      removeNodeListeners?.();
      stopRendezvous?.();
      await node.stop();
      log("Websocket relay stopped");
    },
  };
}

/**
 * Convenience helper to start the relay using environment variables.
 *
 * RELAY_PORT: TCP port (default: 47891)
 * RELAY_HOST: Host/IP to bind (default: 0.0.0.0)
 * RELAY_LISTEN / RELAY_WS_LISTEN: comma-separated explicit multiaddrs
 * RELAY_ANNOUNCE: comma-separated multiaddrs to announce to peers
 * RELAY_STATUS_INTERVAL_MS: how often to log reservations/status
 * RELAY_MAX_RESERVATIONS: limit concurrent reservations
 * RELAY_RESERVATION_TTL_MS: reservation lifetime in ms
 * LIBP2P_DEBUG / DEBUG: libp2p debug namespaces
 */
export async function startWebsocketRelayFromEnv(): Promise<StartedRelay> {
  const envListen =
    process.env.RELAY_LISTEN ||
    process.env.RELAY_WS_LISTEN ||
    "";
  const listen = splitAndClean(envListen);
  const announce = splitAndClean(process.env.RELAY_ANNOUNCE || "");
  const port = coerceNumber(process.env.RELAY_PORT, 47_891);
  const host = process.env.RELAY_HOST || "0.0.0.0";
  const statusIntervalMs = coerceNumber(process.env.RELAY_STATUS_INTERVAL_MS, 15_000);
  const maxReservations = coerceNumber(process.env.RELAY_MAX_RESERVATIONS, 500);
  const reservationTtlMs = coerceNumber(process.env.RELAY_RESERVATION_TTL_MS, 2 * 60 * 60 * 1000);

  log("Starting websocket relay from environment", {
    host,
    port,
    listen,
    announce,
    statusIntervalMs,
    maxReservations,
    reservationTtlMs,
  });

  return startWebsocketRelay({
    listen,
    host,
    port,
    announce,
    statusIntervalMs,
    maxReservations,
    reservationTtlMs,
  });
}

function splitAndClean(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildDefaultListen(host = "0.0.0.0", port = 47891): string[] {
  const proto = host.includes(":") ? "ip6" : "ip4";
  return [`/${proto}/${host}/tcp/${port}/ws`];
}

function toMultiaddrs(values?: Array<string | Multiaddr>): Multiaddr[] {
  if (!values) return [];
  const addrs: Multiaddr[] = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value !== "string") {
      addrs.push(value);
      continue;
    }
    try {
      addrs.push(multiaddr(value));
    } catch (err) {
      log("Invalid multiaddr skipped", { value, error: (err as Error)?.message });
    }
  }
  return addrs;
}

function log(message: string, meta?: Record<string, unknown>) {
  const prefix = `[${new Date().toISOString()}][relay]`;
  if (meta) {
    console.info(prefix, message, meta);
    return;
  }
  console.info(prefix, message);
}

function formatConnection(conn?: Connection) {
  if (!conn) return undefined;
  return {
    peer: conn.remotePeer?.toString?.(),
    addr: conn.remoteAddr?.toString?.(),
    direction: (conn as any).stat?.direction,
    opened: (conn as any).timeline?.open,
    streams: Array.isArray((conn as any).streams) ? (conn as any).streams.length : undefined,
  };
}

function patchUpgraderConnectionFallbacks(node: RelayNode, candidates: any[]) {
  const upgrader = candidates.find(Boolean);
  if (!upgrader) {
    log("patchUpgraderConnectionFallbacks: no upgrader found");
    return;
  }
  const origInbound = upgrader._encryptInbound?.bind(upgrader);
  const origOutbound = upgrader._encryptOutbound?.bind(upgrader);
  log("patchUpgraderConnectionFallbacks: found upgrader", {
    hasInbound: typeof origInbound === "function",
    hasOutbound: typeof origOutbound === "function",
    keys: Object.keys(upgrader || {}),
  });
  if (typeof origInbound === "function") {
    upgrader._encryptInbound = async function (...args: any[]) {
      const res = await origInbound(...args);
      if (res && res.connection == null) {
        res.connection = res.conn ?? res.stream ?? args[0];
      }
      return res;
    };
  }
  if (typeof origOutbound === "function") {
    upgrader._encryptOutbound = async function (...args: any[]) {
      const res = await origOutbound(...args);
      if (res && res.connection == null) {
        res.connection = res.conn ?? res.stream ?? args[0];
      }
      return res;
    };
  }
}

function describePeerIdBytes(raw?: Uint8Array) {
  if (!raw) return undefined;
  try {
    return peerIdFromMultihash(Digest.decode(raw)).toString();
  } catch {
    try {
      return `0x${Buffer.from(raw).toString("hex").slice(0, 16)}...`;
    } catch {
      return "unparseable-peer-id";
    }
  }
}

function describeLimit(limit: any) {
  if (!limit) return undefined;
  return {
    data: typeof limit.data === "bigint" ? limit.data.toString() : limit.data,
    duration: limit.duration,
  };
}

function describeRelayRequest(arg: any) {
  const request = arg?.request ?? arg;
  const connection = arg?.connection;
  const peerInfo = request?.peer || request?.dstPeer;

  return {
    type: request?.type,
    status: request?.status,
    limit: describeLimit(request?.limit),
    peer: describePeerIdBytes(peerInfo?.id),
    peerAddrs: Array.isArray(peerInfo?.addrs)
      ? peerInfo.addrs.map((a: any) => {
          try {
            return multiaddr(a).toString();
          } catch {
            return undefined;
          }
        }).filter(Boolean)
      : undefined,
    reservationExpire: request?.reservation?.expire,
    from: formatConnection(connection),
  };
}

function instrumentNode(node: RelayNode) {
  const listeners: Array<() => void> = [];
  listeners.push(
    bindListener(node, "peer:connect", (evt: any) => {
      log("peer:connect", { peer: evt?.detail?.toString?.() });
    })
  );
  listeners.push(
    bindListener(node, "peer:disconnect", (evt: any) => {
      log("peer:disconnect", { peer: evt?.detail?.toString?.() });
    })
  );
  listeners.push(
    bindListener(node, "connection:open", (evt: any) => {
      log("connection:open", formatConnection(evt?.detail));
    })
  );
  listeners.push(
    bindListener(node, "connection:close", (evt: any) => {
      log("connection:close", formatConnection(evt?.detail));
    })
  );
  listeners.push(
    bindListener(node, "peer:identify", (evt: any) => {
      const detail = evt?.detail;
      log("peer:identify", {
        peer: detail?.peerId?.toString?.(),
        protocols: detail?.protocols,
        listenAddrs: detail?.listenAddrs?.map?.((a: any) => a.toString()),
        observedAddr: detail?.observedAddr?.toString?.(),
      });
    })
  );

  return () => listeners.forEach((unbind) => unbind());
}

function bindListener(node: RelayNode, event: string, handler: (evt: any) => void) {
  node.addEventListener(event as any, handler as any);
  return () => node.removeEventListener(event as any, handler as any);
}

function instrumentRelayService(relay: CircuitRelayService | undefined, statusIntervalMs: number) {
  if (!relay) {
    log("Circuit relay service missing; instrumentation skipped");
    return;
  }
  const relayAny = relay as any;
  const patches: Array<() => void> = [];

  patches.push(wrapRelayMethod(relayAny, "onHop"));
  patches.push(wrapRelayMethod(relayAny, "handleHop"));
  patches.push(wrapRelayMethod(relayAny, "handleReserve"));
  patches.push(wrapRelayMethod(relayAny, "handleConnect"));
  patches.push(wrapRelayMethod(relayAny, "stopHop"));

  if (relayAny?.reservationStore?.reserve) {
    const store = relayAny.reservationStore;
    const originalReserve = store.reserve.bind(store);
    store.reserve = (...args: any[]) => {
      const [peer, addr, limit] = args;
      log("reservation:request", {
        peer: peer?.toString?.(),
        addr: addr?.toString?.(),
        limit: describeLimit(limit),
      });
      const result = originalReserve(...args);
      log("reservation:result", {
        peer: peer?.toString?.(),
        status: result?.status,
        expire: result?.expire,
      });
      return result;
    };
    patches.push(() => {
      store.reserve = originalReserve;
    });
  }

  const interval = setInterval(() => {
    logReservations(relayAny);
  }, Math.max(1_000, statusIntervalMs));

  return () => {
    clearInterval(interval);
    patches.forEach((restore) => restore?.());
  };
}

function wrapRelayMethod(relay: any, method: string) {
  const original = relay?.[method];
  if (typeof original !== "function") return () => {};
  const bound = original.bind(relay);
  relay[method] = async (...args: any[]) => {
    log(`relay:${method}:start`, describeRelayRequest(args[0]));
    try {
      const result = await bound(...args);
      log(`relay:${method}:ok`, describeRelayRequest(args[0]));
      return result;
    } catch (err: any) {
      log(`relay:${method}:error`, {
        message: err?.message || String(err),
      });
      throw err;
    }
  };
  return () => {
    relay[method] = original;
  };
}

function logReservations(relay: any) {
  const reservations: any = relay?.reservations;
  if (!reservations || typeof reservations.entries !== "function") {
    return;
  }
  const snapshot: Array<Record<string, unknown>> = [];
  for (const [peer, data] of reservations.entries()) {
    snapshot.push({
      peer: peer?.toString?.(),
      addr: data?.addr?.toString?.(),
      expiresInMs: data?.expiry instanceof Date ? data.expiry.getTime() - Date.now() : undefined,
      limit: describeLimit(data?.limit),
    });
  }
  log("reservations:snapshot", { count: snapshot.length, reservations: snapshot });
}

function coerceNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function coerceBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return true;
    if (["0", "false", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

function withLogger<T>(factory: any) {
  return (components: any) => {
    components.logger = components.logger || defaultLogger();
    return factory(components) as T;
  };
}

function loadPrivateKeyFromEnv(): PrivateKey | undefined {
  const raw =
    (typeof process !== "undefined" && process.env?.RELAY_PRIVATE_KEY_BASE64) ||
    (typeof process !== "undefined" && process.env?.RELAY_PRIVATE_KEY);
  if (!raw) return undefined;
  try {
    const bytes = Buffer.from(raw.trim(), "base64");
    if (bytes.byteLength === 0) return undefined;
    try {
      return privateKeyFromProtobuf(bytes);
    } catch {
      return privateKeyFromRaw(bytes);
    }
  } catch (err) {
    log("Failed to parse RELAY_PRIVATE_KEY", { error: (err as Error)?.message });
    return undefined;
  }
}

function registerRendezvous(node: RelayNode) {
  const TOPIC_PREFIX = "/rendezvous/1.0.0";
  const topics = new Map<RendezvousTopic, Map<string, RendezvousRecord>>();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  function touch(topic: RendezvousTopic, record: RendezvousRecord) {
    let bucket = topics.get(topic);
    if (!bucket) {
      bucket = new Map();
      topics.set(topic, bucket);
    }
    bucket.set(record.peer, record);
  }

  node.handle(TOPIC_PREFIX, async (data: any) => {
    const stream = data?.stream ?? data;
    const connection = data?.connection ?? (stream as any)?.connection;

    log("Rendezvous handler invoked", {
      stream: describeStream(stream),
      connection: connection ? formatConnection(connection) : undefined,
    });

    if (!stream) {
      log("Rendezvous handler received falsy stream", {
        stream,
        connection: connection ? formatConnection(connection) : undefined,
        dataKeys: data ? Object.keys(data) : undefined,
      });
      return;
    }

    const asyncIter =
      typeof (stream as any)?.[Symbol.asyncIterator] === "function"
        ? (stream as any)[Symbol.asyncIterator]()
        : (stream as any)?.source;
    const iterable = asyncIter as AsyncIterable<any> | undefined;
    if (!iterable || typeof (iterable as any)[Symbol.asyncIterator] !== "function") {
      log("Rendezvous handler missing async iterator on stream", {
        hasSource: Boolean((stream as any)?.source),
        ctor: (stream as any)?.constructor?.name,
        keys: Object.keys(stream as any || {}),
        dataKeys: data ? Object.keys(data) : undefined,
      });
      try {
        await writeResponse(stream, encoder, { ok: false, error: "no_iterator" }, "no-iterator");
      } catch {}
      return;
    }

    for await (const chunk of iterable) {
      try {
        const buf =
          chunk instanceof Uint8Array
            ? chunk
            : typeof (chunk as any)?.subarray === "function"
            ? (chunk as any).subarray()
            : null;
        if (!buf) {
          log("Rendezvous handler received non-buffer chunk", {
            type: typeof chunk,
            ctor: (chunk as any)?.constructor?.name,
            value: chunk,
          });
          await stream.sink([encoder.encode(JSON.stringify({ ok: false, error: "invalid_chunk" }))]);
          continue;
        }
        const msg = JSON.parse(decoder.decode(buf));
        const remotePeer =
          connection?.remotePeer?.toString?.() ||
          extractPeerIdFromAddrs(msg?.addrs) ||
          "unknown";
        const remoteAddr = connection?.remoteAddr?.toString?.();
        log("Rendezvous chunk received", {
          length: buf.length,
          base64: Buffer.from(buf).toString("base64"),
          peer: remotePeer,
          remoteAddr,
        });
        log("Rendezvous decoded message", { msg });
        const topic: string = msg.topic || "default";
        if (msg.action === "register") {
          const addrs: string[] = Array.isArray(msg.addrs) ? msg.addrs : [];
          if (remoteAddr) {
            addrs.push(remoteAddr);
          }
          const record: RendezvousRecord = {
            peer: remotePeer,
            addrs: dedupeStrings(addrs),
            lastSeen: Date.now(),
          };
          touch(topic, record);
          log("Rendezvous register", { topic, peer: record.peer, addrs: record.addrs });
          await writeResponse(stream, encoder, { ok: true, peer: record.peer }, "register-ok");
        } else if (msg.action === "list") {
          const bucket = topics.get(topic);
          const peers = bucket ? Array.from(bucket.values()) : [];
          log("Rendezvous list", { topic, count: peers.length });
          await writeResponse(stream, encoder, { ok: true, peers }, "list-ok");
        } else {
          await writeResponse(stream, encoder, { ok: false, error: "unknown_action" }, "unknown-action");
        }
      } catch (err: any) {
        log("Rendezvous handler error", {
          error: err?.message || err,
          stack: err?.stack,
        });
        try {
          await writeResponse(stream, encoder, { ok: false, error: "handler_error" }, "handler-error");
        } catch {}
      }
    }

    log("Rendezvous handler completed for stream", {
      stream: describeStream(stream),
      connection: connection ? formatConnection(connection) : undefined,
    });
  });

  return () => {
    try {
      node.unhandle?.(TOPIC_PREFIX);
    } catch {}
    topics.clear();
  };
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
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

async function writeResponse(stream: any, encoder: TextEncoder, payload: any, label: string) {
  const data = encoder.encode(JSON.stringify(payload));
  const sinkTarget =
    stream && typeof stream.sink === "function"
      ? stream
      : stream?.stream && typeof stream.stream.sink === "function"
      ? stream.stream
      : undefined;
  if (sinkTarget) {
    log(`Rendezvous response via sink (${label})`, { stream: describeStream(stream), bytes: data.byteLength });
    await sinkTarget.sink([data]);
    return;
  }
  const writeTarget =
    stream && typeof stream.write === "function"
      ? stream
      : stream?.stream && typeof stream.stream.write === "function"
      ? stream.stream
      : undefined;
  if (writeTarget) {
    log(`Rendezvous response via write (${label})`, { stream: describeStream(stream), bytes: data.byteLength });
    await writeTarget.write(data);
    if (typeof writeTarget.closeWrite === "function") {
      await writeTarget.closeWrite();
    } else if (typeof writeTarget.close === "function") {
      await writeTarget.close();
    }
    return;
  }
  const sendTarget =
    stream && typeof stream.send === "function"
      ? stream
      : stream?.stream && typeof stream.stream.send === "function"
      ? stream.stream
      : undefined;
  if (sendTarget) {
    log(`Rendezvous response via send (${label})`, { stream: describeStream(stream), bytes: data.byteLength });
    sendTarget.send(data);
    if (typeof sendTarget.closeWrite === "function") {
      await sendTarget.closeWrite();
    } else if (typeof sendTarget.close === "function") {
      await sendTarget.close();
    }
    return;
  }
  log("Rendezvous response failed: stream not writable", { stream: describeStream(stream), label });
}

function extractPeerIdFromAddrs(addrs?: string[]) {
  if (!addrs) return undefined;
  for (const a of addrs) {
    try {
      const ma = multiaddr(a);
      if (typeof (ma as any).getPeerId === "function") {
        const pid = (ma as any).getPeerId();
        if (pid) return pid;
      }
      const parts = ma.toString().split("/p2p/");
      if (parts.length > 1 && parts[parts.length - 1]) {
        return parts[parts.length - 1];
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

async function loadWebRTCTransport() {
  try {
    const mod = await import("@libp2p/webrtc");
    if (typeof mod.webRTC === "function") {
      log("WebRTC transport enabled");
      return withLogger(mod.webRTC());
    }
    log("WebRTC transport module missing webRTC export");
  } catch (err: any) {
    log("WebRTC transport not enabled", { error: err?.message || err });
  }
  return undefined;
}
