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

const connectedPeerId = "12D3KooWAuz1FwEK4f32DznuhrHm1BWYBhP5NcZ7sPcEFdUykNMR";

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
        request: {
          type: "trust-request",
          from: "me",
          to: "peer",
          payload: {
            device: dev as any,
            sig: "sig",
          },
          sentAt: 1,
        },
        responder: dev as any,
      },
      sentAt: 2,
    } as any);

    expect(await trust.isTrusted("peer")).toBe(true);
    expect(approved).toHaveLength(1);
    expect(approved[0].deviceId).toBe("peer");
  });

  it("matches trusted devices by advertised peer multiaddr", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trustRepo.upsert({
      ...sampleDevice("legacy-device-id"),
      multiaddrs: [`/dns4/example.test/tcp/443/wss/p2p/${connectedPeerId}`],
    });

    expect(await trust.isTrusted("legacy-device-id")).toBe(true);
    expect(await trust.isTrusted(connectedPeerId)).toBe(true);
    expect(await trust.isTrusted(`/dns4/example.test/tcp/443/wss/p2p/${connectedPeerId}`)).toBe(true);
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
      payload: {
        device: dev as any,
        sig: "sig",
      },
      sentAt: 1,
    } as any);

    jest.advanceTimersByTime(11 * 60 * 1000);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].deviceId).toBe("peer");
    jest.useRealTimers();
  });

  it("automatically accepts trust requests from already trusted devices", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => sampleDevice("me"),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc, now: () => 2 });

    const trusted = sampleDevice("peer");
    await trustRepo.upsert(trusted);

    const requests: TrustedDevice[] = [];
    const sent: Array<{ target: string; msg: any }> = [];
    trust.on("request", (d) => requests.push(d));
    trust.bindMessenger({
      send: async (target: string, msg: any) => {
        sent.push({ target, msg });
      },
      broadcast: async () => {},
      onMessage: () => {},
      getPeers: () => [],
    });

    const request = {
      type: "trust-request",
      from: "peer",
      to: "me",
      payload: {
        device: trusted as any,
        sig: "sig",
      },
      sentAt: 1,
    };

    await trust.handleTrustMessage(request as any);

    expect(requests).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].target).toBe("peer");
    expect(sent[0].msg).toMatchObject({
      type: "trust-ack",
      from: "me",
      to: "peer",
      payload: {
        accepted: true,
        request,
        responder: expect.objectContaining({ deviceId: "me" }),
      },
      sentAt: 2,
    });
  });

  it("shares trusted peers after a new device is approved", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => sampleDevice("me"),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc, now: () => 2 });

    const existing = sampleDevice("existing");
    await trustRepo.upsert(existing);

    const sent: Array<{ target: string; msg: any }> = [];
    trust.bindMessenger({
      send: async (target: string, msg: any) => {
        sent.push({ target, msg });
      },
      broadcast: async () => {},
      onMessage: () => {},
      getPeers: () => ["existing", "untrusted"],
    });

    const newDevice = sampleDevice("new");
    const request = {
      type: "trust-request",
      from: "new",
      to: "me",
      payload: {
        device: newDevice as any,
        sig: "sig",
      },
      sentAt: 1,
    };

    await trust.handleTrustMessage(request as any);
    await trust.sendTrustAck(newDevice, true);

    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatchObject({
      target: "new",
      msg: {
        type: "trust-ack",
        payload: expect.not.objectContaining({ trustedDevices: expect.anything() }),
      },
    });
    expect(sent[1]).toMatchObject({
      target: "/p2p/new",
      msg: {
        type: "trusted-peers",
        from: "me",
        to: "new",
        payload: {
          devices: [
            expect.objectContaining({ deviceId: "me" }),
            expect.objectContaining({ deviceId: "existing" }),
          ],
        },
      },
    });
    expect(sent[1].msg.payload.devices).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ deviceId: "new" })])
    );
    expect(sent[2]).toMatchObject({
      target: "existing",
      msg: {
        type: "trusted-peers",
        from: "me",
        to: "existing",
        payload: {
          devices: [expect.objectContaining({ deviceId: "new" })],
        },
      },
    });
    expect(await trust.isTrusted("new")).toBe(true);
  });

  it("imports trusted peers from trusted senders and propagates new peers", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => sampleDevice("me"),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trustRepo.upsert(sampleDevice("sender"));

    const approved: TrustedDevice[] = [];
    const sent: Array<{ target: string; msg: any }> = [];
    trust.on("approved", (d) => approved.push(d));
    trust.bindMessenger({
      send: async (target: string, msg: any) => {
        sent.push({ target, msg });
      },
      broadcast: async () => {},
      onMessage: () => {},
      getPeers: () => ["sender"],
    });

    const shared = { ...sampleDevice("shared"), privateKey: "secret" } as any;
    await trust.handleTrustMessage({
      type: "trusted-peers",
      from: "sender",
      to: "me",
      payload: {
        devices: [
          shared,
          sampleDevice("me") as any,
          sampleDevice("sender") as any,
          { deviceName: "missing id" },
        ],
      },
      sentAt: 2,
    } as any);

    expect(await trust.isTrusted("shared")).toBe(true);
    expect(await trust.isTrusted("me")).toBe(false);
    const importedShared = (await trustRepo.get("shared")) as any;
    expect(importedShared?.privateKey).toBeUndefined();
    expect(approved).toHaveLength(1);
    expect(approved[0].deviceId).toBe("shared");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      target: "/p2p/shared",
      msg: {
        type: "trusted-peers",
        to: "shared",
        payload: {
          devices: [
            expect.objectContaining({ deviceId: "me" }),
            expect.objectContaining({ deviceId: "sender" }),
          ],
        },
      },
    });
    expect(sent[1]).toMatchObject({
      target: "sender",
      msg: {
        type: "trusted-peers",
        to: "sender",
        payload: {
          devices: [expect.objectContaining({ deviceId: "shared" })],
        },
      },
    });
  });

  it("ignores trusted peer shares from untrusted senders", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => sampleDevice("me"),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trust.handleTrustMessage({
      type: "trusted-peers",
      from: "stranger",
      to: "me",
      payload: {
        devices: [sampleDevice("shared") as any],
      },
      sentAt: 2,
    } as any);

    expect(await trust.isTrusted("shared")).toBe(false);
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

  it("renames trusted devices", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      getPublic: async () => ({ deviceId: "me" }),
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    const renamed: TrustedDevice[] = [];
    trust.on("renamed", (d) => renamed.push(d));

    const dev = sampleDevice("peer");
    await trustRepo.upsert(dev);
    const updated = await trust.rename("peer", "Office Mac");

    expect(updated?.deviceName).toBe("Office Mac");
    expect((await trustRepo.get("peer"))?.deviceName).toBe("Office Mac");
    expect(renamed).toHaveLength(1);
    expect(renamed[0].deviceId).toBe("peer");
  });
});
