jest.mock(
  "libp2p",
  () => ({
    createLibp2p: jest.fn(async (config: any) => ({
      config,
      stop: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/circuit-relay-v2",
  () => ({
    circuitRelayTransport: jest.fn(() => jest.fn(() => ({}))),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/websockets",
  () => ({
    webSockets: jest.fn(() => jest.fn(() => ({}))),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/webrtc",
  () => ({
    webRTC: jest.fn(() => jest.fn(() => ({}))),
    webRTCDirect: jest.fn(() => jest.fn(() => ({}))),
  }),
  { virtual: true }
);

jest.mock(
  "@chainsafe/libp2p-noise",
  () => ({
    noise: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@chainsafe/libp2p-yamux",
  () => ({
    yamux: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/mplex",
  () => ({
    mplex: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/bootstrap",
  () => ({
    bootstrap: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/mdns",
  () => ({
    mdns: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@chainsafe/libp2p-gossipsub",
  () => ({
    gossipsub: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/kad-dht",
  () => ({
    kadDHT: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/identify",
  () => ({
    identify: jest.fn(() => ({})),
    identifyPush: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/ping",
  () => ({
    ping: jest.fn(() => ({})),
  }),
  { virtual: true }
);

jest.mock(
  "@libp2p/interface",
  () => ({
    FaultTolerance: { NO_FATAL: "NO_FATAL" },
  }),
  { virtual: true }
);

jest.mock(
  "@multiformats/multiaddr",
  () => {
    class MockMultiaddr {
      constructor(private readonly value: string) {}

      toString() {
        return this.value;
      }

      encapsulate(suffix: string) {
        return new MockMultiaddr(`${this.value}${suffix}`);
      }

      getComponents() {
        const valueless = new Set([
          "ws",
          "wss",
          "p2p-circuit",
          "p2p-webrtc-star",
          "webrtc",
        ]);
        const codes: Record<string, number> = {
          p2p: 421,
          "p2p-circuit": 290,
        };
        const parts = this.value.split("/").filter(Boolean);
        const components: Array<{
          name: string;
          value?: string;
          code?: number;
        }> = [];

        for (let i = 0; i < parts.length; i++) {
          const name = parts[i];
          const hasValue = !valueless.has(name) && i + 1 < parts.length;
          const value = hasValue ? parts[++i] : undefined;
          components.push({ name, value, code: codes[name] });
        }

        return components;
      }
    }

    return {
      multiaddr: (addr: string) => new MockMultiaddr(addr),
    };
  },
  { virtual: true }
);

jest.mock("@libp2p/tcp", () => ({ tcp: jest.fn(() => jest.fn(() => ({}))) }), {
  virtual: true,
});
jest.mock(
  "@libp2p/dcutr",
  () => ({ dcutr: jest.fn(() => jest.fn(() => ({}))) }),
  { virtual: true }
);

import { createLibp2p } from "libp2p";
import { createClipboardNode } from "../../../packages/core/network/node";

const relay =
  "/ip4/141.147.116.147/tcp/47891/ws/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
const peerId = "12D3KooWAuz1FwEK4f32DznuhrHm1BWYBhP5NcZ7sPcEFdUykNMR";

describe("createClipboardNode address config", () => {
  const originalRTCPeerConnection = (globalThis as any).RTCPeerConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).RTCPeerConnection = function MockRTCPeerConnection() {};
  });

  afterEach(() => {
    if (originalRTCPeerConnection === undefined)
      delete (globalThis as any).RTCPeerConnection;
    else (globalThis as any).RTCPeerConnection = originalRTCPeerConnection;
  });

  it("adds relay circuit addresses without replacing websocket listener addresses", async () => {
    await createClipboardNode({
      peerId: { toString: () => peerId },
      relayAddresses: [relay],
    });

    const config = (createLibp2p as jest.Mock).mock.calls[0][0];

    expect(config.addresses.listen.map(String)).toEqual(
      expect.arrayContaining([
        "/ip4/0.0.0.0/tcp/0/ws",
        "/ip4/0.0.0.0/udp/0/webrtc-direct",
        "/webrtc",
        `${relay}/p2p-circuit`,
      ])
    );
    expect(config.addresses.announce).toBeUndefined();
    expect(config.addresses.appendAnnounce).toBeUndefined();
  });

  it("enables relay-signalled WebRTC in Electron without a browser global", async () => {
    delete (globalThis as any).RTCPeerConnection;
    await createClipboardNode({ relayAddresses: [] });
    const config = (createLibp2p as jest.Mock).mock.calls[0][0];
    expect(config.addresses.listen.map(String)).toContain("/webrtc");
  });

  it("isolates relay acceptance from direct dials, listeners, discovery and upgrades", async () => {
    const relayPeer = relay.split("/p2p/")[1];
    await createClipboardNode({
      relayAddresses: [],
      enableTcp: true,
      enableDCUtR: true,
      relayOnly: {
        isRelayPeer: (id: string, address: string) =>
          id === relayPeer && address === relay,
      },
    });
    const config = (createLibp2p as jest.Mock).mock.calls[0][0];
    const circuit = `${relay}/p2p-circuit/p2p/${peerId}`;
    const direct = `/ip4/127.0.0.1/tcp/9000/p2p/${peerId}`;
    const otherRelayTransport = `/ip4/127.0.0.1/tcp/4001/p2p/${relayPeer}`;
    expect(config.addresses.listen).toEqual([]);
    expect(config.peerDiscovery).toEqual([]);
    expect(
      config.connectionGater.denyDialMultiaddr({
        toString: () => otherRelayTransport,
      })
    ).toBe(true);
    expect(config.services.dcutr).toBeUndefined();
    expect(
      config.connectionGater.denyDialMultiaddr({ toString: () => direct })
    ).toBe(true);
    expect(
      config.connectionGater.denyDialMultiaddr({ toString: () => relay })
    ).toBe(false);
    expect(
      config.connectionGater.denyDialMultiaddr({ toString: () => circuit })
    ).toBe(false);
    expect(
      config.connectionGater.denyDialMultiaddr({
        toString: () => `${circuit}/webrtc`,
      })
    ).toBe(true);
    for (const direction of ["Inbound", "Outbound"]) {
      const deny =
        config.connectionGater[`deny${direction}EncryptedConnection`];
      expect(
        deny(
          { toString: () => peerId },
          { remoteAddr: { toString: () => direct } }
        )
      ).toBe(true);
      expect(
        deny(
          { toString: () => relayPeer },
          { remoteAddr: { toString: () => relay } }
        )
      ).toBe(false);
      expect(
        deny(
          { toString: () => peerId },
          { remoteAddr: { toString: () => circuit } }
        )
      ).toBe(false);
      expect(
        deny(
          { toString: () => peerId },
          { remoteAddr: { toString: () => `${circuit}/webrtc` } }
        )
      ).toBe(true);
    }
  });

  it("can disable browser dial gating for direct LAN websocket pairing", async () => {
    await createClipboardNode({
      peerId: { toString: () => peerId },
      allowInsecureBrowserDials: true,
    });

    const config = (createLibp2p as jest.Mock).mock.calls[0][0];

    expect(config.connectionGater.denyDialMultiaddr()).toBe(false);
  });

  it("can disable WebRTC Direct listening", async () => {
    await createClipboardNode({
      peerId: { toString: () => peerId },
      enableWebRTCDirect: false,
      relayAddresses: [],
    });

    const config = (createLibp2p as jest.Mock).mock.calls[0][0];

    expect(config.addresses.listen.map(String)).not.toContain(
      "/ip4/0.0.0.0/udp/0/webrtc-direct"
    );
  });

  it("can reserve relay circuits from browser document runtimes", async () => {
    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;
    (globalThis as any).window = {};
    (globalThis as any).document = {};

    try {
      await createClipboardNode({
        peerId: { toString: () => peerId },
        relayAddresses: [relay],
        enableRelayReservations: true,
      });

      const config = (createLibp2p as jest.Mock).mock.calls[0][0];

      expect(config.addresses.listen.map(String)).toEqual([
        "/webrtc",
        `${relay}/p2p-circuit`,
      ]);
      expect(config.addresses.appendAnnounce).toBeUndefined();
    } finally {
      if (originalWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = originalWindow;
      if (originalDocument === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = originalDocument;
    }
  });

  it("does not try to make circuit relay reservations on WebRTC-star relays", async () => {
    const starRelay =
      "/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star";

    await createClipboardNode({
      peerId: { toString: () => peerId },
      relayAddresses: [starRelay],
      enableRelayReservations: true,
    });

    const config = (createLibp2p as jest.Mock).mock.calls[0][0];

    expect(config.addresses.listen.map(String)).not.toContain(
      `${starRelay}/p2p-circuit`
    );
    expect(config.addresses.appendAnnounce).toBeUndefined();
  });
});
