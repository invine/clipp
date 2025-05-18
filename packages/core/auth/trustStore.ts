/**
 * DeviceTrustStore implementation for trusted device management.
 */
import { TrustedDevice } from "./types";
import { verifyPublicKey } from "./verify";

export interface DeviceTrustStore {
  addDevice(device: TrustedDevice): Promise<void>;
  getDevice(id: string): Promise<TrustedDevice | null>;
  listDevices(): Promise<TrustedDevice[]>;
  removeDevice(id: string): Promise<void>;
  isTrusted(id: string): Promise<boolean>;
  verifyPublicKey(id: string, pubkey: string): Promise<boolean>;
}

export class InMemoryDeviceTrustStore implements DeviceTrustStore {
  private devices = new Map<string, TrustedDevice>();

  async addDevice(device: TrustedDevice): Promise<void> {
    this.devices.set(device.id, device);
  }

  async getDevice(id: string): Promise<TrustedDevice | null> {
    return this.devices.get(id) ?? null;
  }

  async listDevices(): Promise<TrustedDevice[]> {
    return Array.from(this.devices.values());
  }

  async removeDevice(id: string): Promise<void> {
    this.devices.delete(id);
  }

  async isTrusted(id: string): Promise<boolean> {
    return this.devices.has(id);
  }

  async verifyPublicKey(id: string, pubkey: string): Promise<boolean> {
    const device = await this.getDevice(id);
    return device ? verifyPublicKey(device, pubkey) : false;
  }
}
