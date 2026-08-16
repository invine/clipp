import { createTrustManager, type TrustedDevice } from "../../../packages/core/trust/trustManager";
import { createIdentityManager, type DeviceIdentity } from "../../../packages/core/trust/identity";

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
const localPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

describe("TrustManager", () => {
  it("makes a newly admitted member immediately trusted and visible by Peer ID", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const active = new Set(["me"]);
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      activePeerIds: async () => [...active],
      membershipStatus: async (peerId: string) => active.has(peerId) ? "active" : "unknown",
      admit: async (peerId: string) => { active.add(peerId); return "admitted" as const; },
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await expect(trust.admit(connectedPeerId, { deviceName: "Mobile", nameRevision: 3n })).resolves.toBe("admitted");
    await expect(trust.isTrusted(connectedPeerId)).resolves.toBe(true);
    await expect(trust.list()).resolves.toEqual([
      expect.objectContaining({
        deviceId: connectedPeerId,
        deviceName: "Mobile",
        displayName: "Mobile",
        selfReportedDeviceName: "Mobile",
        selfReportedNameRevision: "3",
      }),
    ]);
  });

  it("derives visible and authorized Trusted Devices only from Active Membership", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const activePeerId = connectedPeerId;
    const unknownPeerId = "12D3KooWUnknownLegacyMetadata";
    const revokedPeerId = "12D3KooWRevokedLegacyMetadata";
    await trustRepo.upsert(sampleDevice(activePeerId));
    await trustRepo.upsert(sampleDevice(unknownPeerId));
    await trustRepo.upsert(sampleDevice(revokedPeerId));
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      activePeerIds: async () => ["me", activePeerId],
      membershipStatus: async (peerId: string) => {
        if (peerId === activePeerId || peerId === "me") return "active" as const;
        if (peerId === revokedPeerId) return "revoked" as const;
        return "unknown" as const;
      },
      admit: async () => "already-active" as const,
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await expect(trust.list()).resolves.toEqual([
      expect.objectContaining({ deviceId: activePeerId }),
    ]);
    await expect(trust.isTrusted(activePeerId)).resolves.toBe(true);
    await expect(trust.isTrusted(unknownPeerId)).resolves.toBe(false);
    await expect(trust.isTrusted(revokedPeerId)).resolves.toBe(false);
  });

  it("shows reconciled Device Names and aliases transitive members without legacy metadata", async () => {
    let storedIdentity: DeviceIdentity | undefined;
    const identitySvc = createIdentityManager({
      repo: {
        get: async () => storedIdentity,
        upsert: async (identity) => { storedIdentity = structuredClone(identity); },
      },
      initialDeviceName: "Desktop",
      generateKeyMaterial: async () => ({ peerId: localPeerId, privateKey: "private", publicKey: "public" }),
      deriveKeyMaterial: async () => ({ peerId: localPeerId, privateKey: "private", publicKey: "public" }),
    });
    await identitySvc.get();
    await identitySvc.admit(connectedPeerId);
    await identitySvc.recordRemoteDeviceName(connectedPeerId, "\u0001", 5n);
    const trust = createTrustManager({ trustRepo: createMemoryTrustedDeviceRepo(), identitySvc });

    await trust.admit(connectedPeerId, { deviceName: "Stale Pairing phone", nameRevision: 4n });
    await expect(trust.list()).resolves.toEqual([
      expect.objectContaining({
        deviceId: connectedPeerId,
        displayName: await identitySvc.displayDeviceLabel(connectedPeerId),
      }),
    ]);
    await identitySvc.recordRemoteDeviceName(connectedPeerId, "Pocket computer", 6n);
    await expect(trust.admit(connectedPeerId, {
      deviceName: "Pairing phone",
      nameRevision: 8n,
    })).resolves.toBe("already-active");
    await identitySvc.recordRemoteDeviceName(connectedPeerId, "Stale reconciliation", 7n);
    await expect(trust.list()).resolves.toEqual([
      expect.objectContaining({ deviceId: connectedPeerId, displayName: "Pairing phone" }),
    ]);
    await expect(trust.rename(connectedPeerId, "My phone")).resolves.toEqual(
      expect.objectContaining({ deviceId: connectedPeerId, displayName: "My phone" }),
    );
    await expect(trust.list()).resolves.toEqual([
      expect.objectContaining({ deviceId: connectedPeerId, displayName: "My phone" }),
    ]);
  });

  it("applies authenticated presentation metadata monotonically and validates names", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    await trustRepo.upsert({
      ...sampleDevice(connectedPeerId),
      deviceName: "Current mobile",
      nameRevision: 5,
    });
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      activePeerIds: async () => ["me", connectedPeerId],
      membershipStatus: async () => "active" as const,
      admit: async () => "already-active" as const,
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trust.admit(connectedPeerId, { deviceName: "Stale mobile", nameRevision: 4n });
    await trust.admit(connectedPeerId, { deviceName: "Conflicting mobile", nameRevision: 5n });
    await expect(trustRepo.get(connectedPeerId)).resolves.toEqual(
      expect.objectContaining({ deviceName: "Current mobile", nameRevision: 5 }),
    );

    await trust.admit(connectedPeerId, { deviceName: "Invalid\nmobile", nameRevision: 6n });
    await expect(trustRepo.get(connectedPeerId)).resolves.toEqual(
      expect.objectContaining({
        deviceName: "Current mobile",
        selfReportedDeviceName: "Current mobile",
        selfReportedNameRevision: "6",
      }),
    );

    await trust.admit(connectedPeerId, { deviceName: "  New mobile  ", nameRevision: 7n });
    await expect(trustRepo.get(connectedPeerId)).resolves.toEqual(
      expect.objectContaining({
        deviceName: "New mobile",
        selfReportedDeviceName: "New mobile",
        selfReportedNameRevision: "7",
      }),
    );
  });

  it("keeps a Local Device Alias when a newer self-reported name arrives", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    await trustRepo.upsert({
      ...sampleDevice(connectedPeerId),
      deviceName: "Mobile",
      selfReportedDeviceName: "Mobile",
      selfReportedNameRevision: "2",
    });
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      activePeerIds: async () => ["me", connectedPeerId],
      membershipStatus: async () => "active" as const,
      admit: async () => "already-active" as const,
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trust.rename(connectedPeerId, "My phone");
    await trust.admit(connectedPeerId, { deviceName: "New mobile", nameRevision: 3n });

    await expect(trustRepo.get(connectedPeerId)).resolves.toEqual(
      expect.objectContaining({
        deviceName: "New mobile",
        localAlias: "My phone",
        selfReportedDeviceName: "New mobile",
        selfReportedNameRevision: "3",
      }),
    );
    await expect(trust.list()).resolves.toEqual([
      expect.objectContaining({ deviceName: "New mobile", displayName: "My phone" }),
    ]);
  });

  it("orders self-reported name revisions losslessly beyond safe integers", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      activePeerIds: async () => ["me", connectedPeerId],
      membershipStatus: async () => "active" as const,
      admit: async () => "already-active" as const,
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trust.admit(connectedPeerId, { deviceName: "Large revision", nameRevision: 9_007_199_254_740_993n });
    await trust.admit(connectedPeerId, { deviceName: "Next revision", nameRevision: 9_007_199_254_740_994n });

    await expect(trustRepo.get(connectedPeerId)).resolves.toEqual(
      expect.objectContaining({
        deviceName: "Next revision",
        selfReportedNameRevision: "9007199254740994",
      }),
    );
  });

  it("stores legacy trust-ack metadata without granting Device Membership", async () => {
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

    expect(await trust.isTrusted("peer")).toBe(false);
    await expect(trustRepo.get("peer")).resolves.toEqual(expect.objectContaining({ deviceId: "peer" }));
    expect(approved).toHaveLength(1);
    expect(approved[0].deviceId).toBe("peer");
  });

  it("normalizes an authenticated multiaddr before checking Active Membership", async () => {
    const trustRepo = createMemoryTrustedDeviceRepo();
    const identitySvc = {
      get: async () => ({ deviceId: "me" }),
      activePeerIds: async () => ["me", connectedPeerId],
      membershipStatus: async (peerId: string) => peerId === connectedPeerId ? "active" as const : "unknown" as const,
      admit: async () => "already-active" as const,
      rename: async () => {},
      updateMultiaddrs: async () => {},
    } as any;
    const trust = createTrustManager({ trustRepo, identitySvc });

    await trustRepo.upsert({
      ...sampleDevice("legacy-device-id"),
      multiaddrs: [`/dns4/example.test/tcp/443/wss/p2p/${connectedPeerId}`],
    });

    expect(await trust.isTrusted("legacy-device-id")).toBe(false);
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
      activePeerIds: async () => ["me", "peer"],
      membershipStatus: async (peerId: string) => peerId === "peer" || peerId === "me" ? "active" as const : "unknown" as const,
      admit: async () => "already-active" as const,
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
    const active = new Set(["me", "existing"]);
    const identitySvc = {
      get: async () => sampleDevice("me"),
      activePeerIds: async () => [...active],
      membershipStatus: async (peerId: string) => active.has(peerId) ? "active" as const : "unknown" as const,
      admit: async (peerId: string) => { active.add(peerId); return "admitted" as const; },
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
    active.add("new");
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
      activePeerIds: async () => ["me", "sender"],
      membershipStatus: async (peerId: string) => peerId === "sender" || peerId === "me" ? "active" as const : "unknown" as const,
      admit: async () => "already-active" as const,
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

    expect(await trust.isTrusted("shared")).toBe(false);
    expect(await trust.isTrusted("me")).toBe(true);
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

    expect(updated).toMatchObject({
      deviceName: dev.deviceName,
      displayName: "Office Mac",
      localAlias: "Office Mac",
    });
    expect(await trustRepo.get("peer")).toMatchObject({
      deviceName: dev.deviceName,
      localAlias: "Office Mac",
    });
    expect(renamed).toHaveLength(1);
    expect(renamed[0].deviceId).toBe("peer");
  });
});
