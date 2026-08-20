import { DeviceIdentity, IdentityInitializationError, IdentityRepository } from "./identity"

export interface KVStorageBackend {
  get<T = any>(key: string): Promise<T | undefined>
  set<T = any>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export const IDENTITY_KEY = "localDeviceIdentity";


export function createKVIdentityRepository(options: { storage: KVStorageBackend, key: string }): IdentityRepository {
  const { storage, key } = options
  const initializationErrorKey = `${key}:initializationError`;
  return {
    get: async (): Promise<DeviceIdentity | undefined> => {
      return storage.get<DeviceIdentity>(key)
    },
    upsert: async (device: DeviceIdentity): Promise<void> => {
      return storage.set<DeviceIdentity>(key, device)
    },
    loadInitializationError: () => storage.get<IdentityInitializationError>(initializationErrorKey),
    saveInitializationError: (error) => storage.set(initializationErrorKey, error),
    clearInitializationError: () => storage.remove(initializationErrorKey),
  }
}
