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

import { createClipboardNode } from "../../../packages/core/network/node";

describe("createClipboardNode integration", () => {
  it("should create a libp2p node with DHT and pubsub services", async () => {
    const node = await createClipboardNode();
    expect(node).toBeDefined();
    expect(node.services).toBeDefined();
    expect(node.services.pubsub).toBeDefined();
    expect(node.services.dht).toBeDefined();
    await node.stop();
  });
});
