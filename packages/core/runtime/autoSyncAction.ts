export type AutoSyncActionResult = {
  status: "applied" | "partial" | "rejected" | "unconfirmed";
  autoSync: boolean;
  error?: string;
};
/** Preference persistence and publication are separate effects. */
export async function performAutoSyncAction(
  enabled: boolean,
  operations: {
    set(enabled: boolean): Promise<boolean>;
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
    await operations.set(enabled);
    applied = true;
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
