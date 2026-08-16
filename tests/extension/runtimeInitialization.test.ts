import {
  createExtensionIdentityManager,
  startExtensionRuntimeServices,
} from "../../apps/extension/src/runtimeInitialization";
import type { DeviceIdentity } from "../../packages/core/trust";

const generatedIdentity = {
  peerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
  privateKey: "private-key",
  publicKey: "public-key",
};

describe("Chrome-extension runtime initialization", () => {
  it("creates a fresh Device Identity with the Extension platform name", async () => {
    let stored: DeviceIdentity | undefined;
    const identity = createExtensionIdentityManager({
      repo: {
        get: async () => stored,
        upsert: async (value) => { stored = structuredClone(value); },
      },
      now: () => 123,
      generateKeyMaterial: async () => generatedIdentity,
    });

    await expect(identity.get()).resolves.toMatchObject({
      deviceName: "Extension",
      nameRevision: 0,
    });
    expect(stored).toMatchObject({ deviceName: "Extension" });
  });

  it("starts neither capture nor networking when Device Identity initialization fails", async () => {
    const startCapture = jest.fn();
    const startNetworking = jest.fn();

    await expect(startExtensionRuntimeServices({
      initializeIdentity: async () => { throw new Error("identity_initialization_failed"); },
      startCapture,
      startNetworking,
    })).rejects.toThrow("identity_initialization_failed");

    expect(startCapture).not.toHaveBeenCalled();
    expect(startNetworking).not.toHaveBeenCalled();
  });

  it("keeps capture active when networking fails after Device Identity initialization", async () => {
    const calls: string[] = [];
    const networkFailure = new Error("network_unavailable");

    await expect(startExtensionRuntimeServices({
      initializeIdentity: async () => { calls.push("identity"); },
      startCapture: () => { calls.push("capture"); },
      startNetworking: async () => {
        calls.push("network");
        throw networkFailure;
      },
      onNetworkingFailure: (error) => { calls.push(`network-failed:${(error as Error).message}`); },
    })).resolves.toBeUndefined();

    expect(calls).toEqual([
      "identity",
      "capture",
      "network",
      "network-failed:network_unavailable",
    ]);
  });
});
