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

function harness(addresses: string[] = [], retryMs = 15_000) {
  let selfAddresses = addresses;
  let signedRecord: Uint8Array = Uint8Array.of(1, 2, 3);
  const listeners: any[] = [];
  const connections: any[] = [];
  const events = new Map<string, Set<(event: any) => void>>();
  const reservationEvents = new Map<string, Set<(event: any) => void>>();
  const merge = jest.fn<Promise<void>, any[]>(async () => undefined);
  const reservationStore = {
    addEventListener: (name: string, handler: (event: any) => void) => {
      const handlers = reservationEvents.get(name) ?? new Set();
      handlers.add(handler);
      reservationEvents.set(name, handlers);
    },
    removeEventListener: (name: string, handler: (event: any) => void) => {
      reservationEvents.get(name)?.delete(handler);
    },
  };
  const node = {
    peerId: { toString: () => "device" },
    addEventListener: (name: string, handler: (event: any) => void) => {
      const handlers = events.get(name) ?? new Set();
      handlers.add(handler);
      events.set(name, handlers);
    },
    removeEventListener: (name: string, handler: (event: any) => void) => {
      events.get(name)?.delete(handler);
    },
    peerStore: { merge },
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
        getTransports: () => [
          {
            [Symbol.toStringTag]: "@libp2p/circuit-relay-v2-transport",
            reservationStore,
          },
        ],
      },
    },
  };
  const lifecycle = new RelayLifecycle(
    { rendezvousIntervalMs: 60_000, relayReservationRetryMs: retryMs },
    () => selfAddresses,
    async () => signedRecord,
    () => undefined,
  );
  return {
    node,
    lifecycle,
    connections,
    listeners,
    merge,
    dispatch: (name: string, detail: any) => {
      for (const handler of events.get(name) ?? []) handler({ detail });
    },
    emitReservation: (detail: any) => {
      for (const handler of reservationEvents.get(
        "relay:created-reservation",
      ) ?? [])
        handler({ detail });
    },
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

  it("tracks a post-listen relay reconnect and clears its keep-alive tag before shutdown", async () => {
    const relayDns = "/dns4/relay.example/tcp/9999/ws/p2p/relay-a";
    const { node, lifecycle, connections, dispatch, merge } = harness();
    await lifecycle.start(node, [relayDns]);
    const original = connections[0];
    const replacement = connection(
      "/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a",
      "relay-a",
    );
    const direct = connection(relayDns, "relay-a");
    connections.splice(0, 1);
    dispatch("connection:close", original);
    connections.push(replacement, direct);
    dispatch("connection:open", replacement);

    await lifecycle.stop();

    expect(merge).toHaveBeenCalledWith(original.remotePeer, {
      tags: { "keep-alive-circuit-relay": undefined },
    });
    expect(merge.mock.invocationCallOrder[0]).toBeLessThan(
      replacement.close.mock.invocationCallOrder[0],
    );
    expect(replacement.close).toHaveBeenCalledTimes(1);
    expect(direct.close).not.toHaveBeenCalled();
  });

  it("does not claim a new direct path while another direct path keeps the relay peer connected", async () => {
    const { node, lifecycle, connections, dispatch } = harness();
    await lifecycle.start(node, [relayA]);
    const original = connections[0];
    const direct = connection(relayA, "relay-a");
    const newerDirect = connection(relayA, "relay-a");
    connections.splice(0, 1, direct);
    dispatch("connection:close", original);
    connections.push(newerDirect);
    dispatch("connection:open", newerDirect);

    await lifecycle.stop();

    expect(direct.close).not.toHaveBeenCalled();
    expect(newerDirect.close).not.toHaveBeenCalled();
  });

  it("removes the relay keep-alive tag before closing so the host does not redial", async () => {
    const { node, lifecycle, connections, dispatch, merge } = harness();
    const tags = new Set(["keep-alive-circuit-relay"]);
    merge.mockImplementation(async (_peer: any, update: any) => {
      for (const [tag, value] of Object.entries(update.tags)) {
        if (value === undefined) tags.delete(tag);
      }
    });
    node.addEventListener("peer:disconnect", () => {
      if (tags.has("keep-alive-circuit-relay")) void node.dial(relayA);
    });
    await lifecycle.start(node, [relayA]);
    connections[0].close.mockImplementation(async () => {
      dispatch("peer:disconnect", connections[0].remotePeer);
    });

    await lifecycle.stop();

    expect(tags.has("keep-alive-circuit-relay")).toBe(false);
    expect(node.dial).toHaveBeenCalledTimes(1);
  });

  it("closes a DNS relay listener whose announced address resolves to IP", async () => {
    const relayDns = "/dns4/relay.example/tcp/9999/ws/p2p/relay-a";
    const { node, lifecycle, listeners } = harness();
    const listener = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => ["/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a/p2p-circuit"],
      close: jest.fn(async () => undefined),
    };
    listeners.push(listener);
    await lifecycle.start(node, [relayDns]);

    await lifecycle.stop();

    expect(listener.close).toHaveBeenCalledTimes(1);
  });

  it("retries one failed listener without canceling the other relay's reservation", async () => {
    const { node, lifecycle, listeners, setSelfAddresses } = harness([], 10);
    const cancelReservations = jest.fn();
    let finishRetry!: () => void;
    const retried = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    const listenerA = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayA}/p2p-circuit`],
      close: jest.fn(async () => cancelReservations()),
    };
    let relayBAvailable = false;
    const listenerB = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => (relayBAvailable ? [`${relayB}/p2p-circuit`] : []),
      listen: jest.fn(async () => {
        relayBAvailable = true;
        setSelfAddresses([
          `${relayA}/p2p-circuit/p2p/device`,
          `${relayB}/p2p-circuit/p2p/device`,
        ]);
        finishRetry();
      }),
      close: jest.fn(async () => cancelReservations()),
    };
    node.components.transportManager.listen.mockImplementationOnce(async () => {
      listeners.push(listenerA, listenerB);
      setSelfAddresses([`${relayA}/p2p-circuit/p2p/device`]);
    });

    await lifecycle.start(node, [relayA, relayB]);
    await retried;

    expect(node.components.transportManager.listen).toHaveBeenCalledTimes(1);
    expect(listenerB.listen).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(2);
    expect(listenerA.close).not.toHaveBeenCalled();
    expect(cancelReservations).not.toHaveBeenCalled();

    await lifecycle.stop();
    expect(listenerA.close).toHaveBeenCalledTimes(1);
    expect(listenerB.close).toHaveBeenCalledTimes(1);
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

  it("closes a DNS relay connection reopened by reservation listening after loss", async () => {
    const relayDns = "/dns4/relay.example/tcp/9999/ws/p2p/relay-a";
    const { node, lifecycle, connections, emitReservation } = harness();
    const reopened = {
      ...connection("/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a", "relay-a"),
      id: "reservation-connection",
    };
    (node.components as any).connectionManager = {
      openConnection: jest.fn(async () => {
        connections.push(reopened);
        return reopened;
      }),
    };
    node.components.transportManager.listen.mockImplementation(async () => {
      await (node.components as any).connectionManager.openConnection(relayDns);
      emitReservation({
        relay: reopened.remotePeer,
        details: { type: "configured", connection: reopened.id },
      });
    });

    await lifecycle.start(node, [relayDns]);
    const initial = connections[0];
    connections.splice(0, 1);
    await lifecycle.stop();

    expect(initial.close).toHaveBeenCalledTimes(1);
    expect(reopened.close).toHaveBeenCalledTimes(1);
  });

  it("keeps an existing direct connection reused at the configured relay address", async () => {
    const { node, lifecycle, connections } = harness([
      `${relayA}/p2p-circuit/p2p/device`,
    ]);
    const direct = connection(relayA, "relay-a");
    connections.push(direct);
    node.dial.mockResolvedValueOnce(direct);

    await lifecycle.start(node, [relayA]);
    await lifecycle.stop();

    expect(direct.close).not.toHaveBeenCalled();
  });

  it("does not claim a direct connection reused by the reservation store", async () => {
    const { node, lifecycle, connections, emitReservation } = harness();
    const direct = {
      ...connection(relayA, "relay-a"),
      id: "direct-connection",
    };
    connections.push(direct);
    node.dial.mockResolvedValueOnce(direct);
    node.components.transportManager.listen.mockImplementation(async () => {
      emitReservation({
        relay: direct.remotePeer,
        details: { type: "configured", connection: direct.id },
      });
    });

    await lifecycle.start(node, [relayA]);
    await lifecycle.stop();

    expect(direct.close).not.toHaveBeenCalled();
  });
});
