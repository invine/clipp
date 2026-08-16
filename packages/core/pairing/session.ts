import type { RuntimeClock } from "../runtime/contract";
import {
  DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS,
  DEFAULT_TRUST_REQUEST_VALIDITY_MS,
  TRUST_REQUEST_DOMAIN,
  decodePairingFrame,
  decodeTrustRequestEnvelope,
  decodeTrustRequestPayload,
  encodePairingFrame,
  encodeTrustRequestEnvelope,
  encodeTrustRequestPayload,
  concatPairingBytes,
  validateTrustRequestTime,
} from "./protocol";
import { createPairingRejectionReporter, type PairingConnectionPath, type PairingRejectionDiagnostic, type PairingRejectionReason } from "./diagnostics";
import type { DeviceMembershipAdmissions } from "./membership";

export type PairingIdentity = {
  peerId: string;
  deviceName: string;
  nameRevision: number;
};

export type PairingWaitingState = { targetPeerId: string; expiresAtUnixMs: bigint };
export type PairingErrorState = { targetPeerId: string; code: "membership_persistence_failed" };
export type SignTrustRequest = (bytes: Uint8Array) => Promise<Uint8Array>;
export type VerifyTrustRequest = (bytes: Uint8Array, signature: Uint8Array, peerId: string) => Promise<boolean>;

export type PairingSessionOptions = {
  identity(): Promise<PairingIdentity>;
  send(targetPeerId: string, frame: Uint8Array): Promise<void>;
  sign: SignTrustRequest;
  verify: VerifyTrustRequest;
  membership: DeviceMembershipAdmissions;
  clock: RuntimeClock;
  validityWindowMs?: number;
  clockSkewAllowanceMs?: number;
  connectionPath?(peerId: string): PairingConnectionPath;
  onRejected?(diagnostic: PairingRejectionDiagnostic): void;
  onWaitingChanged?(state: PairingWaitingState[]): void | Promise<void>;
  onErrorsChanged?(state: PairingErrorState[]): void | Promise<void>;
  retryInitialDelayMs?: number;
  retryMaximumDelayMs?: number;
};

export type PairingDecision = "accepted" | "rejected" | "retrying" | null;

