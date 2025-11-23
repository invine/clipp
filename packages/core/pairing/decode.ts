import { base64ToPayload } from "../qr";
import { PairingPayload, PAIRING_MAX_SKEW_SECONDS, PAIRING_VERSION } from "./types";

export function decodePairing(raw: string): PairingPayload | null {
  const payload = base64ToPayload(raw);
  if (!payload) return null;
  if (payload.version !== PAIRING_VERSION) return null;
  if (!Array.isArray(payload.multiaddrs) || payload.multiaddrs.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - payload.timestamp) > PAIRING_MAX_SKEW_SECONDS) return null;
  return payload as PairingPayload;
}
