import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { indexedDB } from "fake-indexeddb";
import {
  createIdentityRotationCommitter,
  createIdentityRotationCoordinator,
  type IdentityRotationState,
} from "../../../packages/core/trust/identityRotation";
import {
  createKVIdentityRepository,
  type KVStorageBackend,
} from "../../../packages/core/trust/storage";
import type { DeviceIdentity } from "../../../packages/core/trust/identity";

class MemoryStorage implements KVStorageBackend {
  readonly values = new Map<string, unknown>();
  failNextSetFor: string | undefined;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.failNextSetFor === key) {
      this.failNextSetFor = undefined;
      throw new Error("storage_write_failed");
    }
    this.values.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const oldPeerId = "old-peer";
const replacementPeerId = "replacement-peer";
const historyItem = {
  clip: {
    id: "00000000-0000-4000-8000-000000000001",
    type: "text" as const,
    content: "kept during recovery",
    originPeerId: oldPeerId,
    capturedAt: 1,
    shareExpiresAt: 2,
  },
  firstStoredAt: 1,
  liveHandled: true,
  pinned: false,
};

function revokedIdentity(): DeviceIdentity {
  return {
    deviceId: oldPeerId,
    deviceName: "Old name",
    publicKey: "old-public",
    privateKey: "old-private",
    multiaddrs: ["/ip4/127.0.0.1/tcp/1"],
    createdAt: 1,
    nameRevision: 9,
    membershipView: {
      admittedPeerIds: [oldPeerId, "remote-peer"],
      revokedPeerIds: [oldPeerId],
    },
    remoteDeviceNames: { "remote-peer": { deviceName: "Remote", nameRevision: "3" } },
    localDeviceAliases: { "remote-peer": "Laptop" },
  };
}

function replacementIdentity(): DeviceIdentity {
  return {
    deviceId: replacementPeerId,
    deviceName: "Desktop",
    nameRevision: 0,
    publicKey: "replacement-public",
    privateKey: "replacement-private",
    multiaddrs: [],
    createdAt: 42,
    membershipView: {
      admittedPeerIds: [replacementPeerId],
      revokedPeerIds: [],
    },
  };
}

describe("Identity Rotation", () => {
  it("does not enter the shutdown barrier for a healthy identity", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    const healthy = {
      ...revokedIdentity(),
      membershipView: { admittedPeerIds: [oldPeerId], revokedPeerIds: [] },
    };
    await repository.upsert(healthy);
    const shutdown = jest.fn(async () => undefined);
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      initialDeviceName: "Desktop",
      shutdown,
      retry: false,
    });

    await expect(coordinator.recoverOrRotate()).resolves.toEqual({
      rotated: false,
      identity: healthy,
    });
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("restores history and the old identity when candidate activation fails, then reuses the candidate", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await storage.set("trustedDevices", [{ deviceId: "remote-peer" }]);
    await history.set(historyItem.clip.id, historyItem);
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: replacementPeerId,
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      generateKeyMaterial,
      shutdown: async () => undefined,
      retry: false,
    });
    storage.failNextSetFor = "identity";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      recovery: { code: "identity_rotation_recovery", reason: "revoked" },
    });
    expect(await repository.get()).toEqual(revokedIdentity());
    expect(await history.get(historyItem.clip.id)).toEqual(historyItem);
    expect(await storage.get("trustedDevices")).toEqual([{ deviceId: "remote-peer" }]);
    expect(await storage.get("identityRotationNotice")).toBeUndefined();
    expect(await storage.get<IdentityRotationState>("identity-rotation")).toMatchObject({
      reason: "revoked",
      phase: "prepared",
      candidate: { deviceId: replacementPeerId },
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "revoked",
      identity: { deviceId: replacementPeerId },
    });

    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(await repository.get()).toEqual(replacementIdentity());
    expect(await history.getAll()).toEqual([]);
    expect(await storage.get("trustedDevices")).toBeUndefined();
    expect(await storage.get("identityRotationNotice")).toEqual({
      reason: "revoked",
      historyDeleted: true,
      pairingRequired: true,
    });
    expect(await storage.get("identity-rotation")).toBeUndefined();
  });

  it("keeps Chrome and Android history backups in IndexedDB instead of the bounded KV marker", async () => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
    const storage = new MemoryStorage();
    const history = new IndexedDBHistoryBackend();
    await history.clearAll();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    const largeHistoryItem = {
      ...historyItem,
      clip: { ...historyItem.clip, content: "x".repeat(256 * 1024) },
    };
    await history.set(largeHistoryItem.clip.id, largeHistoryItem);
    const baseCommitter = createIdentityRotationCommitter({ repository, storage, history });
    let markerBytes = 0;
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: {
        ...baseCommitter,
        async commit(candidate, notice, backup) {
          const marker = await storage.get<IdentityRotationState>("identity-rotation");
          const encodedMarker = JSON.stringify(marker);
          markerBytes = encodedMarker.length;
          expect(encodedMarker).not.toContain(largeHistoryItem.clip.content);
          await baseCommitter.commit(candidate, notice, backup);
        },
      },
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      generateKeyMaterial: async () => ({
        peerId: replacementPeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
      shutdown: async () => undefined,
      retry: false,
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({ rotated: true });
    expect(markerBytes).toBeLessThan(10_000);
    expect(await history.getAll()).toEqual([]);
  });

  it("retains the durable backup marker until a failed rollback can be retried", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set(historyItem.clip.id, historyItem);
    const baseCommitter = createIdentityRotationCommitter({ repository, storage, history });
    let rollbackFails = true;
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: replacementPeerId,
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: {
        ...baseCommitter,
        async rollback(backup) {
          if (rollbackFails) {
            rollbackFails = false;
            throw new Error("rollback_storage_failed");
          }
          await baseCommitter.rollback(backup);
        },
      },
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      generateKeyMaterial,
      shutdown: async () => undefined,
      retry: false,
    });
    storage.failNextSetFor = "identity";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      recovery: { code: "identity_rotation_recovery" },
    });
    expect(await storage.get<IdentityRotationState>("identity-rotation")).toMatchObject({
      phase: "committing",
      backup: { id: replacementPeerId, identity: { deviceId: oldPeerId } },
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: replacementPeerId },
    });
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(await history.getAll()).toEqual([]);
  });

  it("rolls back an interrupted cleanup before retrying the same staged candidate", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await storage.set("trustedDevices", [{ deviceId: "remote-peer" }]);
    await history.set(historyItem.clip.id, historyItem);
    const committer = createIdentityRotationCommitter({
      repository,
      storage,
      history,
      storageKeys: ["trustedDevices"],
    });
    const backup = await committer.prepare(replacementPeerId);
    expect(JSON.stringify(backup)).not.toContain(historyItem.clip.content);
    await history.remove(historyItem.clip.id);
    await storage.remove("trustedDevices");
    const interrupted: IdentityRotationState = {
      version: 1,
      reason: "revoked",
      phase: "committing",
      candidate: replacementIdentity(),
      backup,
    };
    await storage.set("identity-rotation", interrupted);
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer,
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      generateKeyMaterial: jest.fn(async () => { throw new Error("must_not_generate"); }),
      shutdown: async () => undefined,
      retry: false,
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: replacementPeerId },
    });

    expect(await repository.get()).toEqual(replacementIdentity());
    expect(await history.getAll()).toEqual([]);
    expect(await storage.get("trustedDevices")).toBeUndefined();
  });
});
