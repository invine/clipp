import { prepareChromeIdentityRuntime } from "../../apps/extension/src/identityRuntimeRecovery";
import { createIdentityBoundWorkFence } from "../../packages/core/runtime/identityInitialization";

it("cold accepted recovery fences ordinary writes and retires surviving offscreen work before readiness", async () => {
  const workFence = createIdentityBoundWorkFence();
  let close!: () => void;
  let closing!: () => void;
  const closeStarted = new Promise<void>((resolve) => {
    closing = resolve;
  });
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  let oldOffscreenAlive = true;
  let ready = false;
  const startup = prepareChromeIdentityRuntime({
    reconcileIdentityReset: async () => ({
      phase: "accepted",
      operationId: "accepted-reset",
    }),
    workFence,
    async retireOffscreen() {
      closing();
      await closed;
      oldOffscreenAlive = false;
    },
  }).then((state) => {
    ready = true;
    return state;
  });
  await closeStarted;
  expect(() => workFence.run(() => "old storage writer")).toThrow(
    "identity_runtime_suspended"
  );
  expect(ready).toBe(false);
  expect(oldOffscreenAlive).toBe(true);
  close();
  expect(await startup).toEqual({
    phase: "accepted",
    operationId: "accepted-reset",
  });
  expect(oldOffscreenAlive).toBe(false);
  expect(workFence.isFenced()).toBe(true);
});

it("unknown acceptance also retires offscreen, and a close failure keeps runtime readiness rejected and writers sealed", async () => {
  const workFence = createIdentityBoundWorkFence();
  await expect(
    prepareChromeIdentityRuntime({
      reconcileIdentityReset: async () => ({
        phase: "checking",
        error: "storage_unavailable",
      }),
      workFence,
      async retireOffscreen() {
        throw new Error("offscreen_close_failed");
      },
    })
  ).rejects.toThrow("offscreen_close_failed");
  expect(() => workFence.run(() => "late writer")).toThrow(
    "identity_runtime_suspended"
  );
});

it.each([false, true])(
  "preflight uncertainty resolved during the first initialize requests a fresh sealed bootstrap (restart failure: %s)",
  async (restartFails) => {
    const {
      createRuntimeIdentityRotationLifecycle,
      startIdentityBoundRuntimeServices,
    } = await import("../../packages/core/runtime/identityInitialization");
    const workFence = createIdentityBoundWorkFence();
    let publish!: (
      status: import("../../packages/core/trust/identityRotation").IdentityRotationStatus
    ) => void;
    const restart = jest.fn(() => {
      if (restartFails) throw new Error("restart_unavailable");
    });
    const loadIdentity = jest.fn(async () => undefined);
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      workFence,
      rotation: {
        onStatusChanged(listener) {
          publish = listener;
          return () => {};
        },
        async recoverOrRotate() {
          publish({
            kind: "manual-reset",
            state: { phase: "idle", acceptance: "not-accepted" },
          });
          return { rotated: false, identity: undefined };
        },
        rotate: async () => {
          throw new Error("unexpected automatic rotation");
        },
      },
      loadIdentity,
      restart,
      startLocalRecovery() {},
      publishState() {},
    });
    const retireOffscreen = jest.fn(async () => undefined);
    await prepareChromeIdentityRuntime({
      async reconcileIdentityReset() {
        const state = {
          phase: "checking",
          error: "storage_unavailable",
        } as const;
        publish({ kind: "manual-reset", state });
        return state;
      },
      workFence,
      retireOffscreen,
    });
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();
    await expect(
      startIdentityBoundRuntimeServices({
        workFence,
        initializeIdentity: () => lifecycle.initialize(),
        startLocalServices,
        startNetworkServices,
      })
    ).resolves.toBeUndefined();
    expect(retireOffscreen).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(workFence.isFenced()).toBe(true);
    expect(lifecycle.isRecovering()).toBe(true);
    expect(loadIdentity).not.toHaveBeenCalled();
    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
    lifecycle.dispose();
  }
);
