import { DeviceIdentity, IdentityRepository } from "./identity"
import { TrustedDevice, TrustedDeviceRepository } from "./trustManager"

export interface KVStorageBackend {
  get<T = any>(key: string): Promise<T | undefined>
  set<T = any>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export const IDENTITY_KEY = "localDeviceIdentity";
export const TRUST_KEY = 'trustedDevices'


export function createKVIdentityRepository(options: { storage: KVStorageBackend, key: string }): IdentityRepository {
  const { storage, key } = options
  return {
    get: async (): Promise<DeviceIdentity | undefined> => {
      return storage.get<DeviceIdentity>(key)
    },
    upsert: async (device: DeviceIdentity): Promise<void> => {
      return storage.set<DeviceIdentity>(key, device)
    }
  }
}

export function createKVTrustedDeviceRepository(options: { storage: KVStorageBackend, key: string }): TrustedDeviceRepository {
  const { storage, key } = options

  const getDeviceList = async (): Promise<TrustedDevice[]> => {
    const list = await storage.get<TrustedDevice[]>(key);
    if (!list) {
      return [];
    }

    return Array.isArray(list) ? list : [];
  };

  const setDeviceList = (list: TrustedDevice[]): Promise<void> => {
    return storage.set(key, list);
  };

  return {
    list: async (): Promise<TrustedDevice[]> => {
      return getDeviceList();
    },
    get: async (deviceId: string): Promise<TrustedDevice | undefined> => {
      const list = await getDeviceList();
      const device: TrustedDevice | undefined = list.find(
        (device) => device.deviceId === deviceId
      );
      return device;
    },
    upsert: async (device: TrustedDevice): Promise<void> => {
      const list = await getDeviceList();
      const index = list.findIndex((d) => d.deviceId === device.deviceId);
      if (index !== -1) {
        list[index] = device;
      } else {
        list.push(device);
      }
      await setDeviceList(list);
    },
    remove: async (deviceId: string): Promise<void> => {
      const list = await getDeviceList();
      const newList = list.filter((device) => device.deviceId !== deviceId);
      if (newList.length < list.length) {
        await setDeviceList(newList);
      }
    },
  }
}
