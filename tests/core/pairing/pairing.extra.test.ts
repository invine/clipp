import {
  encodePairingPayload,
  generateQRCode,
} from "../../../packages/core/pairing/encode";
import {
  decodePairingPayload,
  validatePayload,
} from "../../../packages/core/pairing/decode";
import { PairingPayload } from "../../../packages/core/pairing/types";

describe("Pairing QR - Additional", () => {
  it("fails to decode corrupted QR string", () => {
    expect(() => decodePairingPayload("not_base64")).toThrow();
  });

  it("version compatibility", () => {
    const payload: PairingPayload = {
      id: "peer-123",
      name: "Test Device",
      publicKey: "BASE64PUBKEY",
      createdAt: Date.now(),
      version: "1.0.0",
    };
    const encoded = encodePairingPayload(payload);
    const decoded = decodePairingPayload(encoded);
    expect(decoded.version).toBe("1.0.0");
  });

  it("handles large payloads", async () => {
    const payload: PairingPayload = {
      id: "peer-123",
      name: "A".repeat(200),
      publicKey: "BASE64PUBKEY",
      createdAt: Date.now(),
      version: "1.0.0",
    };
    const dataUrl = await generateQRCode(payload);
    expect(typeof dataUrl).toBe("string");
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
