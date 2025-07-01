/**
 * libp2p node initialization/config for clipboard network.
 */
import { createLibp2p } from "libp2p";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { bootstrap } from "@libp2p/bootstrap";
import { mdns } from "@libp2p/mdns";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { kadDHT } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";

export async function createClipboardNode(
  options: { peerId?: any; bootstrapList?: string[] } = {}
) {
  const { peerId, bootstrapList = [] } = options;
  const discovery: any[] = [];
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
    transports: [webRTC(), webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    peerDiscovery: discovery,
    services: {
      pubsub: gossipsub(),
      dht: kadDHT() as any,
      identify: identify(),
      ping: ping(),
    },
  });
}