export function createPairingSession(options: PairingSessionOptions) {
  const waiting = new Map<string, PairingWaitingState>();
  const timers = new Map<string, unknown>();
  const retryTimers = new Map<string, unknown>();
  const retryAttempts = new Map<string, number>();
  const retryTasks = new Set<Promise<void>>();
  const persistenceErrors = new Set<string>();
  let stopped = false;
  const validityWindowMs = options.validityWindowMs ?? DEFAULT_TRUST_REQUEST_VALIDITY_MS;
  const clockSkewAllowanceMs = options.clockSkewAllowanceMs ?? DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS;
  const reportRejected = createPairingRejectionReporter({ now: () => options.clock.now(), emit: options.onRejected });
  const rejectResponse = (reason: PairingRejectionReason, authenticatedPeerId: string, frame: Uint8Array) => {
    reportRejected({ reason, authenticatedPeerId, frameSize: frame.byteLength, messageType: "response", connectionPath: options.connectionPath?.(authenticatedPeerId) ?? "unknown" });
    return null;
  };

  const publish = () => options.onWaitingChanged?.([...waiting.values()]);
  const publishErrors = () => options.onErrorsChanged?.([...persistenceErrors].map((targetPeerId) => ({ targetPeerId, code: "membership_persistence_failed" as const })));
  const clear = (targetPeerId: string) => {
    const timer = timers.get(targetPeerId);
    if (timer !== undefined) options.clock.clearTimeout(timer);
    timers.delete(targetPeerId);
    waiting.delete(targetPeerId);
    return publish();
  };
  const clearRetry = async (targetPeerId: string) => {
    const timer = retryTimers.get(targetPeerId);
    if (timer !== undefined) options.clock.clearTimeout(timer);
    retryTimers.delete(targetPeerId);
    retryAttempts.delete(targetPeerId);
    if (persistenceErrors.delete(targetPeerId)) await publishErrors();
  };

  const sendFreshRequest = async (targetPeerId: string): Promise<Uint8Array> => {
    if (stopped) throw new Error("pairing_session_stopped");
    const identity = await options.identity();
    const issuedAtUnixMs = BigInt(options.clock.now());
    const signedPayload = encodeTrustRequestPayload({
      initiatorPeerId: identity.peerId,
      targetPeerId,
      deviceName: identity.deviceName,
      nameRevision: BigInt(identity.nameRevision),
      issuedAtUnixMs,
    });
    const signature = await options.sign(concatPairingBytes(TRUST_REQUEST_DOMAIN, signedPayload));
    const envelope = encodeTrustRequestEnvelope({ signedPayload, signature });
    const frame = encodePairingFrame({ kind: "request", envelope });
    const state = { targetPeerId, expiresAtUnixMs: issuedAtUnixMs + BigInt(validityWindowMs + clockSkewAllowanceMs) };
    const prior = timers.get(targetPeerId);
    if (prior !== undefined) options.clock.clearTimeout(prior);
    waiting.set(targetPeerId, state);
    timers.set(targetPeerId, options.clock.setTimeout(() => void clear(targetPeerId), validityWindowMs + clockSkewAllowanceMs));
    try {
      if (stopped) throw new Error("pairing_session_stopped");
      await options.send(targetPeerId, frame);
      await publish();
      return frame;
    } catch (error) {
      await clear(targetPeerId);
      throw error;
    }
  };

  const scheduleRetry = (targetPeerId: string) => {
    if (stopped || retryTimers.has(targetPeerId)) return;
    const attempt = retryAttempts.get(targetPeerId) ?? 0;
    const initialDelay = options.retryInitialDelayMs ?? 1_000;
    const maximumDelay = options.retryMaximumDelayMs ?? 30_000;
    const delay = Math.min(initialDelay * (2 ** Math.min(attempt, 30)), maximumDelay);
    retryAttempts.set(targetPeerId, attempt + 1);
    retryTimers.set(targetPeerId, options.clock.setTimeout(() => {
      retryTimers.delete(targetPeerId);
      const task = (async () => {
        if (stopped) return;
        try {
          const status = await options.membership.membershipStatus(targetPeerId);
          if (status !== "unknown") return clearRetry(targetPeerId);
          await sendFreshRequest(targetPeerId);
        } catch {
          // Persistence and reachability failures remain in this retry loop.
        }
        scheduleRetry(targetPeerId);
      })();
      retryTasks.add(task);
      void task.then(
        () => retryTasks.delete(task),
        () => retryTasks.delete(task)
      );
    }, delay));
  };

  return {
    async request(targetPeerId: string): Promise<Uint8Array> {
      return sendFreshRequest(targetPeerId);
    },
    async receiveResponse(authenticatedPeerId: string, frame: Uint8Array): Promise<PairingDecision> {
      const message = decodePairingFrame(frame);
      if (!message || message.kind !== "response") return rejectResponse("protobuf_decoding_failed", authenticatedPeerId, frame);
      const envelope = decodeTrustRequestEnvelope(message.response.requestEnvelope);
      const identity = await options.identity();
      if (!envelope) return rejectResponse("protobuf_decoding_failed", authenticatedPeerId, frame);
      if (!(await options.verify(envelope.signedPayload, envelope.signature, identity.peerId))) return rejectResponse("invalid_signature", authenticatedPeerId, frame);
      const request = decodeTrustRequestPayload(envelope.signedPayload);
      if (!request) return rejectResponse("protobuf_decoding_failed", authenticatedPeerId, frame);
      if (request.initiatorPeerId !== identity.peerId || request.targetPeerId !== authenticatedPeerId) return rejectResponse("authenticated_identity_mismatch", authenticatedPeerId, frame);
      const now = BigInt(options.clock.now());
      if (request.issuedAtUnixMs > now + BigInt(clockSkewAllowanceMs)) return rejectResponse("premature_issued_at", authenticatedPeerId, frame);
      if (!validateTrustRequestTime(request, Number(now), { validityWindowMs, clockSkewAllowanceMs })) return rejectResponse("expired_request", authenticatedPeerId, frame);
      const membershipStatus = await options.membership.membershipStatus(authenticatedPeerId);
      if (membershipStatus === "revoked") {
        await clearRetry(authenticatedPeerId);
        return rejectResponse("revoked_peer", authenticatedPeerId, frame);
      }
      await clear(authenticatedPeerId);
      if (message.response.decision === "accepted") {
        try {
          const admission = await options.membership.admit(authenticatedPeerId, {
            deviceName: message.response.responderDeviceName,
            nameRevision: message.response.responderNameRevision,
          });
          if (admission === "revoked") {
            await clearRetry(authenticatedPeerId);
            return rejectResponse("revoked_peer", authenticatedPeerId, frame);
          }
          await clearRetry(authenticatedPeerId);
        } catch {
          if (!persistenceErrors.has(authenticatedPeerId)) {
            persistenceErrors.add(authenticatedPeerId);
            await publishErrors();
          }
          scheduleRetry(authenticatedPeerId);
          return "retrying" as const;
        }
      }
      return message.response.decision;
    },
    waiting: () => [...waiting.values()],
    retrying: (targetPeerId: string) => persistenceErrors.has(targetPeerId),
    stop: async () => {
      stopped = true;
      await Promise.all([...waiting.keys()].map(clear));
      await Promise.all([...new Set([...retryTimers.keys(), ...persistenceErrors])].map(clearRetry));
      await Promise.allSettled([...retryTasks]);
    },
  };
}
