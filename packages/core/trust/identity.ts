import { v4 as uuidv4 } from 'uuid'
import { StorageBackend } from './trusted-devices.js'
import { DEFAULT_WEBRTC_STAR_RELAYS } from '../network/constants.js'

export interface DeviceIdentity {
  deviceId: string
  deviceName: string
  publicKey: string
  multiaddr: string
  multiaddrs: string[]
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
  if (existing) {
    if (!Array.isArray(existing.multiaddrs) || existing.multiaddrs.length === 0) {
      const derived = DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${existing.deviceId}`)
      existing.multiaddrs = derived
      existing.multiaddr = existing.multiaddr || derived[0] || `/p2p/${existing.deviceId}`
      await storage.set(ID_KEY, existing)
    }
    return existing
  }
  const deviceId = uuidv4()
  const multiaddrs = DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${deviceId}`)
  const identity: DeviceIdentity = {
    deviceId,
    deviceName: typeof navigator !== 'undefined' ? navigator.userAgent : 'Device',
    publicKey: await randomKey(),
    multiaddr: multiaddrs[0] || `/p2p/${deviceId}`,
    multiaddrs,
    createdAt: Date.now(),
  }
  await storage.set(ID_KEY, identity)
  return identity
}

export async function setLocalIdentityName(storage: StorageBackend, deviceName: string): Promise<DeviceIdentity> {
  const identity = await getLocalIdentity(storage)
  identity.deviceName = deviceName
  await storage.set(ID_KEY, identity)
  return identity
}
