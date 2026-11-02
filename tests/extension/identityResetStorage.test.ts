import { IDBFactory } from "fake-indexeddb";
import { IndexedDBHistoryBackend } from "../../packages/core/history/indexeddb";
import {
  ChromeStorageBackend,
  createChromeIdentityRotationCoordinator,
} from "../../apps/extension/src/chromeStorage";
import { createKVIdentityRepository } from "../../packages/core/trust/storage";

it.each([
  "manualIdentityResetReceipt",
  "manualIdentityResetCompleted",
  "manualIdentityReset",
])(
  "the Chrome owner recovers the same candidate after a failed %s finalization effect",
  async (faultKey) => {
    globalThis.indexedDB = new IDBFactory();
    const persisted: Record<string, unknown> = {};
    let error: string | undefined;
    let failFinalization = true;
    const storage = new ChromeStorageBackend(
      {
        get(keys, done) {
          done(
            Object.fromEntries(
              keys.map((key) => [key, structuredClone(persisted[key])])
            )
          );
        },
        set(items, done) {
          error =
            failFinalization &&
            faultKey !== "manualIdentityReset" &&
            faultKey in items
              ? "disk unavailable"
              : undefined;
          if (!error) Object.assign(persisted, structuredClone(items));
          done();
          error = undefined;
        },
        remove(key, done) {
          error =
            failFinalization &&
            key === faultKey &&
            faultKey === "manualIdentityReset"
              ? "disk unavailable"
              : undefined;
          if (!error) delete persisted[key];
          done();
          error = undefined;
        },
      },
      () => error
    );
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      deviceId: "old",
      privateKey: "old-private",
      publicKey: "old-public",
      deviceName: "Named",
      createdAt: 1,
      multiaddrs: [],
    });
    await storage.set("autoSync", false);
    await storage.set("managedRelayCredentials", { token: "preserved" });
    await storage.set("runtimeApplicationState", { destination: "old" });
    let history = new IndexedDBHistoryBackend();
    await history.set("old", { content: "old history" });
    const checkpoint = await history.identityRotation.prepare("old-backup");
    await history.identityRotation.commit(checkpoint);
    let generated = 0;
    const create = () =>
      createChromeIdentityRotationCoordinator({
        repository,
        storage,
        history,
        identityKey: "identity",
        lifecycle: {
          acquireFence: async () => ({ release: async () => undefined }),
          quiesce: async () => undefined,
        },
        shutdown: async () => undefined,
        retry: false,
        generateKeyMaterial: async () => {
          generated++;
          return {
            peerId: "new",
            publicKey: "new-public",
            privateKey: "new-private",
          };
        },
        deriveKeyMaterial: async (privateKey) => ({
          peerId: privateKey === "old-private" ? "old" : "new",
          publicKey: privateKey === "old-private" ? "old-public" : "new-public",
          privateKey,
        }),
      });
    expect(
      await create().beginIdentityReset({
        operationId: "reset",
        reviewedPeerId: "old",
      })
    ).toMatchObject({ outcome: "accepted", state: { phase: "finalizing" } });
    expect(await storage.get("manualIdentityReset")).toBeDefined();
    await history.close();
    history = new IndexedDBHistoryBackend();
    failFinalization = false;
    expect(
      await create().resumeIdentityReset({ operationId: "reset" })
    ).toMatchObject({ outcome: "completed" });
    expect(generated).toBe(1);
    expect(await repository.get()).toMatchObject({
      deviceId: "new",
      deviceName: "Extension",
      nameRevision: 0,
    });
    expect(await storage.get("manualIdentityReset")).toBeUndefined();
    expect(await storage.get("runtimeApplicationState")).toBeUndefined();
    expect(await storage.get("autoSync")).toBe(false);
    expect(await storage.get("managedRelayCredentials")).toEqual({
      token: "preserved",
    });
    await history.verifyIdentityResetDataCleared();
    await history.identityRotation.rollback(checkpoint);
    expect(await history.getAll()).toEqual([]);
    await history.close();
  }
);

it("Chrome storage rejects failed reads, writes and deletes instead of falling back", async () => {
  const storage = new ChromeStorageBackend(
    {
      get(_keys, done) {
        done({});
      },
      set(_items, done) {
        done();
      },
      remove(_key, done) {
        done();
      },
    },
    () => "storage unavailable"
  );
  await expect(storage.get("manualIdentityReset")).rejects.toThrow(
    "storage unavailable"
  );
  await expect(storage.set("manualIdentityReset", {})).rejects.toThrow(
    "storage unavailable"
  );
  await expect(storage.remove("manualIdentityReset")).rejects.toThrow(
    "storage unavailable"
  );
});

it("Chrome's production composition cannot admit reset before lifecycle barriers exist", async () => {
  globalThis.indexedDB = new IDBFactory();
  const storage = new ChromeStorageBackend(
    {
      get(_keys, done) {
        done({});
      },
      set(_items, done) {
        done();
      },
      remove(_key, done) {
        done();
      },
    },
    () => undefined
  );
  const history = new IndexedDBHistoryBackend();
  const owner = createChromeIdentityRotationCoordinator({
    storage,
    history,
    identityKey: "identity",
    repository: createKVIdentityRepository({ storage, key: "identity" }),
    shutdown: async () => undefined,
    retry: false,
  });
  expect(
    await owner.beginIdentityReset({
      operationId: "reset",
      reviewedPeerId: "old",
    })
  ).toEqual({ outcome: "rejected", code: "unavailable" });
  await history.close();
});
