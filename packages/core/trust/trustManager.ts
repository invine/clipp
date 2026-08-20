import * as log from '../logger.js';
import type { ProtocolMessenger } from "../messaging/protocolMessenger.js";
import {
  TrustAckMessage,
  TrustMessage,
  TrustRequestMessage,
  TrustedPeersMessage,
  type TrustRequestPayload,
  createTrustedPeersMessage,
  createSignedTrustRequest,
  toTrustRequestPayload,
  validate as validateMsg
} from '../protocols/clipTrust.js';
import { TypedEventEmitter } from './events.js';
import { DeviceIdentity, IdentityManager } from './identity.js';
import type { AdmissionResult, DeviceMembershipAdmissions, DevicePresentation } from '../pairing/membership.js';
import { normalizeDeviceName, shortenPeerId } from '../pairing/presentation.js';

// TODO: refactor later
export interface TrustedDevice extends DeviceIdentity {
  lastSeen?: number
  displayName?: string
  localAlias?: string
  selfReportedDeviceName?: string
  selfReportedNameRevision?: string
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
  renamed: TrustedDevice
}

const PENDING_TTL = 10 * 60 * 1000

function isDevicePayload(device: unknown): device is TrustRequestPayload {
  return (
    !!device &&
    typeof device === "object" &&
    typeof (device as any).deviceId === "string"
  );
}

function toTrustedDevice(device: TrustRequestPayload): TrustedDevice {
  const trusted = { ...(device as any) };
  delete trusted.privateKey;
  return trusted as TrustedDevice;
}

function targetForDevice(device: TrustRequestPayload): string {
  const multiaddrs = (device as any).multiaddrs;
  const multiaddr = (device as any).multiaddr;
  return (
    (Array.isArray(multiaddrs) && multiaddrs.find((addr) => typeof addr === "string")) ||
    (typeof multiaddr === "string" ? multiaddr : undefined) ||
    device.deviceId
  );
}

function deviceMultiaddrs(device: Partial<TrustRequestPayload>): string[] {
  const values = [
    ...(Array.isArray((device as any).multiaddrs) ? (device as any).multiaddrs : []),
    (device as any).multiaddr,
  ];
  return values.filter((addr): addr is string => typeof addr === "string" && addr.length > 0);
}

function peerIdFromAddress(value: string): string | null {
  const match = value.match(/\/p2p\/([^/]+)/);
  return match?.[1] ?? null;
}

function normalizedPeerTarget(value: string): string {
  return value.startsWith("/") ? peerIdFromAddress(value) ?? value : value;
}

function withDisplayName(device: TrustedDevice): TrustedDevice {
  return {
    ...device,
    displayName:
      device.localAlias
      ?? device.selfReportedDeviceName
      ?? normalizeDeviceName(device.deviceName)
      ?? shortenPeerId(device.deviceId),
  };
}

async function trustedDeviceAliases(device: TrustedDevice): Promise<Set<string>> {
  const aliases = new Set<string>();
  aliases.add(device.deviceId);
  for (const addr of deviceMultiaddrs(device)) {
    aliases.add(addr);
    const peerId = peerIdFromAddress(addr);
    if (peerId) aliases.add(peerId);
  }
  return aliases;
}

