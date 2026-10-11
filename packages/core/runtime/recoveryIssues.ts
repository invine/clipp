import type { RelayState } from "../network/managedRelays";

export type RecoveryIssue = {
  id: string;
  scope: "runtime" | "history" | "clipboard" | "pairing" | "relay" | "task";
  code: string;
  target?: string;
  recovering: boolean;
  diagnostics?: string;
  message?: string;
};
export type RecoveryFaults = {
  initializationError?: boolean;
  runtimeError?: string | null;
  identityRotationRecovery?: boolean;
  identityRotationNotice?: string | null;
  historyUnavailable?: boolean;
  historyRefreshError?: string | null;
  clipboardHistoryError?: string | null;
  historyPolicyError?: string | null;
  pairingErrors?: { targetPeerId: string; code: string }[];
  managedRelayStates?: RelayState[];
};
/** A projection of current owner faults, never a second fault store. */
export function composeRecoveryIssues(faults: RecoveryFaults): RecoveryIssue[] {
  const issues = new Map<string, RecoveryIssue>();
  const add = (
    scope: RecoveryIssue["scope"],
    target: string,
    code: string,
    recovering = false,
    diagnostics?: string
  ) => {
    const id = `${scope}:${target}:${code}`;
    issues.set(id, { id, scope, target, code, recovering, diagnostics });
  };
  if (faults.initializationError)
    add("runtime", "identity", "initialization_failed", true);
  else if (faults.runtimeError)
    add("runtime", "host", "unavailable", true, faults.runtimeError);
  if (faults.identityRotationRecovery)
    add("runtime", "identity", "rotation_recovery", true);
  else if (faults.identityRotationNotice)
    add("runtime", "identity", faults.identityRotationNotice);
  if (faults.historyUnavailable || faults.historyRefreshError)
    add(
      "history",
      "read",
      "unavailable",
      true,
      faults.historyRefreshError ?? undefined
    );
  if (faults.clipboardHistoryError)
    add(
      "clipboard",
      "capture",
      faults.clipboardHistoryError,
      faults.clipboardHistoryError === "pending_capture_failed"
    );
  if (faults.historyPolicyError)
    add("history", "cleanup", faults.historyPolicyError, true);
  for (const error of faults.pairingErrors ?? [])
    add("pairing", error.targetPeerId, error.code, true);
  for (const relay of faults.managedRelayStates ?? []) {
    if (
      ["login_needed", "degraded", "refused", "conflict"].includes(
        relay.status
      ) ||
      (relay.status === "retrying" && relay.reason)
    )
      add(
        "relay",
        relay.key,
        relay.status,
        true,
        relay.reason ?? relay.warning
      );
  }
  return [...issues.values()];
}
