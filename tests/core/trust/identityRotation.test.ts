import {
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

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const oldPeerId = "old-peer";
const replacementPeerId = "replacement-peer";

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

describe("Identity Rotation", () => {
  it("reuses a durably staged candidate until identity-scoped cleanup commits", async () => {
    const storage = new MemoryStorage();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    const events: string[] = [];
    let cleanupFails = true;
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: replacementPeerId,
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    const coordinator = createIdentityRotationCoordinator({
      repository,
      storage,
      stateKey: "identity-rotation",
      initialDeviceName: "Desktop",
      now: () => 42,
      generateKeyMaterial,
      shutdown: async () => { events.push("shutdown"); },
      clearIdentityScopedState: async () => {
        events.push("clear");
        if (cleanupFails) throw new Error("history_clear_failed");
      },
    });

    await expect(coordinator.recoverOrRotate()).rejects.toThrow("history_clear_failed");
    expect(await repository.get()).toEqual(revokedIdentity());
    expect(await storage.get<IdentityRotationState>("identity-rotation")).toMatchObject({
      reason: "revoked",
      candidate: { deviceId: replacementPeerId, privateKey: "replacement-private" },
    });

    cleanupFails = false;
    await expect(coordinator.recoverOrRotate()).resolves.toMatchObject({
      rotated: true,
      reason: "revoked",
      identity: { deviceId: replacementPeerId },
    });

    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["shutdown", "clear", "shutdown", "clear"]);
    expect(await repository.get()).toEqual({
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
    });
    expect(await storage.get("identity-rotation")).toBeUndefined();
  });
});
