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

export type PairingIdentity = {
  peerId: string;
  deviceName: string;
  nameRevision: number;
};

export type PairingWaitingState = { targetPeerId: string; expiresAtUnixMs: bigint };
export type SignTrustRequest = (bytes: Uint8Array) => Promise<Uint8Array>;
export type VerifyTrustRequest = (bytes: Uint8Array, signature: Uint8Array, peerId: string) => Promise<boolean>;

export function createPairingSession(options: {
  identity(): Promise<PairingIdentity>;
  send(targetPeerId: string, frame: Uint8Array): Promise<void>;
  sign: SignTrustRequest;
  verify: VerifyTrustRequest;
  clock: RuntimeClock;
  validityWindowMs?: number;
  clockSkewAllowanceMs?: number;
  connectionPath?(peerId: string): PairingConnectionPath;
  onRejected?(diagnostic: PairingRejectionDiagnostic): void;
  onWaitingChanged?(state: PairingWaitingState[]): void | Promise<void>;
}) {
  const waiting = new Map<string, PairingWaitingState>();
  const timers = new Map<string, unknown>();
  const validityWindowMs = options.validityWindowMs ?? DEFAULT_TRUST_REQUEST_VALIDITY_MS;
  const clockSkewAllowanceMs = options.clockSkewAllowanceMs ?? DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS;
  const reportRejected = createPairingRejectionReporter({ now: () => options.clock.now(), emit: options.onRejected });
  const rejectResponse = (reason: PairingRejectionReason, authenticatedPeerId: string, frame: Uint8Array) => {
    reportRejected({ reason, authenticatedPeerId, frameSize: frame.byteLength, messageType: "response", connectionPath: options.connectionPath?.(authenticatedPeerId) ?? "unknown" });
    return null;
  };

  const publish = () => options.onWaitingChanged?.([...waiting.values()]);
  const clear = (targetPeerId: string) => {
    const timer = timers.get(targetPeerId);
    if (timer !== undefined) options.clock.clearTimeout(timer);
    timers.delete(targetPeerId);
    waiting.delete(targetPeerId);
    return publish();
  };

  return {
    async request(targetPeerId: string): Promise<Uint8Array> {
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
        await options.send(targetPeerId, frame);
        await publish();
        return frame;
      } catch (error) {
        await clear(targetPeerId);
        throw error;
      }
    },
    async receiveResponse(authenticatedPeerId: string, frame: Uint8Array): Promise<"accepted" | "rejected" | null> {
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
      await clear(authenticatedPeerId);
      return message.response.decision;
    },
    waiting: () => [...waiting.values()],
    stop: async () => { await Promise.all([...waiting.keys()].map(clear)); },
  };
}
