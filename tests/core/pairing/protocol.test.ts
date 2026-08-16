import {
  decodePairingFrame,
  decodeTrustRequestEnvelope,
  decodeTrustRequestPayload,
  encodePairingFrame,
  encodeTrustRequestEnvelope,
  encodeTrustRequestPayload,
  inspectPairingFrame,
  peerIdFromMultihashBytes,
  peerIdToMultihashBytes,
  validateTrustRequestTime,
} from "../../../packages/core/pairing/protocol";

const initiatorPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

describe("Pairing protocol", () => {
  it("preserves a signed request envelope through its one-frame protobuf transport", () => {
    const signedPayload = encodeTrustRequestPayload({
      initiatorPeerId,
      targetPeerId,
      deviceName: "Desktop",
      nameRevision: 3n,
      issuedAtUnixMs: 1_700_000_000_000n,
    });
    const envelope = encodeTrustRequestEnvelope({ signedPayload, signature: new Uint8Array([1, 2, 3]) });
    const frame = encodePairingFrame({ kind: "request", envelope });
    const parsed = decodePairingFrame(frame);

    expect(parsed).toEqual({ kind: "request", envelope });
    expect(decodeTrustRequestEnvelope(envelope)).toEqual({ signedPayload, signature: new Uint8Array([1, 2, 3]) });
    expect(decodeTrustRequestPayload(signedPayload)).toEqual({
      initiatorPeerId,
      targetPeerId,
      deviceName: "Desktop",
      nameRevision: 3n,
      issuedAtUnixMs: 1_700_000_000_000n,
    });
  });

  it("rejects trailing framing bytes and applies the injected freshness window", () => {
    const frame = encodePairingFrame({ kind: "request", envelope: new Uint8Array([10, 0, 18, 0]) });
    expect(decodePairingFrame(new Uint8Array([...frame, 0]))).toBeNull();
    const request = {
      initiatorPeerId,
      targetPeerId,
      deviceName: "Mobile",
      nameRevision: 0n,
      issuedAtUnixMs: 1_000n,
    };
    expect(validateTrustRequestTime(request, 1_100, { validityWindowMs: 50, clockSkewAllowanceMs: 25 })).toBe(false);
    expect(validateTrustRequestTime(request, 1_075, { validityWindowMs: 50, clockSkewAllowanceMs: 25 })).toBe(true);
  });

  it("ignores unknown protobuf fields, including repeated fields with fixed-width wire types", () => {
    const payload = encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Desktop", nameRevision: 0n, issuedAtUnixMs: 1n });
    // field 99 / fixed64, twice: extension data must not affect signed-field decoding.
    const extended = new Uint8Array([...payload, 0x99, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0x99, 0x06, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(decodeTrustRequestPayload(extended)).toEqual({ initiatorPeerId, targetPeerId, deviceName: "Desktop", nameRevision: 0n, issuedAtUnixMs: 1n });
  });

  it("rejects non-multihash peer ids and classifies framing failures", () => {
    expect(() => peerIdToMultihashBytes("2")).toThrow("invalid_peer_id");
    expect(() => peerIdFromMultihashBytes(new Uint8Array([1, 1]))).toThrow("invalid_peer_id");
    const frame = encodePairingFrame({ kind: "request", envelope: new Uint8Array([1]) });
    expect(inspectPairingFrame(new Uint8Array([...frame, 0]))).toEqual({ ok: false, reason: "invalid_framing" });
  });
});
