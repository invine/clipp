import React from "react";
import type { Clip } from "./types";
import type { SessionContext } from "./uiSession";
export function ClipDetails({
  clip,
  pinned,
  disabled,
  actions,
  onCopy,
  onPin,
  onDelete,
  onRetry,
  onDismiss,
  onHistory,
}: {
  clip?: Clip;
  pinned: boolean;
  disabled: boolean;
  actions: SessionContext["historyActions"];
  onCopy(): void;
  onPin(): void;
  onDelete(): void;
  onRetry(id: string): void;
  onDismiss(id: string): void;
  onHistory(): void;
}) {
  if (!clip)
    return (
      <div>
        <p role="status">This Clip is no longer available.</p>
        <button type="button" onClick={onHistory}>
          Open History
        </button>
      </div>
    );
  return (
    <div className="clip-details">
      <dl>
        <dt>Source Peer ID</dt>
        <dd>{clip.originPeerId}</dd>
        <dt>Clip ID</dt>
        <dd>{clip.id}</dd>
        <dt>Captured</dt>
        <dd>{new Date(clip.capturedAt).toLocaleString()}</dd>
        <dt>Type</dt>
        <dd>{clip.type}</dd>
      </dl>
      <pre className="clip-details-content">{clip.content}</pre>
      <div className="task-dialog-actions">
        <button
          type="button"
          disabled={
            disabled ||
            actions[`copy:${clip.id}`]?.pending ||
            actions[`copy:${clip.id}`]?.feedback?.requiresAcknowledgement
          }
          onClick={onCopy}
        >
          Copy Clip
        </button>
        <button
          type="button"
          aria-pressed={pinned}
          disabled={disabled || actions[`pin:${clip.id}`]?.pending}
          onClick={onPin}
        >
          {pinned ? "Unpin Clip" : "Pin Clip"}
        </button>
        <button
          type="button"
          disabled={disabled || actions[`delete:${clip.id}`]?.pending}
          onClick={onDelete}
        >
          Delete Clip
        </button>
      </div>
      {Object.entries(actions)
        .filter(([id]) => id.endsWith(`:${clip.id}`))
        .map(([id, action]) => (
          <div key={id} role="status">
            {action.pending && <p>Applying Clip action…</p>}
            {action.feedback && (
              <>
                <p>{action.feedback.message}</p>
                <button
                  type="button"
                  disabled={
                    action.pending ||
                    (disabled && action.feedback.action === "retry")
                  }
                  onClick={() =>
                    action.feedback?.action === "retry"
                      ? onRetry(id)
                      : onDismiss(id)
                  }
                >
                  {action.feedback.action === "retry" ? "Retry" : "Dismiss"}
                </button>
              </>
            )}
          </div>
        ))}
    </div>
  );
}
