import {
  createAndroidIdentityResetRuntime,
  createAndroidPendingTrustRequestStore,
} from "../../apps/android/src/identityResetRuntime";
import { createIdentityBoundWorkFence } from "../../packages/core/runtime/identityInitialization";

test("fenced Android Pairing teardown can list former notifications while new pending writers are refused", async () => {
  const data = new Map();
  const fence = createIdentityBoundWorkFence();
  const store = createAndroidPendingTrustRequestStore(
    {
      get: async (key) => data.get(key),
      set: async (key, value) => {
        data.set(key, value);
      },
      remove: async (key) => {
        data.delete(key);
      },
    },
    fence
  );
  const pending = {
    initiatorPeerId: "former-pending-peer",
    deviceName: "Mobile",
    nameRevision: 0n,
    requestEnvelope: new Uint8Array([1]),
    expiresAtUnixMs: 1000n,
  };
  await store.save(pending);
  await fence.acquireFence();
  expect(
    (await store.list()).map((request) => request.initiatorPeerId)
  ).toEqual(["former-pending-peer"]);
  await expect(store.save(pending)).rejects.toThrow(
    "identity_runtime_suspended"
  );
  await expect(store.remove(pending.initiatorPeerId)).rejects.toThrow(
    "identity_runtime_suspended"
  );
});

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

test("Android retries final suspension after a failed first stop before native cleanup", async () => {
  const effects: string[] = [];
  let suspendAttempts = 0;
  const runtime = createAndroidIdentityResetRuntime({
    native: {
      acquireFence: async () => {},
      releaseFence: async () => {},
      clearNativeQueues: async () => {
        effects.push("native-cleared");
      },
      verifyNativeQueues: async () => {},
      openRuntime: async () => {},
      restartRuntime: async () => {},
    },
    suspend: async () => {
      suspendAttempts += 1;
      effects.push(`suspend-${suspendAttempts}`);
      if (suspendAttempts === 1) throw new Error("stop_ack_lost");
    },
  });

  await runtime.lifecycle.acquireFence();
  await expect(runtime.lifecycle.quiesce()).resolves.toBeUndefined();

  expect(effects).toEqual(["suspend-1", "suspend-2", "native-cleared"]);
  expect(runtime.workFence.isFenced()).toBe(true);
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

test("Android reset stops a former transport whose admitted start finishes after initial suspension", async () => {
  let active = false;
  let finishStart!: () => void;
  const runtime = createAndroidIdentityResetRuntime({
    native: {
      acquireFence: async () => {},
      releaseFence: async () => {},
      clearNativeQueues: async () => {
        expect(active).toBe(false);
      },
      verifyNativeQueues: async () => {},
      openRuntime: async () => {},
      restartRuntime: async () => {},
    },
    suspend: async () => {
      active = false;
    },
  });
  const starting = runtime.workFence.run(async () => {
    await new Promise<void>((resolve) => {
      finishStart = resolve;
    });
    active = true;
  });
  await runtime.lifecycle.acquireFence();
  const stopping = runtime.lifecycle.quiesce();
  await Promise.resolve();
  finishStart();
  await starting;
  await stopping;
  expect(active).toBe(false);
});
