import { InMemoryDeviceTrustStore } from "../../../packages/core/auth/trustStore";
import { TrustedDevice } from "../../../packages/core/auth/types";

describe("DeviceTrustStore", () => {
  const store = new InMemoryDeviceTrustStore();
  const device: TrustedDevice = {
    id: "peer-1",
    name: "Chrome on Mac",
    publicKey: "PUBKEY1",
    createdAt: Date.now(),
  };

  it("add and get device", async () => {
    await store.addDevice(device);
    const found = await store.getDevice(device.id);
    expect(found?.publicKey).toBe("PUBKEY1");
  });

  it("isTrusted returns true for added device", async () => {
    expect(await store.isTrusted(device.id)).toBe(true);
  });

  it("verifyPublicKey returns true for correct key", async () => {
    expect(await store.verifyPublicKey(device.id, "PUBKEY1")).toBe(true);
  });

  it("verifyPublicKey returns false for wrong key", async () => {
    expect(await store.verifyPublicKey(device.id, "WRONGKEY")).toBe(false);
  });

  it("removeDevice removes device", async () => {
    await store.removeDevice(device.id);
    expect(await store.isTrusted(device.id)).toBe(false);
  });

  it("re-adding device replaces old data", async () => {
    await store.addDevice(device);
    const updated = { ...device, publicKey: "PUBKEY2" };
    await store.addDevice(updated);
    const found = await store.getDevice(device.id);
    expect(found?.publicKey).toBe("PUBKEY2");
  });
});
