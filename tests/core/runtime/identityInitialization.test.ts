import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeIdentityManager,
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
import {
  createKVIdentityRepository,
  type KVStorageBackend,
} from "../../../packages/core/trust/storage";
import type { DeviceIdentity } from "../../../packages/core/trust/identity";
import { IDENTITY_RESET_JOURNAL_KEY } from "../../../packages/core/trust/manualIdentityReset";

class RotationStorage implements KVStorageBackend {
  readonly values = new Map<string, unknown>();
  failNextSetFor: string | undefined;
  failRemoveFor: string | undefined;
  failGetFor: string | undefined;

  async get<T>(key: string): Promise<T | undefined> {
    if (key === this.failGetFor)
      throw new Error("private_backend_failure_detail");
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
    if (key === this.failRemoveFor) throw new Error("identity_remove_failed");
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

function lostIdentity(): DeviceIdentity {
  return {
    ...revokedIdentity(),
    privateKey: undefined,
    membershipView: {
      admittedPeerIds: [revokedPeerId, "remote-peer"],
      revokedPeerIds: [],
    },
  };
}

type RotationApplicationState = Record<string, never>;
type RotationPublicState = { recovering: boolean };
type RotationAdapter = RuntimeAdapter<
  DeviceIdentity,
  RotationApplicationState,
  RotationPublicState
>;
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
  } = {}
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
    lifecycle: {
      onShutdown: () => () => undefined,
      openApprovalView: () => undefined,
    },
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
  it("seals manual recovery before loading the cached identity or starting local services", async () => {
    const loadIdentity = jest.fn(async () => revokedIdentity());
    const startLocalRecovery = jest.fn();
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation: {
        recoverOrRotate: async () => ({
          rotated: false,
          identity: undefined,
          recovery: {
            code: "manual_identity_reset_recovery",
            state: { phase: "accepted", operationId: "manual-operation" },
          },
        }),
        rotate: jest.fn(),
        onStatusChanged: () => () => undefined,
      },
      loadIdentity,
      restart: jest.fn(),
      startLocalRecovery,
      publishState: async () => undefined,
    });

    await startIdentityBoundRuntimeServices({
      initializeIdentity: () => lifecycle.initialize(),
      startLocalServices,
      startNetworkServices,
    });

