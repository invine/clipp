import type { PairingSubmissionResult } from "../../core/pairing/results";

/** Document-lived draft and immediate submission, shared by Paste and import. */
export function createPairingSubmission() {
  let state: {
    raw: string;
    pending: boolean;
    result: PairingSubmissionResult | null;
  } = { raw: "", pending: false, result: null };
  let version = 0;
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (next: typeof state) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    discard() {
      generation++;
      version++;
      update({ raw: "", pending: false, result: null });
    },
    change(raw: string) {
      version++;
      update({ ...state, raw, result: null });
    },
    async submit(action: (text: string) => Promise<PairingSubmissionResult>) {
      if (state.pending) return;
      const raw = state.raw;
      const submittedVersion = version;
      const submittedGeneration = generation;
      if (!raw.trim()) {
        update({ ...state, result: { ok: false, error: "invalid" } });
        return;
      }
      update({ ...state, pending: true, result: null });
      let result: PairingSubmissionResult;
      try {
        result = await action(raw.trim());
      } catch {
        result = { ok: false, error: "outcome_unconfirmed" };
      }
      if (!result || typeof result.ok !== "boolean")
        result = { ok: false, error: "outcome_unconfirmed" };
      if (submittedGeneration !== generation) return;
      update({
        raw: result.ok && version === submittedVersion ? "" : state.raw,
        pending: false,
        result,
      });
    },
  };
}
