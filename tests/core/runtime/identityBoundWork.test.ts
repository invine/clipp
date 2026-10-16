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

it.each([false, true])(
  "cold conclusive nonacceptance restarts sealed recovery, while accepted reset cannot reopen (%s)",
  async (accepted) => {
    const { createRuntimeIdentityRotationLifecycle } =
      await import("../../../packages/core/runtime/identityInitialization");
    const workFence = createIdentityBoundWorkFence();
    await workFence.acquireFence(); // The cold host preflight sealed admission before services.
    let status!: (
      value: import("../../../packages/core/trust/identityRotation").IdentityRotationStatus
    ) => void;
    const restart = jest.fn();
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      workFence,
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
        onStatusChanged(listener) {
          status = listener;
          return () => {};
        },
      },
      loadIdentity: async () => undefined,
      restart,
      startLocalRecovery() {},
      publishState() {},
    });
    await lifecycle.initialize();
    if (accepted)
      status({
        kind: "manual-reset",
        state: { phase: "accepted", operationId: "accepted-reset" },
      });
    status({
      kind: "manual-reset",
      state: { phase: "idle", acceptance: "not-accepted" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(workFence.isFenced()).toBe(true);
    expect(restart).toHaveBeenCalledTimes(accepted ? 0 : 1);
    lifecycle.dispose();
  }
);

it("Pairing teardown can read and dismiss pending notifications after fencing while its store refuses late writes", async () => {
  const {
    createKVPendingTrustRequestStore,
    createPendingTrustRequestCoordinator,
  } = await import("../../../packages/core/pairing/pending");
  const work = createIdentityBoundWorkFence();
  const values = new Map<string, unknown>();
  const storage: import("../../../packages/core/trust").KVStorageBackend = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  const store = createKVPendingTrustRequestStore({
    storage: work.protectStorageWrites(storage),
    key: "pending",
  });
  const request = {
    initiatorPeerId: "remote",
    deviceName: "Mobile",
    nameRevision: 0n,
    requestEnvelope: new Uint8Array([1]),
    expiresAtUnixMs: 10000n,
  };
  await store.save(request);
  const dismiss = jest.fn(async () => {});
  const pending = createPendingTrustRequestCoordinator({
    store,
    localPeerId: async () => "local",
    notifications: { show: async () => {}, dismiss, onSelect: () => () => {} },
    lifecycle: { openApprovalView() {} },
    clock: { now: () => 1, setTimeout: () => 1, clearTimeout() {} },
    verify: async () => true,
    membership: {
      membershipStatus: async () => "unknown",
      admit: async () => "admitted",
    },
  });
  await work.acquireFence();
  await expect(store.save(request)).rejects.toThrow(
    "identity_runtime_suspended"
  );
  await expect(pending.stop()).resolves.toBeUndefined();
  expect(dismiss).toHaveBeenCalledWith("pairing-request-remote");
});

it("an active runtime releases proven nonacceptance without restarting its existing services", async () => {
  const { createRuntimeIdentityRotationLifecycle } =
    await import("../../../packages/core/runtime/identityInitialization");
  const workFence = createIdentityBoundWorkFence();
  let status!: (
    value: import("../../../packages/core/trust/identityRotation").IdentityRotationStatus
  ) => void;
  const restart = jest.fn();
  const lifecycle = createRuntimeIdentityRotationLifecycle({
    workFence,
    rotation: {
      recoverOrRotate: async () => ({ rotated: false, identity: undefined }),
      rotate: async () => {
        throw new Error("unexpected automatic rotation");
      },
      onStatusChanged(listener) {
        status = listener;
        return () => {};
      },
    },
    loadIdentity: async () => undefined,
    restart,
    startLocalRecovery() {},
    publishState() {},
  });
  await lifecycle.initialize();
  await workFence.acquireFence();
  status({
    kind: "manual-reset",
    state: { phase: "checking", error: "storage_unavailable" },
  });
  status({
    kind: "manual-reset",
    state: { phase: "idle", acceptance: "not-accepted" },
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(workFence.isFenced()).toBe(false);
  expect(lifecycle.isRecovering()).toBe(false);
  expect(restart).not.toHaveBeenCalled();
  lifecycle.dispose();
});

it("uncertain reset arriving during identity load restarts after conclusive rejection once startup returned suspended", async () => {
  const { createRuntimeIdentityRotationLifecycle } =
    await import("../../../packages/core/runtime/identityInitialization");
  const workFence = createIdentityBoundWorkFence();
  let status!: (
    value: import("../../../packages/core/trust/identityRotation").IdentityRotationStatus
  ) => void;
  let loaded!: () => void;
  const loading = new Promise<void>((resolve) => {
    loaded = resolve;
  });
  const restart = jest.fn();
  const lifecycle = createRuntimeIdentityRotationLifecycle({
    workFence,
    rotation: {
      recoverOrRotate: async () => ({ rotated: false, identity: undefined }),
      rotate: async () => {
        throw new Error("unexpected automatic rotation");
      },
      onStatusChanged(listener) {
        status = listener;
        return () => {};
      },
    },
    loadIdentity: () => loading,
    restart,
    startLocalRecovery() {},
    publishState() {},
  });
  const starting = lifecycle.initialize();
  await Promise.resolve();
  status({
    kind: "manual-reset",
    state: { phase: "checking", error: "storage_unavailable" },
  });
  loaded();
  expect(await starting).toEqual({
    networkingEnabled: false,
    localServicesEnabled: false,
  });
  status({
    kind: "manual-reset",
    state: { phase: "idle", acceptance: "not-accepted" },
  });
  await Promise.resolve();
  expect(restart).toHaveBeenCalledTimes(1);
  expect(workFence.isFenced()).toBe(true);
  lifecycle.dispose();
});
