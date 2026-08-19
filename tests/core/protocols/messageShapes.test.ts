import {
  decodeLiveClipFrame,
  encodeLiveClipFrame,
  LIVE_CLIP_PROTOCOL,
} from "../../../packages/core/protocols/liveClip";
import {
  HISTORY_PROTOCOL,
  decodeHistorySnapshot,
  encodeHistoryBatchFrame,
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
    // LiveClip has exactly one nested `Clip clip = 1`, whose first field is
    // the UUID's 16 raw bytes rather than its 36-byte diagnostic string.
    expect(frame[1]).toBe(0x0a);
    expect(frame[2]).toBe(frame.length - 3);
    expect(Array.from(frame.slice(3, 5))).toEqual([0x0a, 0x10]);
    expect(Array.from(frame.slice(5, 21))).toEqual([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00,
      0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ]);
    expect(new TextDecoder().decode(frame)).not.toContain("from");
    expect(new TextDecoder().decode(frame)).not.toContain("sentAt");
    expect(new TextDecoder().decode(frame)).not.toContain(clip.id);
  });

  it("ignores unknown fields in LiveClip and its nested Clip", () => {
    const clip = {
      id: "00000000-0000-4000-8000-000000000001",
      type: "text" as const,
      content: "hello",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    };
    const frame = encodeLiveClipFrame({ clip });
    expect(frame[0]).toBeLessThan(0x80);
    expect(frame[2]).toBeLessThan(0x80);

    const unknownVarint = [0x38, 0x01]; // optional field 7
    const nestedUnknown = Uint8Array.from([
      frame[0] + unknownVarint.length,
      frame[1],
      frame[2] + unknownVarint.length,
      ...frame.slice(3),
      ...unknownVarint,
    ]);
    const liveUnknown = Uint8Array.from([
      frame[0] + unknownVarint.length,
      ...frame.slice(1),
      ...unknownVarint,
    ]);

    expect(decodeLiveClipFrame(nestedUnknown)).toEqual({ clip });
    expect(decodeLiveClipFrame(liveUnknown)).toEqual({ clip });
  });

  it("uses bounded protobuf HistoryBatch frames without routing metadata", () => {
    const historyClip = {
      id: "00000000-0000-4000-8000-000000000002",
      type: "text" as const,
      content: "y",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: 2,
      shareExpiresAt: 86_400_002,
    };
    const frame = encodeHistoryBatchFrame({ clips: [historyClip] });

    expect(HISTORY_PROTOCOL).toBe("/clipp/history/1.0.0");
    expect(decodeHistorySnapshot(frame)).toEqual([{ clips: [historyClip] }]);
    expect(new TextDecoder().decode(frame)).not.toContain("from");
    expect(new TextDecoder().decode(frame)).not.toContain(historyClip.id);
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
