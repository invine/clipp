import { IDBFactory } from "fake-indexeddb";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";

it("reset removes active and recovery generations across close/reopen", async () => {
  globalThis.indexedDB = new IDBFactory();
  let history = new IndexedDBHistoryBackend();
  await history.set("old", { private: "old history" });
  const checkpoint = await history.identityRotation.prepare("interrupted");
  await history.identityRotation.commit(checkpoint);
  await history.set("newer", { private: "recovery history" });
  await history.clearIdentityResetData();
  await history.close();
  history = new IndexedDBHistoryBackend();
  await history.verifyIdentityResetDataCleared();
  // Rolling a stale checkpoint back cannot reveal any old generation.
  await history.identityRotation.rollback(checkpoint);
  expect(await history.getAll()).toEqual([]);
  await history.close();
});

it("refuses reset deletion when the IndexedDB host ignores strict durability", async () => {
  globalThis.indexedDB = new IDBFactory();
  const history = new IndexedDBHistoryBackend();
  await history.set("old", { content: "preserve on unsupported host" });
  const { IDBDatabase } = await import("fake-indexeddb");
  const transaction = IDBDatabase.prototype.transaction;
  const ignoredDurability = jest
    .spyOn(IDBDatabase.prototype, "transaction")
    .mockImplementation(function (this: IDBDatabase, names, mode) {
      return transaction.call(this, names, mode);
    });
  try {
    await expect(history.clearIdentityResetData()).rejects.toThrow(
      "identity_reset_strict_durability_unavailable"
    );
    expect(await history.getAll()).toEqual([
      { content: "preserve on unsupported host" },
    ]);
  } finally {
    ignoredDurability.mockRestore();
    await history.close();
  }
});
