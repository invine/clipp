import {
  LocalStorageBackend,
  type CapacitorPreferencesStore,
  type AndroidDurablePreferences,
} from "../../apps/android/src/storage";
import { createAndroidIdentityRotationOwner } from "../../apps/android/src/identityResetStorage";
import {
  createKVIdentityRepository,
  IDENTITY_KEY,
} from "../../packages/core/trust/storage";
import { IndexedDBHistoryBackend } from "../../packages/core/history/indexeddb";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryHistoryBackend } from "../../packages/core/history/types";

const unavailablePreferences: CapacitorPreferencesStore = {
  get: async () => {
    throw new Error("preferences_unavailable");
  },
  set: async () => {
    throw new Error("preferences_unavailable");
  },
  remove: async () => {
    throw new Error("preferences_unavailable");
  },
};

test("native reset inspection never treats a failed native read as an absent intent", async () => {
  const native: AndroidDurablePreferences = {
    get: async () => {
      throw new Error("durable_read_failed");
    },
    set: async () => {
      throw new Error("commit_failed");
    },
    remove: async () => {
      throw new Error("commit_failed");
    },
  };
  const storage = new LocalStorageBackend(
    "clipp-android:",
    unavailablePreferences,
    { native, isNative: () => true }
  );
  await expect(storage.get("manualIdentityReset")).rejects.toThrow(
    "durable_read_failed"
  );
  await expect(
    storage.set("manualIdentityReset", { operationId: "test" })
  ).rejects.toThrow("commit_failed");
  await expect(storage.remove("manualIdentityReset")).rejects.toThrow(
    "commit_failed"
  );
  const owner = createAndroidIdentityRotationOwner({
    storage,
    repository: createKVIdentityRepository({ storage, key: IDENTITY_KEY }),
    history: new InMemoryHistoryBackend(),
    shutdown: async () => {},
    retry: false,
  });
  expect(await owner.recoverOrRotate()).toMatchObject({
    rotated: false,
    identity: undefined,
    recovery: {
      code: "manual_identity_reset_recovery",
      state: { phase: "checking", error: "storage_unavailable" },
    },
  });
  expect(
    await owner.beginIdentityReset({
      operationId: "blocked",
      reviewedPeerId: "old",
    })
  ).toMatchObject({ outcome: "outcome-unconfirmed" });
});

