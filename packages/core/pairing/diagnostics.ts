export type PairingRejectionReason =
  | "invalid_framing"
  | "oversized_frame"
  | "protobuf_decoding_failed"
  | "invalid_signature"
  | "authenticated_identity_mismatch"
  | "wrong_target"
  | "premature_issued_at"
  | "expired_request"
  | "revoked_peer";

export type PairingConnectionPath = "direct" | "relayed" | "unknown";

export type PairingRejectionDiagnostic = {
  event: "pairing_message_rejected";
  reason: PairingRejectionReason;
  authenticatedPeerId?: string;
  direction: "incoming";
  messageType: "request" | "response" | "unknown";
  frameSize: number;
  connectionPath: PairingConnectionPath;
  observedAtUnixMs: number;
  suppressedCount: number;
};

export type PairingRejectionInput = Omit<PairingRejectionDiagnostic, "event" | "direction" | "observedAtUnixMs" | "suppressedCount">;

/** Privacy-safe, peer-and-reason keyed diagnostic rate limiter. */
export function createPairingRejectionReporter(options: {
  now?: () => number;
  intervalMs?: number;
  emit?(diagnostic: PairingRejectionDiagnostic): void;
}) {
  const buckets = new Map<string, { lastEmittedAt: number; suppressedCount: number }>();
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? 60_000;

  return (input: PairingRejectionInput): void => {
    const observedAtUnixMs = now();
    const key = `${input.authenticatedPeerId ?? "unauthenticated"}\0${input.reason}`;
    const bucket = buckets.get(key);
    if (bucket && observedAtUnixMs - bucket.lastEmittedAt < intervalMs) {
      bucket.suppressedCount += 1;
      return;
    }
    const suppressedCount = bucket?.suppressedCount ?? 0;
    buckets.set(key, { lastEmittedAt: observedAtUnixMs, suppressedCount: 0 });
    options.emit?.({
      event: "pairing_message_rejected",
      direction: "incoming",
      observedAtUnixMs,
      suppressedCount,
      ...input,
    });
  };
}
