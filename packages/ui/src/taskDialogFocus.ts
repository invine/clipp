import { findSessionFocus, restoreSessionFocus } from "./sessionFocus";

/** One focus owner for both React tasks and host-created task surfaces. */
export function bindTaskDialogFocus(
  dialog: HTMLElement,
  options: {
    initialFocusKey?: string;
    originKey?: string;
    fallback?: HTMLElement | null;
    deferredReturnKey?: string;
    onDismiss?(): void;
  } = {}
) {
  const origin =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const initial = findSessionFocus(dialog, options.initialFocusKey, {
    visible: true,
    enabled: true,
  });
  (initial ?? options.fallback ?? dialog)?.focus();
  const backgrounds: HTMLElement[] = [];
  let branch: HTMLElement | null = dialog;
  while (branch?.parentElement) {
    for (const sibling of branch.parentElement.children)
      if (
        sibling instanceof HTMLElement &&
        sibling !== branch &&
        !sibling.hasAttribute("data-task-scenario-controls")
      )
        backgrounds.push(sibling);
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
  const inert = backgrounds.map((element) => element.inert);
  backgrounds.forEach((element) => {
    element.inert = true;
  });
  const recover = () => {
    const tasks = [
      ...document.querySelectorAll<HTMLElement>("[data-task-dialog]"),
    ].filter((element) => element.getClientRects().length > 0);
    if (tasks[tasks.length - 1] === dialog) restoreSessionFocus(document, null);
  };
  const observer = new MutationObserver(recover);
  observer.observe(dialog, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "inert", "class", "style"],
  });
  recover();
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && options.onDismiss) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) options.onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), details > summary:first-of-type, [tabindex]:not([tabindex="-1"])'
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        element.getClientRects().length > 0 &&
        !element.closest("[inert], [hidden]")
    );
    if (!controls.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = controls[0],
      last = controls[controls.length - 1];
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
  };
  dialog.addEventListener("keydown", keydown);
  return () => {
    observer.disconnect();
    dialog.removeEventListener("keydown", keydown);
    backgrounds.forEach((element, index) => {
      element.inert = inert[index];
    });
    const logicalOrigin = findSessionFocus(document, options.originKey, {
      visible: true,
      enabled: true,
    });
    if (logicalOrigin) logicalOrigin.focus();
    else if (
      (origin !== document.body || !options.deferredReturnKey) &&
      origin?.isConnected &&
      origin.getClientRects().length &&
      !origin.matches(":disabled") &&
      !origin.closest("[inert]")
    )
      origin.focus();
    else if (options.deferredReturnKey) restoreSessionFocus(document, null);
    else
      document
        .querySelector<HTMLElement>("[data-session-focus=workspace]")
        ?.focus();
    // A capture invoker remains disabled until its result reaches the mounted
    // consumer. Let that commit complete without racing React scheduling, and
    // relinquish the return intent as soon as another focus owner/user takes over.
    const returnTarget = findSessionFocus(document, options.deferredReturnKey, {
      visible: true,
      enabled: false,
    });
    if (returnTarget) {
      const restored = document.activeElement;
      const stop = () => {
        ready.disconnect();
        document.removeEventListener("focusin", changed);
      };
      const changed = () => {
        if (document.activeElement !== restored) stop();
      };
      const complete = () => {
        if (!returnTarget.isConnected || document.activeElement !== restored) {
          stop();
          return;
        }
        if (
          findSessionFocus(document, options.deferredReturnKey, {
            visible: true,
            enabled: true,
          }) === returnTarget
        ) {
          stop();
          returnTarget.focus();
        }
      };
      const ready = new MutationObserver(complete);
      ready.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["disabled", "hidden", "inert"],
      });
      document.addEventListener("focusin", changed);
      complete();
    }
  };
}
