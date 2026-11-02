import { bindTaskDialogFocus } from "./taskDialogFocus";
import React, { useEffect, useId, useRef, useState } from "react";
import { hostContentSize, HOST_GEOMETRY_EVENT } from "./hostGeometry";
import { NARROW_CONTENT_WIDTH } from "./workspaceLayout";

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
  initialFocusKey?: string;
  returnLabel?: string;
  focusVersion?: number;
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
  initialFocusKey,
  returnLabel = "Close",
  focusVersion,
}: TaskDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      hostContentSize(window, document).width <= NARROW_CONTENT_WIDTH
  );
  useEffect(() => {
    const resize = () =>
      setNarrow(
        hostContentSize(window, document).width <= NARROW_CONTENT_WIDTH
      );
    window.addEventListener("resize", resize);
    window.addEventListener(HOST_GEOMETRY_EVENT, resize);
    resize();
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener(HOST_GEOMETRY_EVENT, resize);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    return bindTaskDialogFocus(dialog, {
      originKey,
      initialFocusKey,
      fallback: returnRef.current ?? cancelRef.current,
    });
  }, [originKey, initialFocusKey, focusVersion]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (onDismiss) onDismiss();
      else if (!pending) onCancel();
      return;
    }
  }

  return (
    <div
      className={`task-dialog-backdrop ${narrow && role === "dialog" ? "task-dialog-full" : ""}`}
      role="presentation"
    >
      <div
        className={`task-dialog ${className ?? ""}`}
        data-task-dialog=""
        data-initial-focus={initialFocusKey}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <header className="task-dialog-header">
          {onDismiss && (
            <button
              data-task-return=""
              ref={returnRef}
              type="button"
              onClick={onDismiss}
            >
              {returnLabel}
            </button>
          )}
          <h2 id={titleId}>{title}</h2>
        </header>
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
