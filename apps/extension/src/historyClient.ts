import type { Clip } from "../../../packages/core/models/Clip";

export type ExtensionHistorySnapshot = {
  sessionId: string;
  revision: number;
  clips: Clip[];
  pinnedIds: string[];
};

export type HistoryClientState = {
  snapshot: ExtensionHistorySnapshot | null;
  loading: boolean;
  refreshing: boolean;
  refreshError: string | null;
};

export function createHistoryClient(port: {
  send(message: { type: "getClipHistory" }): Promise<unknown>;
  subscribe(listener: (message: unknown) => void): () => void;
}) {
  let state: HistoryClientState = {
    snapshot: null,
    loading: true,
    refreshing: false,
    refreshError: null,
  };
  let listener: ((state: HistoryClientState) => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let requestId = 0;
  let acceptedVersion = 0;
  const retiredSessions = new Set<string>();

  const notify = () => listener?.({ ...state });
  const apply = (
    snapshot: ExtensionHistorySnapshot,
    versionAtRequest: number
  ): boolean => {
    if (
      typeof snapshot?.sessionId !== "string" ||
      typeof snapshot.revision !== "number" ||
      !Array.isArray(snapshot.clips) ||
      !Array.isArray(snapshot.pinnedIds)
    )
      return false;
    const previous = state.snapshot;
    if (retiredSessions.has(snapshot.sessionId)) return false;
    if (
      previous &&
      previous.sessionId !== snapshot.sessionId &&
      acceptedVersion !== versionAtRequest
    )
      return false;
    if (
      previous?.sessionId === snapshot.sessionId &&
      previous.revision > snapshot.revision
    )
      return false;
    if (previous && previous.sessionId !== snapshot.sessionId)
      retiredSessions.add(previous.sessionId);
    state = { ...state, snapshot, loading: false, refreshError: null };
    acceptedVersion += 1;
    notify();
    return true;
  };

  async function refresh(): Promise<boolean> {
    const currentRequest = ++requestId;
    const versionAtRequest = acceptedVersion;
    state = {
      ...state,
      loading: state.snapshot === null,
      refreshing: true,
      refreshError: null,
    };
    notify();
    try {
      const reply = (await port.send({ type: "getClipHistory" })) as
        | { ok?: boolean; snapshot?: ExtensionHistorySnapshot; error?: string }
        | undefined;
      if (currentRequest !== requestId) return false;
      if (!reply?.ok || !reply.snapshot)
        throw new Error(reply?.error ?? "history_unavailable");
      return apply(reply.snapshot, versionAtRequest);
    } catch (error) {
      if (currentRequest !== requestId) return false;
      state = {
        ...state,
        loading: false,
        refreshError: (error as Error).message,
      };
      notify();
      return false;
    } finally {
      if (currentRequest === requestId) {
        state = { ...state, refreshing: false };
        notify();
      }
    }
  }

  return {
    getState: () => state,
    start: async (onChange?: (next: HistoryClientState) => void) => {
      listener = onChange;
      unsubscribe = port.subscribe((message) => {
        const event = message as {
          type?: string;
          sessionId?: string;
          revision?: number;
        };
        if (
          event?.type !== "historyChanged" ||
          typeof event.sessionId !== "string"
        )
          return;
        if (retiredSessions.has(event.sessionId)) return;
        const snapshot = state.snapshot;
        if (
          !snapshot ||
          snapshot.sessionId !== event.sessionId ||
          (typeof event.revision === "number" &&
            event.revision > snapshot.revision)
        )
          void refresh();
      });
      await refresh();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
      listener = undefined;
    },
    refresh,
  };
}
