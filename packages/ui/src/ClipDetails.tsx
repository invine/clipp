import React from "react";
import { IconButton } from "./controls";
import type { Clip } from "./types";
import type { SessionContext } from "./uiSession";
export function ClipDetails({
  clip,
  sourceName,
  pinned,
  disabled,
  actions,
  onCopy,
  onPin,
  onDelete,
  onRetry,
  onDismiss,
  onHistory,
  onShareNow,
  shareNowAction,
}: {
  clip?: Clip;
  sourceName?: string;
  pinned: boolean;
  disabled: boolean;
  actions: SessionContext["historyActions"];
  onCopy(): void;
  onPin(): void;
  onDelete(): void;
  onRetry(id: string): void;
  onDismiss(id: string): void;
  onHistory(): void;
  onShareNow?(): void;
  shareNowAction?: SessionContext["historyActions"][string];
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
      <div className="clip-details-primary">
        <p className="clip-details-type">
          {clip.type === "url" ? "Link" : "Text Clip"}
        </p>
        <pre className="clip-details-content">{clip.content}</pre>
      </div>
      <div className="task-dialog-actions clip-details-actions">
        <button
          type="button"
          className="primary-button"
          aria-label="Copy Clip"
          disabled={
            disabled ||
            actions[`copy:${clip.id}`]?.pending ||
            actions[`copy:${clip.id}`]?.feedback?.requiresAcknowledgement
          }
          onClick={onCopy}
        >
          Copy Clip
        </button>
        {onShareNow && (
          <div className="send-control clip-details-share">
            <IconButton
              icon="send"
              label="Share current clipboard now"
              disabled={
                disabled ||
                shareNowAction?.pending ||
                shareNowAction?.feedback?.requiresAcknowledgement
              }
              onClick={onShareNow}
            />
            <span className="control-hint">
              Sends your current system clipboard. This Clip is not sent by this
              action.
            </span>
          </div>
        )}
        <button
          type="button"
          className="text-button"
          aria-label={pinned ? "Unpin Clip" : "Pin Clip"}
          aria-pressed={pinned}
          disabled={disabled || actions[`pin:${clip.id}`]?.pending}
          onClick={onPin}
        >
          {pinned ? "Unpin Clip" : "Pin Clip"}
        </button>
        <button
          type="button"
          className="clip-details-delete"
          aria-label="Delete Clip"
          disabled={disabled || actions[`delete:${clip.id}`]?.pending}
          onClick={onDelete}
        >
          Delete Clip
        </button>
      </div>
      <details className="clip-details-metadata">
        <summary>Clip information</summary>
        <dl>
          {sourceName && (
            <>
              <dt>Source</dt>
              <dd>{sourceName}</dd>
            </>
          )}
          <dt>Captured</dt>
          <dd>{new Date(clip.capturedAt).toLocaleString()}</dd>
          <dt>Source Peer ID</dt>
          <dd>{clip.originPeerId}</dd>
          <dt>Clip ID</dt>
          <dd>{clip.id}</dd>
        </dl>
      </details>
      {onShareNow && shareNowAction && (
        <div role="status">
          {shareNowAction.pending && <p>Sharing current clipboard…</p>}
          {shareNowAction.feedback && (
            <>
              <p>{shareNowAction.feedback.message}</p>
              <button
                type="button"
                disabled={
                  shareNowAction.pending ||
                  (disabled && shareNowAction.feedback.action === "retry")
                }
                onClick={() =>
                  shareNowAction.feedback?.action === "retry"
                    ? onRetry("send:current")
                    : onDismiss("send:current")
                }
              >
                {shareNowAction.feedback.action === "retry"
                  ? "Retry"
                  : "Dismiss"}
              </button>
            </>
          )}
        </div>
      )}
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
