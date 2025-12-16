import { createTrustManager, type TrustedDevice } from "../../../packages/core/trust/trustManager";

function createMemoryTrustedDeviceRepo() {
  const devices = new Map<string, TrustedDevice>();
  return {
    list: async () => Array.from(devices.values()),
    get: async (deviceId: string) => devices.get(deviceId),
    upsert: async (device: TrustedDevice) => {
      devices.set(device.deviceId, device);
    },
    remove: async (deviceId: string) => {
      devices.delete(deviceId);
    },
  };
}

function sampleDevice(id: string): TrustedDevice {
  return {
    deviceId: id,
    deviceName: "Test",
    publicKey: "pk",
    multiaddrs: [`/p2p/${id}`],
    createdAt: Date.now(),
  };
}

describe("TrustManager", () => {
  it("stores device on accepted trust-ack", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    const approved: TrustedDevice[] = [];
    trust.on("approved", (d) => approved.push(d));

    const dev = sampleDevice("peer");
    await trust.handleTrustMessage({
      type: "trust-ack",
      from: "peer",
      to: "me",
      payload: {
        accepted: true,
        request: { type: "trust-request", from: "me", to: "peer", payload: dev as any, sentAt: 1, sig: "sig" },
        responder: dev as any,
      },
      sentAt: 2,
    } as any);

    expect(await trust.isTrusted("peer")).toBe(true);
    expect(approved).toHaveLength(1);
    expect(approved[0].deviceId).toBe("peer");
  });

  it("emits rejected after pending TTL", async () => {
    jest.useFakeTimers();
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    const rejected: TrustedDevice[] = [];
    trust.on("rejected", (d) => rejected.push(d));

    const dev = sampleDevice("peer");
    await trust.handleTrustMessage({
      type: "trust-request",
      from: "peer",
      to: "me",
      payload: dev as any,
      sentAt: 1,
      sig: "sig",
    } as any);

    jest.advanceTimersByTime(11 * 60 * 1000);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].deviceId).toBe("peer");
    jest.useRealTimers();
  });

  it("remove emits removed", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    const removed: TrustedDevice[] = [];
    trust.on("removed", (d) => removed.push(d));

    const dev = sampleDevice("peer");
    await trustRepo.upsert(dev);
    await trust.remove("peer");

    expect(await trust.isTrusted("peer")).toBe(false);
    expect(removed).toHaveLength(1);
    expect(removed[0].deviceId).toBe("peer");
  });
});
