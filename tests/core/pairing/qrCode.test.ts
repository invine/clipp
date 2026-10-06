import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import jsQR from "jsqr";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import {
  decodePairingTarget,
  encodePairingTarget,
} from "../../../packages/core/pairing/v2";

const targetPeerId = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";

function scanImage(image: string): string {
  const png = PNG.sync.read(Buffer.from(image.split(",")[1], "base64"));
  const scanned = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!scanned) throw new Error("pairing_qr_not_readable");
  return scanned.data;
}

describe("pairing code presentation", () => {
  it("scans a complete target that outgrew Base64URL QR capacity without changing copy text", async () => {
    const signedPeerRecord = Uint8Array.from(
      { length: 3500 },
      (_, index) => index % 256
    );
    const text = encodePairingTarget({
      targetPeerId,
      signedPeerRecord,
      deviceNameHint: "Desktop 📋",
    });

    const code = await createPairingCode(text);

    expect(code.image).not.toBeNull();
    expect(code.text).toBe(text);
    expect(decodePairingTarget(scanImage(code.image!))).toEqual({
      version: 2,
      targetPeerId,
      signedPeerRecord,
      deviceNameHint: "Desktop 📋",
    });
  });
  it("keeps a valid pairing target copyable when it exceeds QR capacity", async () => {
    // The presentation layer treats the signed envelope as opaque, like v2.
    const signedPeerRecord = Uint8Array.from(
      createHash("shake256", { outputLength: 6000 })
        .update("Clipp QR overflow fixture")
        .digest()
    );
    const text = encodePairingTarget({ targetPeerId, signedPeerRecord });

    const code = await createPairingCode(text);

    expect(code.image).toBeNull();
    expect(code.text).toBe(text);
    expect(decodePairingTarget(code.text)?.signedPeerRecord).toEqual(
      signedPeerRecord
    );
  });
  it("still generates a complete QR when low-compressibility data only fits error correction L", async () => {
    const signedPeerRecord = Uint8Array.from(
      createHash("shake256", { outputLength: 2300 })
        .update("Clipp QR L fallback fixture")
        .digest()
    );
    const text = encodePairingTarget({ targetPeerId, signedPeerRecord });

    const code = await createPairingCode(text);

    expect(code.image).not.toBeNull();
    expect(code.text).toBe(text);
  }, 15000);
  it("generates a QR image for a compact pairing target without changing its text", async () => {
    const text = encodePairingTarget({
      targetPeerId,
      signedPeerRecord: Uint8Array.of(1, 2, 3),
    });

    const code = await createPairingCode(text);

    expect(code.image).toMatch(/^data:image\/png;base64,/);
    expect(code.text).toBe(text);
  });

  it("propagates errors unrelated to QR capacity", async () => {
    await expect(createPairingCode("")).rejects.toThrow("No input text");
  });
});
