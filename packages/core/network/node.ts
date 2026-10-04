/**
 * libp2p node initialization/config for clipboard network.
 */
import { createLibp2p } from "libp2p";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { webSockets } from "@libp2p/websockets";
import { multiaddr } from "@multiformats/multiaddr";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { mplex } from "@libp2p/mplex";
import { bootstrap } from "@libp2p/bootstrap";
import { mdns } from "@libp2p/mdns";
// TODO: remove gossipsub
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
// TODO: remove kadDHT
import { kadDHT } from "@libp2p/kad-dht";
import { identify, identifyPush } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { DEFAULT_CIRCUIT_RELAY_ADDRESSES } from "./constants.js";
import { FaultTolerance } from "@libp2p/interface";
import { patchGlobalMultiaddrCompat } from "./multiaddrCompat.js";

patchGlobalMultiaddrCompat();

function hasWebRTCSupport() {
  return (
    typeof (globalThis as any).RTCPeerConnection !== "undefined" ||
    typeof (globalThis as any).webkitRTCPeerConnection !== "undefined"
  );
}

function withTransportFilters(factory: any) {
  // Wrap transport factory to ensure listenFilter/dialFilter exist on the instance
  return (components: any) => {
    const transport = factory(components);
    if (transport) {
      const filterFn =
        typeof transport.filter === "function"
          ? transport.filter.bind(transport)
          : (addrs: any) => addrs;
      if (typeof transport.listenFilter !== "function") {
        transport.listenFilter = filterFn;
      }
      if (typeof transport.dialFilter !== "function") {
        transport.dialFilter = filterFn;
      }
    }
    return transport;
  };
}

function isBrowserDocumentRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export async function createClipboardNode(
  options: {
    peerId?: any;
    privateKey?: any;
    bootstrapList?: string[];
    relayAddresses?: string[];
    enableWebRTCDirect?: boolean;
    enableDCUtR?: boolean;
    onDCUtRAttempt?: (peerId: string) => void;
    dcutrTimeoutMs?: number;
    dcutrRetries?: number;
    enableTcp?: boolean;
    enableWebSocketListener?: boolean;
    enableRelayReservations?: boolean;
    allowInsecureBrowserDials?: boolean;
  } = {}
) {
  const {
    peerId,
    privateKey,
    bootstrapList = [],
    relayAddresses = DEFAULT_CIRCUIT_RELAY_ADDRESSES,
    allowInsecureBrowserDials = false,
  } = options;
  const circuitRelayAddresses = relayAddresses.filter(
    (address) => !address.includes("/p2p-webrtc-star")
  );
  const enableWebRTCDirect = options.enableWebRTCDirect !== false;
  const isBrowserDocument = isBrowserDocumentRuntime();
  const enableTcp = options.enableTcp === true && !isBrowserDocument;
  const enableRelayReservations =
    options.enableRelayReservations ?? !isBrowserDocument;
  const discovery: any[] = [];
  const transports: any[] = [
    withTransportFilters(webSockets()),
    withTransportFilters(circuitRelayTransport()),
  ];
  const listenAddrs: any[] =
    isBrowserDocument || options.enableWebSocketListener === false
      ? []
      : [multiaddr("/ip4/0.0.0.0/tcp/0/ws")];

  if (enableTcp) {
    try {
      const { tcp } = await import("@libp2p/tcp");
      if (typeof tcp === "function") {
        transports.unshift(withTransportFilters(tcp()));
        listenAddrs.push(multiaddr("/ip4/0.0.0.0/tcp/0"));
      } else {
        console.warn("TCP transport missing or invalid; skipping");
      }
    } catch (err) {
      console.warn("TCP transport unavailable; continuing without", err);
    }
  }

  if (enableWebRTCDirect || hasWebRTCSupport()) {
    try {
      const { webRTC, webRTCDirect } = await import("@libp2p/webrtc");
      const wrtcDirectTransportFactory =
        typeof (webRTCDirect as any).webRTCDirect === "function"
          ? (webRTCDirect as any).webRTCDirect
          : typeof webRTCDirect === "function"
            ? (webRTCDirect as any)
            : typeof (webRTCDirect as any).default === "function"
              ? (webRTCDirect as any).default
              : null;
      const wrtcTransportFactory =
        typeof (webRTC as any).webRTC === "function"
          ? (webRTC as any).webRTC
          : typeof webRTC === "function"
            ? (webRTC as any)
            : typeof (webRTC as any).default === "function"
              ? (webRTC as any).default
              : null;

      if (
        enableWebRTCDirect &&
        typeof wrtcDirectTransportFactory === "function"
      ) {
        transports.unshift(
          withTransportFilters((wrtcDirectTransportFactory as any)())
        );
        if (!isBrowserDocument) {
          listenAddrs.push(multiaddr("/ip4/0.0.0.0/udp/0/webrtc-direct"));
        }
      } else if (enableWebRTCDirect) {
        console.warn("WebRTC Direct transport missing or invalid; skipping");
      }

      // The Node transport supplies its own RTCPeerConnection through
      // node-datachannel; Electron main has no browser WebRTC global.
      if (hasWebRTCSupport() || (!isBrowserDocument && enableWebRTCDirect)) {
        if (typeof wrtcTransportFactory === "function") {
          const factory = (wrtcTransportFactory as any)();
          if (factory) {
            (factory as any).filter = (addrs: any[]) => {
              const list = Array.isArray(addrs) ? addrs : [];
              const filtered = list.filter((ma: any) => {
                try {
                  const m = typeof ma === "string" ? multiaddr(ma) : ma;
                  return (
                    typeof m?.protoCodes === "function" ||
                    typeof m?.protoNames === "function"
                  );
                } catch (err) {
                  console.warn("[wrtc] filter proto check failed", {
                    addr: String(ma),
                    error: (err as any)?.message,
                  });
                  return false;
                }
              });
              if (filtered.length !== list.length) {
                console.warn("[wrtc] filtered out invalid addrs", {
                  provided: list.map((a: any) => String(a)),
                  kept: filtered.map((a: any) => String(a)),
                });
              }
              return filtered;
            };
            transports.unshift(withTransportFilters(factory));
            listenAddrs.push(multiaddr("/webrtc"));
          } else {
            console.warn("WebRTC transport factory invalid; skipping");
          }
        } else {
          console.warn("WebRTC transport missing; skipping");
        }
      }
    } catch (err) {
      console.warn("WebRTC transports unavailable; continuing without", err);
    }
  }

  // Listen on the relay circuit address to trigger a reservation.
  if (enableRelayReservations) {
    circuitRelayAddresses.forEach((addr) => {
      try {
        listenAddrs.push(multiaddr(`${addr}/p2p-circuit`));
      } catch (err) {
        console.warn("Invalid relay circuit listen addr skipped", addr, err);
      }
    });
  }

  if (bootstrapList.length > 0) {
    discovery.push(bootstrap({ list: bootstrapList }));
  }
  // mdns relies on Node's dgram module which is not available in browser
  // environments like the extension background service worker.
  if (!isBrowserDocument) {
    discovery.push(mdns());
  }

  const services: Record<string, any> = {
    pubsub: gossipsub() as any,
    dht: kadDHT() as any,
    identify: identify(),
    identifyPush: identifyPush(),
    ping: ping(),
  };

  if (options.enableDCUtR === true) {
    try {
      const { dcutr } = await import("@libp2p/dcutr");
      if (typeof dcutr === "function") {
        const createDCUtRService = dcutr({
          ...(options.dcutrTimeoutMs !== undefined
            ? { timeout: options.dcutrTimeoutMs }
            : {}),
          ...(options.dcutrRetries !== undefined
            ? { retries: options.dcutrRetries }
            : {}),
        });
        services.dcutr = (components: any) => {
          const service: any = createDCUtRService(components);
          for (const method of ["upgradeInbound", "upgradeOutbound"] as const) {
            const original = service?.[method]?.bind(service);
            if (!original) continue;
            service[method] = async (connection: any) => {
              options.onDCUtRAttempt?.(
                connection?.remotePeer?.toString?.() ?? ""
              );
              return original(connection);
            };
          }
          return service;
        };
      } else {
        console.warn("DCUtR service missing or invalid; skipping");
      }
    } catch (err) {
      console.warn("DCUtR service unavailable; continuing without", err);
    }
  }

  return await createLibp2p({
    ...(privateKey ? { privateKey } : peerId ? { peerId } : {}),
    start: false,
    addresses: {
      listen: listenAddrs,
    },
    transports,
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    ...(allowInsecureBrowserDials
      ? {
          connectionGater: {
            denyDialMultiaddr: () => false,
          },
        }
      : {}),
    connectionEncrypters: [noise()],
    // Include both yamux and mplex to maximize compatibility (relays often use mplex).
    streamMuxers: [yamux() as any, mplex()],
    peerDiscovery: discovery.map((d) => d as any),
    services,
  });
}
