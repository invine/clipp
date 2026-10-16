import { createIdentityBoundWorkFence } from "../../../packages/core/runtime/identityInitialization";

test("accepted reset drains admitted owner writes and refuses cached late writers until a fresh runtime", async () => {
  const fence = createIdentityBoundWorkFence();
  let settle!: () => void;
  const writes: string[] = [];
  const owner = fence.protect({
    async save(value: string) {
      await new Promise<void>((resolve) => {
        settle = resolve;
      });
      writes.push(value);
    },
  });
  const oldGeneration = fence.generation();
  const admitted = owner.save("old");
  const lease = await fence.acquireFence();
  expect(() => owner.save("late")).toThrow("identity_runtime_suspended");
  let drained = false;
  const drain = fence.quiesce().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  settle();
  await admitted;
  await drain;
  expect(writes).toEqual(["old"]);
  await lease.release();
  expect(() => fence.assertOpen(oldGeneration)).toThrow(
    "identity_runtime_retired"
  );
  expect(() => fence.assertOpen()).not.toThrow();
});

test("cached identity manager drains its queued rename before reset cleanup and refuses a late name callback", async () => {
  const { createIdentityManager } =
    await import("../../../packages/core/trust/identity");
  const fence = createIdentityBoundWorkFence();
  let stored:
    import("../../../packages/core/trust/identity").DeviceIdentity | undefined;
  let settle: (() => void) | undefined;
  const manager = createIdentityManager({
    repo: {
      get: async () => stored,
      upsert: async (value) => {
        if (value.deviceName === "Admitted rename")
          await new Promise<void>((resolve) => {
            settle = resolve;
          });
        stored = value;
      },
    },
    initialDeviceName: "Desktop",
    workFence: fence,
    generateKeyMaterial: async () => ({
      peerId: "old-peer",
      publicKey: "public",
      privateKey: "private",
    }),
  });
  await manager.get();
  const rename = manager.rename("Admitted rename");
  await Promise.resolve();
  await Promise.resolve();
  await fence.acquireFence();
  expect(() => manager.rename("Late callback")).toThrow(
    "identity_runtime_suspended"
  );
  const drain = fence.quiesce();
  settle!();
  await rename;
  await drain;
  stored = undefined; // The transition's cleanup happens only after this barrier.
  await Promise.resolve();
  expect(stored).toBeUndefined();
});

test("cold startup with unreadable reset acceptance seals ordinary owners before loading an identity", async () => {
  const { createRuntimeIdentityRotationLifecycle } =
    await import("../../../packages/core/runtime/identityInitialization");
  const fence = createIdentityBoundWorkFence();
  const loadIdentity = jest.fn();
  const lifecycle = createRuntimeIdentityRotationLifecycle({
    workFence: fence,
    rotation: {
      recoverOrRotate: async () => ({
        rotated: false,
        identity: undefined,
        recovery: {
          code: "manual_identity_reset_recovery",
          state: { phase: "checking", error: "storage_unavailable" },
        },
      }),
      rotate: async () => {
        throw new Error("unexpected automatic rotation");
      },
      onStatusChanged: () => () => {},
    },
    loadIdentity,
    restart() {},
    startLocalRecovery() {},
    publishState() {},
  });
  expect(await lifecycle.initialize()).toEqual({
    networkingEnabled: false,
    localServicesEnabled: false,
  });
  expect(loadIdentity).not.toHaveBeenCalled();
  expect(() => fence.run(() => "late capture")).toThrow(
    "identity_runtime_suspended"
  );
  lifecycle.dispose();
});
