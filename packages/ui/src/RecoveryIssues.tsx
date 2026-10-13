import React from "react";
import type { RecoveryIssue } from "../../core/runtime/recoveryIssues";
import type { UiSession } from "./uiSession";
import { TaskDialog } from "./TaskDialog";
import { identityRotationNoticeMessage } from "./identityRotationNotice";

export function recoveryIssueMessage(issue: RecoveryIssue): string {
  if (issue.message) return issue.message;
  if (issue.code === "action_failed")
    return issue.diagnostics ?? "The action could not be confirmed.";
  if (issue.scope === "pairing")
    return `Pairing storage error for ${issue.target}; retrying automatically.`;
  if (issue.scope === "relay")
    return `Relay ${issue.target} needs attention (${issue.code.replace(/_/g, " ")}). Open relay settings to check its current state.`;
  const messages: Record<string, string> = {
    initialization_failed:
      "Device identity could not be initialized. Clipboard capture and networking are paused.",
    unavailable:
      issue.scope === "history"
        ? "History is unavailable or could not refresh. Existing Clips remain available when already loaded."
        : "The runtime could not be reached. Identity actions remain unavailable until the runtime recovers.",
    rotation_recovery:
      "Identity rotation is recovering. Local capture remains available; networking will retry automatically.",
    revoked: identityRotationNoticeMessage("revoked"),
    "identity-loss": identityRotationNoticeMessage("identity-loss"),
    clip_too_large:
      "A clipboard value was too large to save in Clipboard History.",
    pending_capture_too_large:
      "A pending clipboard item was too large to keep for a later storage retry.",
    pending_capture_dropped:
      "Clipboard History storage is unavailable. One or more pending Clips could not be saved.",
    pending_capture_failed:
      "Clipboard History storage is unavailable. Clipp will retry pending Clips automatically.",
    history_cleanup_failed:
      "Clipboard History cleanup could not finish. Existing Clips remain available.",
  };
  return messages[issue.code] ?? issue.code;
}
export function RecoveryIssues({
  issues,
  session,
  retry,
  dismiss,
  route,
  routeLabel,
  title,
  details,
}: {
  title?: string;
  details?: React.ReactNode;
  issues: RecoveryIssue[];
  session: UiSession;
  retry(
    issue: RecoveryIssue
  ): (() => Promise<boolean | void> | boolean | void) | undefined;
  dismiss(issue: RecoveryIssue): (() => void | Promise<void>) | undefined;
  route(issue: RecoveryIssue): void;
  routeLabel?(issue: RecoveryIssue): string | undefined;
}) {
  const attempts = session.getSnapshot().recoveryAttempts;
  return (
    <TaskDialog
      title={title ?? "Issues and recovery"}
      pending={false}
      cancelLabel="Close"
      onCancel={() => session.close()}
      onDismiss={() => session.close()}
      originKey={session.getSnapshot().tasks.at(-1)?.origin ?? "issues-summary"}
      className="recovery-task"
    >
      {details}
      {issues.length === 0 && <p>No issues need attention.</p>}
      {issues.map((issue) => (
        <section
          key={issue.id}
          data-issue-id={issue.id}
          className="recovery-issue"
        >
          <p>{recoveryIssueMessage(issue)}</p>
          {attempts[issue.id]?.error && (
            <p role="status">
              Retry could not be confirmed. Check the current issue and try
              again.
            </p>
          )}
          {issue.diagnostics && (
            <details>
              <summary>Technical details</summary>
              <pre>{issue.diagnostics}</pre>
            </details>
          )}
          {retry(issue) && (
            <button
              type="button"
              disabled={attempts[issue.id]?.pending}
              onClick={() =>
                void session.retryRecovery(issue.id, retry(issue)!)
              }
            >
              {attempts[issue.id]?.pending ? "Retrying…" : "Retry"}
            </button>
          )}
          {(issue.scope === "pairing" ||
            issue.scope === "relay" ||
            issue.scope === "history" ||
            issue.scope === "task") && (
            <button type="button" onClick={() => route(issue)}>
              {routeLabel?.(issue) ?? (
                <>
                  {" "}
                  Open{" "}
                  {issue.scope === "task"
                    ? ({
                        "device-name": "Device Name",
                        alias: "alias editor",
                        pairing: "Pairing",
                        relay: "relay settings",
                        "relay-edit": "relay settings",
                        "relay-action": "relay settings",
                        "auto-sync": "Auto Sync",
                        settings: "Settings",
                        continuity: "background settings",
                      }[issue.code] ?? "task")
                    : issue.scope === "pairing"
                      ? "Requests"
                      : issue.scope === "relay"
                        ? "relay settings"
                        : "History"}
                </>
              )}
            </button>
          )}
          {!issue.recovering && dismiss(issue) && (
            <button type="button" onClick={() => void dismiss(issue)!()}>
              Dismiss
            </button>
          )}
        </section>
      ))}
    </TaskDialog>
  );
}
