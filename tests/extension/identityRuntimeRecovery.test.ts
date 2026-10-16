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
