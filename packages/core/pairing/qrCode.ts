import QRCode from "qrcode";

export type PairingCode = {
  image: string | null;
  text: string;
};

/** Preserve the complete Pairing Target when its signed record outgrows one QR. */
export async function createPairingCode(text: string): Promise<PairingCode> {
  try {
    const image = await QRCode.toDataURL(text, {
      errorCorrectionLevel: "L",
      margin: 0,
      scale: 2,
    });
    return { image, text };
  } catch (error) {
    // qrcode exposes its capacity failure as a message, without an error code.
    if (
      error instanceof Error &&
      error.message ===
        "The amount of data is too big to be stored in a QR Code"
    ) {
      return { image: null, text };
    }
    throw error;
  }
}
