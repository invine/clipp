import { v4 as uuidv4 } from 'uuid'
import { StorageBackend } from './trusted-devices.js'
import { DEFAULT_WEBRTC_STAR_RELAYS } from '../network/constants.js'
import { deviceIdToPeerId } from '../network/peerId.js'

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
    const peerId = await deviceIdToPeerId(existing.deviceId)
    const derived = buildDerivedAddrs(peerId)
    const merged = dedupeAddrs([...(existing.multiaddrs || []), ...derived])
    const needsRebuild =
      !Array.isArray(existing.multiaddrs) ||
      existing.multiaddrs.length === 0 ||
      merged.length !== existing.multiaddrs.length ||
      merged.some((addr, idx) => addr !== existing.multiaddrs[idx]) ||
      existing.multiaddrs.some((addr) => addr.includes(existing.deviceId) || !addr.includes(peerId))

    if (needsRebuild) {
      existing.multiaddrs = merged
      existing.multiaddr = merged[0] || `/p2p/${peerId}`
      await storage.set(ID_KEY, existing)
    } else if (!existing.multiaddr) {
      existing.multiaddr = existing.multiaddrs[0]
      await storage.set(ID_KEY, existing)
    }
    return existing
  }
  const deviceId = uuidv4()
  const peerId = await deviceIdToPeerId(deviceId)
  const multiaddrs = buildDerivedAddrs(peerId)
  const identity: DeviceIdentity = {
    deviceId,
    deviceName: typeof navigator !== 'undefined' ? navigator.userAgent : 'Device',
    publicKey: await randomKey(),
    multiaddr: multiaddrs[0] || `/p2p/${peerId}`,
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

function buildDerivedAddrs(peerId: string): string[] {
  const relayEnv = getRelayEnv()
  const derived: string[] = []
  if (relayEnv) {
    derived.push(`${relayEnv}/p2p-circuit/p2p/${peerId}`)
  }
  derived.push(...DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${peerId}`))
  return dedupeAddrs(derived)
}

function dedupeAddrs(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

function getRelayEnv(): string | undefined {
  if (typeof process === 'undefined' || !process?.env) return undefined
  const relay = process.env.CLIPP_RELAY_ADDR || process.env.CLIPP_RELAY_MULTIADDR
  return relay && relay.trim().length > 0 ? relay.trim() : undefined
}
