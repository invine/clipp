import { IDBFactory } from "fake-indexeddb";
import {
  IDENTITY_RESET_NATIVE_AUTHORITY_KEY,
  LocalStorageBackend,
  type AndroidDurablePreferences,
} from "../../apps/android/src/storage";
import { createAndroidIdentityRotationOwner } from "../../apps/android/src/identityResetStorage";
import { IndexedDBHistoryBackend } from "../../packages/core/history/indexeddb";
import {
  createKVIdentityRepository,
  IDENTITY_KEY,
} from "../../packages/core/trust/storage";

test.each(["installing", "finalizing"])(
  "Android resumes %s when former web copies reappear after native installation",
  async (phase) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage"
    );
    const previousIDB = globalThis.indexedDB;
    const prefix = "clipp-android:reopen:";
    let web = new Map<string, string>();
    const disk = new Map<string, string>();
    let interrupt = true;
    let generated = 0;
    const native: AndroidDurablePreferences = {
      get: async ({ key }) => ({ value: disk.get(key) ?? null }),
      set: async ({ key, value }) => {
        if (
          interrupt &&
          ((phase === "installing" &&
            key === prefix + "manualIdentityReset" &&
            JSON.parse(value).phase === "finalizing") ||
            (phase === "finalizing" &&
              key === prefix + "manualIdentityResetCompleted"))
        )
          throw new Error("process_stopped_after_candidate_installation");
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
    let history = new IndexedDBHistoryBackend();
    const makeOwner = () => {
      const storage = new LocalStorageBackend(prefix, native, {
        native,
        isNative: () => true,
      });
      const repository = createKVIdentityRepository({
        storage,
        key: IDENTITY_KEY,
      });
      const owner = createAndroidIdentityRotationOwner({
        storage,
        repository,
        history,
        retry: false,
        shutdown: async () => undefined,
        generateKeyMaterial: async () => {
          generated++;
          return {
            peerId: "new",
            privateKey: "new-key",
            publicKey: "new-public",
          };
        },
        deriveKeyMaterial: async (key) => ({
          peerId: key === "old-key" ? "old" : "new",
          privateKey: key,
          publicKey: key === "old-key" ? "old-public" : "new-public",
        }),
        reset: {
          storage,
          persistentHistory: history,
          lifecycle: {
            acquireFence: async () => ({ release: async () => undefined }),
            quiesce: async () => undefined,
          },
        },
      });
      return { storage, repository, owner };
    };
    try {
      const first = makeOwner();
      await first.repository.upsert({
        deviceId: "old",
        privateKey: "old-key",
        publicKey: "old-public",
        deviceName: "Former",
        multiaddrs: [],
        createdAt: 1,
      });
      for (const key of [
        IDENTITY_KEY,
        "trustedDevices",
        "signedPeerRecords",
        "runtimeApplicationState",
      ]) {
        const former =
          key === IDENTITY_KEY
            ? await first.repository.get()
            : { former: true };
        await first.storage.set(key, former);
        web.set(prefix + key, JSON.stringify(former));
      }
      const durableWebSnapshot = new Map(web);
      await first.storage.set("theme", "dark");
      await first.storage.set("managedRelayCredentials", {
        token: "synthetic-preserved",
      });
      await history.set("old-history", { content: "synthetic former Clip" });
      expect(
        await first.owner.beginIdentityReset({
          operationId: "reset",
          reviewedPeerId: "old",
        })
      ).toMatchObject({ outcome: "accepted", state: { phase } });
      expect(
        await first.storage.identityResetStorage.get(IDENTITY_KEY)
      ).toMatchObject({ deviceId: "new" });
      expect(web.size).toBe(0);
      first.owner.stop();
      await history.close();
      // Reopening the WebView can restore web writes whose asynchronous deletion had not reached disk.
      web = new Map(durableWebSnapshot);
      interrupt = false;
      history = new IndexedDBHistoryBackend();
      const reopened = makeOwner();
      await history.verifyIdentityResetDataCleared();
      expect(
        await reopened.storage.identityResetStorage.get(IDENTITY_KEY)
      ).toMatchObject({ deviceId: "new" });
      const result = await reopened.owner.resumeIdentityReset({
        operationId: "reset",
      });
      expect(result).toMatchObject({ outcome: "completed" });
      expect(generated).toBe(1);
      expect(await reopened.repository.get()).toMatchObject({
        deviceId: "new",
      });
      expect(
        await reopened.storage.identityResetStorage.get("trustedDevices")
      ).toBeUndefined();
      expect(await reopened.storage.get("signedPeerRecords")).toBeUndefined();
      expect(
        await reopened.storage.get("runtimeApplicationState")
      ).toBeUndefined();
      expect(await reopened.storage.get("theme")).toBe("dark");
      expect(await reopened.storage.get("managedRelayCredentials")).toEqual({
        token: "synthetic-preserved",
      });
      expect(await history.getAll()).toEqual([]);
      expect(web.size).toBe(0);
      reopened.owner.stop();
      // Finalized native evidence survives both journal sanitization and receipt dismissal.
      await reopened.storage.remove("manualIdentityResetReceipt");
      await reopened.storage.set("trustedDevices", { current: true });
      await reopened.storage.set("identityRotationNotice", {
        reason: "revoked",
      });
      await history.set("new-history", {
        content: "synthetic replacement Clip",
      });
      web = new Map(durableWebSnapshot);
      const admitted = makeOwner();
      expect(await admitted.owner.recoverOrRotate()).toMatchObject({
        rotated: false,
        identity: { deviceId: "new" },
      });
      // Startup sweeps the whole retired set before ordinary identity admission, even keys never loaded.
      expect(web.size).toBe(0);
      expect(await admitted.storage.get("trustedDevices")).toEqual({
        current: true,
      });
      expect(await admitted.storage.get("identityRotationNotice")).toEqual({
        reason: "revoked",
      });
      expect(
        await admitted.storage.get("manualIdentityResetReceipt")
      ).toBeUndefined();
      expect(await admitted.storage.get("theme")).toBe("dark");
      expect(await admitted.storage.get("managedRelayCredentials")).toEqual({
        token: "synthetic-preserved",
      });
      expect(await history.getAll()).toEqual([
        { content: "synthetic replacement Clip" },
      ]);
      expect(generated).toBe(1);
      admitted.owner.stop();
    } finally {
      await history.close();
      globalThis.indexedDB = previousIDB;
      if (descriptor)
        Object.defineProperty(globalThis, "localStorage", descriptor);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
);

test("strict writes report unavailable retirement evidence instead of accepting stale fallback", async () => {
  const native: AndroidDurablePreferences = {
    get: async () => {
      throw new Error("authority_read_unavailable");
    },
    set: async () => {},
    remove: async () => {},
  };
  const storage = new LocalStorageBackend("unavailable-ledger:", native, {
    native,
    isNative: () => true,
  });
  await expect(
    storage.identityResetStorage.set(IDENTITY_KEY, { deviceId: "new" })
  ).rejects.toThrow("authority_read_unavailable");
});

test.each([
  { version: 2, keys: [] },
  { version: 1, keys: ["theme"] },
  { version: 1, keys: ["trustedDevices", "trustedDevices"] },
  { version: 1, keys: [], privateValue: "forbidden" },
])(
  "native startup refuses malformed or out-of-scope retirement evidence %j",
  async (ledger) => {
    const native: AndroidDurablePreferences = {
      get: async ({ key }) => ({
        value: key.endsWith(":" + IDENTITY_RESET_NATIVE_AUTHORITY_KEY)
          ? JSON.stringify(ledger)
          : null,
      }),
      set: async () => {},
      remove: async () => {},
    };
    const storage = new LocalStorageBackend("invalid-ledger:", native, {
      native,
      isNative: () => true,
    });
    await expect(storage.get("manualIdentityReset")).rejects.toThrow(
      "identity_reset_authority_invalid"
    );
    await expect(storage.get(IDENTITY_KEY)).rejects.toThrow(
      "identity_reset_authority_invalid"
    );
  }
);

test("retirement commit failures and later ordinary write/delete failures stay visible across reopen", async () => {
  const prefix = "retired-failures:";
  const disk = new Map<string, string>();
  let failLedger = true;
  let failOrdinary = false;
  const native: AndroidDurablePreferences = {
    get: async ({ key }) => ({ value: disk.get(key) ?? null }),
    set: async ({ key, value }) => {
      if (failLedger && key === prefix + IDENTITY_RESET_NATIVE_AUTHORITY_KEY)
        throw new Error("authority_commit_failed");
      disk.set(key, value);
    },
    remove: async ({ key }) => {
      disk.delete(key);
    },
  };
  const preferences: AndroidDurablePreferences = {
    get: native.get,
    set: async (options) => {
      if (failOrdinary) throw new Error("ordinary_commit_failed");
      await native.set(options);
    },
    remove: async (options) => {
      if (failOrdinary) throw new Error("ordinary_delete_failed");
      await native.remove(options);
    },
  };
  const make = () =>
    new LocalStorageBackend(prefix, preferences, {
      native,
      isNative: () => true,
    });
  const storage = make();
  await storage.set("trustedDevices", { former: true });
  await expect(
    storage.identityResetStorage.remove("trustedDevices")
  ).rejects.toThrow("authority_commit_failed");
  failLedger = false;
  await storage.identityResetStorage.remove("trustedDevices");
  failOrdinary = true;
  await expect(make().set("trustedDevices", { current: true })).rejects.toThrow(
    "ordinary_commit_failed"
  );
  expect(await make().get("trustedDevices")).toBeUndefined();
  failOrdinary = false;
  await make().set("trustedDevices", { current: true });
  failOrdinary = true;
  await expect(make().remove("trustedDevices")).rejects.toThrow(
    "ordinary_delete_failed"
  );
  expect(await make().get("trustedDevices")).toEqual({ current: true });
});

test("startup reports inaccessible retired fallback data before admitting an ordinary identity", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const disk = new Map<string, string>();
  const native: AndroidDurablePreferences = {
    get: async ({ key }) => ({ value: disk.get(key) ?? null }),
    set: async ({ key, value }) => {
      disk.set(key, value);
    },
    remove: async ({ key }) => {
      disk.delete(key);
    },
  };
  const make = () =>
    new LocalStorageBackend("inaccessible-fallback:", native, {
      native,
      isNative: () => true,
    });
  try {
    Reflect.deleteProperty(globalThis, "localStorage");
    await make().identityResetStorage.remove(
      `${IDENTITY_KEY}:initializationError`
    );
    await make().set(IDENTITY_KEY, { deviceId: "new" });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("web_store_inaccessible");
        },
        removeItem: () => {
          throw new Error("web_store_inaccessible");
        },
      },
    });
    await expect(make().get(IDENTITY_KEY)).rejects.toThrow(
      "web_store_inaccessible"
    );
    await expect(make().get("manualIdentityReset")).rejects.toThrow(
      "web_store_inaccessible"
    );
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
