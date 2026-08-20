import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeIdentityRotationLifecycle,
  createRuntimeIdentityRotationCoordinator,
  startIdentityBoundRuntimeServices,
  stopIdentityBoundRuntimeServices,
  type RuntimeAdapter,
} from "../../../packages/core/runtime";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { indexedDB } from "fake-indexeddb";
import { createIdentityRotationCommitter } from "../../../packages/core/trust/identityRotation";
import type { IdentityRotationStatus } from "../../../packages/core/trust/identityRotation";
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

type RotationApplicationState = Record<string, never>;
type RotationPublicState = { recovering: boolean };
type RotationAdapter = RuntimeAdapter<DeviceIdentity, RotationApplicationState, RotationPublicState>;
type RotationAdapterFactory = typeof createElectronRuntimeAdapter<
  DeviceIdentity,
  RotationApplicationState,
  RotationPublicState
>;

function createRotationAdapter(
  factory: RotationAdapterFactory,
  storage: KVStorageBackend,
  overrides: {
    dismissNotification?: (id: string) => Promise<void>;
    stopNetwork?: () => Promise<void>;
  } = {},
): RotationAdapter {
  let adapter!: RotationAdapter;
  adapter = factory({
    storage,
    identityKey: "identity",
    applicationStateKey: "runtimeApplicationState",
    initialApplicationState: () => ({}),
    clipboard: { readText: async () => "", writeText: async () => undefined },
    notifications: {
      show: async () => undefined,
      dismiss: overrides.dismissNotification ?? (async () => undefined),
      onSelect: () => () => undefined,
    },
    lifecycle: { onShutdown: () => () => undefined, openApprovalView: () => undefined },
    network: {
      start: async () => undefined,
      stop: overrides.stopNetwork ?? (async () => undefined),
      send: async () => undefined,
      connect: async () => undefined,
      onMessage: () => undefined,
      onPeerConnected: () => undefined,
      onPeerDisconnected: () => undefined,
      onSelfPeerUpdate: () => undefined,
      getConnectedPeers: () => [],
    },
    clock: { now: () => 0, setTimeout: () => 1, clearTimeout: () => undefined },
    publicState: {
      read: async () => ({ recovering: false }),
      publish: async () => undefined,
    },
    relays: {
      readAddresses: async () => [],
      updateAddresses: async (addresses) => [...addresses],
    },
  });
  return adapter;
}

const rotationAdapterCases = [
  ["electron", createElectronRuntimeAdapter],
  ["android", createAndroidRuntimeAdapter],
  ["chrome-extension", createChromeExtensionRuntimeAdapter],
] as const;

