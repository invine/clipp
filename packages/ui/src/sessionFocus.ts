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
        (!eligibility.visible || element.getClientRects().length > 0) &&
        (!eligibility.enabled || !element.matches(":disabled"))
    ) ?? null
  );
}
