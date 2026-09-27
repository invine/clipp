import {
  RuntimeMessageStorageBackend,
  handleOffscreenStorageRequest,
  type OffscreenStorageResponse,
} from "../../apps/extension/src/runtimeMessageStorage";
import type { KVStorageBackend } from "../../packages/core/trust";
import { MANAGED_RELAY_CREDENTIAL_PREFIX } from "../../apps/extension/src/managedRelayConstants";

describe("offscreen runtime-message storage", () => {
  it("reads durable values through the service worker", async () => {
    const storage = memoryStorage(
      new Map([["identity", { deviceId: "peer-1" }]])
    );
    const backend = connectedBackend(storage);

    await expect(backend.get("identity")).resolves.toEqual({
      deviceId: "peer-1",
    });
  });

  it("writes and removes durable values through the service worker", async () => {
    const backend = connectedBackend(memoryStorage(new Map()));

    await backend.set("signedPeerRecords", { "peer-1": [1, 2, 3] });
    await expect(backend.get("signedPeerRecords")).resolves.toEqual({
      "peer-1": [1, 2, 3],
    });

    await backend.remove("signedPeerRecords");
    await expect(backend.get("signedPeerRecords")).resolves.toBeUndefined();
  });

  it("rejects storage requests that do not come from this extension's offscreen document", async () => {
    const storage = memoryStorage(
      new Map([["identity", { deviceId: "peer-1" }]])
    );
    const backend = connectedBackend(storage, {
      id: "other-extension",
      url: "chrome-extension://other-extension/offscreen.html",
    });

    await expect(backend.get("identity")).rejects.toThrow(
      "storage_proxy_unauthorized"
    );
    await expect(connectedBackend(storage).get("identity")).resolves.toEqual({
      deviceId: "peer-1",
    });
  });

  it("does not expose renewable relay credentials even to offscreen storage requests", async () => {
    const key =
      MANAGED_RELAY_CREDENTIAL_PREFIX + "https://relay.example/v1/relay";
    const values = new Map<string, unknown>([
      [key, { status: "ready", refreshToken: "secret" }],
    ]);
    const backend = connectedBackend(memoryStorage(values));
    await expect(backend.get(key)).rejects.toThrow(
      "storage_proxy_unauthorized"
    );
    await expect(
      backend.set(key, { status: "ready", refreshToken: "other" })
    ).rejects.toThrow("storage_proxy_unauthorized");
    expect(values.get(key)).toEqual({
      status: "ready",
      refreshToken: "secret",
    });
  });

  it("surfaces durable storage failures", async () => {
    const backend = connectedBackend({
      get: async () => {
        throw new Error("durable_storage_failed");
      },
      set: async () => {},
      remove: async () => {},
    });

    await expect(backend.get("identity")).rejects.toThrow(
      "durable_storage_failed"
    );
  });

  it("surfaces runtime messaging failures", async () => {
    const backend = new RuntimeMessageStorageBackend(
      (_request, callback) => callback(undefined),
      () => "Extension context invalidated.",
      100
    );

    await expect(backend.get("identity")).rejects.toThrow(
      "Extension context invalidated."
    );
  });

  it("times out when the service worker does not respond", async () => {
    const backend = new RuntimeMessageStorageBackend(
      () => {},
      () => undefined,
      5
    );

    await expect(backend.get("identity")).rejects.toThrow(
      "storage_proxy_timeout"
    );
  });

  it("acknowledges writes only after durable storage completes", async () => {
    let completeWrite: (() => void) | undefined;
    const storage = memoryStorage(new Map());
    storage.set = async () =>
      await new Promise<void>((resolve) => {
        completeWrite = resolve;
      });
    const backend = connectedBackend(storage);
    let acknowledged = false;

    const write = backend.set("identity", { deviceId: "peer-1" }).then(() => {
      acknowledged = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(acknowledged).toBe(false);
    completeWrite?.();
    await write;
    expect(acknowledged).toBe(true);
  });
});

function connectedBackend(
  storage: KVStorageBackend,
  sender = trustedOffscreenSender()
): RuntimeMessageStorageBackend {
  return new RuntimeMessageStorageBackend(
    (request, callback) => {
      void handleOffscreenStorageRequest(request, sender, {
        storage,
        extensionId: "extension-id",
        offscreenUrl: "chrome-extension://extension-id/offscreen.html",
      }).then((response) => callback(response as OffscreenStorageResponse));
    },
    () => undefined,
    100
  );
}

function trustedOffscreenSender() {
  return {
    id: "extension-id",
    url: "chrome-extension://extension-id/offscreen.html",
  };
}

function memoryStorage(values: Map<string, unknown>): KVStorageBackend {
  return {
    get: async <Value>(key: string) => values.get(key) as Value | undefined,
    set: async <Value>(key: string, value: Value) => {
      values.set(key, value);
    },
    remove: async (key: string) => {
      values.delete(key);
    },
  };
}
