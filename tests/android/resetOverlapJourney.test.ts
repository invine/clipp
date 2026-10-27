import { runResetOverlap } from "../../apps/android/src/resetOverlapJourney";
import { createResetOverlapPorts } from "../../apps/android/src/resetOverlapPorts";

test("the overlap waits for actual start and fence acknowledgements while independent ingress is exercised", async () => {
  const ports = createResetOverlapPorts(1000);
  const events: string[] = [];
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {
      events.push("native start");
    },
  });
  const reset = ports.wrapReset({
    acquireFence: async () => {
      events.push("native fence");
    },
  });
  await runResetOverlap({
    ports,
    start: () => background.start(true),
    begin: async () => {
      await reset.acquireFence();
      events.push("begin returned");
      return "completed";
    },
    ingress: async () => {
      events.push("independent ingress");
    },
    stage: (stage) => events.push(stage),
  });
  expect(events).toEqual([
    "native start",
    "start-held",
    "native fence",
    "provisional-fence-held",
    "independent ingress",
    "begin returned",
  ]);
});

test("failed independent ingress cannot be reported as a completed overlap", async () => {
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {},
  });
  const reset = ports.wrapReset({ acquireFence: async () => {} });
  await expect(
    runResetOverlap({
      ports,
      start: () => background.start(true),
      begin: async () => {
        await reset.acquireFence();
        return "completed";
      },
      ingress: async () => {
        throw new Error("ingress_unconfirmed");
      },
      stage: () => {},
    })
  ).rejects.toThrow("ingress_unconfirmed");
});

test("a rejected Start before the native port never leaves orchestration waiting for a gate", async () => {
  const ports = createResetOverlapPorts(1000);
  await expect(
    runResetOverlap({
      ports,
      start: async () => {
        throw new Error("start_failed_before_native");
      },
      begin: async () => "must not begin",
      ingress: async () => {},
      stage: () => {},
    })
  ).rejects.toThrow("start_failed_before_native");
});

test("a Start that never reaches native admission is bounded", async () => {
  jest.useFakeTimers();
  try {
    const ports = createResetOverlapPorts(1000);
    const result = runResetOverlap({
      ports,
      deadlineMs: 50,
      start: () => new Promise(() => {}),
      begin: async () => "must not begin",
      ingress: async () => {},
      stage: () => {},
    });
    const failure = expect(result).rejects.toThrow("overlap_deadline");
    await jest.advanceTimersByTimeAsync(50);
    await failure;
  } finally {
    jest.useRealTimers();
  }
});

test("reset completion after ingress remains bounded", async () => {
  jest.useFakeTimers();
  try {
    const ports = createResetOverlapPorts(1000);
    const background = ports.wrapBackground({
      start: async (_value: boolean | null) => {},
    });
    const reset = ports.wrapReset({ acquireFence: async () => {} });
    const operation = runResetOverlap({
      ports,
      deadlineMs: 50,
      start: () => background.start(true),
      begin: async () => {
        await reset.acquireFence();
        return await new Promise<never>(() => {});
      },
      ingress: async () => {},
      stage: () => {},
    });
    const failure = expect(operation).rejects.toThrow("overlap_deadline");
    await jest.advanceTimersByTimeAsync(50);
    await failure;
  } finally {
    jest.useRealTimers();
  }
});

test("observed stages report the remaining bounded monotonic window", async () => {
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {},
  });
  const reset = ports.wrapReset({ acquireFence: async () => {} });
  const remaining: number[] = [];
  await runResetOverlap({
    ports,
    deadlineMs: 1000,
    start: () => background.start(true),
    begin: async () => {
      await reset.acquireFence();
      return "completed";
    },
    ingress: async () => {},
    stage: (_stage, timing) => {
      remaining.push(timing.overlapRemainingMs);
    },
  });
  expect(remaining).toHaveLength(2);
  expect(remaining[0]).toBeGreaterThanOrEqual(remaining[1]);
  expect(remaining[0]).toBeLessThanOrEqual(1000);
  expect(remaining[1]).toBeGreaterThanOrEqual(0);
});

test("failure witness reports its finite phase and gate states without exposing the rejection", async () => {
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {},
  });
  const reset = ports.wrapReset({ acquireFence: async () => {} });
  const secret = new Error("PRIVATE_SENTINEL");
  const observed: unknown[] = [];
  await expect(
    runResetOverlap({
      ports,
      start: () => background.start(true),
      begin: async () => {
        await reset.acquireFence();
        throw secret;
      },
      ingress: async () => {},
      stage: () => {},
      failure: (witness) => observed.push(witness),
    })
  ).rejects.toBe(secret);
  expect(observed).toEqual([
    {
      phase: "await-reset",
      startGate: "released",
      fenceGate: "released",
      errorKind: "error",
    },
  ]);
  expect(JSON.stringify(observed)).not.toContain("PRIVATE_SENTINEL");
});

test("failure witness distinguishes ingress rejection while both gates are held", async () => {
  const ports = createResetOverlapPorts(1000);
  const background = ports.wrapBackground({
    start: async (_value: boolean | null) => {},
  });
  const reset = ports.wrapReset({ acquireFence: async () => {} });
  const observed: unknown[] = [];
  await expect(
    runResetOverlap({
      ports,
      start: () => background.start(true),
      begin: async () => {
        await reset.acquireFence();
        return "done";
      },
      ingress: async () => {
        throw new TypeError("PRIVATE_SENTINEL");
      },
      stage: () => {},
      failure: (witness) => observed.push(witness),
    })
  ).rejects.toThrow(TypeError);
  expect(observed).toEqual([
    {
      phase: "await-ingress",
      startGate: "held",
      fenceGate: "held",
      errorKind: "type-error",
    },
  ]);
});

test("a throwing diagnostic observer cannot replace the original error", async () => {
  const ports = createResetOverlapPorts(1000);
  const error = new Error("PRIVATE_SENTINEL");
  await expect(
    runResetOverlap({
      ports,
      start: async () => {
        throw error;
      },
      begin: async () => "unused",
      ingress: async () => {},
      stage: () => {},
      failure: () => {
        throw new Error("observer_failure");
      },
    })
  ).rejects.toBe(error);
});