    expect(lifecycle.isRecovering()).toBe(true);
    expect(lifecycle.startLocalOnlyIfRecovering()).toBe(true);
    expect(loadIdentity).not.toHaveBeenCalled();
    expect(startLocalRecovery).not.toHaveBeenCalled();
    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
  });

  it("keeps the former cached runtime sealed after actual manual completion and admits the new identity only after restart", async () => {
    const storage = new RotationStorage();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      ...revokedIdentity(),
      membershipView: { admittedPeerIds: [revokedPeerId], revokedPeerIds: [] },
    });
    const capabilities = { platform: "electron" as const };
    const deriveKeyMaterial = async (privateKey: string) => ({
      peerId: privateKey === "old-private" ? revokedPeerId : replacementPeerId,
      privateKey,
      publicKey:
        privateKey === "old-private" ? "old-public" : "replacement-public",
    });
    const createManager = () =>
      createRuntimeIdentityManager({
        repo: repository,
        capabilities,
        deriveKeyMaterial,
      });
    const createRotation = () =>
      createRuntimeIdentityRotationCoordinator({
        repository,
        storage,
        capabilities,
        committer: createIdentityRotationCommitter({
          repository,
          storage,
          history: new InMemoryHistoryBackend(),
        }),
        shutdown: async () => undefined,
        retry: false,
        deriveKeyMaterial,
        generateKeyMaterial: async () => ({
          peerId: replacementPeerId,
          privateKey: "replacement-private",
          publicKey: "replacement-public",
        }),
        manualReset: {
          storage,
          acquireFence: async () => ({ release: async () => undefined }),
          quiesce: async () => undefined,
          clearIdentityBoundData: async () => undefined,
          installIdentity: (candidate) => repository.upsert(candidate),
          verifyCleanup: async () => undefined,
        },
      });
    const oldManager = createManager();
    const loadIdentity = jest.fn(() => oldManager.get());
    const restart = jest.fn(() => {
      throw new Error("host_restart_failed_private_detail");
    });
    const rotation = createRotation();
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation,
      loadIdentity,
      restart,
      startLocalRecovery: jest.fn(),
      publishState: async () => undefined,
    });
    await lifecycle.initialize();
    loadIdentity.mockClear();

    await expect(
      rotation.beginIdentityReset({
        operationId: "manual-runtime-operation",
        reviewedPeerId: revokedPeerId,
      })
    ).resolves.toMatchObject({ outcome: "completed" });
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        startIdentityBoundRuntimeServices({
          initializeIdentity: () => lifecycle.initialize(),
          startLocalServices,
          startNetworkServices,
        })
      ).rejects.toThrow("manual_identity_reset_restart_required");
    }
    expect(restart).toHaveBeenCalledTimes(1);
    expect(loadIdentity).not.toHaveBeenCalled();
    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
    lifecycle.dispose();
    rotation.stop();

    const newManager = createManager();
    const restartedRotation = createRotation();
    const restartedLifecycle = createRuntimeIdentityRotationLifecycle({
      rotation: restartedRotation,
      loadIdentity: () => newManager.get(),
      restart,
      startLocalRecovery: jest.fn(),
      publishState: async () => undefined,
    });
    await startIdentityBoundRuntimeServices({
      initializeIdentity: () => restartedLifecycle.initialize(),
      startLocalServices,
      startNetworkServices,
    });
    expect(await newManager.get()).toMatchObject({
      deviceId: replacementPeerId,
      deviceName: "Desktop",
      nameRevision: 0,
    });
    expect(startLocalServices).toHaveBeenCalledTimes(1);
    expect(startNetworkServices).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledTimes(1);
    restartedLifecycle.dispose();
    restartedRotation.stop();
  });

  it.each(["malformed", "unreadable"] as const)(
    "keeps a %s manual journal sealed before ordinary identity initialization",
    async (failure) => {
      const storage = new RotationStorage();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      await repository.upsert(revokedIdentity());
      if (failure === "malformed")
        await storage.set(IDENTITY_RESET_JOURNAL_KEY, {
          version: 999,
          candidate: "private-invalid-candidate",
        });
      else storage.failGetFor = IDENTITY_RESET_JOURNAL_KEY;
      const generateKeyMaterial = jest.fn();
      const rotation = createRuntimeIdentityRotationCoordinator({
        repository,
        storage,
        capabilities: { platform: "electron" },
        committer: createIdentityRotationCommitter({
          repository,
          storage,
          history: new InMemoryHistoryBackend(),
        }),
        shutdown: async () => undefined,
        retry: false,
        generateKeyMaterial,
      });
      const loadIdentity = jest.fn();
      const startLocalRecovery = jest.fn();
      const startLocalServices = jest.fn();
      const startNetworkServices = jest.fn();
      const lifecycle = createRuntimeIdentityRotationLifecycle({
        rotation,
        loadIdentity,
        restart: jest.fn(),
        startLocalRecovery,
        publishState: async () => undefined,
      });

      await startIdentityBoundRuntimeServices({
        initializeIdentity: () => lifecycle.initialize(),
        startLocalServices,
        startNetworkServices,
      });

      expect(lifecycle.isRecovering()).toBe(true);
      expect(loadIdentity).not.toHaveBeenCalled();
      expect(generateKeyMaterial).not.toHaveBeenCalled();
      expect(startLocalRecovery).not.toHaveBeenCalled();
      expect(startLocalServices).not.toHaveBeenCalled();
      expect(startNetworkServices).not.toHaveBeenCalled();
      lifecycle.dispose();
      rotation.stop();
    }
  );

  it("keeps an actual accepted reset suspended after reopening without manual cleanup ports", async () => {
    const storage = new RotationStorage();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      ...revokedIdentity(),
      membershipView: { admittedPeerIds: [revokedPeerId], revokedPeerIds: [] },
    });
    const generateKeyMaterial = jest.fn(async () => ({
      peerId: replacementPeerId,
      privateKey: "replacement-private",
      publicKey: "replacement-public",
    }));
    const options = {
      repository,
      storage,
      capabilities: { platform: "electron" as const },
      committer: createIdentityRotationCommitter({
        repository,
        storage,
        history: new InMemoryHistoryBackend(),
      }),
      shutdown: async () => undefined,
      retry: false as const,
      generateKeyMaterial,
      deriveKeyMaterial: async (privateKey: string) => ({
        peerId:
          privateKey === "old-private" ? revokedPeerId : replacementPeerId,
        privateKey,
        publicKey:
          privateKey === "old-private" ? "old-public" : "replacement-public",
      }),
    };
    const rotation = createRuntimeIdentityRotationCoordinator({
      ...options,
      manualReset: {
        storage,
        acquireFence: async () => ({ release: async () => undefined }),
        quiesce: async () => undefined,
        clearIdentityBoundData: async () => {
          throw new Error("private_cleanup_failure");
        },
        installIdentity: (candidate) => repository.upsert(candidate),
        verifyCleanup: async () => undefined,
      },
    });
    await expect(
      rotation.beginIdentityReset({
        operationId: "manual-interrupted-operation",
        reviewedPeerId: revokedPeerId,
      })
    ).resolves.toMatchObject({ outcome: "accepted" });
    rotation.stop();
    const reopenedRotation = createRuntimeIdentityRotationCoordinator(options);
    const loadIdentity = jest.fn();
    const startLocalRecovery = jest.fn();
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation: reopenedRotation,
      loadIdentity,
      restart: jest.fn(),
      startLocalRecovery,
      publishState: async () => undefined,
    });

    await startIdentityBoundRuntimeServices({
      initializeIdentity: () => lifecycle.initialize(),
      startLocalServices,
      startNetworkServices,
    });

    expect(lifecycle.isRecovering()).toBe(true);
    expect(loadIdentity).not.toHaveBeenCalled();
    expect(startLocalRecovery).not.toHaveBeenCalled();
    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
    expect(generateKeyMaterial).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
    reopenedRotation.stop();
  });

  it("keeps local work suspended when manual acceptance arrives during ordinary identity loading", async () => {
    let listener: ((status: IdentityRotationStatus) => void) | undefined;
    let finishIdentityLoad!: () => void;
    const identityLoading = new Promise<void>((resolve) => {
      finishIdentityLoad = resolve;
    });
    const startLocalRecovery = jest.fn();
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation: {
        recoverOrRotate: async () => ({ rotated: false, identity: undefined }),
        rotate: jest.fn(),
        onStatusChanged: (next) => {
          listener = next;
          return () => undefined;
        },
      },
      loadIdentity: () => identityLoading,
      restart: jest.fn(),
      startLocalRecovery,
      publishState: async () => undefined,
    });
    const starting = startIdentityBoundRuntimeServices({
      initializeIdentity: () => lifecycle.initialize(),
      startLocalServices,
      startNetworkServices,
    });
    await Promise.resolve();
    listener?.({
      kind: "manual-reset",
      state: { phase: "accepted", operationId: "manual-late-operation" },
    });
    listener?.({ kind: "recovering", reason: "revoked" });
    listener?.({ kind: "idle" });
    finishIdentityLoad();
    await starting;

    expect(lifecycle.isRecovering()).toBe(true);
    expect(startLocalRecovery).not.toHaveBeenCalled();
    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it("resumes ordinary startup when the actual owner proves an uncertain start was not accepted", async () => {
    const storage = new RotationStorage();
    const repository = createKVIdentityRepository({ storage, key: "identity" });
    await repository.upsert({
      ...revokedIdentity(),
      membershipView: { admittedPeerIds: [revokedPeerId], revokedPeerIds: [] },
    });
    storage.failGetFor = IDENTITY_RESET_JOURNAL_KEY;
    const rotation = createRuntimeIdentityRotationCoordinator({
      repository,
      storage,
      capabilities: { platform: "electron" },
      committer: createIdentityRotationCommitter({
        repository,
        storage,
        history: new InMemoryHistoryBackend(),
      }),
      shutdown: async () => undefined,
      retry: false,
      deriveKeyMaterial: async (privateKey) => ({
        peerId: revokedPeerId,
        privateKey,
        publicKey: "old-public",
      }),
    });
    const loadIdentity = jest.fn(() => repository.get());
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation,
      loadIdentity,
      restart: jest.fn(),
      startLocalRecovery: jest.fn(),
      publishState: async () => undefined,
    });
    await expect(lifecycle.initialize()).resolves.toEqual({
      networkingEnabled: false,
      localServicesEnabled: false,
    });
    expect(loadIdentity).not.toHaveBeenCalled();

    storage.failGetFor = undefined;
    await expect(rotation.reconcileIdentityReset()).resolves.toMatchObject({
      phase: "idle",
      acceptance: "not-accepted",
    });

    expect(lifecycle.isRecovering()).toBe(false);
    await expect(lifecycle.initialize()).resolves.toEqual({
      networkingEnabled: true,
    });
    expect(loadIdentity).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
    rotation.stop();
  });

  it("does not publish an idle manual reminder as a startup recovery event", async () => {
    let listener: ((status: IdentityRotationStatus) => void) | undefined;
    const publishState = jest.fn(async () => undefined);
    const loadIdentity = jest.fn(async () => revokedIdentity());
    const lifecycle = createRuntimeIdentityRotationLifecycle({
      rotation: {
        recoverOrRotate: async () => ({ rotated: false, identity: undefined }),
        rotate: jest.fn(),
        onStatusChanged: (next) => {
          listener = next;
          return () => undefined;
        },
      },
      loadIdentity,
      restart: jest.fn(),
      startLocalRecovery: jest.fn(),
      publishState,
    });

    listener?.({ kind: "manual-reset", state: { phase: "idle" } });
    await Promise.resolve();

    expect(lifecycle.isRecovering()).toBe(false);
    expect(publishState).not.toHaveBeenCalled();
    expect(loadIdentity).not.toHaveBeenCalled();
    await expect(lifecycle.initialize()).resolves.toEqual({
      networkingEnabled: true,
    });
    lifecycle.dispose();
  });

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
          recovery: {
            code: "identity_rotation_recovery" as const,
            reason: "revoked" as const,
          },
        }),
        rotate: async () => ({
          rotated: true as const,
          reason: "revoked" as const,
          identity: revokedIdentity(),
        }),
        onStatusChanged(listener) {
          statusListener = listener;
          return () => {
            statusListener = undefined;
          };
        },
      },
      loadIdentity: async () => revokedIdentity(),
      restart,
      startLocalRecovery,
      publishState,
    });

    await expect(lifecycle.initialize()).resolves.toEqual({
      networkingEnabled: false,
    });
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

  it.each(rotationAdapterCases)(
    "keeps the %s adapter offline without inventing an identity during Identity Loss recovery",
    async (platform, factory) => {
      const storage = new RotationStorage();
      const adapter = createRotationAdapter(factory, storage);
      if (platform !== "electron")
        (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
      const history =
        platform === "electron"
          ? new InMemoryHistoryBackend()
          : new IndexedDBHistoryBackend();
      await history.clearAll();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      await repository.upsert({ ...revokedIdentity(), privateKey: undefined });
      const rotation = createRuntimeIdentityRotationCoordinator({
        repository,
        storage,
        capabilities: adapter.capabilities,
        committer: createIdentityRotationCommitter({
          repository,
          storage,
          history,
        }),
        shutdown: async () => undefined,
        retry: false,
        generateKeyMaterial: async () => ({
          peerId: `${replacementPeerId}-${platform}-identity-loss`,
          privateKey: "replacement-private",
          publicKey: "replacement-public",
        }),
      });
      const loadIdentity = jest.fn(async () => {
        throw new Error("identity_must_not_be_recreated");
      });
      const startLocalRecovery = jest.fn();
      const lifecycle = createRuntimeIdentityRotationLifecycle({
        rotation,
        loadIdentity,
        restart: jest.fn(),
        startLocalRecovery,
        publishState: async () => undefined,
      });
      storage.failNextSetFor = "identity";

      await expect(lifecycle.initialize()).resolves.toEqual({
        networkingEnabled: false,
      });
      expect(lifecycle.isRecovering()).toBe(true);
      expect(lifecycle.startLocalOnlyIfRecovering()).toBe(true);
      expect(loadIdentity).not.toHaveBeenCalled();
      expect(startLocalRecovery).not.toHaveBeenCalled();
      expect(await repository.get()).toMatchObject({
        deviceId: revokedPeerId,
        privateKey: undefined,
      });
    }
  );

  it.each(rotationAdapterCases)(
    "repairs the %s adapter's redundant identity metadata without rotating",
    async (platform, factory) => {
      const storage = new RotationStorage();
      const adapter = createRotationAdapter(factory, storage);
      const history = new InMemoryHistoryBackend();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      const repairedPeerId = `${platform}-repaired-peer`;
      await repository.upsert({
        ...revokedIdentity(),
        deviceId: "wrong-peer-id",
        publicKey: "wrong-public-key",
        privateKey: "valid-private-key",
        membershipView: {
          admittedPeerIds: ["wrong-peer-id"],
          revokedPeerIds: [],
        },
      });
      const shutdown = jest.fn(async () => undefined);
      const rotation = createRuntimeIdentityRotationCoordinator({
        repository,
        storage,
        capabilities: adapter.capabilities,
        committer: createIdentityRotationCommitter({
          repository,
          storage,
          history,
        }),
        shutdown,
        retry: false,
        deriveKeyMaterial: async () => ({
          peerId: repairedPeerId,
          privateKey: "valid-private-key",
          publicKey: "derived-public-key",
        }),
      });

      await expect(rotation.recoverOrRotate()).resolves.toMatchObject({
        rotated: false,
        identity: { deviceId: repairedPeerId, publicKey: "derived-public-key" },
      });
      expect(await repository.get()).toMatchObject({
        deviceId: repairedPeerId,
        publicKey: "derived-public-key",
      });
      expect(shutdown).not.toHaveBeenCalled();
    }
  );

  it.each(rotationAdapterCases)(
    "starts the %s adapter as an ordinary first launch when no identity is stored",
    async (platform, factory) => {
      const storage = new RotationStorage();
      const adapter = createRotationAdapter(factory, storage);
      const history = new InMemoryHistoryBackend();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      const firstLaunchPeerId = `${platform}-first-launch-peer`;
      const generateRotationCandidate = jest.fn(async () => ({
        peerId: `${platform}-unexpected-rotation-peer`,
        privateKey: "unexpected-rotation-private",
        publicKey: "unexpected-rotation-public",
      }));
      const identity = createRuntimeIdentityManager({
        repo: repository,
        capabilities: adapter.capabilities,
        generateKeyMaterial: async () => ({
          peerId: firstLaunchPeerId,
          privateKey: "first-launch-private",
          publicKey: "first-launch-public",
        }),
        deriveKeyMaterial: async (privateKey) => ({
          peerId: firstLaunchPeerId,
          privateKey,
          publicKey: "first-launch-public",
        }),
      });
      const rotation = createRuntimeIdentityRotationCoordinator({
        repository,
        storage,
        capabilities: adapter.capabilities,
        committer: createIdentityRotationCommitter({
          repository,
          storage,
          history,
        }),
        shutdown: async () => undefined,
        retry: false,
        generateKeyMaterial: generateRotationCandidate,
      });
      const localStarted = jest.fn();
      const networkStarted = jest.fn();
      const restart = jest.fn();
      const lifecycle = createRuntimeIdentityRotationLifecycle({
        rotation,
        loadIdentity: () => identity.get(),
        restart,
        startLocalRecovery: jest.fn(),
        publishState: async () => undefined,
      });

      await startIdentityBoundRuntimeServices({
        initializeIdentity: () => lifecycle.initialize(),
        startLocalServices: localStarted,
        startNetworkServices: networkStarted,
      });

      expect(await adapter.identity.load()).toMatchObject({
        deviceId: firstLaunchPeerId,
        membershipView: {
          admittedPeerIds: [firstLaunchPeerId],
          revokedPeerIds: [],
        },
      });
      expect(generateRotationCandidate).not.toHaveBeenCalled();
      expect(localStarted).toHaveBeenCalledTimes(1);
      expect(networkStarted).toHaveBeenCalledTimes(1);
      expect(restart).not.toHaveBeenCalled();
    }
  );

  it("starts neither local nor network services when Device Identity initialization fails", async () => {
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();

    await expect(
      startIdentityBoundRuntimeServices({
        initializeIdentity: async () => {
          throw new Error("identity_initialization_failed");
        },
        startLocalServices,
        startNetworkServices,
      })
    ).rejects.toThrow("identity_initialization_failed");

    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
  });

  it("keeps local capture and networking suspended when manual recovery disables local services", async () => {
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();

    await startIdentityBoundRuntimeServices({
      initializeIdentity: async () => ({
        networkingEnabled: false,
        localServicesEnabled: false,
      }),
      startLocalServices,
      startNetworkServices,
    });

    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
  });

  it("keeps local services active when networking fails after Device Identity initialization", async () => {
    const calls: string[] = [];
    const networkFailure = new Error("network_unavailable");

    await expect(
      startIdentityBoundRuntimeServices({
        initializeIdentity: async () => {
          calls.push("identity");
        },
        startLocalServices: () => {
          calls.push("local");
        },
        startNetworkServices: async () => {
          calls.push("network");
          throw networkFailure;
        },
        onNetworkingFailure: (error) => {
          calls.push(`network-failed:${(error as Error).message}`);
        },
      })
    ).resolves.toBeUndefined();

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

    await expect(
      stopIdentityBoundRuntimeServices([
        async () => {
          calls.push("pairing-sessions");
        },
        async () => {
          calls.push("notifications");
          throw notificationFailure;
        },
        async () => {
          calls.push("clipboard");
        },
        async () => {
          calls.push("network");
        },
      ])
    ).rejects.toBe(notificationFailure);

    expect(calls).toEqual([
      "pairing-sessions",
      "notifications",
      "clipboard",
      "network",
    ]);
  });

  it.each(rotationAdapterCases)(
    "keeps the %s adapter network offline when notification cleanup fails",
    async (_platform, factory) => {
      const notificationFailure = new Error("notification_dismiss_failed");
      const stopNetwork = jest.fn(async () => undefined);
      const adapter = createRotationAdapter(factory, new RotationStorage(), {
        dismissNotification: async () => {
          throw notificationFailure;
        },
        stopNetwork,
      });

      await expect(
        stopIdentityBoundRuntimeServices([
          () => adapter.notifications.dismiss("pairing-request-peer"),
          () => adapter.network.stop(),
        ])
      ).rejects.toBe(notificationFailure);

      expect(stopNetwork).toHaveBeenCalledTimes(1);
    }
  );

  it.each(
    rotationAdapterCases.flatMap(([platform, factory]) =>
      (["identity-loss", "revoked"] as const).flatMap((reason) => [
        {
          platform,
          factory,
          reason,
          failure: "candidate activation",
          failedKey: "identity",
        },
        {
          platform,
          factory,
          reason,
          failure: "rotation marker persistence",
          failedKey: "identityRotation",
        },
      ])
    )
  )(
    "keeps $platform offline through interrupted $reason $failure and reuses the candidate",
    async ({ platform, factory, reason, failedKey }) => {
      const storage = new RotationStorage();
      const adapter = createRotationAdapter(factory, storage);
      if (platform !== "electron")
        (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
      const history =
        platform === "electron"
          ? new InMemoryHistoryBackend()
          : new IndexedDBHistoryBackend();
      await history.clearAll();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      const formerIdentity =
        reason === "revoked" ? revokedIdentity() : lostIdentity();
      await repository.upsert(formerIdentity);
      await history.set("old-clip", {
        clip: {
          id: "old-clip",
          type: "text",
          content: "available during identity recovery",
          originPeerId: revokedPeerId,
          capturedAt: 1,
          shareExpiresAt: 2,
        },
        firstStoredAt: 1,
        liveHandled: true,
        pinned: false,
      });
      const shutdown = jest.fn(async () => undefined);
      const candidatePeerId = `${replacementPeerId}-${platform}-${reason}-${failedKey}`;
      const generateKeyMaterial = jest.fn(async () => ({
        peerId: candidatePeerId,
        privateKey: "replacement-private",
        publicKey: "replacement-public",
      }));
      const createRotation = () =>
        createRuntimeIdentityRotationCoordinator({
          repository,
          storage,
          capabilities: adapter.capabilities,
          committer: createIdentityRotationCommitter({
            repository,
            storage,
            history,
          }),
          shutdown,
          retry: false,
          now: () => 10,
          generateKeyMaterial,
          deriveKeyMaterial: async (privateKey) =>
            privateKey === "old-private"
              ? { peerId: revokedPeerId, privateKey, publicKey: "old-public" }
              : {
                  peerId: candidatePeerId,
                  privateKey,
                  publicKey: "replacement-public",
                },
        });
      const localStarted = jest.fn();
      const localRecoveryStarted = jest.fn();
      const networkStarted = jest.fn();
      const restart = jest.fn();
      const createLifecycle = (rotation: ReturnType<typeof createRotation>) =>
        createRuntimeIdentityRotationLifecycle({
          rotation,
          loadIdentity: () => adapter.identity.load(),
          restart,
          startLocalRecovery: localRecoveryStarted,
          publishState: async () =>
            adapter.publicState.publish(await adapter.publicState.read()),
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
      if (reason === "revoked") expect(localRecoveryStarted).toHaveBeenCalled();
      else expect(localRecoveryStarted).not.toHaveBeenCalled();
      expect(networkStarted).not.toHaveBeenCalled();
      expect(await adapter.identity.load()).toEqual(formerIdentity);
      expect(await history.get("old-clip")).not.toBeNull();

      if (failedKey === "identity") {
        lifecycle.dispose();
        rotation.stop();
        rotation = createRotation();
        lifecycle = createLifecycle(rotation);
      }
      await expect(
        startIdentityBoundRuntimeServices({
          initializeIdentity: () => lifecycle.initialize(),
          startLocalServices: localStarted,
          startNetworkServices: networkStarted,
        })
      ).rejects.toThrow("identity_rotated_restart_required");
      expect(localStarted).toHaveBeenCalledTimes(1);
      expect(networkStarted).not.toHaveBeenCalled();
      expect(await history.getAll()).toEqual([]);
      expect(await storage.get("identityRotationNotice")).toMatchObject({
        reason,
      });
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
        deviceName:
          platform === "electron"
            ? "Desktop"
            : platform === "android"
              ? "Mobile"
              : "Extension",
        nameRevision: 0,
        membershipView: {
          admittedPeerIds: [candidatePeerId],
          revokedPeerIds: [],
        },
      });
      lifecycle.dispose();
      rotation.stop();
    }
  );

  it.each(rotationAdapterCases)(
    "lets the %s adapter activate when its best-effort rotation notice fails",
    async (platform, factory) => {
      const storage = new RotationStorage();
      const adapter = createRotationAdapter(factory, storage);
      if (platform !== "electron")
        (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
      const history =
        platform === "electron"
          ? new InMemoryHistoryBackend()
          : new IndexedDBHistoryBackend();
      await history.clearAll();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      await repository.upsert(revokedIdentity());
      await history.set("old-clip", {
        clip: {
          id: "old-clip",
          type: "text",
          content: "old",
          originPeerId: revokedPeerId,
          capturedAt: 1,
          shareExpiresAt: 2,
        },
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
        committer: createIdentityRotationCommitter({
          repository,
          storage,
          history,
        }),
        shutdown: async () => undefined,
        retry: false,
        generateKeyMaterial: async () => ({
          peerId: candidatePeerId,
          privateKey: "replacement-private",
          publicKey: "replacement-public",
        }),
        deriveKeyMaterial: async (privateKey) =>
          privateKey === "old-private"
            ? { peerId: revokedPeerId, privateKey, publicKey: "old-public" }
            : {
                peerId: candidatePeerId,
                privateKey,
                publicKey: "replacement-public",
              },
      });
      const lifecycle = createRuntimeIdentityRotationLifecycle({
        rotation,
        loadIdentity: () => adapter.identity.load(),
        restart,
        startLocalRecovery: () => undefined,
        publishState: async () =>
          adapter.publicState.publish(await adapter.publicState.read()),
      });

      await expect(lifecycle.initialize()).rejects.toThrow(
        "identity_rotated_restart_required"
      );
      expect(await adapter.identity.load()).toMatchObject({
        deviceId: candidatePeerId,
      });
      expect(await history.getAll()).toEqual([]);
      expect(await storage.get("identityRotationNotice")).toBeUndefined();
      expect(restart).toHaveBeenCalledTimes(1);
    }
  );

  it.each(rotationAdapterCases)(
    "keeps the %s adapter offline until a committed marker is removed",
    async (platform, factory) => {
      const storage = new RotationStorage();
      const adapter = createRotationAdapter(factory, storage);
      if (platform !== "electron")
        (globalThis as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
      const history =
        platform === "electron"
          ? new InMemoryHistoryBackend()
          : new IndexedDBHistoryBackend();
      await history.clearAll();
      const repository = createKVIdentityRepository({
        storage,
        key: "identity",
      });
      await repository.upsert(revokedIdentity());
      const candidatePeerId = `${replacementPeerId}-${platform}-marker-removal`;
      const restart = jest.fn();
      const localStarted = jest.fn();
      const networkStarted = jest.fn();
      const createRotation = () =>
        createRuntimeIdentityRotationCoordinator({
          repository,
          storage,
          capabilities: adapter.capabilities,
          committer: createIdentityRotationCommitter({
            repository,
            storage,
            history,
          }),
          shutdown: async () => undefined,
          retry: false,
          generateKeyMaterial: async () => ({
            peerId: candidatePeerId,
            privateKey: "replacement-private",
            publicKey: "replacement-public",
          }),
          deriveKeyMaterial: async (privateKey) =>
            privateKey === "old-private"
              ? { peerId: revokedPeerId, privateKey, publicKey: "old-public" }
              : {
                  peerId: candidatePeerId,
                  privateKey,
                  publicKey: "replacement-public",
                },
        });
      const createLifecycle = (rotation: ReturnType<typeof createRotation>) =>
        createRuntimeIdentityRotationLifecycle({
          rotation,
          loadIdentity: () => adapter.identity.load(),
          restart,
          startLocalRecovery: localStarted,
          publishState: async () =>
            adapter.publicState.publish(await adapter.publicState.read()),
        });
      storage.failRemoveFor = "identityRotation";

      let rotation = createRotation();
      let lifecycle = createLifecycle(rotation);
      await expect(lifecycle.initialize()).rejects.toThrow(
        "identity_rotated_restart_required"
      );
      expect(restart).toHaveBeenCalledTimes(1);
      expect(localStarted).not.toHaveBeenCalled();
      expect(await storage.get("identityRotation")).toMatchObject({
        phase: "committed",
        candidateDeviceId: candidatePeerId,
      });
      expect(
        JSON.stringify(await storage.get("identityRotation"))
      ).not.toContain("old-private");

      lifecycle.dispose();
      rotation.stop();
      rotation = createRotation();
      lifecycle = createLifecycle(rotation);
      await startIdentityBoundRuntimeServices({
        initializeIdentity: () => lifecycle.initialize(),
        startLocalServices: localStarted,
        startNetworkServices: networkStarted,
      });
      expect(restart).toHaveBeenCalledTimes(1);
      expect(localStarted).toHaveBeenCalledTimes(1);
      expect(networkStarted).toHaveBeenCalledTimes(1);
      expect(await storage.get("identityRotation")).toBeDefined();
      lifecycle.dispose();
      rotation.stop();
    }
  );
});
