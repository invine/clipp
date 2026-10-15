import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openDatabase,
  SQLiteKVStore,
  SQLiteHistoryBackend,
  createSQLiteIdentityRotationCoordinator,
} from "../../apps/electron/src/storage";
import { createKVIdentityRepository } from "../../packages/core/trust/storage";

it("the SQLite owner durably resets History and identity while preserving settings after reopening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clipp-reset-"));
  let db = openDatabase(join(dir, "reset.sqlite"));
  try {
    let storage = new SQLiteKVStore(db);
    let history = new SQLiteHistoryBackend(db);
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      deviceId: "old",
      privateKey: "old-private",
      publicKey: "old-public",
      deviceName: "Named",
      createdAt: 1,
      multiaddrs: [],
    });
    await storage.set("runtimeApplicationState", { alias: "old name" });
    for (const key of [
      "trustedDevices",
      "signedPeerRecords",
      "pairingPendingRequests",
      "identityRotationNotice",
      "identity:initializationError",
    ])
      await storage.set(key, { old: "identity-bound" });
    for (const [key, value] of Object.entries({
      theme: "dark",
      localRetentionMs: 1000,
      sharingLifetimeMs: 2000,
      backgroundMode: true,
      managedRelayConfigurations: [{ id: "saved" }],
    }))
      await storage.set(key, value);
    await storage.set("autoSync", false);
    await storage.set("managedRelayCredentials", { token: "keep" });
    await history.set("old", { content: "pinned old history" });
    const owner = createSQLiteIdentityRotationCoordinator({
      db,
      storage,
      repository,
      identityKey: "identity",
      retry: false,
      shutdown: async () => undefined,
      lifecycle: {
        acquireFence: async () => ({ release: async () => undefined }),
        quiesce: async () => undefined,
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
    expect(
      await owner.beginIdentityReset({
        operationId: "reset",
        reviewedPeerId: "old",
      })
    ).toMatchObject({ outcome: "completed" });
    db.close();
    db = openDatabase(join(dir, "reset.sqlite"));
    storage = new SQLiteKVStore(db);
    history = new SQLiteHistoryBackend(db);
    expect(await storage.get("identity")).toMatchObject({
      deviceId: "new",
      deviceName: "Desktop",
      nameRevision: 0,
    });
    expect(await history.getAll()).toEqual([]);
    expect(await storage.get("runtimeApplicationState")).toBeUndefined();
    expect(await storage.get("manualIdentityReset")).toBeUndefined();
    expect(await storage.get("manualIdentityResetReceipt")).toMatchObject({
      formerPeerId: "old",
      generatedPeerId: "new",
    });
    expect(await storage.get("manualIdentityResetCompleted")).toEqual({
      operationId: "reset",
      generatedPeerId: "new",
    });
    for (const key of [
      "trustedDevices",
      "signedPeerRecords",
      "pairingPendingRequests",
      "identityRotationNotice",
      "identity:initializationError",
    ])
      expect(await storage.get(key)).toBeUndefined();
    expect(await storage.get("theme")).toBe("dark");
    expect(await storage.get("localRetentionMs")).toBe(1000);
    expect(await storage.get("sharingLifetimeMs")).toBe(2000);
    expect(await storage.get("backgroundMode")).toBe(true);
    expect(await storage.get("managedRelayConfigurations")).toEqual([
      { id: "saved" },
    ]);
    expect(await storage.get("autoSync")).toBe(false);
    expect(await storage.get("managedRelayCredentials")).toEqual({
      token: "keep",
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each([
  ["cleanup", "BEFORE DELETE ON history", "1"],
  ["candidate installation", "BEFORE INSERT ON kv", "NEW.key = 'identity'"],
  ["receipt", "BEFORE INSERT ON kv", "NEW.key = 'manualIdentityResetReceipt'"],
  [
    "replay guard",
    "BEFORE INSERT ON kv",
    "NEW.key = 'manualIdentityResetCompleted'",
  ],
  [
    "journal sanitization",
    "BEFORE DELETE ON kv",
    "OLD.key = 'manualIdentityReset'",
  ],
])(
  "SQLite failure during %s is recoverable with the same candidate after reopening",
  async (_phase, event, condition) => {
    const dir = mkdtempSync(join(tmpdir(), "clipp-reset-fault-"));
    let db = openDatabase(join(dir, "reset.sqlite"));
    let generated = 0;
    try {
      let storage = new SQLiteKVStore(db);
      let history = new SQLiteHistoryBackend(db);
      let repository = createKVIdentityRepository({ storage, key: "identity" });
      await repository.upsert({
        deviceId: "old",
        privateKey: "old-private",
        publicKey: "old-public",
        deviceName: "Named",
        createdAt: 1,
        multiaddrs: [],
      });
      await storage.set("runtimeApplicationState", { alias: "old" });
      await history.set("old", { content: "old" });
      const create = () =>
        createSQLiteIdentityRotationCoordinator({
          db,
          storage,
          repository,
          identityKey: "identity",
          retry: false,
          shutdown: async () => undefined,
          lifecycle: {
            acquireFence: async () => ({ release: async () => undefined }),
            quiesce: async () => undefined,
          },
          generateKeyMaterial: async () => {
            generated++;
            return {
              peerId: "new",
              privateKey: "new-private",
              publicKey: "new-public",
            };
          },
          deriveKeyMaterial: async (privateKey) => ({
            peerId: privateKey === "old-private" ? "old" : "new",
            publicKey:
              privateKey === "old-private" ? "old-public" : "new-public",
            privateKey,
          }),
        });
      db.exec(
        `CREATE TRIGGER fail_reset ${event} WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END;`
      );
      expect(
        await create().beginIdentityReset({
          operationId: "reset",
          reviewedPeerId: "old",
        })
      ).toMatchObject({ outcome: "accepted" });
      expect(await storage.get("manualIdentityReset")).toMatchObject({
        candidate: { deviceId: "new" },
      });
      if (_phase === "cleanup") {
        // The failed transaction preserves the original identity and History together.
        expect(await repository.get()).toMatchObject({ deviceId: "old" });
        expect(await history.getAll()).toEqual([{ content: "old" }]);
      }
      db.close();
      db = openDatabase(join(dir, "reset.sqlite"));
      storage = new SQLiteKVStore(db);
      history = new SQLiteHistoryBackend(db);
      repository = createKVIdentityRepository({ storage, key: "identity" });
      db.exec("DROP TRIGGER fail_reset");
      expect(
        await create().resumeIdentityReset({ operationId: "reset" })
      ).toMatchObject({ outcome: "completed" });
      expect(generated).toBe(1);
      expect(await repository.get()).toMatchObject({ deviceId: "new" });
      expect(await history.getAll()).toEqual([]);
      expect(await storage.get("runtimeApplicationState")).toBeUndefined();
      expect(await storage.get("manualIdentityReset")).toBeUndefined();
      expect(await storage.get("manualIdentityResetReceipt")).toMatchObject({
        operationId: "reset",
        formerPeerId: "old",
        generatedPeerId: "new",
      });
      expect(await storage.get("manualIdentityResetCompleted")).toEqual({
        operationId: "reset",
        generatedPeerId: "new",
      });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
);
