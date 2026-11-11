import { debug } from "../logger.js";
import type { RelayRenewalDiagnostic } from "./managedRelays.js";

export type RelayAccessDiagnostic =
  | { phase: "cached"; expiresAt: number }
  | {
      phase: "credential_unavailable";
      state: "missing" | "refreshing" | "unreadable" | "erase_failed";
    }
  | { phase: "refresh_started" | "refresh_joined" | "refresh_succeeded" }
  | { phase: "refresh_failed"; reason: string };

const SAFE_REFRESH_REASONS = new Set([
  "aborted",
  "invalid_credentials",
  "invalid_relay_token_response",
  "invalid_token_response",
  "relay_login_needed",
  "relay_http_failed",
  "relay_token_response_missing_body",
  "relay_token_response_too_large",
  "relay_token_timeout",
  "relay_token_unavailable",
  "token_exchange_failed",
  "token_response_too_large",
]);

export function relayRefreshFailureReason(error: unknown): string {
  if (error instanceof SyntaxError) return "invalid_token_response";
  const code = error instanceof Error ? error.message : "";
  return SAFE_REFRESH_REASONS.has(code) ? code : "unexpected_failure";
}

export function logRelayAccess(event: RelayAccessDiagnostic, at = Date.now()) {
  debug("relay.access_token", { ...event, at });
}

export function logRelayRenewal(event: RelayRenewalDiagnostic) {
  debug("relay.session_renewal", event);
}
