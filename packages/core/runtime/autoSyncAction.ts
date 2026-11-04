import type {
  SettingsSnapshot,
  SettingsWriteResult,
} from "./settingsAuthority";

export type AutoSyncActionResult = {
  status: "applied" | "partial" | "rejected" | "unconfirmed";
  autoSync: boolean;
  error?: string;
};

export type AutoSyncActionWrite =
  boolean | { autoSync: boolean; warning?: string };

/** Preference persistence and publication are separate effects. */
export async function performAutoSyncAction(
  enabled: boolean,
  operations: {
    set(enabled: boolean): Promise<AutoSyncActionWrite>;
    current(): boolean;
    recover?(): Promise<void>;
    reconcile(): Promise<void>;
  }
): Promise<AutoSyncActionResult> {
  if (typeof enabled !== "boolean")
    return {
      status: "rejected",
      autoSync: operations.current(),
      error: "invalid_auto_sync",
    };
  let applied = false;
  let error: unknown;
  try {
    const outcome = await operations.set(enabled);
    applied = true;
    if (typeof outcome !== "boolean" && outcome.warning)
      error = new Error(outcome.warning);
  } catch (cause) {
    error = cause;
    try {
      await operations.recover?.();
    } catch {
      /* keep the result unconfirmed */
    }
  }
  try {
    await operations.reconcile();
  } catch (cause) {
    error ??= cause;
  }
  return {
    status: error ? (applied ? "partial" : "unconfirmed") : "applied",
    autoSync: operations.current(),
    ...(error
      ? {
          error:
            error instanceof Error
              ? error.message
              : "auto_sync_outcome_unconfirmed",
        }
      : {}),
  };
}

/** Runs the dedicated toggle through the same serialized owner as settings writes. */
export function performAutoSyncSettingsAction(
  enabled: boolean,
  settings: {
    read(): Promise<SettingsSnapshot>;
    write(patch: { autoSync: boolean }): Promise<SettingsWriteResult>;
  },
  operations: {
    current(): boolean;
    reconcile(): Promise<void>;
  }
): Promise<AutoSyncActionResult> {
  return performAutoSyncAction(enabled, {
    set: async (value) => {
      const result = await settings.write({ autoSync: value });
      if (result.status !== "applied")
        throw new Error(result.error ?? "auto_sync_outcome_unconfirmed");
      const confirmed = result.snapshot?.state?.autoSync;
      if (confirmed !== value) throw new Error("auto_sync_outcome_unconfirmed");
      return { autoSync: confirmed, warning: result.warning };
    },
    recover: async () => {
      await settings.read();
    },
    current: operations.current,
    reconcile: operations.reconcile,
  });
}
