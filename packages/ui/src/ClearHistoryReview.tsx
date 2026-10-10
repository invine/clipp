import React from "react";
import { TaskDialog } from "./TaskDialog";

export type ClearHistoryReviewProps = {
  totalCount: number;
  pinnedCount: number;
  filteredOutCount: number;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onConfirm(): void;
};

export function ClearHistoryReview({
  totalCount,
  pinnedCount,
  filteredOutCount,
  pending,
  error,
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
        <p>
          This deletes all {totalCount} local{" "}
          {totalCount === 1 ? "Clip" : "Clips"}, including {pinnedCount} pinned
          and {filteredOutCount} outside the current filters.
        </p>
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
      {pending && <p role="status">Clearing local history…</p>}
      <div className="task-dialog-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onConfirm}
          disabled={pending}
        >
          {error ? "Retry Clear" : "Clear all local history"}
        </button>
      </div>
    </TaskDialog>
  );
}