describe("runtime identity initialization", () => {
  it("coordinates recovery state, local-only capture, publication, and restart", async () => {
    let statusListener: ((status: IdentityRotationStatus) => void) | undefined;
    const restart = jest.fn();
    const startLocalRecovery = jest.fn();
    const publishState = jest.fn(async () => undefined);
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation: {
        recoverOrRotate: async () => ({
          rotated: false as const,
          identity: revokedIdentity(),
          recovery: { code: "identity_rotation_recovery" as const, reason: "revoked" as const },
        }),
        rotate: async () => ({ rotated: true as const, reason: "revoked" as const, identity: revokedIdentity() }),
        onStatusChanged(listener) {
          statusListener = listener;
          return () => { statusListener = undefined; };
        },
      },
      loadIdentity: async () => revokedIdentity(),
      restart,
      startLocalRecovery,
      publishState,
    });

    await expect(lifecycle.initialize()).resolves.toEqual({ networkingEnabled: false });
    expect(lifecycle.isRecovering()).toBe(true);
    expect(lifecycle.startLocalOnlyIfRecovering()).toBe(true);
    expect(startLocalRecovery).toHaveBeenCalledTimes(1);

    statusListener?.({ kind: "recovering", reason: "revoked" });
    await Promise.resolve();
    expect(startLocalRecovery).toHaveBeenCalledTimes(2);
    expect(publishState).toHaveBeenCalledTimes(1);

    statusListener?.({ kind: "rotated", reason: "revoked" });
    await lifecycle.rotateRevoked();
    expect(restart).toHaveBeenCalledTimes(1);
  });

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

  it("attempts every required identity-bound shutdown step before reporting a cleanup failure", async () => {
    const calls: string[] = [];
    const notificationFailure = new Error("notification_dismiss_failed");

    await expect(stopIdentityBoundRuntimeServices([
      async () => { calls.push("pairing-sessions"); },
      async () => { calls.push("notifications"); throw notificationFailure; },
      async () => { calls.push("clipboard"); },
      async () => { calls.push("network"); },
    ])).rejects.toBe(notificationFailure);

    expect(calls).toEqual(["pairing-sessions", "notifications", "clipboard", "network"]);
  });

  it.each(rotationAdapterCases)("keeps the %s adapter network offline when notification cleanup fails", async (_platform, factory) => {
    const notificationFailure = new Error("notification_dismiss_failed");
    const stopNetwork = jest.fn(async () => undefined);
    const adapter = createRotationAdapter(factory, new RotationStorage(), {
      dismissNotification: async () => { throw notificationFailure; },
      stopNetwork,
    });

    await expect(stopIdentityBoundRuntimeServices([
      () => adapter.notifications.dismiss("pairing-request-peer"),
      () => adapter.network.stop(),
    ])).rejects.toBe(notificationFailure);

    expect(stopNetwork).toHaveBeenCalledTimes(1);
  });

  it.each(rotationAdapterCases.flatMap(([platform, factory]) => [
    { platform, factory, failedKey: "identity" },
    { platform, factory, failedKey: "identityRotation" },
  ]))("keeps $platform networking down through $failedKey rotation recovery and enables it after restart", async ({ platform, factory, failedKey }) => {
    const storage = new RotationStorage();
    const adapter = createRotationAdapter(factory, storage);
    if (platform !== "electron") (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
    const history = platform === "electron" ? new InMemoryHistoryBackend() : new IndexedDBHistoryBackend();
    await history.clearAll();
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
    const candidatePeerId = `${replacementPeerId}-${platform}-${failedKey}`;
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: candidatePeerId,
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    const createRotation = () => createRuntimeIdentityRotationCoordinator({
      repository,
      storage,
      capabilities: adapter.capabilities,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      shutdown,
      retry: false,
      now: () => 10,
      generateKeyMaterial,
    });
    const localStarted = jest.fn();
    const localRecoveryStarted = jest.fn();
    const networkStarted = jest.fn();
    const restart = jest.fn();
    const createLifecycle = (rotation: ReturnType<typeof createRotation>) => createRuntimeIdentityRotationLifecycle({
      rotation,
      loadIdentity: () => adapter.identity.load(),
      restart,
      startLocalRecovery: localRecoveryStarted,
      publishState: async () => adapter.publicState.publish(await adapter.publicState.read()),
    });
    storage.failNextSetFor = failedKey;
    let rotation = createRotation();
    let lifecycle = createLifecycle(rotation);

    await startIdentityBoundRuntimeServices({
      initializeIdentity: () => lifecycle.initialize(),
      startLocalServices: () => {
        localStarted();
        lifecycle.startLocalOnlyIfRecovering();
      },
      startNetworkServices: networkStarted,
    });

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(localStarted).toHaveBeenCalledTimes(1);
    expect(networkStarted).not.toHaveBeenCalled();
    expect(await adapter.identity.load()).toEqual(revokedIdentity());
    expect(await history.get("old-clip")).not.toBeNull();
    expect(localRecoveryStarted).toHaveBeenCalled();

    if (failedKey === "identity") {
      lifecycle.dispose();
      rotation.stop();
      rotation = createRotation();
      lifecycle = createLifecycle(rotation);
    }
    await expect(startIdentityBoundRuntimeServices({
      initializeIdentity: () => lifecycle.initialize(),
      startLocalServices: localStarted,
      startNetworkServices: networkStarted,
    })).rejects.toThrow("identity_rotated_restart_required");
    expect(localStarted).toHaveBeenCalledTimes(1);
    expect(networkStarted).not.toHaveBeenCalled();
    expect(await history.getAll()).toEqual([]);
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledTimes(1);

    lifecycle.dispose();
    rotation.stop();
    rotation = createRotation();
    lifecycle = createLifecycle(rotation);
    await startIdentityBoundRuntimeServices({
      initializeIdentity: () => lifecycle.initialize(),
      startLocalServices: localStarted,
      startNetworkServices: networkStarted,
    });
    expect(localStarted).toHaveBeenCalledTimes(2);
    expect(networkStarted).toHaveBeenCalledTimes(1);
    expect(await adapter.identity.load()).toMatchObject({
      deviceId: candidatePeerId,
      nameRevision: 0,
      membershipView: {
        admittedPeerIds: [candidatePeerId],
        revokedPeerIds: [],
      },
    });
  });

  it.each(rotationAdapterCases)("lets the %s adapter activate when its best-effort rotation notice fails", async (platform, factory) => {
    const storage = new RotationStorage();
    const adapter = createRotationAdapter(factory, storage);
    if (platform !== "electron") (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
    const history = platform === "electron" ? new InMemoryHistoryBackend() : new IndexedDBHistoryBackend();
    await history.clearAll();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert(revokedIdentity());
    await history.set("old-clip", {
      clip: { id: "old-clip", type: "text", content: "old", originPeerId: revokedPeerId, capturedAt: 1, shareExpiresAt: 2 },
      firstStoredAt: 1,
      liveHandled: true,
      pinned: false,
    });
    storage.failNextSetFor = "identityRotationNotice";
    const restart = jest.fn();
    const candidatePeerId = `${replacementPeerId}-${platform}-notice`;
    const rotation = createRuntimeIdentityRotationCoordinator({
      repository,
      storage,
      capabilities: adapter.capabilities,
      committer: createIdentityRotationCommitter({ repository, storage, history }),
      shutdown: async () => undefined,
      retry: false,
      generateKeyMaterial: async () => ({
        peerId: candidatePeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }),
    });
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation,
      loadIdentity: () => adapter.identity.load(),
      restart,
      startLocalRecovery: () => undefined,
      publishState: async () => adapter.publicState.publish(await adapter.publicState.read()),
    });

    await expect(lifecycle.initialize()).rejects.toThrow("identity_rotated_restart_required");
    expect(await adapter.identity.load()).toMatchObject({ deviceId: candidatePeerId });
    expect(await history.getAll()).toEqual([]);
    expect(await storage.get("identityRotationNotice")).toBeUndefined();
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
