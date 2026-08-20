import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import {
  createIdentityRotationCommitter,
  createIdentityRotationCoordinator,
  type IdentityRotationBackup,
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

  it("rolls back an interrupted cleanup before retrying the same staged candidate", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    const backup: IdentityRotationBackup = {
      identity: revokedIdentity(),
      storageEntries: [{ key: "trustedDevices", value: [{ deviceId: "remote-peer" }] }],
      historyEntries: [{ key: historyItem.clip.id, value: historyItem }],
    };
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
      committer: createIdentityRotationCommitter({
        repository,
        storage,
        history,
        storageKeys: ["trustedDevices"],
      }),
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
