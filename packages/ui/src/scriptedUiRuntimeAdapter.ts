import type { PairingSubmissionResult } from "../../core/pairing/results";
import type { ClipboardAppProps } from "./ClipboardApp";
import { createUiRuntimeStore } from "./runtimeAdapter";

/** Deterministic effect runner for mounted UI tests and the local scenario page. */
export function createScriptedUiRuntimeAdapter(initial: ClipboardAppProps) {
  let effects: readonly string[] = [];
  const pending: Array<{
    text: string;
    resolve(result: PairingSubmissionResult): void;
  }> = [];
  const effectListeners = new Set<() => void>();
  const updateEffects = (next: string[]) => {
    effects = next;
    effectListeners.forEach((listener) => listener());
  };
  const store = createUiRuntimeStore({
    ...initial,
    onPairText: async (text) => {
      updateEffects([...effects, text]);
      return await new Promise<PairingSubmissionResult>((resolve) => {
        pending.push({ text, resolve });
      });
    },
  });
  return {
    ...store,
    subscribeEffects(listener: () => void) {
      effectListeners.add(listener);
      return () => effectListeners.delete(listener);
    },
    getEffects: () => effects,
    completeNext(result: PairingSubmissionResult) {
      pending.shift()?.resolve(result);
    },
    clearEffects() {
      pending
        .splice(0)
        .forEach(({ resolve }) =>
          resolve({ ok: false, error: "outcome_unconfirmed" })
        );
      updateEffects([]);
    },
  };
}
