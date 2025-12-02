import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { circuitRelayServer, type CircuitRelayService } from "@libp2p/circuit-relay-v2";
import { enable as enableLibp2pDebug } from "@libp2p/logger";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { webSockets } from "@libp2p/websockets";
import * as websocketFilters from "@libp2p/websockets/filters";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { createLibp2p, type Libp2p } from "libp2p";
import type { Connection } from "@libp2p/interface";
import { peerIdFromMultihash } from "@libp2p/peer-id";
import * as Digest from "multiformats/hashes/digest";
import { defaultLogger } from "@libp2p/logger";
import { FaultTolerance } from "@libp2p/interface-transport";

type RelayServices = { circuitRelay: CircuitRelayService };
type RelayNode = Libp2p<RelayServices>;

export interface WebsocketRelayOptions {
  listen?: Array<string | Multiaddr>;
  host?: string;
  port?: number;
  announce?: Array<string | Multiaddr>;
  statusIntervalMs?: number;
  maxReservations?: number;
  reservationTtlMs?: number;
  debugNamespaces?: string;
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

  const node = await createLibp2p<RelayServices>({
    logger: defaultLogger(),
    addresses: {
      listen: listenAddrs,
      announce: announceAddrs,
      announceFilter: (addrs) => addrs,
    },
    transports: [withLogger(webSockets({ filter: websocketFilters.all }))],
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

  const removeNodeListeners = instrumentNode(node);
  const removeRelayInstrumentation = instrumentRelayService(node.services.circuitRelay, statusIntervalMs);

  const info = {
    peerId: node.peerId.toString(),
    listen: node.getMultiaddrs().map(String),
    announce: announceAddrs.map(String),
  };
  log("Websocket relay started", info);

  return {
    node,
    stop: async () => {
      removeRelayInstrumentation?.();
      removeNodeListeners?.();
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

function withLogger<T>(factory: any) {
  return (components: any) => {
    components.logger = components.logger || defaultLogger();
    return factory(components) as T;
  };
}
