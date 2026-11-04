import { useEffect, useMemo, useSyncExternalStore } from "react";

export type PreferenceRecoverySnapshot = {
  pending: boolean;
  error: string | null;
};

/** Owns one recovery attempt; settings snapshots and revisions stay with the runtime client. */
export function createPreferenceRecoveryBehavior() {
  let snapshot: PreferenceRecoverySnapshot = { pending: false, error: null };
  let active = true;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: PreferenceRecoverySnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async run(action: () => Promise<unknown>): Promise<boolean> {
      if (!active || snapshot.pending) return false;
      const current = ++generation;
      publish({ pending: true, error: null });
      try {
        await action();
        if (!active || current !== generation) return false;
        publish({ pending: false, error: null });
        return true;
      } catch (cause) {
        if (!active || current !== generation) return false;
        publish({
          pending: false,
          error:
            cause instanceof Error
              ? cause.message
              : "Preference recovery could not be confirmed.",
        });
        return false;
      }
    },
    start() {
      if (active) return;
      active = true;
      publish({ pending: false, error: null });
    },
    retire() {
      if (!active) return;
      active = false;
      generation += 1;
      listeners.clear();
    },
  };
}

export function usePreferenceRecoveryBehavior(owner: object) {
  const behavior = useMemo(() => createPreferenceRecoveryBehavior(), [owner]);
  useEffect(() => {
    behavior.start();
    return () => behavior.retire();
  }, [behavior]);
  const snapshot = useSyncExternalStore(
    behavior.subscribe,
    behavior.getSnapshot,
    behavior.getSnapshot
  );
  return { ...snapshot, run: behavior.run };
}
