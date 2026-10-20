/** Locate a logical focus target among the caller's scoped descendants.
 * Callers retain responsibility for focusing it and choosing any fallback.
 */
export function findSessionFocus(
  scope: ParentNode | null,
  key: string | null | undefined,
  eligibility: { visible: boolean; enabled: boolean }
): HTMLElement | null {
  if (!scope || !key) return null;
  return (
    [...scope.querySelectorAll<HTMLElement>("[data-session-focus]")].find(
      (element) =>
        element.dataset.sessionFocus === key &&
        (!eligibility.visible ||
          (element.getClientRects().length > 0 &&
            !element.closest("[inert], [hidden]"))) &&
        (!eligibility.enabled || !element.matches(":disabled"))
    ) ?? null
  );
}

/** A bounded host-return observation, never session data or another focus owner. */
export type SessionFocusIntent = Readonly<{
  target: HTMLElement;
  task: HTMLElement | null;
}>;

export function captureSessionFocus(doc: Document): SessionFocusIntent | null {
  const tasks = [
    ...doc.querySelectorAll<HTMLElement>("[data-task-dialog]"),
  ].filter((element) => element.getClientRects().length > 0);
  const task = tasks[tasks.length - 1] ?? null;
  const target = doc.activeElement;
  if (
    !(target instanceof HTMLElement) ||
    target === doc.body ||
    !(task ?? doc).contains(target) ||
    !target.getClientRects().length ||
    target.matches(":disabled") ||
    target.closest("[inert], [hidden]")
  )
    return null;
  return { target, task };
}

/** Host activation reuses the current task's focus rules and the logical workspace
 * origin. Retained focus is preferred; a disappeared invoker gets a usable fallback. */
export function restoreSessionFocus(
  doc: Document,
  key: string | null,
  intent?: SessionFocusIntent | null
): void {
  const tasks = [
    ...doc.querySelectorAll<HTMLElement>("[data-task-dialog]"),
  ].filter((element) => element.getClientRects().length > 0);
  const task = tasks[tasks.length - 1] ?? null;
  const scope = task ?? doc;
  // An OS first-control return can focus Close before activation is delivered.
  // Prefer the observed pre-blur target only while the same task still owns it.
  if (
    intent &&
    intent.task === task &&
    scope.contains(intent.target) &&
    intent.target.getClientRects().length &&
    !intent.target.matches(":disabled") &&
    !intent.target.closest("[inert], [hidden]")
  ) {
    intent.target.focus();
    return;
  }
  const active = doc.activeElement;
  if (
    active instanceof HTMLElement &&
    scope.contains(active) &&
    active !== doc.body &&
    active.getClientRects().length &&
    !active.matches(":disabled") &&
    !active.closest("[inert]")
  ) {
    active.focus();
    return;
  }
  const logical = findSessionFocus(scope, task?.dataset.initialFocus ?? key, {
    visible: true,
    enabled: true,
  });
  const fallback =
    task?.querySelector<HTMLElement>("[data-task-return]") ??
    task ??
    doc.querySelector<HTMLElement>("[data-session-focus=workspace]");
  (logical ?? fallback)?.focus();
}
