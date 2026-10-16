import { createAndroidIdentityResetRuntime } from "../../apps/android/src/identityResetRuntime";

test("Android reset drains admitted writers, suspends continuity and clears native queues before cleanup", async () => {
  const effects: string[] = [];
  let finish!: () => void;
  const runtime = createAndroidIdentityResetRuntime({
    native: {
      acquireFence: async () => {
        effects.push("native-fenced");
      },
      releaseFence: async () => {
        effects.push("native-released");
      },
      clearNativeQueues: async () => {
        effects.push("native-cleared");
      },
      verifyNativeQueues: async () => {},
      openRuntime: async () => {},
      restartRuntime: async () => {},
    },
    suspend: async () => {
      effects.push("continuity-suspended");
    },
  });
  const owner = runtime.workFence.protect({
    write: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const writing = owner.write();
  await runtime.lifecycle.acquireFence();
  expect(() => owner.write()).toThrow("identity_runtime_suspended");
  const quiescing = runtime.lifecycle.quiesce();
  await Promise.resolve();
  expect(effects).toEqual(["native-fenced", "continuity-suspended"]);
  finish();
  await writing;
  await quiescing;
  expect(effects).toEqual([
    "native-fenced",
    "continuity-suspended",
    "native-cleared",
  ]);
  expect(runtime.workFence.isFenced()).toBe(true);
});

test("failed native acknowledgement and continuity suspension keep the cached Android runtime fenced", async () => {
  const native = {
    acquireFence: jest.fn(async () => {}),
    releaseFence: jest.fn(async () => {}),
    clearNativeQueues: jest.fn(async () => {}),
    verifyNativeQueues: jest.fn(async () => {}),
    openRuntime: jest.fn(async () => {}),
    restartRuntime: jest.fn(async () => {}),
  };
  const runtime = createAndroidIdentityResetRuntime({
    native,
    suspend: async () => {
      throw new Error("native_stop_failed");
    },
  });
  await runtime.lifecycle.acquireFence();
  await expect(runtime.lifecycle.quiesce()).rejects.toThrow(
    "native_stop_failed"
  );
  await expect(runtime.openRuntime()).rejects.toThrow(
    "identity_runtime_suspended"
  );
  expect(native.openRuntime).not.toHaveBeenCalled();
  expect(native.clearNativeQueues).not.toHaveBeenCalled();
  native.acquireFence.mockRejectedValueOnce(new Error("commit_reply_lost"));
  await expect(runtime.lifecycle.acquireFence()).rejects.toThrow(
    "commit_reply_lost"
  );
  expect(runtime.workFence.isFenced()).toBe(true);
  expect(native.releaseFence).not.toHaveBeenCalled();
});

test("conclusive nonacceptance releases native admission before ordinary Android work resumes", async () => {
  const effects: string[] = [];
  const runtime = createAndroidIdentityResetRuntime({
    native: {
      acquireFence: async () => {},
      releaseFence: async () => {
        effects.push("native-released");
      },
      clearNativeQueues: async () => {},
      verifyNativeQueues: async () => {},
      openRuntime: async () => {},
      restartRuntime: async () => {},
    },
    suspend: async () => {},
  });
  const fence = await runtime.lifecycle.acquireFence();
  await fence.release();
  runtime.workFence.run(() => effects.push("ordinary-work"));
  expect(effects).toEqual(["native-released", "ordinary-work"]);
});

test("a failed native Activity restart keeps the completed former runtime sealed", async () => {
  const runtime = createAndroidIdentityResetRuntime({
    native: {
      acquireFence: async () => {},
      releaseFence: async () => {},
      clearNativeQueues: async () => {},
      verifyNativeQueues: async () => {},
      openRuntime: async () => {},
      restartRuntime: async () => {
        throw new Error("native_activity_restart_failed");
      },
    },
    suspend: async () => {},
  });
  await runtime.lifecycle.acquireFence();
  await runtime.lifecycle.quiesce();
  await expect(runtime.restartRuntime()).rejects.toThrow(
    "native_activity_restart_failed"
  );
  expect(runtime.workFence.isFenced()).toBe(true);
});
