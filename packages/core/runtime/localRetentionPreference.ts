import {
  MAX_RETENTION_MS,
  RETENTION_MS,
  type ClipHistoryStore,
} from "../history/store";
import type { KVStorageBackend } from "../trust";

export type LocalRetentionState = {
  value: number;
  persistenceError: string | null;
  cleanupError: string | null;
};
export type LocalRetentionResult = LocalRetentionState & {
  status: "applied" | "partial" | "rejected";
  error?: string;
  failureOrigin?: "localRetention";
};
export function normalizeSavedRetention(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, MAX_RETENTION_MS)
    : RETENTION_MS;
}
/** Owns the full policy/cleanup/persistence operation; applied policy survives a later save failure. */
export function createLocalRetentionPreference(options: {
  storage: Pick<KVStorageBackend, "get" | "set">;
  history: Pick<ClipHistoryStore, "setRetention" | "pruneExpired">;
  // eslint-disable-next-line no-unused-vars
  publish(state: LocalRetentionState): Promise<void>;
}) {
  let state: LocalRetentionState = {
    value: RETENTION_MS,
    persistenceError: null,
    cleanupError: null,
  };
  let loaded = false;
  let pendingStartup: number | null = null;
  let queue = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.then(
      () => {},
      () => {}
    );
    return result;
  };
  const publish = async () => {
    await options.publish({ ...state });
  };
  async function apply(
    value: number,
    persist: boolean
  ): Promise<LocalRetentionResult> {
    try {
      state = {
        ...state,
        value: await options.history.setRetention(value),
        cleanupError: null,
      };
    } catch (error) {
      state = { ...state, cleanupError: (error as Error).message };
      await publish();
      return {
        ...state,
        status: "rejected",
        error: state.cleanupError!,
        failureOrigin: "localRetention",
      };
    }
    pendingStartup = null;
    if (persist) {
      try {
        await options.storage.set("localRetentionMs", state.value);
        state.persistenceError = null;
      } catch (error) {
        state.persistenceError = (error as Error).message;
      }
    }
    try {
      await publish();
    } catch (error) {
      return { ...state, status: "partial", error: (error as Error).message };
    }
    return {
      ...state,
      status: state.persistenceError ? "partial" : "applied",
      ...(state.persistenceError
        ? {
            error: state.persistenceError,
            failureOrigin: "localRetention" as const,
          }
        : {}),
    };
  }
  async function load(): Promise<LocalRetentionState> {
    if (!loaded) {
      const raw = await options.storage.get<unknown>("localRetentionMs");
      const value = normalizeSavedRetention(raw);
      pendingStartup = value;
      await apply(value, raw !== undefined && raw !== value);
      loaded = true;
    }
    return { ...state };
  }
  return {
    maintain: () =>
      enqueue(async () => {
        await load();
        if (state.cleanupError || state.persistenceError) {
          const result = await apply(
            pendingStartup ?? state.value,
            pendingStartup !== null || state.persistenceError !== null
          );
          if (result.status !== "applied")
            throw new Error(result.error ?? "history_cleanup_failed");
          return { recovered: true };
        }
        try {
          await options.history.pruneExpired();
        } catch (error) {
          state = { ...state, cleanupError: (error as Error).message };
          await publish();
          throw error;
        }
        return { recovered: false };
      }),
    load: () => enqueue(load),
    read: () => enqueue(load),
    set: (value: number) =>
      enqueue(async (): Promise<LocalRetentionResult> => {
        await load();
        if (!Number.isFinite(value) || value < 0)
          return {
            ...state,
            status: "rejected",
            error: "invalid_history_retention",
          };
        return apply(value, true);
      }),
    retry: () =>
      enqueue(async () => {
        await load();
        return apply(
          pendingStartup ?? state.value,
          pendingStartup !== null || state.persistenceError !== null
        );
      }),
  };
}
