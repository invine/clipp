import type {
  RuntimeSettings,
  SettingsSnapshot,
  SettingsWriteResult,
} from "./settingsAuthority";

export type SettingsClientState = {
  snapshot: SettingsSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  refreshError: string | null;
  recoveryRequired: boolean;
  pending: boolean;
  pendingFields?: (keyof RuntimeSettings)[];
  feedback: {
    status: "applied" | "partial" | "rejected" | "unconfirmed";
    error?: string;
    fields?: (keyof RuntimeSettings)[];
  } | null;
};

export function createSettingsClient(port: {
  send(message: {
    type: string;
    settings?: Partial<RuntimeSettings>;
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
    pendingFields: undefined,
    feedback: null,
  };
  let listener: ((state: SettingsClientState) => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let refreshId = 0;
  let acceptedVersion = 0;
  const retiredSessions = new Set<string>();
  let retentionFailure: SettingsSnapshot | null = null;

  const reconcileRetentionFeedback = () => {
    const current = state.snapshot;
    if (
      retentionFailure &&
      current &&
      current.sessionId === retentionFailure.sessionId &&
      current.revision > retentionFailure.revision &&
      current.state.retentionError === null
    ) {
      state = { ...state, feedback: null };
      retentionFailure = null;
    }
  };

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
    reconcileRetentionFeedback();
    acceptedVersion += 1;
    notify();
  };

  function ensureSubscription() {
    if (unsubscribe) return;
    unsubscribe = port.subscribe((message) => {
      const event = message as { type?: string; snapshot?: SettingsSnapshot };
      if (event?.type === "settingsState" && event.snapshot)
        apply(event.snapshot);
    });
  }

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
      ensureSubscription();
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
      await refresh();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
      listener = undefined;
    },
    refresh,
    save: async (patch: Partial<RuntimeSettings>) => {
      if (state.pending || state.recoveryRequired || !state.snapshot)
        return {
          status: "unconfirmed" as const,
          error: "settings_reconciliation_required",
        };
      retentionFailure = null;
      state = {
        ...state,
        pending: true,
        pendingFields: Object.keys(patch) as (keyof RuntimeSettings)[],
        feedback: null,
      };
      notify();
      const reconcileUnconfirmed = async (error: string) => {
        state = {
          ...state,
          recoveryRequired: true,
          feedback: {
            status: "unconfirmed" as const,
            error,
            fields: Object.keys(patch) as (keyof RuntimeSettings)[],
          },
        };
        notify();
        await refresh();
        state = { ...state, pending: false, pendingFields: undefined };
        notify();
      };
      try {
        const response = (await port.send({
          type: "setSettings",
          settings: patch,
        })) as SettingsWriteResult | undefined;
        if (!response?.status || !response.snapshot)
          throw new Error("settings_reply_missing");
        if (response.snapshot.sessionId !== state.snapshot?.sessionId) {
          await reconcileUnconfirmed("settings_authority_changed");
          return {
            status: "unconfirmed" as const,
            error: "settings_authority_changed",
          };
        }
        apply(response.snapshot);
        if (response.status === "unconfirmed") {
          await reconcileUnconfirmed(response.error);
          return response;
        }
        state = {
          ...state,
          pending: false,
          pendingFields: undefined,
          feedback: {
            status: response.status,
            fields: Object.keys(patch) as (keyof RuntimeSettings)[],
            error:
              response.status === "applied" ? response.warning : response.error,
          },
        };
        if (
          (response.status === "partial" || response.status === "rejected") &&
          Object.keys(patch).length === 1 &&
          "localRetentionMs" in patch &&
          response.error &&
          response.error === response.snapshot.state.retentionError
        )
          retentionFailure = response.snapshot;
        reconcileRetentionFeedback();
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
