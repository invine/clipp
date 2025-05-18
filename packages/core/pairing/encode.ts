/**
 * Encode device info into a QR-compatible string and generate QR code image.
 */
import { PairingPayload } from "./types";
import * as QRCode from "qrcode";

// Use base64 for compact encoding
export function encodePairingPayload(payload: PairingPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf-8").toString("base64");
}

export async function generateQRCode(payload: PairingPayload): Promise<string> {
  const encoded = encodePairingPayload(payload);
  // Returns a base64 PNG data URL
  return await QRCode.toDataURL(encoded, { errorCorrectionLevel: "M" });
}
