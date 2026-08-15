import {
  PAIRING_TARGET_PREFIX,
  decodePairingTarget,
  encodePairingTarget,
} from "../../../packages/core/pairing/v2";

describe("Pairing Target v2", () => {
  const target = {
    targetPeerId: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
    signedPeerRecord: new Uint8Array([1, 2, 3, 4]),
    deviceNameHint: "Desktop",
  };

  it("uses the prefixed, unpadded Base64URL v2 payload", () => {
    const encoded = encodePairingTarget(target);

    expect(encoded.startsWith(PAIRING_TARGET_PREFIX)).toBe(true);
    expect(encoded).not.toMatch(/[+=/]/);
    expect(decodePairingTarget(encoded)).toEqual({ ...target, version: 2 });
  });

  it("rejects a legacy payload, invalid Base64URL, and unknown recognized versions", () => {
    expect(decodePairingTarget("eyJ2ZXJzaW9uIjoiMSJ9")).toBeNull();
    expect(decodePairingTarget(`${PAIRING_TARGET_PREFIX}++++`)).toBeNull();
    expect(decodePairingTarget(`${PAIRING_TARGET_PREFIX}CAU`)).toBeNull();
  });
});
