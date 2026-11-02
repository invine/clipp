import { useSyncExternalStore } from "react";
import type { RecoveryIssue } from "../../core/runtime/recoveryIssues";
import { nameSaveErrorMessage } from "./nameEditSession";
import { pairingSubmissionMessage } from "./pairingFeedback";
import type { UiSession } from "./uiSession";

/** Every retained draft owner publishes its errors, including suspended Save completion. */
export function useTaskRecoveryIssues(
  session: UiSession,
  preferenceError?: string | null,
  preferenceCode = "auto-sync"
): RecoveryIssue[] {
  const names = useSyncExternalStore(
    session.name.subscribe,
    session.name.getErrors,
    session.name.getErrors
  );
  const aliases = useSyncExternalStore(
    session.alias.subscribe,
    session.alias.getErrors,
    session.alias.getErrors
  );
  const relays = useSyncExternalStore(
    session.relay.subscribe,
    session.relay.getErrors,
    session.relay.getErrors
  );
  const pairing = useSyncExternalStore(
    session.pairing.subscribe,
    session.pairing.getSnapshot,
    session.pairing.getSnapshot
  );
  const context = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const issues: RecoveryIssue[] = [];
  const add = (
    target: string,
    code: string,
    message: string,
    diagnostics?: string
  ) =>
    issues.push({
      id: `task:${target}:${code}`,
      scope: "task",
      target,
      code,
      message,
      diagnostics,
      recovering: true,
    });
  for (const value of names)
    add(
      value.targetId,
      "device-name",
      nameSaveErrorMessage(value.error, false),
      value.error
    );
  for (const value of aliases)
    add(
      value.targetId,
      "alias",
      nameSaveErrorMessage(value.error, true),
      value.error
    );
  for (const value of relays)
    add(
      value.key,
      "relay-edit",
      "Relay Save could not be confirmed. Your edit is retained.",
      value.error
    );
  if (pairing.result && !pairing.result.ok)
    add(
      "input",
      "pairing",
      pairingSubmissionMessage(pairing.result),
      pairing.result.error
    );
  if (context.pairingImport.error)
    add("import", "pairing", context.pairingImport.error);
  for (const [key, action] of Object.entries(context.relayActions))
    if (action.result?.error)
      add(
        key,
        "relay-action",
        "A relay action could not be confirmed. Check its current state.",
        action.result.error
      );
  const preference = preferenceError || context.autoSync.feedback?.error;
  if (preference)
    add(
      "preference",
      preferenceCode,
      preferenceCode === "settings"
        ? "Settings need attention. Check the applied values before saving again."
        : "Auto Sync needs attention. Check its applied value before saving again.",
      preference
    );
  return issues;
}
