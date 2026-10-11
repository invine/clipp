import { createRuntimeUiRecovery } from "../../../packages/core/runtime/uiRecovery";
import { startIdentityBoundRuntimeServices } from "../../../packages/core/runtime/identityInitialization";

it("keeps cold identity failure visible until real Retry starts services and reads ready state", async () => {
  let writable = false;
  const local = jest.fn(),
    network = jest.fn();
  const initialize = async () =>
    startIdentityBoundRuntimeServices({
      initializeIdentity: async () => {
        if (!writable) throw new Error("disk");
      },
      startLocalServices: local,
      startNetworkServices: network,
    });
  const states: unknown[] = [],
    recovery: unknown[] = [];
  const owner = createRuntimeUiRecovery({
    load: async () => {
      await initialize();
      return { identity: { deviceId: "durable" } };
    },
    initializationError: async () =>
      writable ? null : { code: "identity_initialization_failed" },
    onState: (state) => states.push(state),
    onRecovery: (value) => recovery.push(value),
  });
  expect(await owner.load()).toBe(false);
  expect(local).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect(recovery.at(-1)).toMatchObject({
    loading: false,
    initializationError: true,
    unavailable: true,
  });
  expect(await owner.load()).toBe(false);
  writable = true;
  expect(await owner.load()).toBe(true);
  expect(states).toEqual([{ identity: { deviceId: "durable" } }]);
  expect(local).toHaveBeenCalledTimes(1);
  expect(network).toHaveBeenCalledTimes(1);
  expect(recovery.at(-1)).toMatchObject({
    loading: false,
    initializationError: false,
    unavailable: false,
  });
});
it("late bootstrap or initialization probe cannot retire newer live authority or recover after document destruction", async () => {
  let reject!: (error: Error) => void;
  let probe!: (value: { code: string }) => void;
  const states: unknown[] = [],
    recovery: unknown[] = [];
  const owner = createRuntimeUiRecovery({
    load: () =>
      new Promise<{ identity: unknown }>((_, fail) => {
        reject = fail;
      }),
    initializationError: () =>
      new Promise((resolve) => {
        probe = resolve;
      }),
    onState: (state) => states.push(state),
    onRecovery: (value) => recovery.push(value),
  });
  const pending = owner.load();
  reject(new Error("load"));
  await Promise.resolve();
  owner.live({ identity: { deviceId: "ready" } });
  probe({ code: "identity_initialization_failed" });
  await pending;
  expect(states).toEqual([{ identity: { deviceId: "ready" } }]);
  expect(recovery.at(-1)).toMatchObject({
    initializationError: false,
    unavailable: false,
  });
  owner.cancel();
  owner.live({ identity: { deviceId: "retired" } });
  expect(states).toHaveLength(1);
});
it("orders Pairing publications and retires previous runtime sessions at the actual document consumer", async () => {
  type State = {
    pairingState: { sessionId: string; revision: number };
    response: string;
  };
  const states: State[] = [];
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({
      pairingState: { sessionId: "old", revision: 1 },
      response: "waiting",
    }),
    initializationError: async () => null,
    version: (state) => state.pairingState,
    onState: (state) => states.push(state),
    onRecovery: () => {},
  });
  await owner.load();
  owner.live({
    pairingState: { sessionId: "old", revision: 3 },
    response: "accepted",
  });
  owner.live({
    pairingState: { sessionId: "old", revision: 2 },
    response: "rejected",
  });
  owner.live({
    pairingState: { sessionId: "new", revision: 0 },
    response: "fresh identity",
  });
  owner.live({
    pairingState: { sessionId: "old", revision: 4 },
    response: "accepted old identity",
  });
  expect(states.map((state) => state.response)).toEqual([
    "waiting",
    "accepted",
    "fresh identity",
  ]);
});
