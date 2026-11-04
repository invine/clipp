import React from "react";
import { TaskDialog } from "./TaskDialog";

export type ClearHistoryReviewProps = {
  totalCount: number;
  pinnedCount: number;
  filteredOutCount: number;
  pending: boolean;
  error: string | null;
  recoveryError?: string | null;
  historyReady?: boolean;
  refreshPending?: boolean;
  onRefresh?(): void;
  diagnostics?: React.ReactNode;
  onCancel(): void;
  onConfirm(): void;
};

export function ClearHistoryReview({
  totalCount,
  pinnedCount,
  filteredOutCount,
  pending,
  error,
  recoveryError = null,
  historyReady = true,
  refreshPending = false,
  onRefresh,
  diagnostics,
  onCancel,
  onConfirm,
}: ClearHistoryReviewProps) {
  return (
    <TaskDialog
      title="Clear all local history?"
      role="alertdialog"
      descriptionId="clear-history-description"
      pending={pending}
      cancelLabel={error ? "Close" : "Cancel"}
      onCancel={onCancel}
    >
      <div id="clear-history-description" className="task-dialog-description">
        {historyReady ? (
          <p>
            This deletes all {totalCount} local{" "}
            {totalCount === 1 ? "Clip" : "Clips"}, including {pinnedCount}{" "}
            pinned and {filteredOutCount} outside the current filters.
          </p>
        ) : (
          <p role="alert">
            History is unavailable or may have changed. Refresh History to
            review the current Clips before trying Clear again.
          </p>
        )}
        <p>
          This affects this device only; history on other devices is not
          deleted.
        </p>
        <p>
          Pending local captures awaiting storage retry are discarded after
          stored history is cleared.
        </p>
        <p>This cannot be undone.</p>
      </div>
      {error && (
        <p className="task-dialog-error" role="alert">
          {error}
        </p>
      )}
      {recoveryError && (
        <p className="task-dialog-error" role="alert">
          {recoveryError}
        </p>
      )}
      {pending && <p role="status">Clearing local history…</p>}
      {refreshPending && <p role="status">Refreshing History…</p>}
      <div className="task-dialog-actions">
        {!historyReady && onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={pending || refreshPending}
          >
            Refresh History
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          onClick={onConfirm}
          disabled={pending || refreshPending || !historyReady}
        >
          {error ? "Retry Clear" : "Clear all local history"}
        </button>
      </div>
      {diagnostics && (
        <details className="history-scenario-controls">
          <summary>History scenario controls</summary>
          {diagnostics}
        </details>
      )}
    </TaskDialog>
  );
}
