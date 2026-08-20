import { createSQLiteIdentityRotationCommitter } from "../../../apps/electron/src/storage";
import { createIdentityRotationCoordinator } from "../../../packages/core/trust/identityRotation";
import { createKVIdentityRepository, type KVStorageBackend } from "../../../packages/core/trust/storage";
import type { DeviceIdentity } from "../../../packages/core/trust/identity";

class TransactionalFakeDatabase {
  kv = new Map<string, string>();
  history = new Map<string, string>();
  failCandidate = false;

  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        if (sql === "DELETE FROM history") this.history.clear();
        else if (sql === "DELETE FROM kv WHERE key = ?") this.kv.delete(String(args[0]));
        else if (sql.startsWith("INSERT OR REPLACE INTO kv")) {
          const [key, value] = args.map(String);
          if (this.failCandidate && key === "identity" && value.includes("replacement-peer")) {
            throw new Error("candidate_failed");
          }
          this.kv.set(key, value);
        }
      },
    };
  }

  transaction(operation: () => void) {
    return () => {
      const kvSnapshot = new Map(this.kv);
      const historySnapshot = new Map(this.history);
      try {
        operation();
      } catch (error) {
        this.kv = kvSnapshot;
        this.history = historySnapshot;
        throw error;
      }
    };
  }
}

class DatabaseStorage implements KVStorageBackend {
  constructor(private readonly db: TransactionalFakeDatabase) {}
  async get<T>(key: string): Promise<T | undefined> {
    const value = this.db.kv.get(key);
    return value === undefined ? undefined : JSON.parse(value) as T;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.db.kv.set(key, JSON.stringify(value));
  }
  async remove(key: string): Promise<void> {
    this.db.kv.delete(key);
  }
}

const oldIdentity: DeviceIdentity = {
  deviceId: "old-peer",
  deviceName: "Desktop",
  publicKey: "old-public",
  privateKey: "old-private",
  multiaddrs: [],
  createdAt: 1,
  membershipView: {
    admittedPeerIds: ["old-peer", "remote-peer"],
    revokedPeerIds: ["old-peer"],
  },
};

describe("SQLite identity rotation transaction", () => {
  it("rolls back every deletion when candidate activation fails", async () => {
    const db = new TransactionalFakeDatabase();
    const storage = new DatabaseStorage(db);
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(oldIdentity);
    await storage.set("trustedDevices", [{ deviceId: "remote-peer" }]);
    db.history.set("clip-1", JSON.stringify({ content: "transactional history" }));
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: "replacement-peer",
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createSQLiteIdentityRotationCommitter({ db, repository, identityKey: "identity" }),
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      generateKeyMaterial,
      shutdown: async () => undefined,
      retry: false,
    });
    db.failCandidate = true;

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      recovery: { code: "identity_rotation_recovery" },
    });
    expect(await repository.get()).toEqual(oldIdentity);
    expect(await storage.get("trustedDevices")).toEqual([{ deviceId: "remote-peer" }]);
    expect(db.history.has("clip-1")).toBe(true);

    db.failCandidate = false;
    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: "replacement-peer" },
    });
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(db.history.size).toBe(0);
    expect(await storage.get("trustedDevices")).toBeUndefined();
  });
});
