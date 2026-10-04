import { peerIdFromString } from "@libp2p/peer-id";
import { createPairingTrustRequestVerifier } from "../../../packages/core/pairing/protocol";

// MV3 service workers cannot execute import(). Link the key loader statically.
export const verifyExtensionPairingTrustRequestSignature =
  createPairingTrustRequestVerifier(
    (peerId) => peerIdFromString(peerId).publicKey
  );
