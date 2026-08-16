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
import { FaultTolerance } from "@libp2p/interface-transport";
import { ensureLegacyMultiaddrApi, patchGlobalMultiaddrCompat } from "./multiaddrCompat.js";

patchGlobalMultiaddrCompat();

// TODO: remove webrtc-star
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

function withPatchedFilter(
  factory: any,
  filter: (addr: any) => boolean
) {
  return withTransportFilters((components: any) => {
    const transport = factory(components);
    if (transport) {
      transport.filter = (addrs: any[]) => {
        const list = Array.isArray(addrs) ? addrs : [addrs];
        return list
          .map((addr) => ensureLegacyMultiaddrApi(addr))
          .filter((addr) => {
            try {
              return filter(addr);
            } catch {
              return false;
            }
          });
      };
    }
    return transport;
  });
}

function multiaddrProtocolNames(addr: any): string[] {
  if (typeof addr?.getComponents === "function") {
    return addr.getComponents().map((c: any) => c?.name).filter(Boolean);
  }
  if (typeof addr?.protoNames === "function") {
    return addr.protoNames();
  }
  return String(addr)
    .split("/")
    .filter((part, index) => index > 0 && index % 2 === 1);
}

function isBrowserDocumentRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isCircuitRelayAddress(addr: string): boolean {
  return !addr.includes("/p2p-webrtc-star");
}

export async function createClipboardNode(
  options: {
    peerId?: any;
    privateKey?: any;
    bootstrapList?: string[];
    relayAddresses?: string[];
    enableWebRTCStar?: boolean;
    enableWebRTCDirect?: boolean;
    enableDCUtR?: boolean;
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
  const enableWebRTCDirect = options.enableWebRTCDirect !== false;
  const isBrowserDocument = isBrowserDocumentRuntime();
  const enableTcp = options.enableTcp === true && !isBrowserDocument;
  const enableRelayReservations = options.enableRelayReservations ?? !isBrowserDocument;
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

  const relayMultiaddrs = relayAddresses
    .map((a) => {
      try {
        return multiaddr(a);
      } catch (err) {
        console.warn("Invalid relay multiaddr skipped", a, err);
        return null;
      }
    })
    .filter(Boolean) as any[];

  const enableWebRTCStar =
    typeof options.enableWebRTCStar === "boolean"
      ? options.enableWebRTCStar
      : typeof process !== "undefined" &&
        process?.env?.CLIPP_ENABLE_WEBRTC_STAR &&
        ["1", "true", "yes", "on"].includes(process.env.CLIPP_ENABLE_WEBRTC_STAR.toLowerCase());

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

      if (enableWebRTCDirect && typeof wrtcDirectTransportFactory === "function") {
        transports.unshift(withTransportFilters((wrtcDirectTransportFactory as any)()));
        if (!isBrowserDocument) {
          listenAddrs.push(multiaddr("/ip4/0.0.0.0/udp/0/webrtc-direct"));
        }
      } else if (enableWebRTCDirect) {
        console.warn("WebRTC Direct transport missing or invalid; skipping");
      }

      if (hasWebRTCSupport()) {
        let wrtcStarInstance: any = null;
        if (enableWebRTCStar) {
          const { webRTCStar } = await import("@libp2p/webrtc-star");
          wrtcStarInstance =
            typeof (webRTCStar as any).webRTCStar === "function"
              ? (webRTCStar as any).webRTCStar()
              : typeof (webRTCStar as any).default === "function"
                ? (webRTCStar as any).default()
                : typeof webRTCStar === "function"
                  ? (webRTCStar as any)()
                  : null;
        }

        const starFactory =
          wrtcStarInstance && typeof wrtcStarInstance.transport === "function"
            ? wrtcStarInstance.transport
            : null;
        if (enableWebRTCStar && starFactory) {
          transports.unshift(
            withPatchedFilter(starFactory, (addr) => {
              const protocols = multiaddrProtocolNames(addr);
              return protocols.includes("p2p-webrtc-star") && !protocols.includes("p2p-circuit");
            })
          );
          if (wrtcStarInstance.discovery) {
            discovery.push(wrtcStarInstance.discovery);
          }
          listenAddrs.push(...relayMultiaddrs);
        } else if (enableWebRTCStar) {
          console.warn("WebRTC-star transport missing or invalid; skipping");
        }

        if (typeof wrtcTransportFactory === "function") {
          const factory = (wrtcTransportFactory as any)();
          if (factory) {
            (factory as any).filter = (addrs: any[]) => {
              const list = Array.isArray(addrs) ? addrs : [];
              const filtered = list.filter((ma: any) => {
                try {
                  const m = typeof ma === "string" ? multiaddr(ma) : ma;
                  return typeof m?.protoCodes === "function" || typeof m?.protoNames === "function";
                } catch (err) {
                  console.warn("[wrtc] filter proto check failed", { addr: String(ma), error: (err as any)?.message });
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
    relayAddresses.filter(isCircuitRelayAddress).forEach((addr) => {
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
        services.dcutr = dcutr();
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
