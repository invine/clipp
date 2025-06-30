/**
 * libp2p node initialization/config for clipboard network.
 */
import { createLibp2p } from "libp2p";
import { webRTC } from "@libp2p/webrtc";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { bootstrap } from "@libp2p/bootstrap";
import { mdns } from "@libp2p/mdns";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { kadDHT } from "@libp2p/kad-dht";

export async function createClipboardNode(
  options: { peerId?: any; bootstrapList?: string[] } = {}
) {
  const { peerId, bootstrapList = [] } = options;
  const discovery: any[] = [];
  if (bootstrapList.length > 0) {
    discovery.push(bootstrap({ list: bootstrapList }));
  }
  discovery.push(mdns());

  return await createLibp2p({
    ...(peerId ? { peerId } : {}),
    transports: [webRTC(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    peerDiscovery: discovery,
    services: {
      pubsub: gossipsub(),
      dht: kadDHT() as any,
    },
  });
}
