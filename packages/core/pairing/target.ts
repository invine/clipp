import type { MessagingTransport } from "../messaging/transport";
import { decodePairingTarget, type PairingTarget } from "./v2";

export async function importPairingTargetAndRequest(options: {
  text: string;
  network: MessagingTransport;
  request(targetPeerId: string): Promise<Uint8Array>;
}): Promise<PairingTarget> {
  const target = decodePairingTarget(options.text);
  if (!target) throw new Error("invalid_pairing_target");
  if (!options.network.importSignedPeerRecord)
    throw new Error("signed_peer_record_unavailable");
  await options.network.importSignedPeerRecord(
    target.targetPeerId,
    target.signedPeerRecord
  );
  // The payload record is preferred, but a stale target may be refreshed only
  // through this exact Peer ID lookup.  It never enumerates other devices.
  // The embedded record has already passed signature and subject verification.
  // An unavailable lookup or older relay registration must not prevent dialing
  // with the verified reachability retained by the peer store.
  await options.network
    .refreshPeerRecord?.(target.targetPeerId)
    .catch((error) => {
      if (error instanceof Error && error.message === "revoked_peer")
        throw error;
    });
  await options.network.connect(target.targetPeerId);
  await options.request(target.targetPeerId);
  return target;
}
