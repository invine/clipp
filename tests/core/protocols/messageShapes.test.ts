import {
  createClipMessage,
  decodeClipMessage,
  encodeClipMessage,
} from "../../../packages/core/protocols/clip";
import {
  decodeLiveClipFrame,
  encodeLiveClipFrame,
  LIVE_CLIP_PROTOCOL,
} from "../../../packages/core/protocols/liveClip";
import {
  createHistorySyncMessage,
  decodeHistorySyncMessage,
  encodeHistorySyncMessage,
} from "../../../packages/core/protocols/history";
import {
  createTrustedPeersMessage,
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
  it("encodes one length-prefixed LiveClip frame without routing metadata", () => {
    const clip = {
      id: "00000000-0000-4000-8000-000000000001",
      type: "text" as const,
      content: "hello",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    };

    const frame = encodeLiveClipFrame({ clip });

    expect(LIVE_CLIP_PROTOCOL).toBe("/clipp/clip/1.0.0");
    expect(decodeLiveClipFrame(frame)).toEqual({ clip });
    expect(new TextDecoder().decode(frame)).not.toContain("from");
    expect(new TextDecoder().decode(frame)).not.toContain("sentAt");
  });

  it("uses the normalized clip wire shape", () => {
    const msg = createClipMessage({
      from: "me",
      clip: {
        id: "c1",
        type: "text",
        content: "hello",
        originPeerId: "me",
        capturedAt: 1,
        shareExpiresAt: 86_400_001,
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
      clips: [{ id: "c2", type: "text", content: "y", originPeerId: "me", capturedAt: 2, shareExpiresAt: 86_400_002, timestamp: 2, senderId: "me" }],
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

  it("uses a separate trusted peers wire shape", () => {
    const msg = createTrustedPeersMessage({
      from: "me",
      to: "peer",
      devices: [
        {
          deviceId: "known",
          deviceName: "Known",
          publicKey: "pk",
          privateKey: "secret",
          multiaddrs: ["/p2p/known"],
          createdAt: 1,
        } as any,
      ],
      sentAt: 6,
    });

    expect(msg.payload.devices[0]).toEqual(
      expect.not.objectContaining({ privateKey: expect.anything() }),
    );

    const encoded = new TextDecoder().decode(encodeTrustMessage(msg));
    expect(JSON.parse(encoded)).toEqual(msg);
    expect(
      decodeTrustMessage(new TextEncoder().encode(encoded), "me")
    ).toEqual({
      type: "trusted-peers",
      from: "me",
      to: "peer",
      payload: {
        devices: [
          expect.objectContaining({
            deviceId: "known",
            multiaddrs: ["/p2p/known"],
          }),
        ],
      },
      sentAt: 6,
    });
  });
});
