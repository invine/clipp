import { createResetOverlapGate } from "../../apps/android/src/resetOverlapGate";

test("the acceptance gate holds only after the actual native acknowledgement and releases within its deadline", async () => {
  let acknowledge!: () => void;
  const native = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const gate = createResetOverlapGate(1000);
  let completed = false;
  const operation = gate.observe(native).then(() => {
    completed = true;
  });
  expect(gate.state()).toBe("waiting-native");
  acknowledge();
  await gate.ready;
  expect(gate.state()).toBe("held");
  expect(completed).toBe(false);
  gate.release();
  await operation;
  expect(completed).toBe(true);
  expect(gate.state()).toBe("released");
});

test("a missing native acknowledgement fails within the same deadline and cannot be released", async () => {
  jest.useFakeTimers();
  try {
    const gate = createResetOverlapGate(50);
    const operation = gate.observe(new Promise<void>(() => {}));
    const failure = expect(operation).rejects.toThrow("overlap_deadline");
    await jest.advanceTimersByTimeAsync(50);
    await failure;
    expect(gate.state()).toBe("failed");
    expect(() => gate.release()).toThrow("overlap_not_held");
  } finally {
    jest.useRealTimers();
  }
});

test("a native rejection remains a rejection and never announces a held fence", async () => {
  const gate = createResetOverlapGate(1000);
  await expect(
    gate.observe(Promise.reject(new Error("native_failure")))
  ).rejects.toThrow("native_failure");
  expect(gate.state()).toBe("failed");
  expect(() => gate.release()).toThrow("overlap_not_held");
});

test("a failed native call resolves the observation as unavailable", async () => {
  const gate = createResetOverlapGate(1000);
  await expect(
    gate.observe(Promise.reject(new Error("native_failure")))
  ).rejects.toThrow("native_failure");
  await expect(gate.ready).resolves.toBe(false);
});

test("late native acknowledgement cannot reopen an expired gate", async () => {
  jest.useFakeTimers();
  try {
    let acknowledge!: () => void;
    const native = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const gate = createResetOverlapGate(50);
    const operation = gate.observe(native);
    const failure = expect(operation).rejects.toThrow("overlap_deadline");
    await jest.advanceTimersByTimeAsync(50);
    await failure;
    acknowledge();
    await Promise.resolve();
    expect(gate.state()).toBe("failed");
    await expect(gate.ready).resolves.toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
