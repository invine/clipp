import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import {
  decodePairingTarget,
  encodePairingTarget,
} from "../../../packages/core/pairing/v2";

const targetPeerId = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";

describe("pairing code presentation", () => {
  it("keeps a valid pairing target copyable when it exceeds QR capacity", async () => {
    // The presentation layer treats the signed envelope as opaque, like v2.
    const signedPeerRecord = Uint8Array.from(
      { length: 3500 },
      (_, index) => index % 256
    );
    const text = encodePairingTarget({ targetPeerId, signedPeerRecord });

    const code = await createPairingCode(text);

    expect(code.image).toBeNull();
    expect(code.text).toBe(text);
    expect(decodePairingTarget(code.text)?.signedPeerRecord).toEqual(
      signedPeerRecord
    );
  });
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
