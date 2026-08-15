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
  await options.network.connect(target.targetPeerId);
  await options.request(target.targetPeerId);
  return target;
}
