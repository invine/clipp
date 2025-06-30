import { v4 as uuidv4 } from 'uuid'
import { StorageBackend } from './trusted-devices'

export interface DeviceIdentity {
  deviceId: string
  deviceName: string
  publicKey: string
  multiaddr: string
  createdAt: number
}

async function randomKey(): Promise<string> {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    return Buffer.from(arr).toString('base64')
  } else {
    const { randomBytes } = await import('crypto')
    return randomBytes(32).toString('base64')
  }
}

const ID_KEY = 'localDeviceIdentity'

export async function getLocalIdentity(storage: StorageBackend): Promise<DeviceIdentity> {
  const existing = await storage.get<DeviceIdentity>(ID_KEY)
  if (existing) return existing
  const deviceId = uuidv4()
  const identity: DeviceIdentity = {
    deviceId,
    deviceName: typeof navigator !== 'undefined' ? navigator.userAgent : 'Device',
    publicKey: await randomKey(),
    multiaddr: `/p2p/${deviceId}`,
    createdAt: Date.now(),
  }
  await storage.set(ID_KEY, identity)
  return identity
}
