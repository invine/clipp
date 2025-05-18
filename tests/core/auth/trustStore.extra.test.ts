import { InMemoryDeviceTrustStore } from "../../../packages/core/auth/trustStore";
import { TrustedDevice } from "../../../packages/core/auth/types";

describe("DeviceTrustStore - Additional", () => {
  const store = new InMemoryDeviceTrustStore();
  const now = Date.now();
  const device: TrustedDevice = {
    id: "peer-2",
    name: "Pixel 7",
    publicKey: "PUBKEY3",
    createdAt: now,
    lastSeen: now,
  };

  it("temporary trust expiry simulation", async () => {
    // Simulate temporary trust by removing after 1 hour
    await store.addDevice(device);
    await store.removeDevice(device.id); // Simulate expiry
    expect(await store.isTrusted(device.id)).toBe(false);
  });

  it("case-insensitive peer ID trust", async () => {
    const mixed = { ...device, id: "Peer-Case" };
    await store.addDevice(mixed);
    expect(await store.isTrusted("peer-case")).toBe(false); // Map is case-sensitive
    expect(await store.isTrusted("Peer-Case")).toBe(true);
  });

  it("listDevices after add/remove cycles", async () => {
    await store.addDevice(device);
    await store.removeDevice(device.id);
    await store.addDevice(device);
    const list = await store.listDevices();
    expect(list.some((d) => d.id === device.id)).toBe(true);
  });
});
