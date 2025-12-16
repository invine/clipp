import * as log from '../logger.js';
import type { ProtocolMessenger } from "../messaging/protocolMessenger.js";
import {
  TrustAckMessage,
  TrustMessage,
  TrustRequestMessage,
  TrustRequestPayload,
  createSignedTrustRequest,
  validate as validateMsg
} from '../protocols/clipTrust.js';
import { TypedEventEmitter } from './events.js';
import { DeviceIdentity, IdentityService } from './identity.js';

// TODO: refactor later
export interface TrustedDevice extends DeviceIdentity {
  lastSeen?: number
}

// TODO: is it required?
export function toTrustRequestPayload(identity: DeviceIdentity): TrustRequestPayload {
  const { privateKey: _privateKey, ...rest } = identity as any;
  return rest as TrustRequestPayload;
}

export interface TrustedDeviceRepository {
  list(): Promise<TrustedDevice[]>
  get(deviceId: string): Promise<TrustedDevice | undefined>
  upsert(device: TrustedDevice): Promise<void>
  remove(deviceId: string): Promise<void>
}

// TODO: how MemoryStorageBackend is used?
// export class MemoryStorageBackend implements StorageBackend {
//   private store = new Map<string, any>()
//   async get<T>(key: string): Promise<T | undefined> {
//     return this.store.get(key)
//   }
//   async set<T>(key: string, value: T) {
//     this.store.set(key, value)
//   }
//   async remove(key: string) {
//     this.store.delete(key)
//   }
// }

type Events = {
  request: TrustedDevice
  approved: TrustedDevice
  rejected: TrustedDevice
  removed: TrustedDevice
}

const PENDING_TTL = 10 * 60 * 1000

export interface TrustManager {
  // getLocalIdentity(): Promise<DeviceIdentity>
  // renameLocalIdentity(name: string): Promise<DeviceIdentity>
  sendTrustRequest(device: TrustedDevice): Promise<void>
  sendTrustAck(device: TrustedDevice, accepted: boolean): Promise<void>
  handleTrustMessage(msg: TrustMessage): Promise<void>
  list(): Promise<TrustedDevice[]>
  remove(deviceId: string): Promise<void>
  isTrusted(deviceId: string): Promise<boolean>
  on(event: keyof Events, cb: (device: TrustedDevice) => void): void
  // list(): Promise<TrustedDevice[]>
  // isTrusted(deviceId: string): Promise<boolean>
  // verifyPublicKey(deviceId: string, pubkey: string): Promise<boolean>
  // add(device: TrustedDevice): Promise<void>
  // reject(deviceId: string): Promise<void>
  // remove(deviceId: string): Promise<void>
  // handleTrustRequest(req: TrustedDevice): Promise<void>
  // on(event: keyof Events, cb: (device: TrustedDevice) => void): void
}

