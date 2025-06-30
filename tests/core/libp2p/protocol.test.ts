import { encodeMessage, decodeMessage, PROTOCOL } from "../../../packages/core/libp2p/protocol";
import { SyncMessage } from "../../../packages/core/models/SyncMessage";

describe("libp2p protocol", () => {
  it("encodes and decodes messages", () => {
    const msg: SyncMessage = {
      type: "HELLO",
      payload: { foo: "bar" },
      senderId: "peer1",
      timestamp: 123,
    };
    const bytes = encodeMessage(msg);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const decoded = decodeMessage(bytes);
    expect(decoded).toEqual(msg);
  });

  it("exposes protocol id", () => {
    expect(PROTOCOL).toBe("/clipp/sync/1.0.0");
  });
});