function dedupeDevicePayloads(devices: TrustRequestPayload[]): TrustRequestPayload[] {
  const seen = new Set<string>();
  const out: TrustRequestPayload[] = [];
  for (const device of devices) {
    if (!isDevicePayload(device) || seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    out.push(toTrustRequestPayload(device as DeviceIdentity));
  }
  return out;
}

export interface TrustManager extends DeviceMembershipAdmissions {
  sendTrustRequest(device: TrustedDevice): Promise<void>
  sendTrustAck(device: TrustedDevice, accepted: boolean): Promise<void>
  handleTrustMessage(msg: TrustMessage): Promise<void>
  list(): Promise<TrustedDevice[]>
  rename(deviceId: string, name: string): Promise<TrustedDevice | null>
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
    const req = pendingDevices.get(device.deviceId);
    if (!req) {
      log.debug("Trust ack skipped: no pending request", { deviceId: device.deviceId, accepted });
      return;
    }
    if (!(await sendTrustAckForRequest(req, device, accepted))) return
    forgetPendingRequest(device.deviceId)
    // TODO: add logging
    if (accepted) {
      await addTrustedDevice(device)
      return
    } else {
      events.emit('rejected', device)
    }
  }

  async function sendTrustAckForRequest(
    req: TrustRequestMessage,
    device: TrustedDevice,
    accepted: boolean,
  ): Promise<boolean> {
    const messaging = current;
    if (!messaging) {
      log.debug("Trust ack skipped: messenger not bound", { deviceId: device.deviceId, accepted });
      return false;
    }
    const local = await identitySvc.get();
    const payload: TrustAckMessage["payload"] = {
      accepted,
      request: req,
      responder: toTrustRequestPayload(local),
    };
    const msg: TrustMessage = {
      type: "trust-ack",
      from: local.deviceId,
      to: req.from,
      payload,
      sentAt: clock(),
    };

    await messaging.send(req.from, msg)
      .catch(() => {
        // TODO: add logging
      });
    log.debug("Sent trust ack", { from: local.deviceId, to: req.from, accepted });
    return true;
  }

  async function addTrustedDevice(
    device: TrustRequestPayload,
    options: { share?: boolean } = {},
  ): Promise<{ device: TrustedDevice; added: boolean } | null> {
    const local = await identitySvc.get();
    if (!isDevicePayload(device) || device.deviceId === local.deviceId) return null;

    const existing = await trustRepo.get(device.deviceId);
    const trustedDevice = toTrustedDevice(device);
    await trustRepo.upsert(trustedDevice);

    if (!existing) {
      events.emit('approved', trustedDevice)
      if (options.share !== false) {
        await shareTrustedPeerAdded(trustedDevice, local)
      }
    }
    return { device: trustedDevice, added: !existing };
  }

  async function shareTrustedPeerAdded(
    device: TrustedDevice,
    local: DeviceIdentity,
  ): Promise<void> {
    const messaging = current;
    if (!messaging) return;
    await shareKnownPeersWithDevice(device, local);
    await shareNewPeerWithConnectedTrustedPeers(device, local);
  }

  async function shareKnownPeersWithDevice(
    device: TrustedDevice,
    local: DeviceIdentity,
  ): Promise<void> {
    const peers = await trustRepo.list();
    const devices = dedupeDevicePayloads([
      toTrustRequestPayload(local),
      ...peers.filter((peer) => peer.deviceId !== device.deviceId),
    ]);
    if (devices.length === 0) return;
    await sendTrustedPeers(targetForDevice(device), device.deviceId, devices, local);
  }

  async function shareNewPeerWithConnectedTrustedPeers(
    device: TrustedDevice,
    local: DeviceIdentity,
  ): Promise<void> {
    const messaging = current;
    const connected = new Set(messaging?.getPeers?.() ?? []);
    if (connected.size === 0) return;

    const peers = await trustRepo.list();
    const connectedPeers = (
      await Promise.all(
        peers.map(async (peer) => ({
          peer,
          connected: await trustedDeviceConnected(peer, connected),
        }))
      )
    )
      .filter((entry) => entry.connected)
      .map((entry) => entry.peer);

    await Promise.all(
      connectedPeers
        .filter((peer) => peer.deviceId !== device.deviceId)
        .filter((peer) => peer.deviceId !== local.deviceId)
        .map((peer) =>
          sendTrustedPeers(targetForConnectedDevice(peer, connected), peer.deviceId, [device], local),
        ),
    );
  }

  async function trustedDeviceConnected(device: TrustedDevice, connected: Set<string>): Promise<boolean> {
    const aliases = await trustedDeviceAliases(device);
    for (const peer of connected) {
      if (aliases.has(peer) || aliases.has(normalizedPeerTarget(peer))) return true;
    }
    return false;
  }

  function targetForConnectedDevice(device: TrustedDevice, connected: Set<string>): string {
    for (const addr of deviceMultiaddrs(device)) {
      const peerId = peerIdFromAddress(addr);
      if (peerId && connected.has(peerId)) return peerId;
    }
    if (connected.has(device.deviceId)) return device.deviceId;
    return targetForDevice(device);
  }

  async function sendTrustedPeers(
    target: string,
    to: string,
    devices: TrustRequestPayload[],
    local: DeviceIdentity,
  ): Promise<void> {
    const messaging = current;
    if (!messaging) return;
    const shared = dedupeDevicePayloads(
      devices.filter((device) => device.deviceId !== to),
    );
    if (shared.length === 0) return;

    const msg = createTrustedPeersMessage({
      from: local.deviceId,
      to,
      devices: shared,
      now: clock,
    });
    await messaging.send(target, msg).catch(() => {
      // TODO: add logging
    });
  }

  async function handleTrustMessage(msg: TrustMessage): Promise<void> {
    if (!(await validateMsg(msg))) {
      log.warn("Invalid trust message received", { type: (msg as any)?.type, from: (msg as any)?.from });
      return;
    }
    log.debug("Trust message received", { type: msg.type, from: msg.from, to: (msg as any).to });
    switch (msg.type) {
      case 'trust-request':
        return await handleTrustRequest(msg)

      case 'trust-ack':
        return await handleTrustAck(msg)

      case 'trusted-peers':
        return await handleTrustedPeers(msg)

      default:
        // TODO: add logging
        return
    }
  }

  async function handleTrustRequest(msg: TrustRequestMessage): Promise<void> {
    const device = msg.payload.device
    log.debug("Handling trust request", { from: msg.from, to: msg.to, deviceId: device.deviceId });
    if (await isTrusted(device.deviceId)) {
      log.debug("Trust request accepted automatically: already trusted", { deviceId: device.deviceId });
      await sendTrustAckForRequest(msg, device as TrustedDevice, true);
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
    const requestDevice = msg.payload?.request?.payload?.device
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
    await addTrustedDevice(device)
    forgetPendingRequest(device.deviceId)
  }

  async function handleTrustedPeers(msg: TrustedPeersMessage): Promise<void> {
    const local = await identitySvc.get()
    if (msg.to !== local.deviceId) return
    if (!(await isTrusted(msg.from))) {
      log.warn("Trusted peers message ignored: sender not trusted", { from: msg.from, to: msg.to })
      return
    }
    const added: TrustedDevice[] = []
    for (const device of msg.payload.devices) {
      const result = await addTrustedDevice(device, { share: false })
      if (result?.added) added.push(result.device)
    }
    for (const device of added) {
      await shareTrustedPeerAdded(device, local)
    }
  }

  async function list(): Promise<TrustedDevice[]> {
    const [legacyDevices, activePeerIds, local] = await Promise.all([
      trustRepo.list(),
      identitySvc.activePeerIds?.() ?? Promise.resolve([]),
      identitySvc.get(),
    ]);
    const metadataByPeerId = new Map(legacyDevices.map((device) => [device.deviceId, device]));
    return Promise.all(activePeerIds
      .filter((peerId) => peerId !== local.deviceId)
      .map(async (peerId) => {
        const metadata = metadataByPeerId.get(peerId);
        const device = metadata ? withDisplayName(metadata) : {
          deviceId: peerId,
          deviceName: "",
          displayName: shortenPeerId(peerId),
          publicKey: "",
          multiaddrs: [],
          createdAt: 0,
        };
        const identityLabel = await identitySvc.displayDeviceLabel?.(peerId);
        return {
          ...device,
          displayName:
            metadata?.localAlias
            ?? identityLabel
            ?? device.displayName,
        };
      }));
  }

  async function rename(deviceId: string, name: string): Promise<TrustedDevice | null> {
    const normalized = normalizeDeviceName(name)
    if (!normalized) return null
    if (identitySvc.membershipStatus && await identitySvc.membershipStatus(deviceId) !== "active") return null
    const device = await trustRepo.get(deviceId)
    if (!device && !identitySvc.setLocalDeviceAlias) return null
    await identitySvc.setLocalDeviceAlias?.(deviceId, normalized)
    if (device) {
      await trustRepo.upsert({
        ...device,
        localAlias: normalized,
      })
    }
    log.info("Device renamed", deviceId)
    const presented = (await list()).find((candidate) => candidate.deviceId === deviceId)
      ?? (device ? withDisplayName({ ...device, localAlias: normalized }) : null)
    if (!presented) return null
    events.emit('renamed', presented)
    return presented
  }

  async function remove(deviceId: string): Promise<void> {
    const device = await trustRepo.get(deviceId);
    const revocation = await identitySvc.revoke(deviceId);
    if (revocation === "not-active") return;
    // Device Membership is already durably revoked. Legacy presentation data
    // is only a local cache, so its cleanup cannot roll back the tombstone.
    await trustRepo.remove(deviceId).catch((error) => {
      log.warn("Revoked device metadata cleanup failed", { deviceId, error });
    });
    const removed = device ?? {
      deviceId,
      deviceName: "",
      publicKey: "",
      multiaddrs: [],
      createdAt: 0,
    };
    log.info("Device revoked", deviceId);
    events.emit('removed', removed);
  }

  async function isTrusted(id: string): Promise<boolean> {
    const membershipStatus = await identitySvc.membershipStatus?.(normalizedPeerTarget(id)) ?? "unknown";
    return membershipStatus === "active";
  }

  async function admit(deviceId: string, presentation?: DevicePresentation): Promise<AdmissionResult> {
    const admission = await identitySvc.admit?.(deviceId) ?? "admitted";
    if (admission === "revoked" || !presentation) return admission;
    try {
      await identitySvc.recordRemoteDeviceName?.(
        deviceId,
        presentation.deviceName,
        presentation.nameRevision,
      );
      const existing = await trustRepo.get(deviceId);
      const currentRevision = BigInt(existing?.selfReportedNameRevision ?? existing?.nameRevision ?? -1);
      if (presentation.nameRevision <= currentRevision) return admission;
      const reportedDeviceName = normalizeDeviceName(presentation.deviceName)
        ?? existing?.selfReportedDeviceName
        ?? (!existing?.localAlias && existing ? normalizeDeviceName(existing.deviceName) : undefined);
      await trustRepo.upsert({
        ...existing,
        deviceId,
        deviceName: reportedDeviceName ?? existing?.deviceName ?? "",
        selfReportedDeviceName: reportedDeviceName,
        selfReportedNameRevision: presentation.nameRevision.toString(),
        publicKey: existing?.publicKey ?? "",
        privateKey: undefined,
        multiaddrs: existing?.multiaddrs ?? [],
        createdAt: existing?.createdAt ?? clock(),
        lastSeen: existing?.lastSeen,
      });
    } catch {
      // Presentation metadata is non-authoritative. Active membership remains
      // immediately usable and list() supplies a Peer ID fallback label.
    }
    return admission;
  }

  function on(event: keyof Events, cb: (device: TrustedDevice) => void) {
    events.on(event, cb)
  }

  return {
    sendTrustRequest,
    sendTrustAck,
    handleTrustMessage,
    list,
    rename,
    remove,
    isTrusted,
    membershipStatus: (peerId) => identitySvc.membershipStatus?.(peerId) ?? Promise.resolve("unknown"),
    admit,
    on,
    bindMessenger: (messenger: ProtocolMessenger<TrustMessage>) => {
      current = messenger
    }
  }
}
