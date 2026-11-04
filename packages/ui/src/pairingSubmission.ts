import type { PairingSubmissionResult } from "../../core/pairing/results";

export type PairingSubmissionSnapshot = {
  raw: string;
  pending: boolean;
  result: PairingSubmissionResult | null;
};

type PairingSubmissionState = PairingSubmissionSnapshot & {
  draftVersion: number;
  generation: number;
};

type PairingSubmissionEvent =
  | { type: "change"; raw: string }
  | { type: "discard" }
  | { type: "empty" }
  | { type: "started" }
  | {
      type: "finished";
      generation: number;
      draftVersion: number;
      result: PairingSubmissionResult;
    };

const initialState: PairingSubmissionState = {
  raw: "",
  pending: false,
  result: null,
  draftVersion: 0,
  generation: 0,
};

/** Pure Pairing submission transitions; runtime work is performed by the task. */
function reducePairingSubmission(
  state: PairingSubmissionState,
  event: PairingSubmissionEvent
): PairingSubmissionState {
  switch (event.type) {
    case "change":
      return {
        ...state,
        raw: event.raw,
        draftVersion: state.draftVersion + 1,
        result: null,
      };
    case "discard":
      return {
        ...initialState,
        draftVersion: state.draftVersion + 1,
        generation: state.generation + 1,
      };
    case "empty":
      return {
        ...state,
        result: { ok: false, error: "invalid" },
      };
    case "started":
      return { ...state, pending: true, result: null };
    case "finished":
      if (event.generation !== state.generation) return state;
      return {
        ...state,
        raw:
          event.result.ok && event.draftVersion === state.draftVersion
            ? ""
            : state.raw,
        pending: false,
        result: event.result,
      };
  }
}

/** Document-lived draft and immediate submission, shared by Paste and import. */
export function createPairingSubmission() {
  let state = initialState;
  let snapshot: PairingSubmissionSnapshot = {
    raw: state.raw,
    pending: state.pending,
    result: state.result,
  };
  const listeners = new Set<() => void>();
  const dispatch = (event: PairingSubmissionEvent) => {
    const next = reducePairingSubmission(state, event);
    if (next === state) return;
    state = next;
    snapshot = { raw: state.raw, pending: state.pending, result: state.result };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    discard() {
      dispatch({ type: "discard" });
    },
    change(raw: string) {
      dispatch({ type: "change", raw });
    },
    async submit(action: (text: string) => Promise<PairingSubmissionResult>) {
      if (state.pending) return;
      const raw = state.raw;
      const submittedVersion = state.draftVersion;
      const submittedGeneration = state.generation;
      if (!raw.trim()) {
        dispatch({ type: "empty" });
        return;
      }
      dispatch({ type: "started" });
      let result: PairingSubmissionResult;
      try {
        result = await action(raw.trim());
      } catch {
        result = { ok: false, error: "outcome_unconfirmed" };
      }
      if (!result || typeof result.ok !== "boolean")
        result = { ok: false, error: "outcome_unconfirmed" };
      dispatch({
        type: "finished",
        generation: submittedGeneration,
        draftVersion: submittedVersion,
        result,
      });
    },
  };
}
