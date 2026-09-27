jest.mock(
  "@multiformats/multiaddr",
  () => ({
    multiaddr: (address: string) => ({ toString: () => address }),
  }),
  { virtual: true },
);

const register = jest.fn<Promise<boolean>, any[]>(async () => true);
const unregister = jest.fn<Promise<boolean>, any[]>(async () => true);
jest.mock("../../../packages/core/network/rendezvous", () => ({
  registerOnRendezvous: register,
  unregisterFromRendezvous: unregister,
  lookupRendezvousPeer: jest.fn(async () => []),
}));

import { RelayLifecycle } from "../../../packages/core/network/relayLifecycle";

const relayA = "/ip4/127.0.0.1/tcp/9999/ws/p2p/relay-a";
const relayB = "/ip4/127.0.0.1/tcp/9998/ws/p2p/relay-b";

function connection(address: string, peerId: string) {
  return {
    remoteAddr: { toString: () => address },
    remotePeer: { toString: () => peerId },
    close: jest.fn(async () => undefined),
  };
}

function harness(addresses: string[] = []) {
  let selfAddresses = addresses;
  const listeners: any[] = [];
  const connections: any[] = [];
  const node = {
    peerId: { toString: () => "device" },
    dial: jest.fn(async (target: any) => {
      const address = String(target);
      const peerId = address.split("/p2p/").pop() ?? "";
      const result = connection(address, peerId);
      connections.push(result);
      return result;
    }),
    getConnections: () => connections,
    components: {
      transportManager: {
        listen: jest.fn<Promise<void>, any[]>(async () => undefined),
        getListeners: () => listeners,
      },
    },
  };
  const lifecycle = new RelayLifecycle(
    { rendezvousIntervalMs: 60_000 },
    () => selfAddresses,
    async () => Uint8Array.of(1, 2, 3),
    () => undefined,
  );
  return {
    node,
    lifecycle,
    connections,
    listeners,
    setSelfAddresses: (addresses: string[]) => {
      selfAddresses = addresses;
    },
  };
}

describe("RelayLifecycle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps an unchanged relay connected and registered while adding another", async () => {
    const { node, lifecycle, connections, setSelfAddresses } = harness([
      `${relayA}/p2p-circuit/p2p/device`,
    ]);
    await lifecycle.start(node, [relayA]);
    await new Promise((resolve) => setImmediate(resolve));
    const existing = connections[0];
    setSelfAddresses([
      `${relayA}/p2p-circuit/p2p/device`,
      `${relayB}/p2p-circuit/p2p/device`,
    ]);

    await lifecycle.reconfigure(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(existing.close).not.toHaveBeenCalled();
    expect(
      node.dial.mock.calls.map(([address]: any[]) => String(address)),
    ).toEqual([relayA, relayB]);
    expect(register.mock.calls.map(([, relay]: any[]) => relay)).toEqual([
      relayA,
      relayB,
    ]);
    expect(unregister).not.toHaveBeenCalled();
    await lifecycle.stop();
  });

  it("preserves a direct connection to the configured relay Peer ID", async () => {
    const { node, lifecycle, connections } = harness();
    await lifecycle.start(node, [relayA]);
    const relayConnection = connections[0];
    const directConnection = connection(
      "/ip4/192.0.2.1/tcp/9000/p2p/relay-a",
      "relay-a",
    );
    connections.push(directConnection);

    await lifecycle.stop();

    expect(relayConnection.close).toHaveBeenCalledTimes(1);
    expect(directConnection.close).not.toHaveBeenCalled();
  });

  it("removes one relay without tearing down the remaining relay", async () => {
    const { node, lifecycle, connections, listeners } = harness([
      `${relayA}/p2p-circuit/p2p/device`,
      `${relayB}/p2p-circuit/p2p/device`,
    ]);
    const listenerA = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayA}/p2p-circuit`],
      close: jest.fn(async () => undefined),
    };
    const listenerB = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayB}/p2p-circuit`],
      close: jest.fn(async () => undefined),
    };
    listeners.push(listenerA, listenerB);
    await lifecycle.start(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));
    const [connectionA, connectionB] = connections;
    unregister.mockClear();

    await lifecycle.reconfigure(node, [relayA]);

    expect(connectionA.close).not.toHaveBeenCalled();
    expect(connectionB.close).toHaveBeenCalledTimes(1);
    expect(listenerA.close).not.toHaveBeenCalled();
    expect(listenerB.close).toHaveBeenCalledTimes(1);
    expect(unregister.mock.calls.map(([, relay]: any[]) => relay)).toEqual([
      relayB,
    ]);
    await lifecycle.stop();
  });

  it("does not close a new listener when an old reservation attempt finishes late", async () => {
    const { node, lifecycle, listeners } = harness();
    let finishOldListen!: () => void;
    const oldListener = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayA}/p2p-circuit`],
      close: jest.fn(async () => undefined),
    };
    const newListener = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayA}/p2p-circuit`],
      close: jest.fn(async () => undefined),
    };
    node.components.transportManager.listen
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishOldListen = () => {
              listeners.push(oldListener);
              resolve();
            };
          }),
      )
      .mockImplementationOnce(async () => {
        listeners.push(newListener);
      });

    const starting = lifecycle.start(node, [relayA]);
    await new Promise((resolve) => setImmediate(resolve));
    const reconfiguring = lifecycle.reconfigure(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));
    finishOldListen();
    await starting;
    await reconfiguring;

    expect(newListener.close).not.toHaveBeenCalled();
    await lifecycle.stop();
  });
});
