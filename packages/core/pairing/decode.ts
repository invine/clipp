/**
 * Decode and validate device pairing QR payload.
 */
import { PairingPayload } from "./types";

export function decodePairingPayload(encoded: string): PairingPayload {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch (e) {
    throw new Error("Invalid QR payload: " + (e as Error).message);
  }
}

export function validatePayload(payload: any): payload is PairingPayload {
  return (
    typeof payload === "object" &&
    typeof payload.id === "string" &&
    typeof payload.name === "string" &&
    typeof payload.publicKey === "string" &&
    typeof payload.createdAt === "number" &&
    typeof payload.version === "string"
  );
}
