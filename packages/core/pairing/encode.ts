import { payloadToBase64 } from "../qr";
import type { PairingPayload } from "./types";

export function encodePairing(payload: Omit<PairingPayload, "timestamp" | "version">): string {
  const full: PairingPayload = {
    ...payload,
    timestamp: Math.floor(Date.now() / 1000),
    version: "1",
  };
  return payloadToBase64(full);
}
