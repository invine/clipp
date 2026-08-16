import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeConformanceHarness,
  createRuntimeIdentityManager,
  createRuntimeOrchestrator,
  startIdentityBoundRuntimeServices,
} from "../../../packages/core/runtime";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import {
  createIdentityManager,
  createKVIdentityRepository,
  toPublicDeviceIdentity,
  type DeviceIdentity,
  type IdentityRepository,
} from "../../../packages/core/trust";

const generatedIdentity = {
  peerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
  privateKey: "private-key",
  publicKey: "public-key",
};

function createManager(repo: IdentityRepository, initialDeviceName: string) {
  return createIdentityManager({
    repo,
    initialDeviceName,
    now: () => 123,
    generateKeyMaterial: async () => generatedIdentity,
    deriveKeyMaterial: async () => generatedIdentity,
  });
}

describe("Device Identity initialization", () => {
  it.each([
    ["Electron", createElectronRuntimeAdapter, "Desktop"],
    ["Android", createAndroidRuntimeAdapter, "Mobile"],
    ["Chrome", createChromeExtensionRuntimeAdapter, "Extension"],
  ] as const)("creates a singleton Device Network for %s", async (_platform, createAdapter, expectedDeviceName) => {
    const harness = createRuntimeConformanceHarness({
      capabilities: {
        platform: "electron" as const,
        clipboardCapture: "polling" as const,
        relayConfiguration: "editable" as const,
        pinPersistence: "durable" as const,
        notificationApi: "electron" as const,
        postRotationClipboardCapture: "baseline-current" as const,
      },
      initialApplicationState: {},
      getPublicState: async () => ({}),
    });
    const adapter = createAdapter({
      storage: {
        get: async <Value>(key: string) => key === "identity" ? (await harness.adapter.identity.load()) as Value : undefined,
        set: async <Value>(key: string, value: Value) => {
          if (key === "identity") await harness.adapter.identity.save(value);
        },
        remove: async () => {},
      },
      identityKey: "identity",
      applicationStateKey: "runtime-state",
      initialApplicationState: () => ({}),
      clipboard: harness.adapter.clipboard,
      notifications: harness.adapter.notifications,
      lifecycle: harness.adapter.lifecycle,
      network: harness.adapter.network,
      clock: harness.adapter.clock,
      publicState: harness.adapter.publicState,
      relays: { readAddresses: async () => [], updateAddresses: async (addresses) => addresses },
    });
    const identity = await createRuntimeIdentityManager({
      repo: {
        get: () => adapter.identity.load() as Promise<DeviceIdentity | undefined>,
        upsert: (value) => adapter.identity.save(value),
      },
      capabilities: adapter.capabilities,
      now: () => 123,
      generateKeyMaterial: async () => generatedIdentity,
      deriveKeyMaterial: async () => generatedIdentity,
    }).get();

    expect(identity).toMatchObject({
      deviceId: generatedIdentity.peerId,
      deviceName: expectedDeviceName,
      nameRevision: 0,
      membershipView: { admittedPeerIds: [generatedIdentity.peerId], revokedPeerIds: [] },
    });
    expect(identity.privateKey).toBe(generatedIdentity.privateKey);
    expect(await adapter.identity.load()).toEqual(identity);
  });

  it("repairs redundant identity metadata from an authoritative private key", async () => {
    const stored = {
      deviceId: "wrong-peer-id",
      deviceName: "Desktop",
      publicKey: "wrong-public-key",
      privateKey: generatedIdentity.privateKey,
      multiaddrs: [],
      createdAt: 1,
    };
    const repo = {
      get: async () => stored,
      upsert: async (value: DeviceIdentity) => {
        Object.assign(stored, value);
      },
    };

    await expect(createManager(repo, "Desktop").get()).resolves.toMatchObject({
      deviceId: generatedIdentity.peerId,
      publicKey: generatedIdentity.publicKey,
      membershipView: { admittedPeerIds: [generatedIdentity.peerId], revokedPeerIds: [] },
    });
  });

  it("does not persist a placeholder when key generation fails", async () => {
    const saved: unknown[] = [];
    const initializationErrors: unknown[] = [];
    const manager = createIdentityManager({
      repo: {
        get: async () => undefined,
        upsert: async (identity) => { saved.push(identity); },
        saveInitializationError: async (error) => { initializationErrors.push(error); },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: async () => {
        throw new Error("key_generation_failed");
      },
    });

    await expect(manager.get()).rejects.toThrow("key_generation_failed");
    expect(saved).toEqual([]);
    expect(initializationErrors).toEqual([{ code: "identity_initialization_failed" }]);
  });

  it("requires an explicit retry after initialization fails", async () => {
    let attempts = 0;
    let initializationError: { code: "identity_initialization_failed" } | undefined;
    const manager = createIdentityManager({
      repo: {
        get: async () => undefined,
        upsert: async () => undefined,
        loadInitializationError: async () => initializationError,
        saveInitializationError: async (error) => { initializationError = error; },
        clearInitializationError: async () => { initializationError = undefined; },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("key_generation_failed");
        return generatedIdentity;
      },
    });

    await expect(manager.get()).rejects.toThrow("key_generation_failed");
    await expect(manager.get()).rejects.toThrow("identity_initialization_failed");
    expect(attempts).toBe(1);

    await expect(manager.retryInitialization()).resolves.toMatchObject({
      deviceId: generatedIdentity.peerId,
    });
    expect(attempts).toBe(2);
    expect(await manager.getInitializationError()).toBeUndefined();
  });

  it("initializes a fresh Device Identity once for concurrent callers", async () => {
    let stored: DeviceIdentity | undefined;
    let generationCount = 0;
    let persistenceCount = 0;
    const manager = createIdentityManager({
      repo: {
        get: async () => stored,
        upsert: async (identity) => {
          persistenceCount += 1;
          stored = structuredClone(identity);
        },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: async () => {
        generationCount += 1;
        await Promise.resolve();
        return {
          peerId: `${generatedIdentity.peerId}-${generationCount}`,
          privateKey: `${generatedIdentity.privateKey}-${generationCount}`,
          publicKey: `${generatedIdentity.publicKey}-${generationCount}`,
        };
      },
    });

    const [first, second] = await Promise.all([manager.get(), manager.get()]);

    expect(second).toEqual(first);
    expect(generationCount).toBe(1);
    expect(persistenceCount).toBe(1);
    expect(stored).toEqual(first);
  });

  it("clears a persisted initialization error after a retry succeeds", async () => {
    let attempts = 0;
    const errors: unknown[] = [];
    const cleared: unknown[] = [];
    const manager = createIdentityManager({
      repo: {
        get: async () => undefined,
        upsert: async () => undefined,
        saveInitializationError: async (error) => { errors.push(error); },
        clearInitializationError: async () => { cleared.push(undefined); },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("key_generation_failed");
        return generatedIdentity;
      },
    });

    await expect(manager.get()).rejects.toThrow("key_generation_failed");
    await expect(manager.retryInitialization()).resolves.toMatchObject({ deviceId: generatedIdentity.peerId });

    expect(errors).toEqual([{ code: "identity_initialization_failed" }]);
    expect(cleared).toEqual([undefined]);
  });

  it("clears a stale initialization error when retry loads an identity committed before marker cleanup failed", async () => {
    let stored: DeviceIdentity | undefined;
    let initializationError: { code: "identity_initialization_failed" } | undefined;
    let clearAttempts = 0;
    const manager = createIdentityManager({
      repo: {
        get: async () => stored,
        upsert: async (identity) => { stored = structuredClone(identity); },
        loadInitializationError: async () => initializationError,
        saveInitializationError: async (error) => { initializationError = error; },
        clearInitializationError: async () => {
          clearAttempts += 1;
          if (clearAttempts === 1) throw new Error("marker_cleanup_failed");
          initializationError = undefined;
        },
      },
      initialDeviceName: "Desktop",
      now: () => 123,
      generateKeyMaterial: async () => generatedIdentity,
      deriveKeyMaterial: async () => generatedIdentity,
    });

    await expect(manager.get()).rejects.toThrow("marker_cleanup_failed");
    expect(stored).toMatchObject({ deviceId: generatedIdentity.peerId });
    expect(await manager.getInitializationError()).toEqual({ code: "identity_initialization_failed" });

    await expect(manager.retryInitialization()).resolves.toMatchObject({ deviceId: generatedIdentity.peerId });
    expect(await manager.getInitializationError()).toBeUndefined();
    expect(clearAttempts).toBe(2);
  });

  it.each([
    ["Electron", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron],
    ["Android", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android],
    ["Chrome", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension],
  ] as const)("keeps capture and networking stopped until %s identity initialization succeeds", async (
    _platform,
    createAdapter,
    capabilities
  ) => {
    const durable = new Map<string, unknown>();
    let identitySaveAttempts = 0;
    const storage = {
      get: async <Value>(key: string) => durable.get(key) as Value | undefined,
      set: async <Value>(key: string, value: Value) => {
        if (key === "identity" && ++identitySaveAttempts === 1) {
          throw new Error("identity_persistence_failed");
        }
        durable.set(key, structuredClone(value));
      },
      remove: async (key: string) => { durable.delete(key); },
    };
    const harness = createRuntimeConformanceHarness({
      capabilities,
      initialApplicationState: {},
      getPublicState: async () => ({}),
    });
    const adapter = createAdapter({
      storage,
      identityKey: "identity",
      applicationStateKey: "runtime-state",
      initialApplicationState: () => ({}),
      clipboard: harness.adapter.clipboard,
      notifications: harness.adapter.notifications,
      lifecycle: harness.adapter.lifecycle,
      network: harness.adapter.network,
      clock: harness.adapter.clock,
      publicState: harness.adapter.publicState,
      relays: {
        readAddresses: async () => [],
        updateAddresses: async (addresses: string[]) => addresses,
      },
    });
    const identity = createRuntimeIdentityManager({
      repo: createKVIdentityRepository({ storage, key: "identity" }),
      capabilities: adapter.capabilities,
      generateKeyMaterial: async () => generatedIdentity,
    });
    const startCapture = jest.fn();
    const startNetworking = jest.fn();
    const runtime = createRuntimeOrchestrator({
      adapter,
      start: () => startIdentityBoundRuntimeServices({
        initializeIdentity: () => identity.get(),
        startLocalServices: startCapture,
        startNetworkServices: startNetworking,
      }),
    });

    await expect(runtime.start()).rejects.toThrow("identity_persistence_failed");
    expect(startCapture).not.toHaveBeenCalled();
    expect(startNetworking).not.toHaveBeenCalled();
    expect(await identity.getInitializationError()).toEqual({ code: "identity_initialization_failed" });
    expect(await adapter.identity.load()).toBeUndefined();

    await expect(identity.retryInitialization()).resolves.toMatchObject({ deviceId: generatedIdentity.peerId });
    await runtime.start();
    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(startNetworking).toHaveBeenCalledTimes(1);
    expect(await identity.getInitializationError()).toBeUndefined();
  });

  it("creates a public identity without private key material", () => {
    const publicIdentity = toPublicDeviceIdentity({
      deviceId: generatedIdentity.peerId,
      deviceName: "Desktop",
      publicKey: generatedIdentity.publicKey,
      privateKey: generatedIdentity.privateKey,
      multiaddrs: [],
      createdAt: 123,
    });

    expect(publicIdentity).not.toHaveProperty("privateKey");
    expect(JSON.stringify(publicIdentity)).not.toContain(generatedIdentity.privateKey);
  });
});
