import { TypedEventEmitter } from './events'
import { DeviceIdentity, getLocalIdentity } from './identity'
import * as log from '../logger'

export interface TrustedDevice extends DeviceIdentity {
  lastSeen?: number
}

export interface StorageBackend {
  get<T=any>(key: string): Promise<T | undefined>
  set<T=any>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export class MemoryStorageBackend implements StorageBackend {
  private store = new Map<string, any>()
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key)
  }
  async set<T>(key: string, value: T) {
    this.store.set(key, value)
  }
  async remove(key: string) {
    this.store.delete(key)
  }
}

type Events = {
  request: TrustedDevice
  approved: TrustedDevice
  rejected: TrustedDevice
  removed: TrustedDevice
}

const TRUST_KEY = 'trustedDevices'
const PENDING_TTL = 10 * 60 * 1000

export interface TrustManager {
  getLocalIdentity(): Promise<DeviceIdentity>
  list(): Promise<TrustedDevice[]>
  isTrusted(deviceId: string): Promise<boolean>
  verifyPublicKey(deviceId: string, pubkey: string): Promise<boolean>
  add(device: TrustedDevice): Promise<void>
  remove(deviceId: string): Promise<void>
  handleTrustRequest(req: TrustedDevice): Promise<void>
  on(event: keyof Events, cb: (device: TrustedDevice) => void): void
}

export function createTrustManager(storage: StorageBackend): TrustManager {
  const events = new TypedEventEmitter<Events>()
  let identity: DeviceIdentity | null = null
  const pending = new Map<string, NodeJS.Timeout>()
  const pendingDevices = new Map<string, TrustedDevice>()

  async function load(): Promise<TrustedDevice[]> {
    const data = await storage.get<TrustedDevice[]>(TRUST_KEY)
    return Array.isArray(data) ? data : []
  }
  async function save(list: TrustedDevice[]) {
    await storage.set(TRUST_KEY, list)
  }

  async function getIdentity(): Promise<DeviceIdentity> {
    if (!identity) {
      identity = await getLocalIdentity(storage)
    }
    return identity
  }

  async function list(): Promise<TrustedDevice[]> {
    return await load()
  }

  async function isTrusted(id: string): Promise<boolean> {
    const list = await load()
    return list.some((d) => d.deviceId === id)
  }

  async function verifyPublicKey(id: string, key: string): Promise<boolean> {
    const list = await load()
    const dev = list.find((d) => d.deviceId === id)
    return dev ? dev.publicKey === key : false
  }

  async function add(device: TrustedDevice) {
    const list = await load()
    const idx = list.findIndex((d) => d.deviceId === device.deviceId)
    if (idx >= 0) list[idx] = device
    else list.push(device)
    await save(list)
    if (pending.has(device.deviceId)) {
      clearTimeout(pending.get(device.deviceId)!)
      pending.delete(device.deviceId)
      pendingDevices.delete(device.deviceId)
    }
    log.info("Device approved", device.deviceId)
    events.emit('approved', device)
  }

  async function remove(id: string) {
    const list = await load()
    const idx = list.findIndex((d) => d.deviceId === id)
    const device = list[idx]
    if (idx >= 0) {
      list.splice(idx, 1)
      await save(list)
      log.info("Device removed", id)
      events.emit('removed', device)
    }
  }

  function validate(device: TrustedDevice): boolean {
    const hasMultiaddr = typeof device.multiaddr === 'string' && device.multiaddr.endsWith(`/p2p/${device.deviceId}`)
    const hasMultiaddrs =
      Array.isArray(device.multiaddrs) &&
      device.multiaddrs.length > 0 &&
      device.multiaddrs.every((addr) => typeof addr === 'string' && addr.endsWith(`/p2p/${device.deviceId}`))

    return (
      device &&
      typeof device.deviceId === 'string' &&
      typeof device.deviceName === 'string' &&
      typeof device.publicKey === 'string' &&
      typeof device.createdAt === 'number' &&
      (hasMultiaddr || hasMultiaddrs)
    )
  }

  async function handleTrustRequest(req: TrustedDevice) {
    if (!validate(req)) return
    if (await isTrusted(req.deviceId)) return
    if (pending.has(req.deviceId)) return
    pendingDevices.set(req.deviceId, req)
    const timer = setTimeout(() => {
      pending.delete(req.deviceId)
      pendingDevices.delete(req.deviceId)
      events.emit('rejected', req)
    }, PENDING_TTL)
    pending.set(req.deviceId, timer)
    log.info("Trust request from", req.deviceId)
    events.emit('request', req)
  }

  function on(event: keyof Events, cb: (device: TrustedDevice) => void) {
    events.on(event, cb)
  }

  return { getLocalIdentity: getIdentity, list, isTrusted, verifyPublicKey, add, remove, handleTrustRequest, on }
}
