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
      getPeerId: () => {
        const parts = addr.split("/p2p/");
        return parts.length > 1 ? parts[parts.length - 1].split("/")[0] : undefined;
      },
    }),
  }),
  { virtual: true }
);

const protocolHandlers = new Map<string, any>();
const eventHandlers = new Map<string, any[]>();
let mockSelfMultiaddrs = ["/ip4/127.0.0.1/tcp/9/ws/p2p/mock-peer"];
const mockTransportManagerListen = jest.fn<Promise<void>, any[]>(async () => {});
const mockTransportManagerGetListeners = jest.fn<any[], any[]>(() => []);
const mockRegisterOnRendezvous = jest.fn<Promise<boolean>, any[]>(async () => true);
const mockLookupRendezvousPeer = jest.fn<Promise<any[]>, any[]>(async () => []);
const mockUnregisterFromRendezvous = jest.fn<Promise<boolean>, any[]>(async () => true);

jest.mock("../../../packages/core/network/node", () => ({
  createClipboardNode: jest.fn(async () => ({
    addEventListener: jest.fn((event: string, handler: any) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
    }),
    handle: jest.fn((protocol: string, handler: any) => {
      protocolHandlers.set(protocol, handler);
    }),
    start: jest.fn(),
    stop: jest.fn(),
    getConnections: jest.fn(() => []),
    getMultiaddrs: jest.fn(() => mockSelfMultiaddrs),
    dial: jest.fn(async () => ({})),
    dialProtocol: jest.fn(async () => ({
      send: jest.fn(() => true),
      onDrain: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
      [Symbol.asyncIterator]: async function* () {},
    })),
    peerId: { toString: () => "mock-peer" },
    peerStore: { get: jest.fn(async () => ({ peerRecordEnvelope: Uint8Array.of(1, 2, 3) })) },
    components: {
      transportManager: {
        listen: mockTransportManagerListen,
        getListeners: mockTransportManagerGetListeners,
      },
    },
    services: { pubsub: {}, dht: {} },
  })),
}));

jest.mock("../../../packages/core/network/rendezvous", () => ({
  registerOnRendezvous: mockRegisterOnRendezvous,
  lookupRendezvousPeer: mockLookupRendezvousPeer,
  unregisterFromRendezvous: mockUnregisterFromRendezvous,
}));

import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine";
import { CLIP_PROTOCOL } from "../../../packages/core/network/protocol";

const { createClipboardNode } = jest.requireMock("../../../packages/core/network/node");

