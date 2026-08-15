import type { RuntimeClock, RuntimeLifecycle, RuntimeNotifications } from "../runtime/contract";
import {
  decodePairingFrame,
  decodeTrustRequestEnvelope,
  decodeTrustRequestPayload,
  validateTrustRequestTime,
} from "./protocol";

export type PendingTrustRequest = {
  initiatorPeerId: string;
  deviceName: string;
  nameRevision: bigint;
  requestEnvelope: Uint8Array;
  expiresAtUnixMs: bigint;
};

export interface PendingTrustRequestStore {
  list(): Promise<PendingTrustRequest[]>;
  save(request: PendingTrustRequest): Promise<void>;
  remove(initiatorPeerId: string): Promise<void>;
}

export type TrustRequestVerifier = (signedPayload: Uint8Array, signature: Uint8Array, initiatorPeerId: string) => Promise<boolean>;

export function createPendingTrustRequestCoordinator(options: {
  localPeerId(): Promise<string>;
  store: PendingTrustRequestStore;
  notifications: RuntimeNotifications;
  lifecycle: Pick<RuntimeLifecycle, "openApprovalView">;
  clock: RuntimeClock;
  verify: TrustRequestVerifier;
  validityWindowMs?: number;
  clockSkewAllowanceMs?: number;
}) {
  const notificationId = (peerId: string) => `pairing-request-${peerId}`;
  const expiryTimers = new Map<string, unknown>();

  const expirationFor = (issuedAt: bigint) => issuedAt + BigInt(options.validityWindowMs ?? 10 * 60 * 1000) + BigInt(options.clockSkewAllowanceMs ?? 2 * 60 * 1000);
  const isCurrent = (request: PendingTrustRequest) => BigInt(options.clock.now()) <= request.expiresAtUnixMs;
  const clearTimer = (peerId: string) => {
    const timer = expiryTimers.get(peerId);
    if (timer !== undefined) options.clock.clearTimeout(timer);
    expiryTimers.delete(peerId);
  };
  const expire = async (peerId: string) => {
    clearTimer(peerId);
    await options.store.remove(peerId);
    await options.notifications.dismiss(notificationId(peerId));
  };
  const scheduleExpiry = (request: PendingTrustRequest) => {
    clearTimer(request.initiatorPeerId);
    const delay = Number(request.expiresAtUnixMs - BigInt(options.clock.now()));
    expiryTimers.set(request.initiatorPeerId, options.clock.setTimeout(() => void expire(request.initiatorPeerId), Math.max(0, delay)));
  };
  const show = async (request: PendingTrustRequest) => {
    await options.notifications.show({
      id: notificationId(request.initiatorPeerId),
      title: "Pairing request",
      body: `${request.deviceName} wants to pair.`,
    });
  };

  return {
    async start(): Promise<void> {
      options.notifications.onSelect((id) => {
        if (id.startsWith("pairing-request-")) return options.lifecycle.openApprovalView();
      });
      for (const request of await options.store.list()) {
        if (!isCurrent(request)) await expire(request.initiatorPeerId);
        else {
          scheduleExpiry(request);
          await show(request);
        }
      }
    },
    async receive(authenticatedPeerId: string, frame: Uint8Array): Promise<boolean> {
      const parsed = decodePairingFrame(frame);
      if (!parsed || parsed.kind !== "request") return false;
      const envelope = decodeTrustRequestEnvelope(parsed.envelope);
      if (!envelope) return false;
      // The authenticated stream peer supplies the verification key; never
      // parse attacker-controlled signed fields before their signature holds.
      if (!(await options.verify(envelope.signedPayload, envelope.signature, authenticatedPeerId))) return false;
      const payload = decodeTrustRequestPayload(envelope.signedPayload);
      if (!payload || payload.initiatorPeerId !== authenticatedPeerId || payload.targetPeerId !== await options.localPeerId()) return false;
      if (!validateTrustRequestTime(payload, options.clock.now(), options)) return false;

      const request: PendingTrustRequest = {
        initiatorPeerId: payload.initiatorPeerId,
        deviceName: payload.deviceName,
        nameRevision: payload.nameRevision,
        requestEnvelope: Uint8Array.from(parsed.envelope),
        expiresAtUnixMs: expirationFor(payload.issuedAtUnixMs),
      };
      const existing = (await options.store.list()).find((entry) => entry.initiatorPeerId === request.initiatorPeerId);
      await options.store.save(request);
      scheduleExpiry(request);
      if (!existing) await show(request);
      return true;
    },
    expire,
  };
}