test("owning coordinator commits one native identity and removes former fallback data and every History generation", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  Reflect.deleteProperty(globalThis, "localStorage");
  const legacyMemory = new LocalStorageBackend(
    "clipp-android:",
    unavailablePreferences
  );
  await legacyMemory.set(IDENTITY_KEY, { privateKey: "former-memory-key" });
  await legacyMemory.set("runtimeApplicationState", {
    private: "former-memory-state",
  });
  const previousIDB = globalThis.indexedDB;
  const web = new Map<string, string>();
  const disk = new Map<string, string>();
  let failGuard = true;
  let failAutomaticRead = true;
  const native: AndroidDurablePreferences = {
    get: async ({ key }) => {
      if (failAutomaticRead && key === "clipp-android:identityRotation")
        throw new Error("automatic_state_unavailable");
      return { value: disk.get(key) ?? null };
    },
    set: async ({ key, value }) => {
      if (failGuard && key === "clipp-android:manualIdentityResetCompleted")
        throw new Error("guard_commit_failed");
      disk.set(key, value);
    },
    remove: async ({ key }) => {
      disk.delete(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => web.get(key) ?? null,
      setItem: (key: string, value: string) => {
        web.set(key, value);
      },
      removeItem: (key: string) => {
        web.delete(key);
      },
    },
  });
  globalThis.indexedDB = new IDBFactory();
  const history = new IndexedDBHistoryBackend();
  try {
    const storage = new LocalStorageBackend("clipp-android:", native, {
      native,
      isNative: () => true,
    });
    const repo = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
    await repo.upsert({
      deviceId: "old",
      privateKey: "old-key",
      publicKey: "old-public",
      deviceName: "Named",
      multiaddrs: [],
      createdAt: 1,
    });
    await storage.set("signedPeerRecords", { old: "record" });
    await storage.set("theme", "dark");
    await storage.set("managedRelayConfigurations", [{ id: "keep" }]);
    localStorage.setItem(
      "clipp-android:localDeviceIdentity",
      JSON.stringify({ privateKey: "former-web-key" })
    );
    localStorage.setItem("clipp-android:signedPeerRecords", "stale-record");
    await history.set("old-clip", { private: "history" });
    const stale = await history.identityRotation.prepare("old-backup");
    await history.identityRotation.commit(stale);
    await history.set("__clipp_suppression__:old", { clipId: "old" });
    const activeHistory = new InMemoryHistoryBackend();
    await activeHistory.set("memory-clip", { private: "memory-history" });
    const makeOwner = () =>
      createAndroidIdentityRotationOwner({
        storage,
        repository: repo,
        history: activeHistory,
        shutdown: async () => {},
        retry: false,
        generateKeyMaterial: async () => ({
          peerId: "new",
          privateKey: "new-key",
          publicKey: "new-public",
        }),
        deriveKeyMaterial: async (key) => ({
          peerId: key === "old-key" ? "old" : "new",
          privateKey: key,
          publicKey: key === "old-key" ? "old-public" : "new-public",
        }),
        reset: {
          storage,
          persistentHistory: history,
          lifecycle: {
            acquireFence: async () => ({ release: async () => {} }),
            quiesce: async () => {},
          },
        },
      });
    const owner = makeOwner();
    expect(
      await owner.beginIdentityReset({
        operationId: "unreadable-old-state",
        reviewedPeerId: "old",
      })
    ).toMatchObject({ outcome: "rejected", code: "preparation_failed" });
    expect(await storage.get("manualIdentityReset")).toBeUndefined();
    failAutomaticRead = false;
    expect(
      await owner.beginIdentityReset({
        operationId: "reset-1",
        reviewedPeerId: "old",
      })
    ).toMatchObject({ outcome: "accepted", state: { phase: "finalizing" } });
    expect(await storage.get("manualIdentityReset")).toMatchObject({
      operationId: "reset-1",
      candidate: { deviceId: "new", privateKey: "new-key" },
    });
    expect(await storage.get("manualIdentityResetReceipt")).toMatchObject({
      operationId: "reset-1",
    });
    expect(await storage.get("manualIdentityResetCompleted")).toBeUndefined();
    failGuard = false;
    owner.stop();
    const restarted = makeOwner();
    expect(
      await restarted.resumeIdentityReset({ operationId: "reset-1" })
    ).toMatchObject({ outcome: "completed" });
    expect(await repo.get()).toMatchObject({
      deviceId: "new",
      deviceName: "Mobile",
      nameRevision: 0,
      membershipView: { admittedPeerIds: ["new"], revokedPeerIds: [] },
    });
    await history.identityRotation.rollback(stale);
    expect(await history.getAll()).toEqual([]);
    expect(await activeHistory.getAll()).toEqual([]);
    expect(web.size).toBe(0);
    expect(await storage.get("signedPeerRecords")).toBeUndefined();
    expect(await storage.get("theme")).toBe("dark");
    expect(await storage.get("managedRelayConfigurations")).toEqual([
      { id: "keep" },
    ]);
    const reopened = new LocalStorageBackend("clipp-android:", native, {
      native,
      isNative: () => true,
    });
    expect(await reopened.get("manualIdentityReset")).toBeUndefined();
    expect(await reopened.get("manualIdentityResetReceipt")).toMatchObject({
      operationId: "reset-1",
      formerPeerId: "old",
      generatedPeerId: "new",
    });
    expect(await reopened.get("manualIdentityResetCompleted")).toEqual({
      operationId: "reset-1",
      generatedPeerId: "new",
    });
    Reflect.deleteProperty(globalThis, "localStorage");
    expect(await legacyMemory.get(IDENTITY_KEY)).toBeUndefined();
    expect(await legacyMemory.get("runtimeApplicationState")).toBeUndefined();
  } finally {
    await history.close();
    globalThis.indexedDB = previousIDB;
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("reset-enabled owner preserves automatic rotation when its optional notice cannot persist", async () => {
  const previousIDB = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  const history = new IndexedDBHistoryBackend();
  const disk = new Map<string, string>();
  let poisoned = false;
  const preferences: AndroidDurablePreferences = {
    get: async ({ key }) => ({ value: disk.get(key) ?? null }),
    set: async ({ key, value }) => {
      if (key.endsWith(":identityRotationNotice"))
        throw new Error("optional_notice_failed");
      disk.set(key, value);
    },
    remove: async ({ key }) => {
      disk.delete(key);
    },
  };
  const native: AndroidDurablePreferences = {
    get: async (options) => {
      if (poisoned) throw new Error("commit_unconfirmed");
      return preferences.get(options);
    },
    set: async (options) => {
      try {
        await preferences.set(options);
      } catch (error) {
        poisoned = true;
        throw error;
      }
    },
    remove: async (options) => {
      if (poisoned) throw new Error("commit_unconfirmed");
      await preferences.remove(options);
    },
  };
  try {
    const storage = new LocalStorageBackend(
      "clipp-android:auto:",
      preferences,
      { native, isNative: () => true }
    );
    await storage.identityResetStorage.remove("identityRotationNotice");
    const repository = createKVIdentityRepository({
      storage,
      key: IDENTITY_KEY,
    });
    await repository.upsert({
      deviceId: "old",
      privateKey: "old-key",
      publicKey: "old-public",
      deviceName: "Named",
      multiaddrs: [],
      createdAt: 1,
      membershipView: { admittedPeerIds: ["old"], revokedPeerIds: ["old"] },
    });
    const owner = createAndroidIdentityRotationOwner({
      storage,
      repository,
      history,
      shutdown: async () => {},
      retry: false,
      generateKeyMaterial: async () => ({
        peerId: "new",
        privateKey: "new-key",
        publicKey: "new-public",
      }),
      deriveKeyMaterial: async (key) => ({
        peerId: key === "old-key" ? "old" : "new",
        privateKey: key,
        publicKey: key === "old-key" ? "old-public" : "new-public",
      }),
      reset: {
        storage,
        persistentHistory: history,
        lifecycle: {
          acquireFence: async () => ({ release: async () => {} }),
          quiesce: async () => {},
        },
      },
    });
    expect(await owner.rotate("revoked")).toMatchObject({
      rotated: true,
      identity: { deviceId: "new" },
    });
    expect(
      await storage.identityResetStorage.get("identityRotation")
    ).toBeUndefined();
    expect(await repository.get()).toMatchObject({ deviceId: "new" });
    owner.stop();
  } finally {
    await history.close();
    globalThis.indexedDB = previousIDB;
  }
});
