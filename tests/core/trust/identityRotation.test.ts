import {
  historySuppressionKey,
  InMemoryHistoryBackend,
} from "../../../packages/core/history/types";
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
  failRemoveFor: string | undefined;

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
    if (this.failRemoveFor === key) throw new Error("storage_remove_failed");
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
  it("keeps a completely empty installation on the ordinary first-launch path", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    const shutdown = jest.fn(async () => undefined);
    const generateKeyMaterial = jest.fn();
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      initialDeviceName: "Desktop",
      shutdown,
      generateKeyMaterial,
      retry: false,
    });

    await expect(coordinator.recoverOrRotate()).resolves.toEqual({
      rotated: false,
      identity: undefined,
    });
    expect(shutdown).not.toHaveBeenCalled();
    expect(generateKeyMaterial).not.toHaveBeenCalled();
  });

  it("treats a persisted identity without private-key material as Identity Loss", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    const lostIdentity = { ...revokedIdentity(), privateKey: undefined };
    await repository.upsert(lostIdentity);
    await storage.set("trustedDevices", [{ deviceId: "remote-peer" }]);
    await storage.set("relayAddresses", ["/dns4/relay.example/tcp/443/wss"]);
    await history.set(historyItem.clip.id, historyItem);
    const shutdown = jest.fn(async () => undefined);
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      initialDeviceName: "Desktop",
      now: () => 42,
      shutdown,
      retry: false,
      generateKeyMaterial: async () => ({
        peerId: replacementPeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "identity-loss",
      identity: { deviceId: replacementPeerId },
    });
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(await repository.get()).toEqual(replacementIdentity());
    expect(await history.getAll()).toEqual([]);
    expect(await storage.get("trustedDevices")).toBeUndefined();
    expect(await storage.get("relayAddresses")).toEqual(["/dns4/relay.example/tcp/443/wss"]);
    expect(await coordinator.notice()).toEqual({
      reason: "identity-loss",
      historyDeleted: true,
      pairingRequired: true,
    });
  });

  it("keeps Identity Loss offline and reuses its candidate when the first marker write fails", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({ ...revokedIdentity(), privateKey: undefined });
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
      shutdown: async () => undefined,
      retry: false,
      generateKeyMaterial,
    });
    storage.failNextSetFor = "identity-rotation";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      recovery: { code: "identity_rotation_recovery", reason: "identity-loss" },
    });
    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "identity-loss",
      identity: { deviceId: replacementPeerId },
    });
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
  });

  it("repairs redundant metadata from a valid private key without rotating", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      ...revokedIdentity(),
      deviceId: "wrong-peer-id",
      publicKey: "wrong-public-key",
      privateKey: "valid-private-key",
      membershipView: { admittedPeerIds: ["wrong-peer-id", "remote-peer"], revokedPeerIds: [] },
    });
    await storage.set("trustedDevices", [{ deviceId: "remote-peer" }]);
    await history.set(historyItem.clip.id, historyItem);
    const shutdown = jest.fn(async () => undefined);
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      initialDeviceName: "Desktop",
      shutdown,
      retry: false,
      deriveKeyMaterial: async () => ({
        peerId: oldPeerId,
        privateKey: "valid-private-key",
        publicKey: "derived-public-key",
      }),
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: { deviceId: oldPeerId, publicKey: "derived-public-key" },
    });
    expect(await repository.get()).toMatchObject({
      deviceId: oldPeerId,
      publicKey: "derived-public-key",
      privateKey: "valid-private-key",
    });
    expect(await history.get(historyItem.clip.id)).toEqual(historyItem);
    expect(await storage.get("trustedDevices")).toEqual([{ deviceId: "remote-peer" }]);
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("treats unreadable private-key material as Identity Loss", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      ...revokedIdentity(),
      membershipView: { admittedPeerIds: [oldPeerId, "remote-peer"], revokedPeerIds: [] },
    });
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      initialDeviceName: "Desktop",
      shutdown: async () => undefined,
      retry: false,
      deriveKeyMaterial: async () => { throw new Error("private_key_unreadable"); },
      generateKeyMaterial: async () => ({
        peerId: replacementPeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "identity-loss",
      identity: { deviceId: replacementPeerId },
    });
  });

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

  it("enters recovery and preserves local state when the initial rotation marker cannot persist", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
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
      generateKeyMaterial,
      shutdown: async () => undefined,
      retry: false,
    });
    storage.failNextSetFor = "identity-rotation";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: revokedIdentity(),
      recovery: { code: "identity_rotation_recovery", reason: "revoked" },
    });
    expect(await storage.get("identity-rotation")).toBeUndefined();
    expect(await repository.get()).toEqual(revokedIdentity());
    expect(await history.get(historyItem.clip.id)).toEqual(historyItem);

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: replacementPeerId },
    });
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
  });

  it("deletes every identity-scoped record while preserving installation preferences", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    const remoteHistoryItem = {
      ...historyItem,
      clip: {
        ...historyItem.clip,
        id: "00000000-0000-4000-8000-000000000002",
        originPeerId: "remote-peer",
        content: "remote history",
      },
      pinned: true,
    };
    const suppressedClipId = "00000000-0000-4000-8000-000000000003";
    await history.set(historyItem.clip.id, historyItem);
    await history.set(remoteHistoryItem.clip.id, remoteHistoryItem);
    await history.set(historySuppressionKey(suppressedClipId), {
      clipId: suppressedClipId,
      suppressedUntil: 10_000,
    });
    const identityScopedState = {
      trustedDevices: [{ deviceId: "remote-peer" }],
      signedPeerRecords: [{ peerId: "remote-peer", envelope: [1, 2, 3] }],
      pairingPendingRequests: [{ initiatorPeerId: "remote-peer" }],
      runtimeApplicationState: {
        formerNetworkMetadata: { "remote-peer": "Remote" },
      },
    };
    for (const [key, value] of Object.entries(identityScopedState)) await storage.set(key, value);
    const installationPreferences = {
      theme: "dark",
      relayAddresses: ["/dns4/relay.example/tcp/443/wss"],
      pollingIntervalMs: 1_500,
      autoSync: false,
      clipSharingLifetimeMs: 60_000,
      localRetentionMs: 86_400_000,
      maxUnpinnedClips: 250,
      maxUnpinnedBytes: 1_000_000,
      maximumFrameBytes: 262_144,
    };
    for (const [key, value] of Object.entries(installationPreferences)) await storage.set(key, value);
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
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

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "revoked",
      identity: replacementIdentity(),
    });

    expect(await history.getAll()).toEqual([]);
    for (const key of Object.keys(identityScopedState)) expect(await storage.get(key)).toBeUndefined();
    for (const [key, value] of Object.entries(installationPreferences)) {
      expect(await storage.get(key)).toEqual(value);
    }
    expect(await repository.get()).toEqual(replacementIdentity());
  });

  it("activates the replacement identity when persisting the rotation notice fails", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set(historyItem.clip.id, historyItem);
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
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
    storage.failNextSetFor = "identityRotationNotice";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: replacementPeerId },
    });
    expect(await repository.get()).toEqual(replacementIdentity());
    expect(await history.getAll()).toEqual([]);
    expect(await coordinator.notice()).toBeUndefined();
  });

  it("treats failed transition-marker removal as committed and restart-required", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      shutdown: async () => undefined,
      retry: false,
      generateKeyMaterial: async () => ({
        peerId: replacementPeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
    });
    storage.failRemoveFor = "identity-rotation";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "revoked",
      identity: { deviceId: replacementPeerId },
    });
    expect(await repository.get()).toEqual(replacementIdentity());
    expect(await storage.get<IdentityRotationState>("identity-rotation")).toMatchObject({
      phase: "committed",
      candidateDeviceId: replacementPeerId,
    });
    expect(JSON.stringify(await storage.get("identity-rotation"))).not.toContain("old-private");

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: { deviceId: replacementPeerId },
    });
    expect(await storage.get<IdentityRotationState>("identity-rotation")).toMatchObject({
      phase: "committed",
      candidateDeviceId: replacementPeerId,
    });
  });

  it("retains a reason-specific rotation notice until acknowledgement", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      initialDeviceName: "Desktop",
      shutdown: async () => undefined,
      retry: false,
      generateKeyMaterial: async () => ({
        peerId: replacementPeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
    });

    await coordinator.recoverOrRotate();
    await expect(coordinator.notice()).resolves.toMatchObject({ reason: "revoked" });
    await coordinator.acknowledgeNotice();
    await expect(coordinator.notice()).resolves.toBeUndefined();
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
    let pendingCaptures = ["captured during recovery"];
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      generateKeyMaterial,
      shutdown: async () => undefined,
      runtimeCleanup: {
        prepare: async () => {
          const checkpoint = [...pendingCaptures];
          pendingCaptures = [];
          return { rollback: async () => { pendingCaptures = checkpoint; } };
        },
      },
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
    expect(pendingCaptures).toEqual(["captured during recovery"]);
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
    expect(pendingCaptures).toEqual([]);
  });

  it("restores the old identity and history when final cleanup fails, then reuses the candidate", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set(historyItem.clip.id, historyItem);
    const baseCommitter = createIdentityRotationCommitter({ repository, storage, history });
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: replacementPeerId,
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    let failFinalCleanup = true;
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: {
        ...baseCommitter,
        async finalize(backup) {
          if (failFinalCleanup) {
            failFinalCleanup = false;
            throw new Error("history_finalize_failed");
          }
          await baseCommitter.finalize(backup);
        },
      },
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      generateKeyMaterial,
      shutdown: async () => undefined,
      retry: false,
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: revokedIdentity(),
      recovery: { code: "identity_rotation_recovery", reason: "revoked" },
    });
    expect(await repository.get()).toEqual(revokedIdentity());
    expect(await history.get(historyItem.clip.id)).toEqual(historyItem);
    expect(await storage.get<IdentityRotationState>("identity-rotation")).toMatchObject({
      phase: "prepared",
      candidate: { deviceId: replacementPeerId },
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: replacementPeerId },
    });
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(await history.getAll()).toEqual([]);
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

  it("restores the active IndexedDB generation when final cleanup fails", async () => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
    const storage = new MemoryStorage();
    const history = new IndexedDBHistoryBackend();
    await history.clearAll();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set(historyItem.clip.id, historyItem);
    const baseCommitter = createIdentityRotationCommitter({ repository, storage, history });
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: {
        ...baseCommitter,
        finalize: async () => { throw new Error("indexeddb_generation_cleanup_failed"); },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: async () => ({
        peerId: "indexeddb-replacement-peer",
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
      shutdown: async () => undefined,
      retry: false,
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: { deviceId: oldPeerId },
      recovery: { code: "identity_rotation_recovery" },
    });
    expect(await repository.get()).toEqual(revokedIdentity());
    expect(await history.get(historyItem.clip.id)).toEqual(historyItem);
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
      backup: { backupId: replacementPeerId, identity: { deviceId: oldPeerId } },
    });

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      identity: { deviceId: replacementPeerId },
    });
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(await history.getAll()).toEqual([]);
  });

  it("keeps the history backup when persisting the rolled-back marker fails", async () => {
    const storage = new MemoryStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set(historyItem.clip.id, historyItem);
    const baseCommitter = createIdentityRotationCommitter({ repository, storage, history });
    let failMarkerAfterRollback = true;
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      committer: {
        ...baseCommitter,
        async rollback(backup) {
          await baseCommitter.rollback(backup);
          if (failMarkerAfterRollback) {
            failMarkerAfterRollback = false;
            storage.failNextSetFor = "identity-rotation";
          }
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
    storage.failNextSetFor = "identity";

    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      recovery: { code: "identity_rotation_recovery" },
    });
    const marker = await storage.get<IdentityRotationState>("identity-rotation");
    expect(marker).toMatchObject({ phase: "committing" });
    if (marker?.phase !== "committing") throw new Error("missing_committing_marker");

    await baseCommitter.rollback(marker.backup!);
    expect(await history.get(historyItem.clip.id)).toEqual(historyItem);
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
