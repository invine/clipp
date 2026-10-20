import type { UiSession } from "../../../packages/ui/src/uiSession";
import {
  captureSessionFocus,
  restoreSessionFocus,
  type SessionFocusIntent,
} from "../../../packages/ui/src/sessionFocus";
export type ElectronTaskInputBridge = {
  onTaskActivation(listener: () => void): () => void;
  setTaskInputReady(owner: string, ready: boolean): Promise<void>;
};
/** Subscribe before readiness. Shared task presentation remains the only focus owner. */
export function bindElectronHostTaskInput(
  bridge: ElectronTaskInputBridge,
  session: UiSession,
  enter: (intent?: SessionFocusIntent | null) => void = (intent) =>
    restoreSessionFocus(document, session.getSnapshot().focusKey, intent),
  owner: string = crypto.randomUUID()
) {
  let disposed = false;
  const doc = typeof document === "undefined" ? null : document;
  const view = doc?.defaultView;
  let lastFocus = doc ? captureSessionFocus(doc) : null;
  let suspendedFocus: SessionFocusIntent | null = null;
  const rememberFocus = () => {
    if (doc) lastFocus = captureSessionFocus(doc);
  };
  const suspendFocus = () => {
    // Retain the actual field/button chosen before the host loses focus, not
    // the OS's first control selected while a warm return is being activated.
    suspendedFocus ??= (doc && captureSessionFocus(doc)) || lastFocus;
  };
  const userInput = (event: Event) => {
    // A delayed activation must not steal a newer intentional control or edit.
    if (event.isTrusted) suspendedFocus = null;
  };
  doc?.addEventListener("focusin", rememberFocus, true);
  doc?.addEventListener("keydown", userInput, true);
  doc?.addEventListener("pointerdown", userInput, true);
  view?.addEventListener("blur", suspendFocus);
  const unsubscribe = bridge.onTaskActivation(() => {
    if (disposed) return;
    const intent = suspendedFocus;
    suspendedFocus = null;
    enter(intent);
  });
  void bridge.setTaskInputReady(owner, true).catch(() => undefined);
  return () => {
    disposed = true;
    unsubscribe();
    doc?.removeEventListener("focusin", rememberFocus, true);
    doc?.removeEventListener("keydown", userInput, true);
    doc?.removeEventListener("pointerdown", userInput, true);
    view?.removeEventListener("blur", suspendFocus);
    lastFocus = null;
    suspendedFocus = null;
    void bridge.setTaskInputReady(owner, false).catch(() => undefined);
  };
}
