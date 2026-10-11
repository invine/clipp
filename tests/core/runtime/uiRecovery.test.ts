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
  let currentSession = "old";
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({
      pairingState: { sessionId: "old", revision: 1 },
      response: "waiting",
    }),
    initializationError: async () => null,
    version: (state) => state.pairingState,
    authority: async () => currentSession,
    onState: (state) => states.push(state),
    onRecovery: () => {},
  });
  await owner.load();
  await owner.live({
    pairingState: { sessionId: "old", revision: 3 },
    response: "accepted",
  });
  await owner.live({
    pairingState: { sessionId: "old", revision: 2 },
    response: "rejected",
  });
  currentSession = "new";
  await owner.live({
    pairingState: { sessionId: "new", revision: 0 },
    response: "fresh identity",
  });
  await owner.live({
    pairingState: { sessionId: "old", revision: 4 },
    response: "accepted old identity",
  });
  expect(states.map((state) => state.response)).toEqual([
    "waiting",
    "accepted",
    "fresh identity",
  ]);
});
it("an unseen late old session cannot retire the authority established by the current adapter handshake", async () => {
  type State = {
    pairingState: { sessionId: string; revision: number };
    response: string;
  };
  const states: State[] = [];
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({
      pairingState: { sessionId: "new", revision: 0 },
      response: "current",
    }),
    initializationError: async () => null,
    version: (state) => state.pairingState,
    authority: async () => "new",
    onState: (state) => states.push(state),
    onRecovery: () => {},
  });
  await owner.live({
    pairingState: { sessionId: "new", revision: 0 },
    response: "current",
  });
  await owner.live({
    pairingState: { sessionId: "unseen-old", revision: 99 },
    response: "retired acceptance",
  });
  await owner.live({
    pairingState: { sessionId: "new", revision: 1 },
    response: "current rejection",
  });
  expect(states.map((state) => state.response)).toEqual([
    "current",
    "current rejection",
  ]);
});
it("late old handshake replies cannot switch a reconnected adapter back, while current publications continue", async () => {
  type State = { sessionId: string; revision: number; response: string };
  const pending: Array<(session: string) => void> = [],
    states: State[] = [];
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({ sessionId: "new", revision: 0, response: "new" }),
    initializationError: async () => null,
    version: (state) => state,
    authority: () => new Promise((resolve) => pending.push(resolve)),
    onState: (state) => states.push(state),
    onRecovery: () => {},
  });
  const old = owner.live({
    sessionId: "old-unseen",
    revision: 99,
    response: "old",
  });
  const current = owner.live({
    sessionId: "new",
    revision: 0,
    response: "new",
  });
  pending[1]("new");
  await current;
  pending[0]("old-unseen");
  await old;
  await owner.live({ sessionId: "new", revision: 1, response: "accepted" });
  expect(states.map((state) => state.response)).toEqual(["new", "accepted"]);
});
it("an unknown old publication does not starve a valid current publication whose handshake is still pending", async () => {
  type State = { sessionId: string; revision: number };
  const pending: Array<(session: string) => void> = [],
    states: State[] = [];
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({ sessionId: "new", revision: 0 }),
    initializationError: async () => null,
    version: (state) => state,
    authority: () => new Promise((resolve) => pending.push(resolve)),
    onState: (state) => states.push(state),
    onRecovery: () => {},
  });
  const current = owner.live({ sessionId: "new", revision: 0 });
  const old = owner.live({ sessionId: "unknown-old", revision: 99 });
  pending[1]("new");
  await old;
  pending[0]("new");
  await current;
  expect(states).toEqual([{ sessionId: "new", revision: 0 }]);
});
it("a failed authority handshake retains prior state and reports recoverable runtime unavailability", async () => {
  type State = { sessionId: string; revision: number };
  const states: State[] = [],
    recovery: unknown[] = [];
  let fail = false;
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({ sessionId: "current", revision: 0 }),
    initializationError: async () => null,
    version: (state) => state,
    authority: async () => {
      if (fail) throw Error("connection lost");
      return "current";
    },
    onState: (state) => states.push(state),
    onRecovery: (state) => recovery.push(state),
  });
  await owner.load();
  fail = true;
  await owner.live({ sessionId: "unknown", revision: 99 });
  expect(states).toEqual([{ sessionId: "current", revision: 0 }]);
  expect(recovery.at(-1)).toMatchObject({ unavailable: true });
  owner.cancel();
  fail = false;
  await owner.live({ sessionId: "new", revision: 0 });
  expect(states).toHaveLength(1);
});
it("a failed handshake from an older connection cannot hide a later ready current session", async () => {
  type State = { sessionId: string; revision: number };
  let rejectOld!: (error: Error) => void,
    confirmNew!: (session: string) => void;
  let calls = 0;
  const recovery: unknown[] = [];
  const owner = createRuntimeUiRecovery<State>({
    load: async () => ({ sessionId: "new", revision: 0 }),
    initializationError: async () => null,
    version: (state) => state,
    authority: () =>
      ++calls === 1
        ? new Promise((_, reject) => {
            rejectOld = reject;
          })
        : new Promise((resolve) => {
            confirmNew = resolve;
          }),
    onState: () => {},
    onRecovery: (state) => recovery.push(state),
  });
  const old = owner.live({ sessionId: "old", revision: 99 });
  const current = owner.live({ sessionId: "new", revision: 0 });
  confirmNew("new");
  await current;
  rejectOld(Error("old connection closed"));
  await old;
  expect(recovery.at(-1)).toMatchObject({ unavailable: false });
});
it("refresh checks the current connection even when a delayed snapshot names the previously accepted session", async () => {
  type State = { sessionId: string; revision: number };
  let currentSession = "old",
    resolveRefresh!: (state: State) => void,
    reads = 0;
  const states: State[] = [];
  const owner = createRuntimeUiRecovery<State>({
    load: () =>
      ++reads === 1
        ? Promise.resolve({ sessionId: "old", revision: 1 })
        : new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
    initializationError: async () => null,
    version: (state) => state,
    authority: async () => currentSession,
    onState: (state) => states.push(state),
    onRecovery: () => {},
  });
  await owner.load();
  const refresh = owner.load();
  currentSession = "new";
  resolveRefresh({ sessionId: "old", revision: 99 });
  expect(await refresh).toBe(false);
  await owner.live({ sessionId: "new", revision: 0 });
  expect(states).toEqual([
    { sessionId: "old", revision: 1 },
    { sessionId: "new", revision: 0 },
  ]);
});
