import type { RuntimeClock, RuntimeLifecycle, RuntimeNotifications } from "../runtime/contract";
import type { KVStorageBackend } from "../trust";
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

type SerializedPendingTrustRequest = Omit<PendingTrustRequest, "requestEnvelope" | "nameRevision" | "expiresAtUnixMs"> & {
  nameRevision: string;
  expiresAtUnixMs: string;
  requestEnvelope: number[];
};

/** Durable store shared by all runtime adapters. */
export function createKVPendingTrustRequestStore(options: { storage: KVStorageBackend; key: string }): PendingTrustRequestStore {
  let mutation = Promise.resolve();
  const serializeMutation = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutation.then(operation);
    mutation = result.then(() => undefined, () => undefined);
    return result;
  };
  const read = async (): Promise<PendingTrustRequest[]> => {
    const stored = await options.storage.get<SerializedPendingTrustRequest[]>(options.key);
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((item): PendingTrustRequest[] => {
      if (!item || typeof item.initiatorPeerId !== "string" || typeof item.deviceName !== "string" || !Array.isArray(item.requestEnvelope) || !item.requestEnvelope.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return [];
      try {
        return [{
          ...item,
          nameRevision: BigInt(item.nameRevision),
          expiresAtUnixMs: BigInt(item.expiresAtUnixMs),
          requestEnvelope: Uint8Array.from(item.requestEnvelope),
        }];
      } catch {
        return [];
      }
    });
  };
  const write = async (requests: PendingTrustRequest[]) => options.storage.set<SerializedPendingTrustRequest[]>(options.key, requests.map((request) => ({
    ...request,
    nameRevision: request.nameRevision.toString(),
    expiresAtUnixMs: request.expiresAtUnixMs.toString(),
    requestEnvelope: [...request.requestEnvelope],
  })));
  return {
    list: read,
    async save(request) {
      await serializeMutation(async () => {
        const requests = await read();
        const index = requests.findIndex((entry) => entry.initiatorPeerId === request.initiatorPeerId);
        if (index === -1) requests.push(request); else requests[index] = request;
        await write(requests);
      });
    },
    async remove(initiatorPeerId) {
      await serializeMutation(async () => write((await read()).filter((request) => request.initiatorPeerId !== initiatorPeerId)));
    },
  };
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
  let started = false;

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
    list: () => options.store.list(),
    async start(): Promise<void> {
      if (started) return;
      started = true;
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
