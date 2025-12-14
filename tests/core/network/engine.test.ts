// Mock libp2p node creation to avoid ESM issues and heavy deps
jest.mock(
  "@multiformats/multiaddr",
  () => ({
    multiaddr: (addr: string) => ({
      toString: () => addr,
      encapsulate: (suffix: string) => ({
        toString: () => `${addr}${suffix}`,
        encapsulate: (suffix2: string) => ({
          toString: () => `${addr}${suffix}${suffix2}`,
        }),
      }),
      getPeerId: () => addr.split("/p2p/")[1] || undefined,
    }),
  }),
  { virtual: true }
);

const protocolHandlers = new Map<string, any>();

jest.mock("../../../packages/core/network/node", () => ({
  createClipboardNode: jest.fn(async () => ({
    addEventListener: jest.fn(),
    handle: jest.fn((protocol: string, handler: any) => {
      protocolHandlers.set(protocol, handler);
    }),
    start: jest.fn(),
    stop: jest.fn(),
    getConnections: jest.fn(() => []),
    dialProtocol: jest.fn(async () => ({
      send: jest.fn(() => true),
      onDrain: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
      [Symbol.asyncIterator]: async function* () {},
    })),
    peerId: { toString: () => "mock-peer" },
    services: { pubsub: {}, dht: {} },
  })),
}));

import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine";
import { CLIP_PROTOCOL } from "../../../packages/core/network/protocol";

const { createClipboardNode } = jest.requireMock("../../../packages/core/network/node");

describe("Libp2pMessagingTransport", () => {
  beforeEach(() => {
    protocolHandlers.clear();
    jest.clearAllMocks();
  });

  it("returns no peers when not started", () => {
    const transport = createLibp2pMessagingTransport();
    expect(transport.getConnectedPeers()).toEqual([]);
  });

  it("start and stop are idempotent", async () => {
    const transport = createLibp2pMessagingTransport();
    await transport.start();
    await transport.start();
    expect(createClipboardNode).toHaveBeenCalledTimes(1);
    await transport.stop();
    await transport.stop();
    const node = await createClipboardNode.mock.results[0].value;
    expect(node.stop).toHaveBeenCalledTimes(1);
  });

  it("send uses MessageStream send/close", async () => {
    const transport = createLibp2pMessagingTransport();
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;
    await transport.send(CLIP_PROTOCOL, "/ip4/127.0.0.1/tcp/1/ws/p2p/mock", new Uint8Array([1, 2, 3]));
    const stream = await node.dialProtocol.mock.results[0].value;
    expect(node.dialProtocol).toHaveBeenCalledTimes(1);
    expect(stream.send).toHaveBeenCalledTimes(1);
    expect(stream.close).toHaveBeenCalledTimes(1);
  });

  it("dispatches inbound messages to protocol handlers", async () => {
    const transport = createLibp2pMessagingTransport();
    await transport.start();

    const received: Array<{ from: string; data: Uint8Array }> = [];
    transport.onMessage(CLIP_PROTOCOL, (from, data) => received.push({ from, data }));

    const handler = protocolHandlers.get(CLIP_PROTOCOL);
    expect(typeof handler).toBe("function");

    const fakeStream = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([7, 8, 9]);
      },
    };
    await handler({ stream: fakeStream, connection: { remotePeer: { toString: () => "peer-1" } } });

    expect(received).toHaveLength(1);
    expect(received[0].from).toBe("peer-1");
    expect(Array.from(received[0].data)).toEqual([7, 8, 9]);
  });
});
