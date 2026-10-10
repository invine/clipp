import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPairingCodeTask } from "./pairingCodeTask";

export function usePairingCodeTask(context: string | null) {
  const [task] = useState(createPairingCodeTask);
  const state = useSyncExternalStore(
    task.subscribe,
    task.getState,
    task.getState
  );
  useLayoutEffect(() => {
    task.setContext(context);
  }, [task, context]);
  useLayoutEffect(() => () => task.close(), [task]);
  return { task, state };
}
