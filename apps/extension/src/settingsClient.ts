import type {
  ExtensionSettings,
  SettingsSnapshot,
  SettingsWriteResult,
} from "./settingsHandler";

export type SettingsClientState = {
  snapshot: SettingsSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  refreshError: string | null;
  recoveryRequired: boolean;
  pending: boolean;
  feedback: {
    status: "applied" | "partial" | "rejected" | "unconfirmed";
    error?: string;
  } | null;
};

export function createSettingsClient(port: {
  send(message: {
    type: string;
    settings?: Partial<ExtensionSettings>;
  }): Promise<unknown>;
  subscribe(listener: (message: unknown) => void): () => void;
}) {
  let state: SettingsClientState = {
    snapshot: null,
    loading: true,
    refreshing: false,
    refreshError: null,
    recoveryRequired: false,
    pending: false,
    feedback: null,
  };
  let listener: ((state: SettingsClientState) => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let refreshId = 0;
  let acceptedVersion = 0;
  const retiredSessions = new Set<string>();

  const notify = () => listener?.({ ...state });
  const apply = (snapshot: SettingsSnapshot, allowSessionChange = false) => {
    if (
      !snapshot ||
      typeof snapshot.sessionId !== "string" ||
      typeof snapshot.revision !== "number"
    )
      return;
    const prior = state.snapshot;
    if (retiredSessions.has(snapshot.sessionId)) return;
    if (
      prior &&
      prior.sessionId !== snapshot.sessionId &&
      !allowSessionChange
    ) {
      void refresh();
      return;
    }
    if (
      prior?.sessionId === snapshot.sessionId &&
      prior.revision >= snapshot.revision
    )
      return;
    if (prior && prior.sessionId !== snapshot.sessionId)
      retiredSessions.add(prior.sessionId);
    state = { ...state, snapshot, loading: false, refreshError: null };
    acceptedVersion += 1;
    notify();
  };

  async function refresh(): Promise<void> {
    const requestId = ++refreshId;
    const versionAtRequest = acceptedVersion;
    state = {
      ...state,
      loading: state.snapshot === null,
      refreshing: true,
      refreshError: null,
    };
    notify();
    try {
      const response = (await port.send({ type: "getSettings" })) as
        | { ok?: boolean; snapshot?: SettingsSnapshot; error?: string }
        | undefined;
      if (requestId !== refreshId) return;
      if (!response?.ok || !response.snapshot)
        throw new Error(response?.error ?? "settings_unavailable");
      if (
        state.snapshot &&
        response.snapshot.sessionId !== state.snapshot.sessionId &&
        acceptedVersion !== versionAtRequest
      ) {
        state = { ...state, recoveryRequired: false };
        return;
      }
      apply(response.snapshot, true);
      if (
        state.snapshot &&
        state.snapshot.sessionId === response.snapshot.sessionId &&
        state.snapshot.revision >= response.snapshot.revision
      ) {
        state = { ...state, recoveryRequired: false };
      }
    } catch (error) {
      if (requestId !== refreshId) return;
      state = {
        ...state,
        loading: false,
        refreshError: (error as Error).message,
      };
      notify();
    } finally {
      if (requestId === refreshId) {
        state = { ...state, refreshing: false };
        notify();
      }
    }
  }

  return {
    getState: () => state,
    start: async (onChange?: (state: SettingsClientState) => void) => {
      listener = onChange;
      unsubscribe = port.subscribe((message) => {
        const event = message as { type?: string; snapshot?: SettingsSnapshot };
        if (event?.type === "settingsState" && event.snapshot)
          apply(event.snapshot);
      });
      await refresh();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
      listener = undefined;
    },
    refresh,
    save: async (patch: Partial<ExtensionSettings>) => {
      if (state.pending || state.recoveryRequired || !state.snapshot)
        return {
          status: "unconfirmed" as const,
          error: "settings_reconciliation_required",
        };
      state = { ...state, pending: true, feedback: null };
      notify();
      const reconcileUnconfirmed = async (error: string) => {
        state = {
          ...state,
          recoveryRequired: true,
          feedback: { status: "unconfirmed" as const, error },
        };
        notify();
        await refresh();
        state = { ...state, pending: false };
        notify();
      };
      try {
        const response = (await port.send({
          type: "setSettings",
          settings: patch,
        })) as SettingsWriteResult | undefined;
        if (!response?.status || !response.snapshot)
          throw new Error("settings_reply_missing");
        apply(response.snapshot);
        if (response.status === "unconfirmed") {
          await reconcileUnconfirmed(response.error);
          return response;
        }
        state = {
          ...state,
          pending: false,
          feedback: {
            status: response.status,
            error:
              response.status === "applied" ? response.warning : response.error,
          },
        };
        notify();
        return response;
      } catch (error) {
        await reconcileUnconfirmed((error as Error).message);
        return {
          status: "unconfirmed" as const,
          error: (error as Error).message,
        };
      }
    },
  };
}
