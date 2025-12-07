/**
 * libp2p node initialization/config for clipboard network.
 */
import { createLibp2p } from "libp2p";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { webSockets } from "@libp2p/websockets";
import { webRTCStar } from "@libp2p/webrtc-star";
import { multiaddr } from "@multiformats/multiaddr";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
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
  options: { peerId?: any; bootstrapList?: string[]; relayAddresses?: string[] } = {}
) {
  const {
    peerId,
    bootstrapList = [],
    relayAddresses = DEFAULT_WEBRTC_STAR_RELAYS,
  } = options;
  const discovery: any[] = [];
  const transports: any[] = [
    withTransportFilters(webSockets()),
    withTransportFilters(circuitRelayTransport()),
  ];
  const listenAddrs: any[] = [];

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

  if (hasWebRTCSupport()) {
    const wrtcStar = webRTCStar() as any;
    transports.unshift(withTransportFilters(wrtcStar.transport as any));
    discovery.push(wrtcStar.discovery);
    listenAddrs.push(...relayMultiaddrs);
  }

  if (bootstrapList.length > 0) {
    discovery.push(bootstrap({ list: bootstrapList }));
  }
  // mdns relies on Node's dgram module which is not available in browser
  // environments like the extension background service worker.
  if (typeof navigator === "undefined") {
    discovery.push(mdns());
  }

  return await createLibp2p({
    ...(peerId ? { peerId } : {}),
    addresses: {
      listen: listenAddrs,
    },
    transports,
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    connectionEncrypters: [noise()],
    // Type cast required to satisfy older StreamMuxerFactory shape in libp2p typings
    streamMuxers: [yamux() as any],
    peerDiscovery: discovery.map((d) => d as any),
    services: {
      pubsub: gossipsub(),
      dht: kadDHT() as any,
      identify: identify(),
      ping: ping(),
    },
  });
}
