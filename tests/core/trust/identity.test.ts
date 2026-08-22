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
const remotePeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

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
  it("durably admits a non-revoked Device Identity before publishing it as active", async () => {
    let stored: DeviceIdentity | undefined;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => { stored = structuredClone(identity); },
    }, "Desktop");

    await manager.get();
    await expect(manager.admit(remotePeerId)).resolves.toBe("admitted");

    expect(stored?.membershipView).toEqual({
      admittedPeerIds: [generatedIdentity.peerId, remotePeerId],
      revokedPeerIds: [],
    });
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("active");
  });

  it("publishes no partial Admission when membership persistence fails", async () => {
    let stored: DeviceIdentity | undefined;
    let failAdmission = true;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => {
        if (failAdmission && identity.membershipView?.admittedPeerIds.includes(remotePeerId)) throw new Error("storage_failed");
        stored = structuredClone(identity);
      },
    }, "Desktop");
    await manager.get();

    await expect(manager.admit(remotePeerId)).rejects.toThrow("storage_failed");
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("unknown");
    expect(stored?.membershipView?.admittedPeerIds).toEqual([generatedIdentity.peerId]);

    failAdmission = false;
    await expect(manager.admit(remotePeerId)).resolves.toBe("admitted");
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("active");
  });

  it("does not admit a Peer ID already present in the Revoked Peer ID set", async () => {
    let stored: DeviceIdentity | undefined = {
      deviceId: generatedIdentity.peerId,
      deviceName: "Desktop",
      nameRevision: 0,
      publicKey: generatedIdentity.publicKey,
      privateKey: generatedIdentity.privateKey,
      multiaddrs: [],
      createdAt: 123,
      membershipView: { admittedPeerIds: [generatedIdentity.peerId], revokedPeerIds: [remotePeerId] },
    };
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => { stored = structuredClone(identity); },
    }, "Desktop");

    await expect(manager.admit(remotePeerId)).resolves.toBe("revoked");
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("revoked");
    expect(stored.membershipView?.admittedPeerIds).not.toContain(remotePeerId);
  });

  it("durably revokes an Active Member before publishing the remove-wins tombstone", async () => {
    let stored: DeviceIdentity | undefined;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => { stored = structuredClone(identity); },
    }, "Desktop");
    await manager.get();
    await manager.admit(remotePeerId);

    await expect(manager.revoke(remotePeerId)).resolves.toBe("revoked");
    expect(stored?.membershipView).toEqual({
      admittedPeerIds: [remotePeerId, generatedIdentity.peerId],
      revokedPeerIds: [remotePeerId],
    });
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("revoked");
    await expect(manager.admit(remotePeerId)).resolves.toBe("revoked");
  });

  it("does not publish a revocation or side-effect notification when tombstone persistence fails", async () => {
    let stored: DeviceIdentity | undefined;
    let failRevocation = true;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => {
        if (failRevocation && identity.membershipView?.revokedPeerIds.includes(remotePeerId)) {
          throw new Error("storage_failed");
        }
        stored = structuredClone(identity);
      },
    }, "Desktop");
    await manager.get();
    await manager.admit(remotePeerId);
    const changes = jest.fn();
    manager.onMembershipChanged(changes);

    await expect(manager.revoke(remotePeerId)).rejects.toThrow("storage_failed");
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("active");
    expect(changes).not.toHaveBeenCalled();
    expect(stored?.membershipView?.revokedPeerIds).toEqual([]);

    failRevocation = false;
    await expect(manager.revoke(remotePeerId)).resolves.toBe("revoked");
  });

  it("merges complete Membership Views atomically with revocation taking precedence", async () => {
    let stored: DeviceIdentity | undefined;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => { stored = structuredClone(identity); },
    }, "Desktop");
    await manager.get();

    await expect(manager.mergeMembershipView({
      admittedPeerIds: [remotePeerId],
      revokedPeerIds: [remotePeerId],
    })).resolves.toBe(true);

    expect(await manager.membershipView()).toEqual({
      admittedPeerIds: [remotePeerId, generatedIdentity.peerId],
      revokedPeerIds: [remotePeerId],
    });
    await expect(manager.membershipStatus(remotePeerId)).resolves.toBe("revoked");
  });

  it("keeps aliases local and resolves labels as alias, latest valid Device Name, then Peer ID", async () => {
    let stored: DeviceIdentity | undefined;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => { stored = structuredClone(identity); },
    }, "Desktop");
    await manager.get();
    await manager.admit(remotePeerId);

    expect(await manager.displayDeviceLabel(remotePeerId)).toContain("…");
    await manager.recordRemoteDeviceName(remotePeerId, "Phone", 2n);
    await manager.recordRemoteDeviceName(remotePeerId, "Older", 1n);
    expect(await manager.displayDeviceLabel(remotePeerId)).toBe("Phone");
    await manager.setLocalDeviceAlias(remotePeerId, "My pocket");
    expect(await manager.displayDeviceLabel(remotePeerId)).toBe("My pocket");
    expect(stored?.remoteDeviceNames?.[remotePeerId]).toEqual({ deviceName: "Phone", nameRevision: "2" });
    await manager.recordRemoteDeviceName(remotePeerId, "\u0001", 3n);
    expect(await manager.displayDeviceLabel(remotePeerId)).toBe("My pocket");
    expect(stored?.remoteDeviceNames?.[remotePeerId]).toEqual({ deviceName: "Phone", nameRevision: "3" });
    await manager.recordRemoteDeviceName(remotePeerId, "Large revision", 9_007_199_254_740_993n);
    expect(await manager.displayDeviceLabel(remotePeerId)).toBe("My pocket");
    expect(stored?.remoteDeviceNames?.[remotePeerId]).toEqual({
      deviceName: "Large revision",
      nameRevision: "9007199254740993",
    });
  });

  it("renames and derives visible Trusted Devices exclusively from Active Membership", async () => {
    let stored: DeviceIdentity | undefined;
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => { stored = structuredClone(identity); },
    }, "Desktop");
    await manager.get();
    await manager.admit(remotePeerId);
    await manager.recordRemoteDeviceName(remotePeerId, "Phone", 1n);

    await expect(manager.trustedDevices()).resolves.toEqual([{
      deviceId: remotePeerId,
      deviceName: "Phone",
      displayName: "Phone",
      localAlias: undefined,
    }]);

    await expect(manager.setLocalDeviceAlias(remotePeerId, "My phone")).resolves.toEqual({
      deviceId: remotePeerId,
      deviceName: "Phone",
      displayName: "My phone",
      localAlias: "My phone",
    });

    await manager.revoke(remotePeerId);
    await expect(manager.trustedDevices()).resolves.toEqual([]);
    await expect(manager.setLocalDeviceAlias(remotePeerId, "Former phone")).resolves.toBeNull();
  });

  it("waits for an in-flight presentation mutation before listing Trusted Devices", async () => {
    let stored: DeviceIdentity | undefined;
    let releaseAliasWrite!: () => void;
    let markAliasWriteStarted!: () => void;
    const aliasWriteBlocked = new Promise<void>((resolve) => { releaseAliasWrite = resolve; });
    const aliasWriteStarted = new Promise<void>((resolve) => { markAliasWriteStarted = resolve; });
    const manager = createManager({
      get: async () => stored,
      upsert: async (identity) => {
        if (identity.localDeviceAliases?.[remotePeerId] === "My phone") {
          markAliasWriteStarted();
          await aliasWriteBlocked;
        }
        stored = structuredClone(identity);
      },
    }, "Desktop");
    await manager.get();
    await manager.admit(remotePeerId);
    await manager.recordRemoteDeviceName(remotePeerId, "Phone", 1n);

    const rename = manager.setLocalDeviceAlias(remotePeerId, "My phone");
    await aliasWriteStarted;
    const listing = manager.trustedDevices();
    let listingSettled = false;
    void listing.then(() => { listingSettled = true; });
    await Promise.resolve();
    expect(listingSettled).toBe(false);

    releaseAliasWrite();
    await rename;
    await expect(listing).resolves.toEqual([expect.objectContaining({ displayName: "My phone" })]);
  });

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
        liveClipboardApplicationRecovery: "none" as const,
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

  it("does not treat a persisted identity without its private key as first launch", async () => {
    const generated = jest.fn(async () => generatedIdentity);
    const initializationErrors: unknown[] = [];
    const manager = createIdentityManager({
      repo: {
        get: async () => ({
          deviceId: generatedIdentity.peerId,
          deviceName: "Desktop",
          publicKey: generatedIdentity.publicKey,
          multiaddrs: [],
          createdAt: 1,
        }),
        upsert: async () => undefined,
        saveInitializationError: async (error) => { initializationErrors.push(error); },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: generated,
    });

    await expect(manager.get()).rejects.toThrow("identity_private_key_unavailable");
    expect(generated).not.toHaveBeenCalled();
    expect(initializationErrors).toEqual([{ code: "identity_initialization_failed" }]);
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
        initializeIdentity: async () => { await identity.get(); },
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
