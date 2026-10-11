export type RuntimeUiRecoveryState = {
  loading: boolean;
  unavailable: boolean;
  initializationError: boolean;
};
export const initialRuntimeUiRecovery: RuntimeUiRecoveryState = {
  loading: true,
  unavailable: false,
  initializationError: false,
};
/** Document-lived runtime consumer. A live publication retires older reads/probes. */
export function createRuntimeUiRecovery<State>(options: {
  load(): Promise<State>;
  initializationError(): Promise<{ code: string } | null>;
  confirmed?(state: State): boolean;
  version?(state: State): { sessionId: string; revision: number } | undefined;
  onState(state: State): void;
  onRecovery(state: RuntimeUiRecoveryState): void;
}) {
  let generation = 0,
    cancelled = false,
    pending = false,
    confirmed = false;
  let currentVersion: { sessionId: string; revision: number } | undefined;
  const retired = new Set<string>();
  const ready = (state: State) => {
    const version = options.version?.(state);
    if (version) {
      if (
        retired.has(version.sessionId) ||
        (currentVersion?.sessionId === version.sessionId &&
          currentVersion.revision > version.revision)
      )
        return;
      if (currentVersion && currentVersion.sessionId !== version.sessionId)
        retired.add(currentVersion.sessionId);
      currentVersion = version;
    } else if (currentVersion) return;
    confirmed = options.confirmed?.(state) ?? true;
    options.onState(state);
    options.onRecovery({
      loading: false,
      unavailable: false,
      initializationError: false,
    });
  };
  return {
    async load(retry?: () => Promise<void> | void): Promise<boolean> {
      if (cancelled || pending) return false;
      pending = true;
      const expected = ++generation;
      try {
        if (retry) await retry();
        const state = await options.load();
        if (!cancelled && expected === generation) ready(state);
        return !cancelled && confirmed;
      } catch {
        let initializationError = false;
        try {
          initializationError =
            (await options.initializationError())?.code ===
            "identity_initialization_failed";
        } catch {
          /* runtime remains unavailable */
        }
        if (!cancelled && expected === generation)
          options.onRecovery({
            loading: false,
            unavailable: true,
            initializationError,
          });
        return !cancelled && expected !== generation && confirmed;
      } finally {
        pending = false;
      }
    },
    live(state: State) {
      if (cancelled) return;
      generation++;
      ready(state);
    },
    cancel() {
      cancelled = true;
      generation++;
    },
  };
}
