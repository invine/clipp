jest.mock(
  "@multiformats/multiaddr",
  () => ({
    multiaddr: (address: string) => ({ toString: () => address }),
  }),
  { virtual: true }
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
    () => undefined
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
        "relay:created-reservation"
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
      "relay-a"
    );
    connections.push(directConnection);

    await lifecycle.stop();

    expect(relayConnection.close).toHaveBeenCalledTimes(1);
    expect(directConnection.close).not.toHaveBeenCalled();
  });

  it("leaves an ambiguous post-listen connection open but removes relay work", async () => {
    const relayDns = "/dns4/relay.example/tcp/9999/ws/p2p/relay-a";
    const {
      node,
      lifecycle,
      connections,
      dispatch,
      merge,
      listeners,
      setSelfAddresses,
    } = harness([`${relayDns}/p2p-circuit/p2p/device`]);
    const tags = new Set(["keep-alive-circuit-relay"]);
    merge.mockImplementation(async (_peer: any, update: any) => {
      for (const [tag, value] of Object.entries(update.tags)) {
        if (value === undefined) tags.delete(tag);
      }
    });
    const cancelReservations = jest.fn();
    const listener = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [`${relayDns}/p2p-circuit`],
      close: jest.fn(async () => {
        cancelReservations();
        setSelfAddresses([]);
      }),
    };
    listeners.push(listener);
    await lifecycle.start(node, [relayDns]);
    await new Promise((resolve) => setImmediate(resolve));
    const original = connections[0];
    const replacement = connection(
      "/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a",
      "relay-a"
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
    expect(tags.has("keep-alive-circuit-relay")).toBe(false);
    expect(cancelReservations).toHaveBeenCalledTimes(1);
    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledWith(
      node,
      relayDns,
      "clipp",
      expect.any(Object)
    );
    expect(replacement.close).not.toHaveBeenCalled();
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

  it("does not claim a new direct path after the last relay connection is lost", async () => {
    const { node, lifecycle, connections, dispatch } = harness();
    await lifecycle.start(node, [relayA]);
    const original = connections[0];
    const direct = connection("/ip4/192.0.2.1/tcp/9000/p2p/relay-a", "relay-a");
    connections.splice(0, 1);
    dispatch("connection:close", original);
    connections.push(direct);
    dispatch("connection:open", direct);

    await lifecycle.stop();

    expect(direct.close).not.toHaveBeenCalled();
  });

  it("does not claim a same-address direct dial after the last relay connection is lost", async () => {
    const { node, lifecycle, connections, dispatch } = harness();
    await lifecycle.start(node, [relayA]);
    const original = connections[0];
    const direct = connection(relayA, "relay-a");
    connections.splice(0, 1);
    dispatch("connection:close", original);
    connections.push(direct);
    dispatch("connection:open", direct);

    await lifecycle.stop();

    expect(direct.close).not.toHaveBeenCalled();
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

  it("closes owned relay connections when keep-alive tag removal fails", async () => {
    const { node, lifecycle, connections, merge } = harness();
    await lifecycle.start(node, [relayA, relayB]);
    merge.mockRejectedValueOnce(new Error("peer store unavailable"));

    await expect(lifecycle.stop()).resolves.toBeUndefined();

    expect(merge).toHaveBeenCalledTimes(2);
    expect(connections[0].close).toHaveBeenCalledTimes(1);
    expect(connections[1].close).toHaveBeenCalledTimes(1);
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
      "relay-a"
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
    const {
      node,
      lifecycle,
      connections,
      listeners,
      emitReservation,
      setSelfAddresses,
    } = harness([], 10);
    const reopened = {
      ...connection("/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a", "relay-a"),
      id: "reservation-connection",
    };
    let finishRetry!: () => void;
    const retried = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    let available = false;
    const listener = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () =>
        available
          ? ["/ip4/198.51.100.7/tcp/9999/ws/p2p/relay-a/p2p-circuit"]
          : [],
      listen: jest.fn(async () => {
        connections.push(reopened);
        available = true;
        setSelfAddresses([`${relayDns}/p2p-circuit/p2p/device`]);
        emitReservation({
          relay: reopened.remotePeer,
          details: { type: "configured", connection: reopened.id },
        });
        finishRetry();
      }),
      close: jest.fn(async () => undefined),
    };
    node.components.transportManager.listen.mockImplementationOnce(async () => {
      listeners.push(listener);
    });

    await lifecycle.start(node, [relayDns]);
    const initial = connections[0];
    connections.splice(0, 1);
    await retried;
    await new Promise((resolve) => setImmediate(resolve));
    await lifecycle.stop();

    expect(node.components.transportManager.listen).toHaveBeenCalledTimes(1);
    expect(listener.listen).toHaveBeenCalledTimes(1);
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

  it("releases closed owned connections across repeated reservation retries", async () => {
    const {
      node,
      lifecycle,
      connections,
      listeners,
      emitReservation,
      dispatch,
    } = harness([], 10);
    const replacements: Array<ReturnType<typeof connection> & { id: string }> =
      [];
    let finishThirdRetry!: () => void;
    const threeRetries = new Promise<void>((resolve) => {
      finishThirdRetry = resolve;
    });
    const listener = {
      constructor: { name: "CircuitRelayTransportListener" },
      getAddrs: () => [],
      listen: jest.fn(async () => {
        const previous = connections.pop();
        await previous.close();
        dispatch("connection:close", previous);
        const next = {
          ...connection(relayA, "relay-a"),
          id: `retry-${replacements.length}`,
        };
        connections.push(next);
        replacements.push(next);
        emitReservation({
          relay: next.remotePeer,
          details: { type: "configured", connection: next.id },
        });
        if (replacements.length === 3) finishThirdRetry();
      }),
      close: jest.fn(async () => undefined),
    };
    node.components.transportManager.listen.mockImplementationOnce(async () => {
      listeners.push(listener);
    });

    await lifecycle.start(node, [relayA]);
    const initial = connections[0];
    await threeRetries;
    await new Promise((resolve) => setImmediate(resolve));

    expect((lifecycle as any).ownedConnections.get(relayA)?.size).toBe(1);
    await lifecycle.stop();
    expect(initial.close).toHaveBeenCalledTimes(1);
    for (const closed of replacements.slice(0, -1)) {
      expect(closed.close).toHaveBeenCalledTimes(1);
    }
    expect(replacements[2].close).toHaveBeenCalledTimes(1);
  });
});
