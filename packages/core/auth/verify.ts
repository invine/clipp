/**
 * Public key verification and trust logic.
 */
import { TrustedDevice } from "./types";

/**
 * Verify that the provided public key matches the trusted device's key.
 */
export function verifyPublicKey(
  device: TrustedDevice,
  pubkey: string
): boolean {
  return device.publicKey === pubkey;
}
