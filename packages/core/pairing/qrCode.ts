import QRCode, { type QRCodeSegment } from "qrcode";
import { decodePairingTarget, PAIRING_TARGET_PREFIX } from "./v2";
import { encodePairingQrPayload } from "./qrTransport";

export type PairingCode = {
  image: string | null;
  text: string;
};

/** Preserve the complete Pairing Target when its signed record outgrows one QR. */
export async function createPairingCode(text: string): Promise<PairingCode> {
  const candidates: Array<string | QRCodeSegment[]> = [text];
  if (text.startsWith(PAIRING_TARGET_PREFIX) && decodePairingTarget(text)) {
    // Base64URL's many short digit/uppercase runs make qrcode's automatic
    // mixed-mode optimizer expensive. Base45 already supplies the compact QR
    // representation; keep the legacy text candidate in a single byte segment.
    candidates[0] = [{ data: new TextEncoder().encode(text), mode: "byte" }];
    const payload = Uint8Array.from(
      Buffer.from(
        text
          .slice(PAIRING_TARGET_PREFIX.length)
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
        "base64"
      )
    );
    candidates.push([
      { data: encodePairingQrPayload(payload), mode: "alphanumeric" },
    ]);
  }
  for (const errorCorrectionLevel of ["M", "L"] as const) {
    let best: { data: string | QRCodeSegment[]; version: number } | undefined;
    for (const data of candidates) {
      try {
        const qr = QRCode.create(data, { errorCorrectionLevel });
        if (!best || qr.version < best.version)
          best = { data, version: qr.version };
      } catch (error) {
        // qrcode has no error code for capacity failures. Propagate other errors.
        if (
          !(error instanceof Error) ||
          error.message !==
            "The amount of data is too big to be stored in a QR Code"
        )
          throw error;
      }
    }
    if (best) {
      const image = await QRCode.toDataURL(best.data, {
        errorCorrectionLevel,
        version: best.version,
        margin: 4,
        scale: 4,
      });
      return { image, text };
    }
  }
  return { image: null, text };
}
