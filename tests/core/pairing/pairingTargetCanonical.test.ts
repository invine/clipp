import { decodePairingTarget, encodePairingTarget } from "../../../packages/core/pairing/v2";
import { peerIdToMultihashBytes } from "../../../packages/core/pairing/protocol";

const peerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";

describe("v2 pairing targets", () => {
  it("stores the target peer as canonical multihash bytes, not display text", () => {
    const encoded = encodePairingTarget({ targetPeerId: peerId, signedPeerRecord: new Uint8Array([1]) });
    const bytes = Buffer.from(encoded.slice("clipp:pair:".length), "base64url");
    expect(bytes.includes(Buffer.from(peerId))).toBe(false);
    expect(bytes.includes(Buffer.from(peerIdToMultihashBytes(peerId)))).toBe(true);
    expect(decodePairingTarget(encoded)?.targetPeerId).toBe(peerId);
  });

  it("ignores unsafe name hints without invalidating the target", () => {
    const encoded = encodePairingTarget({ targetPeerId: peerId, signedPeerRecord: new Uint8Array([1]), deviceNameHint: "Bad\nname" });
    expect(decodePairingTarget(encoded)?.deviceNameHint).toBeUndefined();
  });
});