describe("Libp2pMessagingTransport", () => {
  beforeEach(() => {
    protocolHandlers.clear();
    eventHandlers.clear();
    mockSelfMultiaddrs = ["/ip4/127.0.0.1/tcp/9/ws/p2p/mock-peer"];
    mockTransportManagerListen.mockResolvedValue(undefined);
    mockTransportManagerGetListeners.mockReturnValue([]);
    jest.clearAllMocks();
  });

  it("returns no peers when not started", () => {
    const transport = createLibp2pMessagingTransport({ isPeerKnown: async () => true });
    expect(transport.getConnectedPeers()).toEqual([]);
  });

  it("start and stop are idempotent", async () => {
    const transport = createLibp2pMessagingTransport({ isPeerKnown: async () => true });
    await transport.start();
    await transport.start();
    expect(createClipboardNode).toHaveBeenCalledTimes(1);
    await transport.stop();
    await transport.stop();
    const node = await createClipboardNode.mock.results[0].value;
    expect(node.stop).toHaveBeenCalledTimes(1);
  });

  it("passes direct upgrade options to the libp2p node", async () => {
    const transport = createLibp2pMessagingTransport({
      enableDCUtR: true,
      enableTcp: true,
    });

    await transport.start();

    expect(createClipboardNode).toHaveBeenCalledWith(
      expect.objectContaining({
        enableDCUtR: true,
        enableTcp: true,
      })
    );
    await transport.stop();
  });

  it("send uses MessageStream send/close", async () => {
    const transport = createLibp2pMessagingTransport({ isPeerKnown: async () => true });
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;
    await transport.send(CLIP_PROTOCOL, "/ip4/127.0.0.1/tcp/1/ws/p2p/mock", new Uint8Array([1, 2, 3]));
    const stream = await node.dialProtocol.mock.results[0].value;
    expect(node.dialProtocol).toHaveBeenCalledTimes(1);
    expect(stream.send).toHaveBeenCalledTimes(1);
    expect(stream.close).toHaveBeenCalledTimes(1);
  });

  it("rejects when a queued WebRTC stream write fails after the data channel closes", async () => {
    const transport = createLibp2pMessagingTransport({ isPeerKnown: async () => true });
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;
    const err = new Error(
      "libdatachannel error while sending data channel message: DataChannel is closed"
    );
    const stream: any = {
      abort: jest.fn(),
      send: jest.fn(() => false),
      onDrain: jest.fn(async () => {
        stream.processSendQueue();
      }),
      close: jest.fn(async () => {}),
      processSendQueue: jest.fn(() => {
        throw err;
      }),
      [Symbol.asyncIterator]: async function* () {},
    };
    node.dialProtocol.mockResolvedValueOnce(stream);

    await expect(
      transport.send(CLIP_PROTOCOL, "/ip4/127.0.0.1/tcp/1/ws/p2p/mock", new Uint8Array([1, 2, 3]))
    ).rejects.toThrow("DataChannel is closed");
    expect(stream.abort).toHaveBeenCalledWith(err);
    expect(stream.close).not.toHaveBeenCalled();
  });

  it("connect dials multiaddr targets without opening a protocol stream", async () => {
    const transport = createLibp2pMessagingTransport();
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;
    const connected: string[] = [];
    transport.onPeerConnected((peerId) => connected.push(peerId));

    await transport.connect("/ip4/127.0.0.1/tcp/1/ws/p2p/mock");

    expect(node.dial).toHaveBeenCalledTimes(1);
    expect(node.dialProtocol).not.toHaveBeenCalled();
    expect(connected).toEqual(["mock"]);
    expect(transport.getConnectedPeers()).toEqual(["mock"]);
  });

  it("does not hide peers connected through a relay circuit", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createLibp2pMessagingTransport({ relayAddresses: [relay] });
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;

    node.getConnections.mockReturnValue([
      {
        remotePeer: { toString: () => "peer-1" },
        remoteAddr: {
          toString: () => `${relay}/p2p-circuit/p2p/peer-1`,
        },
      },
      {
        remotePeer: { toString: () => "relay" },
        remoteAddr: { toString: () => relay },
      },
    ]);

    expect(transport.getConnectedPeers()).toEqual(["peer-1"]);
    expect(transport.getPeerConnectionInfo?.()).toEqual([
      {
        peerId: "peer-1",
        path: "relay",
        hasDirect: false,
        hasRelay: true,
        addrs: [`${relay}/p2p-circuit/p2p/peer-1`],
      },
    ]);
    await transport.stop();
  });

  it("reports direct connection path when a direct connection is active", async () => {
    const transport = createLibp2pMessagingTransport();
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;

    node.getConnections.mockReturnValue([
      {
        remotePeer: { toString: () => "peer-1" },
        remoteAddr: { toString: () => "/ip4/127.0.0.1/tcp/63067/ws/p2p/peer-1" },
      },
    ]);

    expect(transport.getPeerConnectionInfo?.()).toEqual([
      {
        peerId: "peer-1",
        path: "direct",
        hasDirect: true,
        hasRelay: false,
        addrs: ["/ip4/127.0.0.1/tcp/63067/ws/p2p/peer-1"],
      },
    ]);
    await transport.stop();
  });

  it("reports WebRTC-over-relay connections as direct", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createLibp2pMessagingTransport({ relayAddresses: [relay] });
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;

    node.getConnections.mockReturnValue([
      {
        remotePeer: { toString: () => "peer-1" },
        remoteAddr: { toString: () => `${relay}/p2p-circuit/webrtc/p2p/peer-1` },
      },
    ]);

    expect(transport.getPeerConnectionInfo?.()).toEqual([
      {
        peerId: "peer-1",
        path: "direct",
        hasDirect: true,
        hasRelay: false,
        addrs: [`${relay}/p2p-circuit/webrtc/p2p/peer-1`],
      },
    ]);
    await transport.stop();
  });

  it("exposes current self multiaddrs", async () => {
    const transport = createLibp2pMessagingTransport();
    expect(transport.getSelfMultiaddrs?.()).toEqual([]);

    await transport.start();

    expect(transport.getSelfMultiaddrs?.()).toEqual([
      "/ip4/127.0.0.1/tcp/9/ws/p2p/mock-peer",
    ]);
    await transport.stop();
  });

  it("logs when a relayed peer connection upgrades to direct", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const transport = createLibp2pMessagingTransport();
    await transport.start();
    const connectionOpen = eventHandlers.get("connection:open")?.[0];
    expect(typeof connectionOpen).toBe("function");

    connectionOpen({
      detail: {
        remotePeer: { toString: () => "peer-1" },
        remoteAddr: { toString: () => "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay/p2p-circuit/p2p/peer-1" },
      },
    });
    connectionOpen({
      detail: {
        remotePeer: { toString: () => "peer-1" },
        remoteAddr: { toString: () => "/ip4/127.0.0.1/tcp/63067/ws/p2p/peer-1" },
      },
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "Peer connection upgraded from relay to direct",
      expect.objectContaining({
        peerId: "peer-1",
        directAddr: "/ip4/127.0.0.1/tcp/63067/ws/p2p/peer-1",
      })
    );
    expect(transport.getPeerConnectionInfo?.()).toEqual([
      {
        peerId: "peer-1",
        path: "direct",
        hasDirect: true,
        hasRelay: true,
        addrs: [],
      },
    ]);
    infoSpy.mockRestore();
    await transport.stop();
  });

  it("dials discovered peers by multiaddr", async () => {
    const transport = createLibp2pMessagingTransport({ isPeerKnown: async () => true });
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;
    const discovered = eventHandlers.get("peer:discovery")?.[0];
    expect(typeof discovered).toBe("function");

    discovered({
      detail: {
        id: { toString: () => "peer-1" },
        multiaddrs: ["/ip4/127.0.0.1/tcp/1/ws/p2p/peer-1"],
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(node.dial).toHaveBeenCalledTimes(1);
  });

  it("dials direct discovery targets when an existing peer connection is relay-only", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createLibp2pMessagingTransport({ isPeerKnown: async () => true });
    await transport.start();
    const node = await createClipboardNode.mock.results[0].value;
    node.getConnections.mockReturnValue([
      {
        remotePeer: { toString: () => "peer-1" },
        remoteAddr: { toString: () => `${relay}/p2p-circuit/p2p/peer-1` },
        limits: {},
      },
    ]);
    const discovered = eventHandlers.get("peer:discovery")?.[0];
    expect(typeof discovered).toBe("function");

    discovered({
      detail: {
        id: { toString: () => "peer-1" },
        multiaddrs: [
          `${relay}/p2p-circuit/p2p/peer-1`,
          `${relay}/p2p-circuit/webrtc/p2p/peer-1`,
        ],
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(node.dial).toHaveBeenCalledTimes(1);
    expect(node.dial.mock.calls[0][0].toString()).toBe(`${relay}/p2p-circuit/webrtc/p2p/peer-1`);
  });

  it("registers only a Signed Peer Record after a relay reservation is live", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    mockSelfMultiaddrs = [`${relay}/p2p-circuit/p2p/mock-peer`];
    const transport = createLibp2pMessagingTransport({
      relayAddresses: [relay],
      rendezvousIntervalMs: 60_000,
    });
    await transport.start();
    await new Promise((resolve) => setImmediate(resolve));
    const node = await createClipboardNode.mock.results[0].value;

    expect(mockRegisterOnRendezvous).toHaveBeenCalledWith(
      node,
      relay,
      "clipp",
      Uint8Array.of(1, 2, 3),
      expect.objectContaining({ timeoutMs: 12_000 })
    );
    expect(mockLookupRendezvousPeer).not.toHaveBeenCalled();
    await transport.stop();
  });

  it("explicitly retries relay reservation after dialing configured relays", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createLibp2pMessagingTransport({
      relayAddresses: [relay],
      rendezvousIntervalMs: 60_000,
    });

    await transport.start();

    expect(mockTransportManagerListen).toHaveBeenCalledWith([
      expect.objectContaining({
        toString: expect.any(Function),
      }),
    ]);
    expect(mockTransportManagerListen.mock.calls[0][0].map(String)).toEqual([
      `${relay}/p2p-circuit`,
    ]);
    await transport.stop();
  });

  it("does not retry relay reservation when a circuit self address already exists", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    mockSelfMultiaddrs = [`${relay}/p2p-circuit/p2p/mock-peer`];
    const transport = createLibp2pMessagingTransport({
      relayAddresses: [relay],
      rendezvousIntervalMs: 60_000,
    });

    await transport.start();

    expect(mockTransportManagerListen).not.toHaveBeenCalled();
    await transport.stop();
  });

  it("does not register while a relay reservation is unavailable", async () => {
    mockSelfMultiaddrs = [];
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createLibp2pMessagingTransport({
      relayAddresses: [relay],
      rendezvousIntervalMs: 60_000,
    });
    await transport.start();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockRegisterOnRendezvous).not.toHaveBeenCalled();
    expect(mockUnregisterFromRendezvous).not.toHaveBeenCalled();
    await transport.stop();
  });

  it("reruns rendezvous when self addresses change", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createLibp2pMessagingTransport({
      relayAddresses: [relay],
      rendezvousIntervalMs: 60_000,
    });
    await transport.start();
    await new Promise((resolve) => setImmediate(resolve));
    mockRegisterOnRendezvous.mockClear();
    mockUnregisterFromRendezvous.mockClear();

    mockSelfMultiaddrs = [`${relay}/p2p-circuit/p2p/mock-peer`];
    eventHandlers.get("self:peer:update")?.[0]?.({});
    await new Promise((resolve) => setImmediate(resolve));
    const node = await createClipboardNode.mock.results[0].value;

    expect(mockRegisterOnRendezvous).toHaveBeenCalledWith(
      node,
      relay,
      "clipp",
      Uint8Array.of(1, 2, 3),
      expect.objectContaining({ timeoutMs: 12_000 })
    );
    await transport.stop();
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
