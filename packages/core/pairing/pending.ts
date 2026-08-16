import type { RuntimeClock, RuntimeLifecycle, RuntimeNotifications } from "../runtime/contract";
import type { KVStorageBackend } from "../trust";
import {
  decodePairingFrame,
  decodeTrustRequestEnvelope,
  decodeTrustRequestPayload,
  validateTrustRequestTime,
} from "./protocol";
import { encodePairingFrame } from "./protocol";
import { createPairingRejectionReporter, type PairingConnectionPath, type PairingRejectionDiagnostic, type PairingRejectionReason } from "./diagnostics";

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
  sendResponse?(peerId: string, frame: Uint8Array): Promise<void>;
  responseIdentity?(): Promise<{ deviceName: string; nameRevision: bigint }>;
  connectionPath?(peerId: string): PairingConnectionPath;
  onRejected?(diagnostic: PairingRejectionDiagnostic): void;
  onChanged?(requests: PendingTrustRequest[]): void | Promise<void>;
  validityWindowMs?: number;
  clockSkewAllowanceMs?: number;
}) {
  const notificationId = (peerId: string) => `pairing-request-${peerId}`;
  const expiryTimers = new Map<string, unknown>();
  const receiveMutations = new Map<string, Promise<void>>();
  let started = false;
  const reportRejected = createPairingRejectionReporter({ now: () => options.clock.now(), emit: options.onRejected });
  const reject = (reason: PairingRejectionReason, authenticatedPeerId: string, frame: Uint8Array, messageType: "request" | "response" | "unknown" = "request") => {
    reportRejected({ reason, authenticatedPeerId, frameSize: frame.byteLength, messageType, connectionPath: options.connectionPath?.(authenticatedPeerId) ?? "unknown" });
    return false;
  };
  const publish = async () => options.onChanged?.(await options.store.list());

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
    await publish();
  };
  const scheduleExpiry = (request: PendingTrustRequest) => {
    clearTimer(request.initiatorPeerId);
    const delay = Number(request.expiresAtUnixMs - BigInt(options.clock.now())) + 1;
    expiryTimers.set(request.initiatorPeerId, options.clock.setTimeout(() => { void expire(request.initiatorPeerId).catch(() => undefined); }, Math.max(0, delay)));
  };
  const show = async (request: PendingTrustRequest) => {
    await options.notifications.show({
      id: notificationId(request.initiatorPeerId),
      title: "Pairing request",
      body: `${request.deviceName} (${request.initiatorPeerId}) wants to pair.`,
    });
  };
  const revalidateStoredRequest = async (request: PendingTrustRequest): Promise<PendingTrustRequest | null> => {
    const envelope = decodeTrustRequestEnvelope(request.requestEnvelope);
    if (!envelope || !(await options.verify(envelope.signedPayload, envelope.signature, request.initiatorPeerId))) return null;
    const payload = decodeTrustRequestPayload(envelope.signedPayload);
    if (!payload || payload.initiatorPeerId !== request.initiatorPeerId || payload.targetPeerId !== await options.localPeerId()) return null;
    if (!validateTrustRequestTime(payload, options.clock.now(), options)) return null;
    return {
      initiatorPeerId: payload.initiatorPeerId,
      deviceName: normalizeDeviceName(payload.deviceName) ?? shortenPeerId(payload.initiatorPeerId),
      nameRevision: payload.nameRevision,
      requestEnvelope: Uint8Array.from(request.requestEnvelope),
      expiresAtUnixMs: expirationFor(payload.issuedAtUnixMs),
    };
  };

  return {
    list: () => options.store.list(),
    async start(): Promise<void> {
      if (started) return;
      started = true;
      options.notifications.onSelect((id) => {
        if (id.startsWith("pairing-request-")) return options.lifecycle.openApprovalView();
      });
      for (const storedRequest of await options.store.list()) {
        const request = await revalidateStoredRequest(storedRequest);
        if (!request) {
          await expire(storedRequest.initiatorPeerId);
          continue;
        }
        await options.store.save(request);
        scheduleExpiry(request);
        await show(request);
      }
      await publish();
    },
    receive(authenticatedPeerId: string, frame: Uint8Array): Promise<boolean> {
      const previous = receiveMutations.get(authenticatedPeerId) ?? Promise.resolve();
      const result = previous.then(async () => {
        const parsed = decodePairingFrame(frame);
        if (!parsed || parsed.kind !== "request") return reject("protobuf_decoding_failed", authenticatedPeerId, frame, parsed?.kind ?? "unknown");
        const envelope = decodeTrustRequestEnvelope(parsed.envelope);
        if (!envelope) return reject("protobuf_decoding_failed", authenticatedPeerId, frame);
        // The authenticated stream peer supplies the verification key; never
        // parse attacker-controlled signed fields before their signature holds.
        if (!(await options.verify(envelope.signedPayload, envelope.signature, authenticatedPeerId))) return reject("invalid_signature", authenticatedPeerId, frame);
        const payload = decodeTrustRequestPayload(envelope.signedPayload);
        if (!payload) return reject("protobuf_decoding_failed", authenticatedPeerId, frame);
        if (payload.initiatorPeerId !== authenticatedPeerId) return reject("authenticated_identity_mismatch", authenticatedPeerId, frame);
        if (payload.targetPeerId !== await options.localPeerId()) return reject("wrong_target", authenticatedPeerId, frame);
        const now = BigInt(options.clock.now());
        const skew = BigInt(options.clockSkewAllowanceMs ?? 2 * 60 * 1000);
        if (payload.issuedAtUnixMs > now + skew) return reject("premature_issued_at", authenticatedPeerId, frame);
        if (!validateTrustRequestTime(payload, Number(now), options)) return reject("expired_request", authenticatedPeerId, frame);

        const request: PendingTrustRequest = {
          initiatorPeerId: payload.initiatorPeerId,
          deviceName: normalizeDeviceName(payload.deviceName) ?? shortenPeerId(payload.initiatorPeerId),
          nameRevision: payload.nameRevision,
          requestEnvelope: Uint8Array.from(parsed.envelope),
          expiresAtUnixMs: expirationFor(payload.issuedAtUnixMs),
        };
        const existing = (await options.store.list()).find((entry) => entry.initiatorPeerId === request.initiatorPeerId);
        if (existing) {
          const existingEnvelope = decodeTrustRequestEnvelope(existing.requestEnvelope);
          const existingPayload = existingEnvelope ? decodeTrustRequestPayload(existingEnvelope.signedPayload) : null;
          if (existingPayload && existingPayload.issuedAtUnixMs > payload.issuedAtUnixMs) {
            return true;
          }
        }
        await options.store.save(request);
        scheduleExpiry(request);
        if (!existing) await show(request);
        await publish();
        return true;
      });
      const settled = result.then(() => undefined, () => undefined);
      receiveMutations.set(authenticatedPeerId, settled);
      void settled.then(() => {
        if (receiveMutations.get(authenticatedPeerId) === settled) receiveMutations.delete(authenticatedPeerId);
      });
      return result;
    },
    async decide(initiatorPeerId: string, decision: "accepted" | "rejected"): Promise<boolean> {
      if (!options.sendResponse || !options.responseIdentity) return false;
      const request = (await options.store.list()).find((entry) => entry.initiatorPeerId === initiatorPeerId);
      if (!request) return false;
      if (!isCurrent(request)) {
        await expire(initiatorPeerId);
        return false;
      }
      const envelope = decodeTrustRequestEnvelope(request.requestEnvelope);
      if (!envelope || !(await options.verify(envelope.signedPayload, envelope.signature, initiatorPeerId))) {
        await expire(initiatorPeerId);
        return false;
      }
      const payload = decodeTrustRequestPayload(envelope.signedPayload);
      if (!payload || payload.initiatorPeerId !== initiatorPeerId || payload.targetPeerId !== await options.localPeerId() || !validateTrustRequestTime(payload, options.clock.now(), options)) {
        await expire(initiatorPeerId);
        return false;
      }
      const identity = await options.responseIdentity();
      try {
        await options.sendResponse(initiatorPeerId, encodePairingFrame({ kind: "response", response: { decision, requestEnvelope: request.requestEnvelope, responderDeviceName: identity.deviceName, responderNameRevision: identity.nameRevision } }));
      } catch {
        // A response has one best-effort delivery attempt and no retry job.
      } finally {
        await expire(initiatorPeerId);
      }
      return true;
    },
    expire,
  };
}

function normalizeDeviceName(value: string): string | undefined {
  const normalized = value.normalize("NFC").trim();
  return normalized && [...normalized].length <= 64 && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : undefined;
}
function shortenPeerId(peerId: string): string { return `${peerId.slice(0, 8)}…${peerId.slice(-6)}`; }
