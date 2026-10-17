import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openDatabase,
  SQLiteKVStore,
  SQLiteHistoryBackend,
  createSQLiteIdentityRotationCoordinator,
} from "../../apps/electron/src/storage";
import {
  createKVIdentityRepository,
  type DeviceIdentity,
} from "../../packages/core/trust";
import {
  createIdentityBoundWorkFence,
  createRuntimeIdentityManager,
  createRuntimeIdentityRotationLifecycle,
  RUNTIME_CAPABILITIES,
  startIdentityBoundRuntimeServices,
} from "../../packages/core/runtime";

it("the SQLite runtime drains cached name writes before cleanup and stays sealed when relaunch fails", async () => {
  const directory = mkdtempSync(join(tmpdir(), "clipp-reset-runtime-"));
  const db = openDatabase(join(directory, "runtime.sqlite"));
  try {
    const storage = new SQLiteKVStore(db);
    const history = new SQLiteHistoryBackend(db);
    await history.set("former", { content: "old history" });
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      deviceId: "old",
      privateKey: "old-private",
      publicKey: "old-public",
      deviceName: "Desktop",
      multiaddrs: [],
      createdAt: 1,
    });
    await storage.set("autoSync", false);
    const work = createIdentityBoundWorkFence();
    let releaseWrite!: () => void;
    let enteredWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
      enteredWrite = resolve;
    });
    const pendingWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const manager = createRuntimeIdentityManager({
      repo: {
        ...repository,
        async upsert(value: DeviceIdentity) {
          if (value.deviceName === "Admitted name") {
            enteredWrite();
            await pendingWrite;
          }
          await repository.upsert(value);
        },
      },
      capabilities: RUNTIME_CAPABILITIES.electron,
      workFence: work,
      deriveKeyMaterial: async (privateKey) => ({
        peerId: "old",
        privateKey,
        publicKey: "old-public",
      }),
    });
    await manager.get();
    let quiescing!: () => void;
    const reachedQuiescence = new Promise<void>((resolve) => {
      quiescing = resolve;
    });
    const rotation = createSQLiteIdentityRotationCoordinator({
      db,
      storage,
      repository,
      identityKey: "identity",
      retry: false,
      shutdown: async () => undefined,
      lifecycle: {
        acquireFence: work.acquireFence,
        async quiesce() {
          quiescing();
          await work.quiesce();
        },
      },
      generateKeyMaterial: async () => ({
        peerId: "new",
        privateKey: "new-private",
        publicKey: "new-public",
      }),
      deriveKeyMaterial: async (privateKey) => ({
        peerId: privateKey === "old-private" ? "old" : "new",
        publicKey: privateKey === "old-private" ? "old-public" : "new-public",
        privateKey,
      }),
    });
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation,
      workFence: work,
      loadIdentity: () => manager.get(),
      restart() {
        throw new Error("relaunch unavailable");
      },
      startLocalRecovery() {},
      publishState() {},
    });
    const rename = manager.rename("Admitted name");
    await writing;
    const reset = rotation.beginIdentityReset({
      operationId: "reset-runtime",
      reviewedPeerId: "old",
    });
    await reachedQuiescence;
    expect((await repository.get())?.deviceId).toBe("old");
    expect(() => manager.rename("Late renderer callback")).toThrow(
      "identity_runtime_suspended"
    );
    releaseWrite();
    await rename;
    const result = await reset;
    expect(result).toEqual(expect.objectContaining({ outcome: "completed" }));
    expect((await repository.get())?.deviceId).toBe("new");
    expect(await storage.get("autoSync")).toBe(false);
    expect(await history.getAll()).toEqual([]);
    expect(work.isFenced()).toBe(true);
    expect(() => manager.get()).toThrow("identity_runtime_suspended");
    const replacement = createRuntimeIdentityManager({
      repo: repository,
      capabilities: RUNTIME_CAPABILITIES.electron,
      deriveKeyMaterial: async (privateKey) => ({
        peerId: "new",
        privateKey,
        publicKey: "new-public",
      }),
    });
    expect((await replacement.get()).deviceName).toBe("Desktop");
    lifecycle.dispose();
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each(
  [false, true].flatMap((servicesReady) =>
    (
      ["journal-write", "eligibility-read", "eligibility-validation"] as const
    ).map((failure) => ({
      servicesReady,
      failure,
    }))
  )
)(
  "a conclusively failed SQLite reset preserves the former identity and rebuilds only incomplete startup (services ready: $servicesReady, failure: $failure)",
  async ({ servicesReady, failure }) => {
    const directory = mkdtempSync(join(tmpdir(), "clipp-reset-startup-"));
    const db = openDatabase(join(directory, "runtime.sqlite"));
    try {
      // Fault the persistence boundary once, after provisional admission closes.
      class InterruptedReadStorage extends SQLiteKVStore {
        failNextIdentityRead = false;
        override async get<T>(key: string): Promise<T | undefined> {
          if (key === "identity" && this.failNextIdentityRead) {
            this.failNextIdentityRead = false;
            throw new Error("transient_identity_read_failure");
          }
          return super.get<T>(key);
        }
      }
      const storage = new InterruptedReadStorage(db);
      const history = new SQLiteHistoryBackend(db);
      await history.set("former", { content: "retained history" });
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      await repository.upsert({
        deviceId: "old",
        privateKey: "old-private",
        publicKey: "old-public",
        deviceName: "Desktop",
        multiaddrs: [],
        createdAt: 1,
      });
      const workFence = createIdentityBoundWorkFence();
      let failNextKeyValidation = false;
      const rotation = createSQLiteIdentityRotationCoordinator({
        db,
        storage,
        repository,
        identityKey: "identity",
        retry: false,
        shutdown: async () => undefined,
        lifecycle: {
          async acquireFence() {
            const lease = await workFence.acquireFence();
            storage.failNextIdentityRead = failure === "eligibility-read";
            failNextKeyValidation = failure === "eligibility-validation";
            return lease;
          },
          quiesce: workFence.quiesce,
        },
        generateKeyMaterial: async () => ({
          peerId: "new",
          privateKey: "new-private",
          publicKey: "new-public",
        }),
        deriveKeyMaterial: async (privateKey) => {
          if (failNextKeyValidation) {
            failNextKeyValidation = false;
            throw new Error("transient_key_validation_failure");
          }
          return {
            peerId: privateKey === "old-private" ? "old" : "new",
            publicKey:
              privateKey === "old-private" ? "old-public" : "new-public",
            privateKey,
          };
        },
      });
      const manager = createRuntimeIdentityManager({
        repo: repository,
        capabilities: RUNTIME_CAPABILITIES.electron,
        workFence,
        deriveKeyMaterial: async (privateKey) => ({
          peerId: "old",
          privateKey,
          publicKey: "old-public",
        }),
      });
      const restart = jest.fn();
      const lifecycle = createRuntimeIdentityRotationLifecycle({
        rotation,
        workFence,
        loadIdentity: () => manager.get(),
        restart,
        startLocalRecovery() {},
        publishState() {},
      });
      let started!: () => void;
      let finish!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const network = jest.fn();
      const startup = startIdentityBoundRuntimeServices({
        workFence,
        initializeIdentity: () => lifecycle.initialize(),
        async startLocalServices() {
          started();
          if (!servicesReady) await pending;
        },
        startNetworkServices: network,
        onServicesStarted: () => lifecycle.servicesStarted(),
      });
      await entered;
      if (servicesReady) await startup;
      if (failure === "journal-write")
        db.exec(
          "CREATE TRIGGER fail_reset BEFORE INSERT ON kv WHEN NEW.key = 'manualIdentityReset' BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END;"
        );
      expect(
        await rotation.beginIdentityReset({
          operationId: "failed-startup-reset",
          reviewedPeerId: "old",
        })
      ).toEqual({
        outcome: "rejected",
        code:
          failure === "eligibility-validation"
            ? "automatic_rotation_pending"
            : "preparation_failed",
      });
      finish();
      if (servicesReady) {
        expect(restart).not.toHaveBeenCalled();
        expect(network).toHaveBeenCalledTimes(1);
        expect(workFence.isFenced()).toBe(false);
        expect((await manager.get()).deviceId).toBe("old");
      } else {
        await expect(startup).rejects.toThrow("identity_runtime_suspended");
        expect(restart).toHaveBeenCalledTimes(1);
        expect(network).not.toHaveBeenCalled();
        expect(workFence.isFenced()).toBe(true);
        expect(() => manager.get()).toThrow("identity_runtime_suspended");
      }
      expect((await repository.get())?.deviceId).toBe("old");
      expect(await history.getAll()).toEqual([{ content: "retained history" }]);
      expect(await storage.get("manualIdentityResetReceipt")).toBeUndefined();
      lifecycle.dispose();
      rotation.stop();
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
);
