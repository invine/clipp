import { createResetOverlapPorts } from "../../apps/android/src/resetOverlapPorts";

test("overlap ports let the actual native operations finish before holding their acknowledgements", async () => {
  const events: string[] = [];
  const ports = createResetOverlapPorts(1000);
  ports.arm();
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {
      events.push("actual start");
    },
  });
  const reset = ports.wrapReset({
    acquireFence: async () => {
      events.push("actual fence");
    },
  });
  const start = background.start(false);
  expect(await ports.startGate.ready).toBe(true);
  expect(events).toEqual(["actual start"]);
  let startDone = false;
  void start.then(() => {
    startDone = true;
  });
  const fence = reset.acquireFence();
  expect(await ports.fenceGate.ready).toBe(true);
  expect(events).toEqual(["actual start", "actual fence"]);
  expect(startDone).toBe(false);
  ports.fenceGate.release();
  await fence;
  ports.startGate.release();
  await start;
  expect(startDone).toBe(true);
});

test("acceptance adapters delegate the native arguments and leave unrelated operations intact", async () => {
  const calls: unknown[] = [];
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (autoSync: boolean | null) => {
      calls.push(autoSync);
    },
    stop: async () => {
      calls.push("stop");
    },
  });
  const reset = ports.wrapReset({
    acquireFence: async () => {
      calls.push("acquired");
    },
    releaseFence: async () => {
      calls.push("released");
    },
  });
  ports.arm();
  const start = background.start(false);
  expect(await ports.startGate.ready).toBe(true);
  const acquire = reset.acquireFence();
  expect(await ports.fenceGate.ready).toBe(true);
  expect(calls).toEqual([false, "acquired"]);
  ports.fenceGate.release();
  ports.startGate.release();
  await Promise.all([start, acquire]);
  await background.stop();
  await reset.releaseFence();
  expect(calls).toEqual([false, "acquired", "stop", "released"]);
});

test("unarmed adapters pass through normally and the overlap is armed only once", async () => {
  const calls: string[] = [];
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {
      calls.push("start");
    },
  });
  await background.start(null);
  expect(calls).toEqual(["start"]);
  ports.arm();
  const held = background.start(null);
  expect(await ports.startGate.ready).toBe(true);
  ports.startGate.release();
  await held;
  expect(() => ports.arm()).toThrow("overlap_already_armed");
});

test("a repeated gated start is refused before a second native call", async () => {
  let calls = 0;
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {
      calls++;
    },
  });
  ports.arm();
  const first = background.start(false);
  expect(await ports.startGate.ready).toBe(true);
  await expect(background.start(false)).rejects.toThrow(
    "overlap_start_already_used"
  );
  expect(calls).toBe(1);
  ports.startGate.release();
  await first;
});

test("after the bounded overlap, later native starts and fence acquisitions pass through", async () => {
  const calls: string[] = [];
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {
      calls.push("start");
    },
  });
  const reset = ports.wrapReset({
    acquireFence: async () => {
      calls.push("fence");
    },
  });
  ports.arm();
  const start = background.start(false);
  expect(await ports.startGate.ready).toBe(true);
  const fence = reset.acquireFence();
  expect(await ports.fenceGate.ready).toBe(true);
  ports.fenceGate.release();
  ports.startGate.release();
  await Promise.all([start, fence]);
  await background.start(false);
  await reset.acquireFence();
  expect(calls).toEqual(["start", "fence", "start", "fence"]);
});

test("a non-enumerable native proxy retains its unwrapped methods", async () => {
  const calls: string[] = [];
  const actual = new Proxy(
    {} as { acquireFence(): Promise<void>; releaseFence(): Promise<void> },
    {
      get(_target, name) {
        if (name === "acquireFence")
          return async () => {
            calls.push("acquire");
          };
        if (name === "releaseFence")
          return async () => {
            calls.push("release");
          };
      },
    }
  );
  const ports = createResetOverlapPorts(1000);
  const wrapped = ports.wrapReset(actual);
  await wrapped.releaseFence();
  expect(calls).toEqual(["release"]);
});
