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
import { DeviceIdentity, IdentityManager } from './identity.js';

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

type Events = {
  request: TrustedDevice
  approved: TrustedDevice
  rejected: TrustedDevice
  removed: TrustedDevice
}

const PENDING_TTL = 10 * 60 * 1000

export interface TrustManager {
  sendTrustRequest(device: TrustedDevice): Promise<void>
  sendTrustAck(device: TrustedDevice, accepted: boolean): Promise<void>
  handleTrustMessage(msg: TrustMessage): Promise<void>
  list(): Promise<TrustedDevice[]>
  remove(deviceId: string): Promise<void>
  isTrusted(deviceId: string): Promise<boolean>
  on(event: keyof Events, cb: (device: TrustedDevice) => void): void
  bindMessenger(messenger: ProtocolMessenger<TrustMessage>): void
}

export function createTrustManager(options: {
  trustRepo: TrustedDeviceRepository;
  identitySvc: IdentityManager;
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
    if (!messaging) {
      log.debug("Trust request skipped: messenger not bound", { deviceId: device.deviceId });
      return;
    }
    const local = await identitySvc.get();
    const msg = await createSignedTrustRequest(local, device.deviceId, clock);
    log.debug("Sending trust request", { from: local.deviceId, to: device.deviceId });
    await messaging.send(device.deviceId, msg)
      .catch(() => {
        // TODO: add logging
      });
    // TODO: add logging
  }

  async function sendTrustAck(device: TrustedDevice, accepted: boolean): Promise<void> {
    const messaging = current;
    if (!messaging) {
      log.debug("Trust ack skipped: messenger not bound", { deviceId: device.deviceId, accepted });
      return;
    }
    const req = pendingDevices.get(device.deviceId);
    if (!req) {
      log.debug("Trust ack skipped: no pending request", { deviceId: device.deviceId, accepted });
      return;
    }
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
    log.debug("Sent trust ack", { from: local.deviceId, to: device.deviceId, accepted });
    forgetPendingRequest(device.deviceId)
    // TODO: add logging
    if (accepted) {
      await trustRepo.upsert(device)
      events.emit('approved', device)
      return
    } else {
      events.emit('rejected', device)
    }
  }

  async function handleTrustMessage(msg: TrustMessage): Promise<void> {
    if (!validateMsg(msg)) {
      log.warn("Invalid trust message received", { type: (msg as any)?.type, from: (msg as any)?.from });
      return;
    }
    log.debug("Trust message received", { type: msg.type, from: msg.from, to: (msg as any).to });
    switch (msg.type) {
      case 'trust-request':
        return await handleTrustRequest(msg)

      case 'trust-ack':
        return await handleTrustAck(msg)

      default:
        // TODO: add logging
        return
    }
  }

  async function handleTrustRequest(msg: TrustRequestMessage): Promise<void> {
    const device = msg.payload
    log.debug("Handling trust request", { from: msg.from, to: msg.to, deviceId: device.deviceId });
    if (await isTrusted(device.deviceId)) {
      log.debug("Trust request ignored: already trusted", { deviceId: device.deviceId });
      return;
    }
    pendingDevices.set(device.deviceId, msg)
    const existing = pending.get(device.deviceId)
    if (existing) clearTimeout(existing)
    pending.set(
      device.deviceId,
      setTimeout(() => {
        pending.delete(device.deviceId);
        pendingDevices.delete(device.deviceId);
        log.debug("Trust request expired", { deviceId: device.deviceId });
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
    const responder = (msg.payload as any)?.responder
    const requestDevice = msg.payload?.request?.payload
    const device =
      responder && typeof (responder as any).deviceId === "string"
        ? (responder as TrustedDevice)
        : requestDevice
    log.debug("Handling trust ack", {
      from: msg.from,
      to: msg.to,
      deviceId: (device as any)?.deviceId,
      accepted: msg.payload?.accepted,
    });
    if (!device || typeof (device as any).deviceId !== "string") {
      log.warn("Trust ack missing responder identity", { from: msg.from, to: msg.to })
      return
    }
    if (!msg.payload.accepted) {
      forgetPendingRequest(device.deviceId)
      // TODO: do we need rejected event?
      events.emit('rejected', device)
      return
    }
    await trustRepo.upsert(device)
    forgetPendingRequest(device.deviceId)
    events.emit('approved', device)
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

  async function isTrusted(id: string): Promise<boolean> {
    const device = await trustRepo.get(id)
    return !!device
  }

  function on(event: keyof Events, cb: (device: TrustedDevice) => void) {
    events.on(event, cb)
  }

  return {
    sendTrustRequest,
    sendTrustAck,
    handleTrustMessage,
    list,
    remove,
    isTrusted,
    on,
    bindMessenger: (messenger: ProtocolMessenger<TrustMessage>) => {
      current = messenger
    }
  }
}
