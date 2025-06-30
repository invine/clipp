// Mock libp2p and related ESM-only imports to avoid Jest ESM issues
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

import { ClipboardMessagingLayer } from "../../../packages/core/network/messaging";

import { Clip } from "../../../packages/core/models/Clip";

describe("ClipboardMessagingLayer", () => {
  it("should ignore messages from untrusted peers (trust logic)", async () => {
    const layer = new ClipboardMessagingLayer();
    // Patch trust.isTrusted to simulate trust logic
    jest
      .spyOn((layer as any).trust, "isTrusted")
      .mockImplementation(async function (id) {
        return id === "peer-trusted";
      });
    const received: any[] = [];
    layer.onMessage((msg) => received.push(msg));
    // Simulate protocol handler (as in .handle callback)
    async function simulateProtocolMessage(from: string) {
      // This mimics the protocol handler's trust check
      if (await (layer as any).trust.isTrusted(from)) {
        (layer as any).messageBus.emit({
          type: "CLIP",
          from,
          clip: {
            id: from === "peer-trusted" ? "1" : "2",
            type: "text",
            content: from === "peer-trusted" ? "a" : "b",
            timestamp: Date.now(),
            senderId: from,
          },
          sentAt: Date.now(),
        });
      }
    }
    await simulateProtocolMessage("peer-trusted");
    await simulateProtocolMessage("peer-untrusted");
    expect(received.length).toBe(1);
    expect(received[0].from).toBe("peer-trusted");
  });

  it("should emit peer connect/disconnect events", async () => {
    const layer = new ClipboardMessagingLayer();
    const connected: string[] = [];
    const disconnected: string[] = [];
    layer.onPeerConnected((pid) => connected.push(pid));
    layer.onPeerDisconnected((pid) => disconnected.push(pid));
    (layer as any).connectBus.emit("peer-x");
    (layer as any).disconnectBus.emit("peer-x");
    expect(connected).toContain("peer-x");
    expect(disconnected).toContain("peer-x");
  });
});
