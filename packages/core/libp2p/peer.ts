/**
 * Peer creation logic for libp2p engine.
 */
import { createLibp2p, Libp2p } from "libp2p";
import { createTransportConfig } from "./transport";

export async function createPeer(peerId?: any): Promise<Libp2p<any>> {
  // If peerId is not provided, libp2p will generate one
  const config = await createTransportConfig(peerId);
  return await createLibp2p(config);
}
