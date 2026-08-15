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
  onWaitingChanged?(state: PairingWaitingState[]): void | Promise<void>;
}) {
  const waiting = new Map<string, PairingWaitingState>();
  const timers = new Map<string, unknown>();
  const validityWindowMs = options.validityWindowMs ?? DEFAULT_TRUST_REQUEST_VALIDITY_MS;
  const clockSkewAllowanceMs = options.clockSkewAllowanceMs ?? DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS;

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
      await options.send(targetPeerId, frame);

      const state = { targetPeerId, expiresAtUnixMs: issuedAtUnixMs + BigInt(validityWindowMs + clockSkewAllowanceMs) };
      const prior = timers.get(targetPeerId);
      if (prior !== undefined) options.clock.clearTimeout(prior);
      waiting.set(targetPeerId, state);
      timers.set(targetPeerId, options.clock.setTimeout(() => void clear(targetPeerId), validityWindowMs + clockSkewAllowanceMs));
      await publish();
      return frame;
    },
    async receiveResponse(authenticatedPeerId: string, frame: Uint8Array): Promise<"accepted" | "rejected" | null> {
      const message = decodePairingFrame(frame);
      if (!message || message.kind !== "response") return null;
      const envelope = decodeTrustRequestEnvelope(message.response.requestEnvelope);
      const identity = await options.identity();
      if (!envelope || !(await options.verify(concatPairingBytes(TRUST_REQUEST_DOMAIN, envelope.signedPayload), envelope.signature, identity.peerId))) return null;
      const request = decodeTrustRequestPayload(envelope.signedPayload);
      if (!request || request.initiatorPeerId !== identity.peerId || request.targetPeerId !== authenticatedPeerId || !validateTrustRequestTime(request, options.clock.now(), { validityWindowMs, clockSkewAllowanceMs })) return null;
      await clear(authenticatedPeerId);
      return message.response.decision;
    },
    waiting: () => [...waiting.values()],
    stop: async () => { await Promise.all([...waiting.keys()].map(clear)); },
  };
}
