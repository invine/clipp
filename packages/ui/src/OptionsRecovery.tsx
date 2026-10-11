import React, { useSyncExternalStore } from "react";
import {
  composeRecoveryIssues,
  type RecoveryFaults,
  type RecoveryIssue,
} from "../../core/runtime/recoveryIssues";
import type { PairingWaiting } from "./types";
import { useTaskRecoveryIssues } from "./useTaskRecoveryIssues";
import type { UiSession } from "./uiSession";
import { RecoveryIssues } from "./RecoveryIssues";
import { TaskDialog } from "./TaskDialog";

/** Recovery consumer used by the existing options wrapper before full-page cutover. */
export function OptionsRecovery({
  session,
  faults,
  waiting = [],
  preferenceError,
  onRetry,
  onOpenTask,
}: {
  session: UiSession;
  faults: RecoveryFaults;
  waiting?: PairingWaiting[];
  preferenceError?: string | null;
  onRetry(
    issue: RecoveryIssue
  ): (() => boolean | void | Promise<boolean | void>) | undefined;
  onOpenTask(issue: RecoveryIssue): void;
}) {
  const context = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const taskIssues = useTaskRecoveryIssues(
    session,
    preferenceError,
    "settings"
  );
  const issues = [...composeRecoveryIssues(faults), ...taskIssues];
  return (
    <>
      {issues.length > 0 && (
        <div role="status" className="app-notices">
          <button
            type="button"
            className="issue-summary"
            data-session-focus="issues-summary"
            onClick={() =>
              session.open({ kind: "issues", origin: "issues-summary" })
            }
          >
            {issues.length}{" "}
            {issues.length === 1 ? "issue needs" : "issues need"} attention
          </button>
        </div>
      )}
      {context.tasks.at(-1)?.kind === "issues" && (
        <RecoveryIssues
          issues={issues}
          session={session}
          retry={onRetry}
          dismiss={() => undefined}
          routeLabel={(issue) =>
            issue.scope === "pairing" ? "Inspect Pairing recovery" : undefined
          }
          route={(issue) => {
            if (issue.scope === "pairing")
              session.open({
                kind: "pairing-recovery",
                origin: "issues-summary",
              });
            else {
              session.close();
              onOpenTask(issue);
            }
          }}
        />
      )}
      {context.tasks.at(-1)?.kind === "pairing-recovery" && (
        <TaskDialog
          title="Pairing recovery"
          pending={false}
          cancelLabel="Back to Issues"
          onCancel={() => session.back()}
          onDismiss={() => session.back()}
          originKey="issues-summary"
        >
          <p>
            Clipp retries Pairing storage automatically. Closing this view does
            not stop recovery.
          </p>
          {issues
            .filter((issue) => issue.scope === "pairing")
            .map((error) => (
              <section
                className="recovery-issue"
                key={`${error.target}:${error.code}`}
              >
                <p>Retrying local membership storage automatically</p>
                <p>{error.target}</p>
                <details>
                  <summary>Technical details</summary>
                  <pre>{error.code}</pre>
                </details>
              </section>
            ))}
          {waiting.map((value) => (
            <p key={value.targetPeerId}>
              Waiting for approval from {value.targetPeerId}.
            </p>
          ))}
          {!issues.some((issue) => issue.scope === "pairing") &&
            !waiting.length && (
              <p>No active Pairing recovery or waiting request.</p>
            )}
        </TaskDialog>
      )}
    </>
  );
}
