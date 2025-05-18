import { encodePairingPayload, generateQRCode } from "../encode";
import { decodePairingPayload, validatePayload } from "../decode";
import { PairingPayload } from "../types";

describe("Pairing QR encode/decode", () => {
  const payload: PairingPayload = {
    id: "peer-123",
    name: "Test Device",
    publicKey: "BASE64PUBKEY",
    createdAt: Date.now(),
    version: "1.0.0",
  };

  it("should encode and decode payload correctly", () => {
    const encoded = encodePairingPayload(payload);
    const decoded = decodePairingPayload(encoded);
    expect(validatePayload(decoded)).toBe(true);
    expect(decoded).toMatchObject(payload);
  });

  it("should generate a QR code PNG", async () => {
    const dataUrl = await generateQRCode(payload);
    expect(typeof dataUrl).toBe("string");
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("should fail validation for missing fields", () => {
    const bad: any = { id: "x" };
    expect(validatePayload(bad)).toBe(false);
  });
});
