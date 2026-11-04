import { createAndroidRuntimeUiOwner } from "../../apps/android/src/uiRuntimeAdapter";

describe("Android runtime UI owner", () => {
  it("loads after startup and retires its subscription when stopped", async () => {
    let publish!: (state: {
      pairingState: { sessionId: string; revision: number };
    }) => void;
    const observed: number[] = [];
    const runtime = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const client = {
      getState: jest.fn(async () => ({
        pairingState: { sessionId: "owner-a", revision: 1 },
      })),
      getInitializationError: jest.fn(async () => null),
      getRuntimeAuthority: jest.fn(async () => "owner-a"),
      onUpdate: jest.fn(
        (
          listener: (state: {
            pairingState: { sessionId: string; revision: number };
          }) => void
        ) => {
          publish = listener;
          return jest.fn();
        }
      ),
    };
    const owner = createAndroidRuntimeUiOwner(runtime, client, (state) => {
      observed.push(state.pairingState!.revision);
    });

    const started = owner.start();
    const replayed = owner.start();
    expect(runtime.start).toHaveBeenCalledTimes(1);
    await Promise.all([started, replayed]);
    expect(client.getState).toHaveBeenCalledTimes(1);

    expect(observed).toEqual([1]);
    publish({ pairingState: { sessionId: "owner-a", revision: 2 } });
    await Promise.resolve();
    expect(observed).toEqual([1, 2]);
    await owner.stop();
    publish({ pairingState: { sessionId: "owner-a", revision: 3 } });
    expect(observed).toEqual([1, 2]);
    expect(runtime.stop).toHaveBeenCalledTimes(1);
  });

  it("does not publish a read that resolves after its runtime owner stops", async () => {
    let resolveRead!: (state: {
      pairingState: { sessionId: string; revision: number };
    }) => void;
    const observed: number[] = [];
    const runtime = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const client = {
      getState: jest.fn(
        () =>
          new Promise<{
            pairingState: { sessionId: string; revision: number };
          }>((resolve) => (resolveRead = resolve))
      ),
      getInitializationError: jest.fn(async () => null),
      getRuntimeAuthority: jest.fn(async () => "owner-a"),
      onUpdate: jest.fn(() => jest.fn()),
    };
    const owner = createAndroidRuntimeUiOwner(runtime, client, (state) => {
      observed.push(state.pairingState!.revision);
    });

    const started = owner.start();
    await Promise.resolve();
    await owner.stop();
    resolveRead({ pairingState: { sessionId: "owner-a", revision: 1 } });
    await started;

    expect(observed).toEqual([]);
    expect(runtime.stop).toHaveBeenCalledTimes(1);
  });

  it("preserves unknown, disconnected, direct, and relayed connection observations", async () => {
    type Observation = {
      pairingState: { sessionId: string; revision: number };
      connectionStateKnown?: boolean;
      peers: string[];
      peerConnections: string[];
      relayConnections: string[];
    };
    let publish!: (state: Observation) => void;
    const projected: Observation[] = [];
    const client = {
      getState: jest.fn(async () => ({
        pairingState: { sessionId: "owner-a", revision: 1 },
        peers: [],
        peerConnections: [],
        relayConnections: [],
      })),
      getInitializationError: jest.fn(async () => null),
      getRuntimeAuthority: jest.fn(async () => "owner-a"),
      onUpdate: jest.fn((listener: (state: Observation) => void) => {
        publish = listener;
        return jest.fn();
      }),
    };
    const runtime = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const owner = createAndroidRuntimeUiOwner<Observation>(
      runtime,
      client,
      (state) => projected.push(state)
    );
    await owner.start();

    const observations: Observation[] = [
      {
        pairingState: { sessionId: "owner-a", revision: 2 },
        peers: [],
        peerConnections: [],
        relayConnections: [],
      },
      {
        pairingState: { sessionId: "owner-a", revision: 3 },
        connectionStateKnown: true,
        peers: [],
        peerConnections: [],
        relayConnections: [],
      },
      {
        pairingState: { sessionId: "owner-a", revision: 4 },
        connectionStateKnown: true,
        peers: ["direct-peer"],
        peerConnections: ["direct"],
        relayConnections: [],
      },
      {
        pairingState: { sessionId: "owner-a", revision: 5 },
        connectionStateKnown: true,
        peers: ["relayed-peer"],
        peerConnections: [],
        relayConnections: ["relayed"],
      },
    ];
    for (const observation of observations) {
      publish(observation);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(projected.slice(1)).toEqual(observations);
    await owner.stop();
  });
});
