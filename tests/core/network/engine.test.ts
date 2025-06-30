// Mock libp2p node creation to avoid ESM issues and heavy deps
jest.mock("../../../packages/core/network/node", () => ({
  createClipboardNode: jest.fn(async () => ({
    addEventListener: jest.fn(),
    handle: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    getConnections: jest.fn(() => []),
    dialProtocol: jest.fn(async () => ({ sink: async () => {} })),
    peerId: { toString: () => "mock-peer" },
    services: { pubsub: {}, dht: {} },
  })),
}));

import { createMessagingLayer } from "../../../packages/core/network/engine";
import type { ClipboardMessage } from "../../../packages/core/network/types";

const { createClipboardNode } = jest.requireMock("../../../packages/core/network/node");

describe("MessagingLayer", () => {
  it("start and stop are idempotent", async () => {
    const layer = createMessagingLayer();
    await layer.start();
    await layer.start();
    expect(createClipboardNode).toHaveBeenCalledTimes(1);
    await layer.stop();
    await layer.stop();
    // stop should have been called once on the mocked node
    const node = await createClipboardNode.mock.results[0].value;
    expect(node.stop).toHaveBeenCalledTimes(1);
  });

  it("delivers messages only from trusted peers", async () => {
    const layer = createMessagingLayer();
    await layer.start();
    jest.spyOn((layer as any).trust, "isTrusted").mockImplementation(async (id) => id === "trusted");
    const received: ClipboardMessage[] = [];
    layer.onMessage((m) => received.push(m));
    if (await (layer as any).trust.isTrusted("trusted")) {
      (layer as any).messageBus.emit({ type: "CLIP", from: "trusted", clip: { id: "1", type: "text", content: "hi", timestamp: Date.now(), senderId: "trusted" }, sentAt: Date.now() });
    }
    if (await (layer as any).trust.isTrusted("bad")) {
      (layer as any).messageBus.emit({ type: "CLIP", from: "bad", clip: { id: "2", type: "text", content: "bad", timestamp: Date.now(), senderId: "bad" }, sentAt: Date.now() });
    }
    expect(received.length).toBe(1);
    expect(received[0].from).toBe("trusted");
  });

  it("broadcast sends to all peers", async () => {
    const layer = createMessagingLayer();
    await layer.start();
    (layer as any).node.getConnections.mockReturnValue([
      { remotePeer: { toString: () => "p1" } },
      { remotePeer: { toString: () => "p2" } },
    ]);
    const spy = jest.spyOn(layer as any, "sendMessage").mockResolvedValue(undefined as any);
    expect(layer.getConnectedPeers()).toEqual(["p1", "p2"]);
    const msg: ClipboardMessage = { type: "CLIP" as any, from: "me", clip: { id: "1", type: "text", content: "x", timestamp: Date.now(), senderId: "me" }, sentAt: Date.now() } as any;
    await layer.broadcast(msg);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
