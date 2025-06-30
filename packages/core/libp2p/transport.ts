/**
 * libp2p transport and configuration setup for browser/mobile compatibility.
 */
import { webRTCStar } from "@libp2p/webrtc-star";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { mplex } from "@libp2p/mplex";
import { noise } from "@chainsafe/libp2p-noise";
import { mdns } from "@libp2p/mdns";
import { identify } from "@libp2p/identify";

export async function createTransportConfig(
  peerId: any
): Promise<any> {
  const wrtcStar = webRTCStar();
  const transports = [wrtcStar.transport, webRTC(), circuitRelayTransport()];
  return {
    peerId,
    transports,
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    peerDiscovery: [mdns(), wrtcStar.discovery],
    services: {
      identify: identify(),
    },
  };
}
