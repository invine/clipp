import React, { useEffect, useId, useRef } from "react";

export type TaskDialogProps = {
  title: string;
  children: React.ReactNode;
  descriptionId?: string;
  pending: boolean;
  cancelLabel?: string;
  role?: "dialog" | "alertdialog";
  onCancel(): void;
  onDismiss?(): void;
  originKey?: string;
  className?: string;
};

export function TaskDialog({
  title,
  children,
  descriptionId,
  pending,
  cancelLabel = "Cancel",
  role = "dialog",
  onCancel,
  onDismiss,
  originKey,
  className,
}: TaskDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const origin =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
    return () => {
      const logicalOrigin = originKey
        ? [
            ...document.querySelectorAll<HTMLElement>("[data-session-focus]"),
          ].find(
            (element) =>
              element.dataset.sessionFocus === originKey &&
              element.getClientRects().length
          )
        : null;
      if (logicalOrigin) logicalOrigin.focus();
      else if (origin?.isConnected && origin.getClientRects().length)
        origin.focus();
      else
        document
          .querySelector<HTMLElement>("[data-session-focus=workspace]")
          ?.focus();
    };
  }, [originKey]);

  useEffect(() => {
    if (pending) dialogRef.current?.focus();
  }, [pending]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (onDismiss) onDismiss();
      else if (!pending) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    if (controls.length === 0) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="task-dialog-backdrop" role="presentation">
      <div
        className={`task-dialog ${className ?? ""}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-button"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
