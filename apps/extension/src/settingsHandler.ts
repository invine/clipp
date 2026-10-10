import { createAutoSyncPreference } from "../../../packages/core/runtime/autoSyncPreference";

export type ExtensionSettings = {
  autoSync: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
};

export type SettingsSnapshot = {
  sessionId: string;
  revision: number;
  state: ExtensionSettings;
};

export type SettingsWriteResult =
  | { status: "applied"; snapshot: SettingsSnapshot; warning?: string }
  | {
      status: "partial" | "rejected" | "unconfirmed";
      snapshot: SettingsSnapshot;
      error: string;
    };

const logLevels = ["debug", "info", "warn", "error"] as const;

export function createSettingsHandler(options: {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
  applyAutoSync(value: boolean): void;
  applyLogLevel(value: ExtensionSettings["logLevel"]): void;
  publish(snapshot: SettingsSnapshot): Promise<void>;
  sessionId?: string;
}) {
  const sessionId = options.sessionId ?? crypto.randomUUID();
  const autoSyncPreference = createAutoSyncPreference({
    storage: options.storage,
  });
  let revision = 0;
  let state: ExtensionSettings | null = null;
  let queue = Promise.resolve();

  const snapshot = (): SettingsSnapshot => {
    if (!state) throw new Error("settings_not_loaded");
    return { sessionId, revision, state: { ...state } };
  };

  async function reconcile(): Promise<SettingsSnapshot> {
    const [autoSync, logLevel] = await Promise.all([
      autoSyncPreference.load(),
      options.storage.get<ExtensionSettings["logLevel"]>("logLevel"),
    ]);
    const next: ExtensionSettings = {
      autoSync,
      logLevel: logLevels.includes(logLevel as ExtensionSettings["logLevel"])
        ? logLevel!
        : "info",
    };
    options.applyAutoSync(next.autoSync);
    options.applyLogLevel(next.logLevel);
    if (
      !state ||
      next.autoSync !== state.autoSync ||
      next.logLevel !== state.logLevel
    ) {
      revision += 1;
    }
    state = next;
    return snapshot();
  }

  const enqueue = <Result>(work: () => Promise<Result>): Promise<Result> => {
    const result = queue.then(work);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  return {
    read: () => enqueue(reconcile),
    write: (raw: unknown): Promise<SettingsWriteResult> =>
      enqueue(async () => {
        let current = await reconcile();
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return {
            status: "rejected",
            snapshot: current,
            error: "invalid_settings",
          };
        }
        const patch = raw as Record<string, unknown>;
        const keys = Object.keys(patch);
        if (
          keys.length === 0 ||
          keys.some((key) => !["autoSync", "logLevel"].includes(key)) ||
          ("autoSync" in patch && typeof patch.autoSync !== "boolean") ||
          ("logLevel" in patch &&
            !logLevels.includes(
              patch.logLevel as ExtensionSettings["logLevel"]
            ))
        ) {
          return {
            status: "rejected",
            snapshot: current,
            error: "invalid_settings",
          };
        }
        const before = current.state;
        try {
          for (const key of keys) {
            if (key === "autoSync")
              await autoSyncPreference.set(patch.autoSync as boolean);
            else await options.storage.set(key, patch[key]);
          }
        } catch (error) {
          try {
            current = await reconcile();
            await options.publish(current);
            const changed =
              current.state.autoSync !== before.autoSync ||
              current.state.logLevel !== before.logLevel;
            return {
              status: changed ? "partial" : "rejected",
              snapshot: current,
              error: (error as Error).message,
            };
          } catch {
            return {
              status: "unconfirmed",
              snapshot: current,
              error: (error as Error).message,
            };
          }
        }
        try {
          current = await reconcile();
        } catch (error) {
          return {
            status: "unconfirmed",
            snapshot: current,
            error: (error as Error).message,
          };
        }
        try {
          await options.publish(current);
          return { status: "applied", snapshot: current };
        } catch (error) {
          return {
            status: "applied",
            snapshot: current,
            warning: (error as Error).message,
          };
        }
      }),
  };
}
