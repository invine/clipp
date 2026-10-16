import { findSessionFocus } from "./sessionFocus";
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
    const origin =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const initial = findSessionFocus(dialogRef.current, initialFocusKey, {
      visible: true,
      enabled: true,
    });
    (initial ?? returnRef.current ?? cancelRef.current)?.focus();
    const backgrounds: HTMLElement[] = [];
    let branch = dialogRef.current?.parentElement;
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children)
        if (sibling instanceof HTMLElement && sibling !== branch)
          backgrounds.push(sibling);
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const inert = backgrounds.map((element) => element.inert);
    backgrounds.forEach((element) => {
      element.inert = true;
    });
    return () => {
      backgrounds.forEach((element, index) => {
        element.inert = inert[index];
      });
      const logicalOrigin = findSessionFocus(document, originKey, {
        visible: true,
        enabled: true,
      });
      if (logicalOrigin) logicalOrigin.focus();
      else if (
        origin?.isConnected &&
        origin.getClientRects().length &&
        !origin.matches(":disabled") &&
        !origin.closest("[inert]")
      )
        origin.focus();
      else
        document
          .querySelector<HTMLElement>("[data-session-focus=workspace]")
          ?.focus();
    };
  }, [originKey, initialFocusKey, focusVersion]);

  useEffect(() => {
    if (
      pending &&
      (document.activeElement === document.body ||
        (document.activeElement instanceof HTMLButtonElement &&
          document.activeElement.disabled))
    )
      dialogRef.current?.focus();
  }, [pending]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (onDismiss) onDismiss();
      else if (!pending) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        element.getClientRects().length > 0 &&
        !element.closest("[inert], [hidden]")
    );
    if (controls.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !controls.includes(document.activeElement as HTMLElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !controls.includes(document.activeElement as HTMLElement))
    ) {
      event.preventDefault();
      first.focus();
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
