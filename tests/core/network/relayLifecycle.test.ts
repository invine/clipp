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
  let signedRecord: Uint8Array = Uint8Array.of(1, 2, 3);
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
    async () => signedRecord,
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
    setSignedRecord: (record: Uint8Array) => {
      signedRecord = record;
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

  it("keeps a relay newly re-added while an earlier removal is waiting to unregister", async () => {
    const { node, lifecycle, connections, listeners, setSelfAddresses } =
      harness([
        `${relayA}/p2p-circuit/p2p/device`,
        `${relayB}/p2p-circuit/p2p/device`,
      ]);
    await lifecycle.start(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));
    let finishUnregister!: () => void;
    unregister.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishUnregister = () => resolve(true);
        }),
    );
    const listenerB = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayB}/p2p-circuit`],
      close: jest.fn(async () => {
        setSelfAddresses([`${relayA}/p2p-circuit/p2p/device`]);
      }),
    };
    const newListenerB = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayB}/p2p-circuit`],
      close: jest.fn(async () => undefined),
    };
    listeners.push(listenerB);
    node.components.transportManager.listen.mockImplementation(async () => {
      listeners.push(newListenerB);
      setSelfAddresses([
        `${relayA}/p2p-circuit/p2p/device`,
        `${relayB}/p2p-circuit/p2p/device`,
      ]);
    });

    const removing = lifecycle.reconfigure(node, [relayA]);
    await new Promise((resolve) => setImmediate(resolve));
    const readding = lifecycle.reconfigure(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));
    finishUnregister();
    await Promise.all([removing, readding]);

    expect(connections[connections.length - 1]?.close).not.toHaveBeenCalled();
    expect(listenerB.close).toHaveBeenCalledTimes(1);
    expect(newListenerB.close).not.toHaveBeenCalled();
    await lifecycle.stop();
  });

  it("cleans a pending removed relay when shutdown interrupts reconfiguration", async () => {
    const { node, lifecycle, connections } = harness([
      `${relayA}/p2p-circuit/p2p/device`,
      `${relayB}/p2p-circuit/p2p/device`,
    ]);
    await lifecycle.start(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));
    let finishUnregister!: () => void;
    unregister.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishUnregister = () => resolve(true);
        }),
    );

    const removing = lifecycle.reconfigure(node, [relayA]);
    await new Promise((resolve) => setImmediate(resolve));
    await lifecycle.stop();
    finishUnregister();
    await removing;

    expect(connections[1].close).toHaveBeenCalledTimes(1);
  });

  it("keeps an unchanged listener when an old reservation attempt finishes late", async () => {
    const { node, lifecycle, listeners } = harness();
    const listenerA = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayA}/p2p-circuit`],
      close: jest.fn(async () => undefined),
    };
    listeners.push(listenerA);
    let finishListen!: () => void;
    node.components.transportManager.listen.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishListen = resolve;
        }),
    );

    const starting = lifecycle.start(node, [relayA]);
    await new Promise((resolve) => setImmediate(resolve));
    const reconfiguring = lifecycle.reconfigure(node, [relayA, relayB]);
    finishListen();
    await Promise.all([starting, reconfiguring]);

    expect(listenerA.close).not.toHaveBeenCalled();
    await lifecycle.stop();
  });

  it("closes a newly dialed DNS relay at its resolved IP while keeping another direct path", async () => {
    const relayDns = "/dns4/relay.example/tcp/9999/ws/p2p/relay-a";
    const { node, lifecycle, connections } = harness();
    const resolved = connection(
      "/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a",
      "relay-a",
    );
    node.dial.mockImplementationOnce(async () => {
      connections.push(resolved);
      return resolved;
    });
    await lifecycle.start(node, [relayDns]);
    const direct = connection("/ip4/192.0.2.1/tcp/9000/p2p/relay-a", "relay-a");
    connections.push(direct);

    await lifecycle.stop();

    expect(resolved.close).toHaveBeenCalledTimes(1);
    expect(direct.close).not.toHaveBeenCalled();
  });

  it("does not take ownership when dial returns an existing direct connection", async () => {
    const relayDns = "/dns4/relay.example/tcp/9999/ws/p2p/relay-a";
    const { node, lifecycle, connections } = harness();
    const existing = {
      ...connection("/ip4/192.0.2.1/tcp/9000/p2p/relay-a", "relay-a"),
      id: "existing-direct",
    };
    const returned = { ...existing, close: jest.fn(async () => undefined) };
    connections.push(existing);
    node.dial.mockResolvedValueOnce(returned);

    await lifecycle.start(node, [relayDns]);
    await lifecycle.stop();

    expect(returned.close).not.toHaveBeenCalled();
    expect(existing.close).not.toHaveBeenCalled();
  });

  it("refreshes retained Rendezvous records after a new relay changes self addresses", async () => {
    const { node, lifecycle, setSelfAddresses, setSignedRecord } = harness([
      `${relayA}/p2p-circuit/p2p/device`,
    ]);
    await lifecycle.start(node, [relayA]);
    await new Promise((resolve) => setImmediate(resolve));
    register.mockClear();
    setSelfAddresses([
      `${relayA}/p2p-circuit/p2p/device`,
      `${relayB}/p2p-circuit/p2p/device`,
    ]);
    setSignedRecord(Uint8Array.of(4, 5, 6));

    await lifecycle.reconfigure(node, [relayA, relayB]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(
      register.mock.calls.map(([, relay, , record]: any[]) => ({
        relay,
        record,
      })),
    ).toEqual([
      { relay: relayA, record: Uint8Array.of(4, 5, 6) },
      { relay: relayB, record: Uint8Array.of(4, 5, 6) },
    ]);
    await lifecycle.stop();
  });
});
