import {
  createRuntimeIdentityRotationCoordinator,
  startIdentityBoundRuntimeServices,
} from "../../../packages/core/runtime";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import { createIdentityRotationCommitter } from "../../../packages/core/trust/identityRotation";
import { createKVIdentityRepository, type KVStorageBackend } from "../../../packages/core/trust/storage";
import type { DeviceIdentity } from "../../../packages/core/trust/identity";

class RotationStorage implements KVStorageBackend {
  readonly values = new Map<string, unknown>();
  failNextSetFor: string | undefined;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (key === this.failNextSetFor) {
      this.failNextSetFor = undefined;
      throw new Error("identity_write_failed");
    }
    this.values.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const revokedPeerId = "runtime-revoked-peer";
const replacementPeerId = "runtime-replacement-peer";

function revokedIdentity(): DeviceIdentity {
  return {
    deviceId: revokedPeerId,
    deviceName: "Former device",
    nameRevision: 4,
    publicKey: "old-public",
    privateKey: "old-private",
    multiaddrs: [],
    createdAt: 1,
    membershipView: {
      admittedPeerIds: [revokedPeerId, "remote-peer"],
      revokedPeerIds: [revokedPeerId],
    },
  };
}

describe("runtime identity initialization", () => {
  it("starts neither local nor network services when Device Identity initialization fails", async () => {
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();

    await expect(startIdentityBoundRuntimeServices({
      initializeIdentity: async () => { throw new Error("identity_initialization_failed"); },
      startLocalServices,
      startNetworkServices,
    })).rejects.toThrow("identity_initialization_failed");

    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
  });

  it("keeps local services active when networking fails after Device Identity initialization", async () => {
    const calls: string[] = [];
    const networkFailure = new Error("network_unavailable");

    await expect(startIdentityBoundRuntimeServices({
      initializeIdentity: async () => { calls.push("identity"); },
      startLocalServices: () => { calls.push("local"); },
      startNetworkServices: async () => {
        calls.push("network");
        throw networkFailure;
      },
      onNetworkingFailure: (error) => { calls.push(`network-failed:${(error as Error).message}`); },
    })).resolves.toBeUndefined();

    expect(calls).toEqual([
      "identity",
      "local",
      "network",
      "network-failed:network_unavailable",
    ]);
  });

  it.each([
    { capabilities: RUNTIME_CAPABILITIES.electron, failedKey: "identity" },
    { capabilities: RUNTIME_CAPABILITIES.android, failedKey: "identity" },
    { capabilities: RUNTIME_CAPABILITIES.chromeExtension, failedKey: "identity" },
    { capabilities: RUNTIME_CAPABILITIES.electron, failedKey: "identityRotation" },
    { capabilities: RUNTIME_CAPABILITIES.android, failedKey: "identityRotation" },
    { capabilities: RUNTIME_CAPABILITIES.chromeExtension, failedKey: "identityRotation" },
  ])("keeps $capabilities.platform networking down through $failedKey rotation recovery and enables it after restart", async ({ capabilities, failedKey }) => {
    const storage = new RotationStorage();
    const history = new InMemoryHistoryBackend();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set("old-clip", {
      clip: {
        id: "old-clip",
        type: "text",
        content: "old network history",
        originPeerId: revokedPeerId,
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      firstStoredAt: 1,
      liveHandled: true,
      pinned: false,
    });
    const shutdown = jest.fn(async () => undefined);
    const createRotation = () => createRuntimeIdentityRotationCoordinator({
      repository,
      storage,
      capabilities,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      shutdown,
      retry: false,
      now: () => 10,
      generateKeyMaterial: async () => ({
        peerId: replacementPeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
    });
    const localStarted = jest.fn();
    const networkStarted = jest.fn();
    storage.failNextSetFor = failedKey;
    let rotation = createRotation();

    await startIdentityBoundRuntimeServices({
      initializeIdentity: async () => {
        const result = await rotation.recoverOrRotate();
        return { networkingEnabled: !result.rotated && !result.recovery };
      },
      startLocalServices: localStarted,
      startNetworkServices: networkStarted,
    });

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(localStarted).toHaveBeenCalledTimes(1);
    expect(networkStarted).not.toHaveBeenCalled();
    expect(await repository.get()).toEqual(revokedIdentity());
    expect(await history.get("old-clip")).not.toBeNull();

    rotation.stop();
    rotation = createRotation();
    await expect(startIdentityBoundRuntimeServices({
      initializeIdentity: async () => {
        const result = await rotation.recoverOrRotate();
        if (result.rotated) throw new Error("identity_rotated_restart_required");
      },
      startLocalServices: localStarted,
      startNetworkServices: networkStarted,
    })).rejects.toThrow("identity_rotated_restart_required");
    expect(localStarted).toHaveBeenCalledTimes(1);
    expect(networkStarted).not.toHaveBeenCalled();
    expect(await history.getAll()).toEqual([]);

    rotation.stop();
    rotation = createRotation();
    await startIdentityBoundRuntimeServices({
      initializeIdentity: async () => {
        const result = await rotation.recoverOrRotate();
        return { networkingEnabled: !result.rotated && !result.recovery };
      },
      startLocalServices: localStarted,
      startNetworkServices: networkStarted,
    });
    expect(localStarted).toHaveBeenCalledTimes(2);
    expect(networkStarted).toHaveBeenCalledTimes(1);
    expect(await repository.get()).toMatchObject({
      deviceId: replacementPeerId,
      nameRevision: 0,
      membershipView: {
        admittedPeerIds: [replacementPeerId],
        revokedPeerIds: [],
      },
    });
  });
});
