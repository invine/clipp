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
type RuntimeUiRecoveryOptions<State> = {
  load(): Promise<State>;
  initializationError(): Promise<{ code: string } | null>;
  confirmed?(state: State): boolean;
  onState(state: State): void;
  onRecovery(state: RuntimeUiRecoveryState): void;
} & (
  | { version?: never; authority?: never }
  | {
      version(
        state: State
      ): { sessionId: string; revision: number } | undefined;
      /** Read the current owning session through this adapter's live connection. */
      authority(): Promise<string>;
    }
);

export function createRuntimeUiRecovery<State>(
  options: RuntimeUiRecoveryOptions<State>
) {
  let generation = 0,
    cancelled = false,
    pending = false,
    confirmed = false;
  let currentVersion: { sessionId: string; revision: number } | undefined;
  const retired = new Set<string>();
  let authoritySession: string | undefined;
  let authorityRequested = 0,
    authorityConfirmed = 0;
  const authorize = async (
    state: State,
    reconcile = false
  ): Promise<boolean> => {
    if (!options.version) return true;
    const version = options.version(state);
    if (!version) throw new Error("runtime_authority_unavailable");
    if (retired.has(version.sessionId)) return false;
    if (!reconcile && version.sessionId === authoritySession) return true;
    const request = ++authorityRequested;
    const authority = await options.authority();
    if (cancelled) return false;
    if (!authority) throw new Error("runtime_authority_unavailable");
    if (request > authorityConfirmed) {
      authorityConfirmed = request;
      authoritySession = authority;
    }
    return (
      authority === authoritySession && version.sessionId === authoritySession
    );
  };
  const ready = (state: State) => {
    const version = options.version?.(state);
    if (version) {
      if (
        version.sessionId !== authoritySession ||
        retired.has(version.sessionId) ||
        (currentVersion?.sessionId === version.sessionId &&
          currentVersion.revision > version.revision)
      )
        return false;
      if (currentVersion && currentVersion.sessionId !== version.sessionId)
        retired.add(currentVersion.sessionId);
      currentVersion = version;
    } else if (currentVersion) return false;
    confirmed = options.confirmed?.(state) ?? true;
    options.onState(state);
    options.onRecovery({
      loading: false,
      unavailable: false,
      initializationError: false,
    });
    return true;
  };
  return {
    async load(retry?: () => Promise<void> | void): Promise<boolean> {
      if (cancelled || pending) return false;
      pending = true;
      const expected = ++generation;
      try {
        if (retry) await retry();
        const state = await options.load();
        let applied = false;
        if (
          !cancelled &&
          expected === generation &&
          (await authorize(state, true)) &&
          expected === generation
        )
          applied = ready(state);
        return !cancelled && confirmed && (applied || expected !== generation);
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
    live(state: State): void | Promise<void> {
      if (cancelled) return;
      if (!options.version) {
        generation++;
        ready(state);
        return;
      }
      const expected = generation;
      return (async () => {
        try {
          if ((await authorize(state)) && !cancelled && ready(state))
            generation++;
        } catch {
          if (!cancelled && expected === generation)
            options.onRecovery({
              loading: false,
              unavailable: true,
              initializationError: false,
            });
        }
      })();
    },
    cancel() {
      cancelled = true;
      generation++;
    },
  };
}
