import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeConformanceHarness,
} from "../../../packages/core/runtime";
import { createIdentityManager, type DeviceIdentity, type IdentityRepository } from "../../../packages/core/trust";

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
  ] as const)("creates a singleton Device Network for %s", async (_platform, createAdapter, initialDeviceName) => {
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
    const identity = await createManager({
      get: () => adapter.identity.load() as Promise<DeviceIdentity | undefined>,
      upsert: (value) => adapter.identity.save(value),
    }, initialDeviceName).get();

    expect(identity).toMatchObject({
      deviceId: generatedIdentity.peerId,
      deviceName: initialDeviceName,
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
});
