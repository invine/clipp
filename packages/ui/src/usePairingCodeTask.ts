import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPairingCodeTask } from "./pairingCodeTask";

export function usePairingCodeTask(
  context: string | null,
  owner?: ReturnType<typeof createPairingCodeTask>
) {
  const [task] = useState(() => owner ?? createPairingCodeTask());
  const state = useSyncExternalStore(
    task.subscribe,
    task.getState,
    task.getState
  );
  useLayoutEffect(() => {
    task.setContext(context);
  }, [task, context]);
  useLayoutEffect(
    () => () => {
      if (!owner) task.close();
    },
    [task, owner]
  );
  return { task, state };
}
