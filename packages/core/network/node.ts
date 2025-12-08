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
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { kadDHT } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "./constants.js";
import { FaultTolerance } from "@libp2p/interface-transport";

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

export async function createClipboardNode(
  options: { peerId?: any; privateKey?: any; bootstrapList?: string[]; relayAddresses?: string[] } = {}
) {
  const {
    peerId,
    privateKey,
    bootstrapList = [],
    relayAddresses = DEFAULT_WEBRTC_STAR_RELAYS,
  } = options;
  const discovery: any[] = [];
  const transports: any[] = [
    withTransportFilters(webSockets()),
    withTransportFilters(circuitRelayTransport()),
  ];
  const listenAddrs: any[] = [multiaddr("/ip4/0.0.0.0/tcp/0/ws")];

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
    typeof process !== "undefined" &&
    process?.env?.CLIPP_ENABLE_WEBRTC_STAR &&
    ["1", "true", "yes", "on"].includes(process.env.CLIPP_ENABLE_WEBRTC_STAR.toLowerCase());

  if (hasWebRTCSupport()) {
    try {
      const [{ webRTC }, { webRTCStar }] = await Promise.all([
        import("@libp2p/webrtc"),
        import("@libp2p/webrtc-star"),
      ]);
      const wrtcStarInstance =
        typeof (webRTCStar as any).webRTCStar === "function"
          ? (webRTCStar as any).webRTCStar()
          : typeof (webRTCStar as any).default === "function"
          ? (webRTCStar as any).default()
          : typeof webRTCStar === "function"
          ? (webRTCStar as any)()
          : null;
      const wrtcTransportFactory =
        typeof (webRTC as any).webRTC === "function"
          ? (webRTC as any).webRTC
          : typeof webRTC === "function"
          ? (webRTC as any)
          : typeof (webRTC as any).default === "function"
          ? (webRTC as any).default
          : null;

      const starFactory =
        wrtcStarInstance && typeof wrtcStarInstance.transport === "function"
          ? wrtcStarInstance.transport
          : null;
      if (enableWebRTCStar && starFactory) {
        const starTransport = starFactory as any;
        starTransport.filter = (addrs: any[]) => {
          const list = Array.isArray(addrs) ? addrs : [];
          const filtered = list.filter((ma: any) => {
            try {
              const m = typeof ma === "string" ? multiaddr(ma) : ma;
              return typeof m?.protoCodes === "function" || typeof m?.protoNames === "function";
            } catch (err) {
              console.warn("[wrtc-star] filter proto check failed", { addr: String(ma), error: (err as any)?.message });
              return false;
            }
          });
          if (filtered.length !== list.length) {
            console.warn("[wrtc-star] filtered out invalid addrs", {
              provided: list.map((a: any) => String(a)),
              kept: filtered.map((a: any) => String(a)),
            });
          }
          return filtered;
        };
        transports.unshift(withTransportFilters(starTransport));
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
        } else {
          console.warn("WebRTC transport factory invalid; skipping");
        }
      } else {
        console.warn("WebRTC transport missing; skipping");
      }
    } catch (err) {
      console.warn("WebRTC transports unavailable; continuing without", err);
    }
  }

  // Announce reachable addresses so getMultiaddrs() returns something useful for rendezvous.
  const announce: any[] = [];
  const peerIdStr =
    typeof (peerId as any)?.toString === "function"
      ? (peerId as any).toString()
      : peerId && typeof peerId === "string"
      ? peerId
      : undefined;
  if (peerIdStr) {
    relayAddresses.forEach((addr) => {
      try {
        announce.push(multiaddr(`${addr}/p2p-circuit/p2p/${peerIdStr}`));
      } catch (err) {
        console.warn("Invalid announce relay addr skipped", addr, err);
      }
    });
  }
  // Listen on the relay circuit address to trigger a reservation.
  relayAddresses.forEach((addr) => {
    try {
      listenAddrs.push(multiaddr(`${addr}/p2p-circuit`));
    } catch (err) {
      console.warn("Invalid relay circuit listen addr skipped", addr, err);
    }
  });

  if (bootstrapList.length > 0) {
    discovery.push(bootstrap({ list: bootstrapList }));
  }
  // mdns relies on Node's dgram module which is not available in browser
  // environments like the extension background service worker.
  if (typeof navigator === "undefined") {
    discovery.push(mdns());
  }

  return await createLibp2p({
    ...(privateKey ? { privateKey } : peerId ? { peerId } : {}),
    addresses: {
      listen: listenAddrs,
      announce,
    },
    transports,
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    connectionEncrypters: [noise()],
    // Include both yamux and mplex to maximize compatibility (relays often use mplex).
    streamMuxers: [yamux() as any, mplex()],
    peerDiscovery: discovery.map((d) => d as any),
    services: {
      pubsub: gossipsub(),
      dht: kadDHT() as any,
      identify: identify(),
      ping: ping(),
    },
  });
}
