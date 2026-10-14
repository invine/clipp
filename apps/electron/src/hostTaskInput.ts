import type { UiSession } from "../../../packages/ui/src/uiSession";
import { restoreSessionFocus } from "../../../packages/ui/src/sessionFocus";
export type ElectronTaskInputBridge = {
  onTaskActivation(listener: () => void): () => void;
  setTaskInputReady(owner: string, ready: boolean): Promise<void>;
};
/** Subscribe before readiness. Shared task presentation remains the only focus owner. */
export function bindElectronHostTaskInput(
  bridge: ElectronTaskInputBridge,
  session: UiSession,
  enter = () => restoreSessionFocus(document, session.getSnapshot().focusKey),
  owner: string = crypto.randomUUID()
) {
  let disposed = false;
  const unsubscribe = bridge.onTaskActivation(() => {
    if (!disposed) enter();
  });
  void bridge.setTaskInputReady(owner, true).catch(() => undefined);
  return () => {
    disposed = true;
    unsubscribe();
    void bridge.setTaskInputReady(owner, false).catch(() => undefined);
  };
}
