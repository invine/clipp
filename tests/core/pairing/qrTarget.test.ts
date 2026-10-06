import { decodePairingTarget } from "../../../packages/core/pairing/v2";
import fixtures from "./fixtures/qr-targets";

// Independent interoperability vectors generated with Node's zlib and RFC 9285
// Base45, not the production compressor. Bodies include significant spaces.
describe("Pairing Target QR transport", () => {
  it.each([fixtures.legacy, fixtures.validZ1, fixtures.validB1])(
    "preserves the full target from a supported transport",
    (text) => {
      expect(decodePairingTarget(text.trim())).toEqual({
        version: 2,
        targetPeerId: fixtures.targetPeerId,
        signedPeerRecord: Uint8Array.from(fixtures.recordBytes),
        deviceNameHint: fixtures.deviceNameHint,
      });
    }
  );

  it.each([fixtures.validZ1, fixtures.validB1])(
    "enforces the injectable decoded limit for both QR transports",
    (text) => {
      expect(decodePairingTarget(text, fixtures.payloadBytes)).not.toBeNull();
      expect(decodePairingTarget(text, fixtures.payloadBytes - 1)).toBeNull();
    }
  );

  it.each(
    Object.entries({
      truncated: fixtures.truncated,
      badChecksum: fixtures.badChecksum,
      trailingZero: fixtures.trailingZero,
      trailingGarbage: fixtures.trailingGarbage,
      concatenated: fixtures.concatenated,
      gzip: fixtures.gzip,
      rawDeflate: fixtures.rawDeflate,
      dictionary: fixtures.dictionary,
      bomb: fixtures.bomb,
      invalidProtobuf: fixtures.invalidProtobuf,
      unknownVersion: "CLIPP:PAIR:Z2:BB8:",
      empty: "CLIPP:PAIR:Z1::",
      invalidLength: "CLIPP:PAIR:B1:A:",
      invalidCharacters: "CLIPP:PAIR:B1:abc:",
      overflowingPair: "CLIPP:PAIR:B1:%%%:",
      overflowingByte: "CLIPP:PAIR:B1:ZZ:",
      missingTerminator: fixtures.validZ1.slice(0, -1),
      oversizedRawInput: `CLIPP:PAIR:B1:${"0".repeat(24577)}:`,
      oversizedCompressedInput: `CLIPP:PAIR:Z1:${"0".repeat(24577)}:`,
    })
  )("rejects %s without fallback", (_name, text) => {
    expect(decodePairingTarget(text)).toBeNull();
  });
});
