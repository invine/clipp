import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import type { PeerConnectionInfo } from "../../../packages/core/messaging/transport";
import {
  createPairedPeerConnectionManager,
  peerConnectionTargets,
} from "../../../packages/core/network/pairedConnections";

function createTransport(
  connectedPeers: string[] = [],
  connectionInfo: PeerConnectionInfo[] = []
): MessagingTransport & {
  connect: jest.Mock<Promise<void>, [string]>;
} {
  return {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    send: jest.fn(async () => {}),
    connect: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    onMessage: jest.fn(),
    onPeerConnected: jest.fn(),
    onPeerDisconnected: jest.fn(),
    onSelfPeerUpdate: jest.fn(),
    getConnectedPeers: jest.fn(() => connectedPeers),
    getPeerConnectionInfo: jest.fn(() => connectionInfo),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("paired peer connections", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds deduped targets from multiaddrs and peer id", () => {
    expect(
      peerConnectionTargets({
        deviceId: "peer-1",
        multiaddr: "/p2p/peer-1",
        multiaddrs: ["/p2p/peer-1", " /ip4/127.0.0.1/tcp/1/ws/p2p/peer-1 "],
      })
    ).toEqual(["/p2p/peer-1", "/ip4/127.0.0.1/tcp/1/ws/p2p/peer-1", "peer-1"]);
  });

  it("connects disconnected paired peers and tries alternate targets", async () => {
    const transport = createTransport(["peer-a"]);
    transport.connect.mockImplementation(async (target) => {
      if (target.includes("bad")) throw new Error("dial_failed");
    });
    const manager = createPairedPeerConnectionManager({
      transport,
      getPairedPeers: async () => [
        { deviceId: "peer-a", multiaddrs: ["/p2p/peer-a"] },
        { deviceId: "peer-b", multiaddrs: ["/p2p/bad", "/p2p/good", "/p2p/unused"] },
        { deviceId: "peer-c" },
      ],
    });

    await manager.reconnectNow();

    const targets = transport.connect.mock.calls.map(([target]) => target);
    expect(targets).not.toContain("/p2p/peer-a");
    expect(targets).toEqual(expect.arrayContaining(["/p2p/bad", "/p2p/good", "peer-c"]));
    expect(targets).not.toContain("/p2p/unused");
  });

  it("keeps probing direct targets for relay-only paired peers", async () => {
    const relay = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay";
    const transport = createTransport(["peer-a"], [
      {
        peerId: "peer-a",
        path: "relay",
        hasDirect: false,
        hasRelay: true,
        addrs: [`${relay}/p2p-circuit/p2p/peer-a`],
      },
    ]);
    const manager = createPairedPeerConnectionManager({
      transport,
      getPairedPeers: async () => [
        {
          deviceId: "peer-a",
          multiaddrs: [
            `${relay}/p2p-circuit/p2p/peer-a`,
            `${relay}/p2p-circuit/webrtc/p2p/peer-a`,
          ],
        },
      ],
    });

    await manager.reconnectNow();

    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(transport.connect).toHaveBeenCalledWith(`${relay}/p2p-circuit/webrtc/p2p/peer-a`);
  });

  it("runs once on start and repeats on the configured interval", async () => {
    jest.useFakeTimers();
    const transport = createTransport();
    const manager = createPairedPeerConnectionManager({
      transport,
      getPairedPeers: async () => [{ deviceId: "peer-1" }],
      intervalMs: 1000,
    });

    manager.start();
    await flushPromises();
    expect(transport.connect).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(transport.connect).toHaveBeenCalledTimes(2);

    manager.stop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(transport.connect).toHaveBeenCalledTimes(2);
  });

  it("shutdown waits for an active reconnect pass and cancels alternate dials", async () => {
    const transport = createTransport();
    let releaseDial!: () => void;
    let markDialStarted!: () => void;
    const dialStarted = new Promise<void>((resolve) => { markDialStarted = resolve; });
    const dialGate = new Promise<void>((resolve) => { releaseDial = resolve; });
    transport.connect.mockImplementationOnce(async () => {
      markDialStarted();
      await dialGate;
      throw new Error("transport_stopped");
    });
    const manager = createPairedPeerConnectionManager({
      transport,
      getPairedPeers: async () => [{
        deviceId: "peer-1",
        multiaddrs: ["/ip4/127.0.0.1/tcp/1/p2p/peer-1", "/ip4/127.0.0.1/tcp/2/p2p/peer-1"],
      }],
    });
    manager.start();
    await dialStarted;
    let stopped = false;
    const stopping = Promise.resolve(manager.stop()).then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    releaseDial();
    await stopping;
    expect(transport.connect).toHaveBeenCalledTimes(1);
  });
});