// export function createTrustManager(storage: StorageBackend): TrustManager {
export function createTrustManager(options: {
  trustRepo: TrustedDeviceRepository;
  identitySvc: IdentityService;
  now?: () => number
}): TrustManager {
  const { trustRepo } = options
  const { identitySvc } = options
  const clock = options.now ?? Date.now;
  // TODO: refactor event bus later
  const events = new TypedEventEmitter<Events>()
  let current: ProtocolMessenger<TrustMessage> | null = null;
  const pending = new Map<string, NodeJS.Timeout>()
  const pendingDevices = new Map<string, TrustRequestMessage>()


  async function sendTrustRequest(device: TrustedDevice): Promise<void> {
    const messaging = current;
    if (!messaging) return;
    const local = await identitySvc.get();
    const msg = await createSignedTrustRequest(local, device.deviceId, clock);
    await messaging.send(device.deviceId, msg)
      .catch(() => {
        // TODO: add logging
      });
    // TODO: add logging
  }

  async function sendTrustAck(device: TrustedDevice, accepted: boolean): Promise<void> {
    const messaging = current;
    if (!messaging) return;
    const req = pendingDevices.get(device.deviceId);
    if (!req) return
    const local = await identitySvc.get();
    const msg: TrustMessage = {
      type: "trust-ack",
      from: local.deviceId,
      to: device.deviceId,
      payload: { accepted: accepted, request: req, responder: toTrustRequestPayload(local) },
      sentAt: clock(),
    };

    await messaging.send(device.deviceId, msg)
      .catch(() => {
        // TODO: add logging
      });
    // TODO: add logging
    if (accepted) {
      // TODO: add logging
      await trustRepo.upsert(device)
      events.emit('approved', device)
      return
    }
    events.emit('rejected', device)
  }

  async function handleTrustMessage(msg: TrustMessage): Promise<void> {
    if (!validateMsg(msg)) return;
    switch (msg.type) {
      case 'trust-request':
        return await handleTrustRequest(msg)

      case 'trust-ack':
        return await handleTrustAck(msg)

      // Use a default case or an exhaustive check for future-proofing
      default:
        // TODO: add logging
        return
    }
  }

  async function handleTrustRequest(msg: TrustRequestMessage): Promise<void> {
    const device = msg.payload
    if (await isTrusted(device.deviceId)) return
    pendingDevices.set(device.deviceId, msg)
    const existing = pending.get(device.deviceId)
    if (existing) clearTimeout(existing)
    pending.set(
      device.deviceId,
      setTimeout(() => {
        pending.delete(device.deviceId);
        pendingDevices.delete(device.deviceId);
        events.emit('rejected', device);
      }, PENDING_TTL)
    )
    log.info("Trust request from", device.deviceId)
    events.emit('request', device)
  }

  function forgetPendingRequest(deviceId: string) {
    const timer = pending.get(deviceId);
    if (timer) clearTimeout(timer);
    pending.delete(deviceId);
    pendingDevices.delete(deviceId);
  }

  async function handleTrustAck(msg: TrustAckMessage): Promise<void> {
    const device = msg.payload.request.payload
    if (!msg.payload.accepted) {
      // TODO: do we need rejected event?
      events.emit('rejected', device)
      forgetPendingRequest(device.deviceId)
      return
    }
    await trustRepo.upsert(device)
    events.emit('approved', device)
    forgetPendingRequest(device.deviceId)
  }

  async function list(): Promise<TrustedDevice[]> {
    return trustRepo.list()
  }

  async function remove(deviceId: string): Promise<void> {
    const device = await trustRepo.get(deviceId)
    if (!device) return
    await trustRepo.remove(deviceId)
    log.info("Device removed", deviceId)
    events.emit('removed', device)
  }

  // async function load(): Promise<TrustedDevice[]> {
  //   const data = await repo.get<TrustedDevice[]>(TRUST_KEY)
  //   return Array.isArray(data) ? data : []
  // }
  // TODO: Should be part of storage, not part of the use case
  // async function save(list: TrustedDevice[]) {
  //   await repo.set(TRUST_KEY, list)
  // }

  // async function getIdentity(): Promise<DeviceIdentity> {
  //   if (!identity) {
  //     identity = await identityRepo.get()
  //   }
  //   return identity
  // }

  // TODO: what's the reason for having this function? Why not use load instead?
  // async function list(): Promise<TrustedDevice[]> {
  //   return await load()
  // }

  async function isTrusted(id: string): Promise<boolean> {
    // const list = await load()
    const trusted = await list()
    return trusted.some((d) => d.deviceId === id)
  }

  // TODO: this does nothing!
  // async function verifyPublicKey(id: string, key: string): Promise<boolean> {
  //   const list = await load()
  //   const dev = list.find((d) => d.deviceId === id)
  //   return dev ? dev.publicKey === key : false
  // }

  // async function add(device: TrustedDevice) {
  //   const list = await load()
  //   const idx = list.findIndex((d) => d.deviceId === device.deviceId)
  //   if (idx >= 0) list[idx] = device
  //   else list.push(device)
  //   await save(list)
  //   if (pending.has(device.deviceId)) {
  //     clearTimeout(pending.get(device.deviceId)!)
  //     pending.delete(device.deviceId)
  //     pendingDevices.delete(device.deviceId)
  //   }
  //   log.info("Device approved", device.deviceId)
  //   events.emit('approved', device)
  // }
  //
  // async function reject(deviceId: string) {
  //   const device = pendingDevices.get(deviceId)
  //   if (!device) return
  //   const timer = pending.get(deviceId)
  //   if (timer) {
  //     clearTimeout(timer)
  //     pending.delete(deviceId)
  //   }
  //   pendingDevices.delete(deviceId)
  //   log.info('Trust request rejected', deviceId)
  //   events.emit('rejected', device)
  // }

  // async function remove(id: string) {
  //   const list = await load()
  //   const idx = list.findIndex((d) => d.deviceId === id)
  //   const device = list[idx]
  //   if (idx >= 0) {
  //     list.splice(idx, 1)
  //     await save(list)
  //     log.info("Device removed", id)
  //     events.emit('removed', device)
  //   }
  // }

  // TODO: add to other validations
  // function validate(device: TrustedDevice): boolean {
  //   const hasMultiaddr = typeof device.multiaddr === 'string' && device.multiaddr.endsWith(`/p2p/${device.deviceId}`)
  //   const hasMultiaddrs =
  //     Array.isArray(device.multiaddrs) &&
  //     device.multiaddrs.length > 0 &&
  //     device.multiaddrs.every((addr) => typeof addr === 'string' && addr.endsWith(`/p2p/${device.deviceId}`))
  //
  //   return (
  //     device &&
  //     typeof device.deviceId === 'string' &&
  //     typeof device.deviceName === 'string' &&
  //     typeof device.publicKey === 'string' &&
  //     typeof device.createdAt === 'number' &&
  //     (hasMultiaddr || hasMultiaddrs)
  //   )
  // }

  // TODO: need to decide who owns list of pending trust requests - it's either trustManager or trustBinder. Currently both have this functionality
  // async function handleTrustRequest(req: TrustedDevice) {
  //   if (!validate(req)) return
  //   if (await isTrusted(req.deviceId)) return
  //   if (pending.has(req.deviceId)) return
  //   pendingDevices.set(req.deviceId, req)
  //   const timer = setTimeout(() => {
  //     pending.delete(req.deviceId)
  //     pendingDevices.delete(req.deviceId)
  //     events.emit('rejected', req)
  //   }, PENDING_TTL)
  //   pending.set(req.deviceId, timer)
  //   log.info("Trust request from", req.deviceId)
  //   events.emit('request', req)
  // }

  function on(event: keyof Events, cb: (device: TrustedDevice) => void) {
    events.on(event, cb)
  }

  // async function renameLocalIdentity(name: string): Promise<DeviceIdentity> {
  //   const trimmed = (name || '').trim()
  //   if (!trimmed) return await getIdentity()
  //   identity = await setLocalIdentityName(trustRepo, trimmed)
  //   return identity
  // }

  return {
    sendTrustRequest,
    sendTrustAck,
    handleTrustMessage,
    list,
    remove,
    isTrusted,
    on,
  }
}
