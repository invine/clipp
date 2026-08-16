import type { MessagingTransport } from "../messaging/transport";
import { decodePairingTarget, type PairingTarget } from "./v2";

export async function importPairingTargetAndRequest(options: {
  text: string;
  network: MessagingTransport;
  request(targetPeerId: string): Promise<Uint8Array>;
}): Promise<PairingTarget> {
  const target = decodePairingTarget(options.text);
  if (!target) throw new Error("invalid_pairing_target");
  if (!options.network.importSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
  await options.network.importSignedPeerRecord(target.targetPeerId, target.signedPeerRecord);
  // The payload record is preferred, but a stale target may be refreshed only
  // through this exact Peer ID lookup.  It never enumerates other devices.
  await options.network.lookupPeer?.(target.targetPeerId);
  await options.network.connect(target.targetPeerId);
  await options.request(target.targetPeerId);
  return target;
}
