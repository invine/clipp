/** Arbitrates an initial History read against later authoritative push updates. */
export function createHistoryInitialLoadGate<State>(callbacks: {
  onState(state: State): void;
  onLoading(loading: boolean): void;
  onFailed(failed: boolean): void;
}): {
  resolved(state: State): void;
  rejected(): boolean;
  live(state: State): void;
  cancel(): void;
} {
  let cancelled = false;
  let receivedUpdate = false;
  return {
    resolved(state) {
      if (cancelled || receivedUpdate) return;
      callbacks.onState(state);
      callbacks.onLoading(false);
      callbacks.onFailed(false);
    },
    rejected() {
      if (cancelled || receivedUpdate) return false;
      callbacks.onLoading(false);
      callbacks.onFailed(true);
      return true;
    },
    live(state) {
      if (cancelled) return;
      receivedUpdate = true;
      callbacks.onState(state);
      callbacks.onLoading(false);
      callbacks.onFailed(false);
    },
    cancel() {
      cancelled = true;
    },
  };
}
