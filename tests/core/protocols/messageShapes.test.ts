import {
  createClipMessage,
  decodeClipMessage,
  encodeClipMessage,
} from "../../../packages/core/protocols/clip";
import {
  createHistorySyncMessage,
  decodeHistorySyncMessage,
  encodeHistorySyncMessage,
} from "../../../packages/core/protocols/history";
import {
  createSignedTrustRequestFromKey,
  decodeTrustMessage,
  encodeTrustMessage,
} from "../../../packages/core/protocols/clipTrust";

function sumBytes(data: Uint8Array): number {
  let sum = 0;
  for (const b of data) sum = (sum + b) & 0xff;
  return sum;
}

const fakePrivateKey = {
  sign(data: Uint8Array) {
    return new Uint8Array([sumBytes(data)]);
  },
};

describe("protocol message shapes", () => {
  it("uses the normalized clip wire shape", () => {
    const msg = createClipMessage({
      from: "me",
      clip: {
        id: "c1",
        type: "text",
        content: "hello",
        timestamp: 1,
        senderId: "me",
      },
      sentAt: 2,
    });

    const encoded = new TextDecoder().decode(encodeClipMessage(msg));
    expect(JSON.parse(encoded)).toEqual(msg);

    expect(
      decodeClipMessage(new TextEncoder().encode(encoded), "peer")
    ).toEqual({
      type: "clip",
      from: "peer",
      payload: {
        clip: msg.payload.clip,
      },
      sentAt: 2,
    });
  });

  it("uses the normalized history sync wire shape", () => {
    const normalized = createHistorySyncMessage({
      from: "me",
      clips: [{ id: "c2", type: "text", content: "y", timestamp: 2, senderId: "me" }],
      sentAt: 4,
    });

    const encoded = new TextDecoder().decode(encodeHistorySyncMessage(normalized));
    expect(JSON.parse(encoded)).toEqual(normalized);
    expect(
      decodeHistorySyncMessage(new TextEncoder().encode(encoded), "peer")
    ).toEqual({
      ...normalized,
      from: "peer",
    });
  });

  it("uses the normalized trust request wire shape", async () => {
    const request = await createSignedTrustRequestFromKey({
      from: "me",
      to: "peer",
      payload: {
        deviceId: "me",
        deviceName: "My device",
        publicKey: "pk",
        multiaddrs: ["/p2p/me"],
        createdAt: 1,
      },
      privateKey: fakePrivateKey as any,
      sentAt: 5,
    });

    const encoded = new TextDecoder().decode(encodeTrustMessage(request));
    expect(JSON.parse(encoded)).toEqual(request);

    expect(
      decodeTrustMessage(new TextEncoder().encode(encoded), "me")
    ).toEqual({
      type: "trust-request",
      from: "me",
      to: "peer",
      payload: request.payload,
      sentAt: 5,
    });
  });
});
