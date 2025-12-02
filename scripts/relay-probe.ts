/**
 * Minimal CLI to validate a relay:
 * - makes a reservation on the relay
 * - prints announced circuit multiaddrs
 * - optionally pings a target peer through the relay
 *
 * Usage:
 *   RELAY_ADDR=/dns4/relay.example.com/tcp/47891/ws npx tsx scripts/relay-probe.ts
 *   RELAY_ADDR=/ip4/127.0.0.1/tcp/47891/ws TARGET_PEER=12D3... npx tsx scripts/relay-probe.ts
 */
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { defaultLogger } from "@libp2p/logger";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { webSockets } from "@libp2p/websockets";
import * as websocketFilters from "@libp2p/websockets/filters";
import { FaultTolerance } from "@libp2p/interface-transport";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";

function env(name: string): string | undefined {
  const val = process.env[name];
  return val && val.trim().length > 0 ? val.trim() : undefined;
}

const relayAddr = env("RELAY_ADDR");

if (!relayAddr) {
  console.error("RELAY_ADDR is required, e.g. /dns4/localhost/tcp/47891/ws/p2p/<relay-id>");
  process.exit(1);
}

const targetPeer = env("TARGET_PEER");

async function main() {
  const circuitAddr = toCircuitAddr(relayAddr);

  const node = await createLibp2p({
    addresses: {
      listen: [circuitAddr],
    },
    logger: defaultLogger(),
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    // Explicitly keep metrics off to minimize dependencies in probe environment.
    metrics: undefined,
    transports: [
      withLogger(webSockets({ filter: websocketFilters.all })),
      withLogger(circuitRelayTransport()),
    ],
    services: {
      identify: identify(),
      ping: ping(),
    },
  });

  await node.start();

  // Try opening a direct connection to the relay (baseline transport check).
  try {
    const baseRelay = typeof relayAddr === "string" ? multiaddr(relayAddr) : relayAddr;
    console.info("[probe] dialing relay transport", baseRelay.toString());
    await node.dial(baseRelay);
    console.info("[probe] dial succeeded");
  } catch (err: any) {
    console.error("[probe] dial to relay failed", err?.message || err);
  }

  console.info("[probe] local peer", node.peerId.toString());
  console.info("[probe] relay circuit listen:", circuitAddr.toString());

  // Wait a beat for reservation/listen to settle
  await delay(1500);

  const announced = node.getMultiaddrs().map(String);
  console.info("[probe] announced multiaddrs:", announced);

  const reservationAddrs = announced.filter((a) => a.includes("/p2p-circuit/"));
  if (reservationAddrs.length === 0) {
    console.warn("[probe] no circuit addresses announced; reservation may have failed");
  }

  const conns = node.getConnections();
  console.info("[probe] active connections:", conns.map((c) => ({ peer: c.remotePeer.toString(), addr: c.remoteAddr?.toString() })));

  if (targetPeer) {
    try {
      console.info("[probe] pinging target via relay", targetPeer);
      const result = await node.services.ping?.ping?.(targetPeer as any);
      console.info("[probe] ping success", { rttMs: result?.toFixed ? Number(result.toFixed(2)) : result });
    } catch (err: any) {
      console.error("[probe] ping failed", err?.message || err);
    }
  }

  console.info("[probe] keep running to maintain reservation; press Ctrl+C to exit");
}

function toCircuitAddr(base: string | Multiaddr): Multiaddr {
  const ma = typeof base === "string" ? multiaddr(base) : base;
  return ma.encapsulate("/p2p-circuit");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[probe] fatal error", err);
  process.exit(1);
});

function withLogger<T>(factory: any) {
  return (components: any) => {
    components.logger = components.logger || defaultLogger();
    return factory(components) as T;
  };
}
