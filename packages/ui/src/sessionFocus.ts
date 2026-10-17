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

/** Host activation reuses the current task's focus rules and the logical workspace
 * origin. Retained focus is preferred; a disappeared invoker gets a usable fallback. */
export function restoreSessionFocus(doc: Document, key: string | null): void {
  const tasks = [
    ...doc.querySelectorAll<HTMLElement>("[data-task-dialog]"),
  ].filter((element) => element.getClientRects().length > 0);
  const task = tasks[tasks.length - 1];
  const scope = task ?? doc;
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
