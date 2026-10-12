import { RETENTION_MS } from "../history/store";
import type {
  LocalRetentionState,
  LocalRetentionResult,
} from "./localRetentionPreference";
import {
  normalizeThemePreference,
  isThemePreference,
  type ThemePreference,
} from "./themePreference";
import {
  DEFAULT_CLIP_SHARING_LIFETIME_MS,
  MAX_CLIP_SHARING_LIFETIME_MS,
} from "../models/Clip";
import { createAutoSyncPreference } from "./autoSyncPreference";

export type RuntimeSettings = {
  theme: ThemePreference;
  sharingLifetimeMs: number;
  localRetentionMs: number;
  retentionError?: string | null;
  autoSync: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
};

export type SettingsSnapshot = {
  sessionId: string;
  revision: number;
  state: RuntimeSettings;
};

export type SettingsWriteResult =
  | { status: "applied"; snapshot: SettingsSnapshot; warning?: string }
  | {
      status: "partial" | "rejected" | "unconfirmed";
      snapshot: SettingsSnapshot;
      error: string;
      failureOrigin?: "localRetention";
    };

export function isSharingLifetime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_CLIP_SHARING_LIFETIME_MS
  );
}

export function normalizeSharingLifetime(value: unknown): number {
  return isSharingLifetime(value) ? value : DEFAULT_CLIP_SHARING_LIFETIME_MS;
}

const logLevels = ["debug", "info", "warn", "error"] as const;

export function createSettingsHandler(options: {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
  retention?: {
    read(): Promise<LocalRetentionState>;
    // eslint-disable-next-line no-unused-vars
    set(value: number): Promise<LocalRetentionResult>;
  };
  applyTheme?(value: ThemePreference): void;
  // eslint-disable-next-line no-unused-vars
  applySharingLifetime?(value: number): void;
  applyAutoSync(value: boolean): void;
  applyLogLevel(value: RuntimeSettings["logLevel"]): void;
  publish(snapshot: SettingsSnapshot): Promise<void>;
  sessionId?: string;
}) {
  const sessionId = options.sessionId ?? crypto.randomUUID();
  const autoSyncPreference = createAutoSyncPreference({
    storage: options.storage,
  });
  let revision = 0;
  let state: RuntimeSettings | null = null;
  let queue = Promise.resolve();

  const snapshot = (): SettingsSnapshot => {
    if (!state) throw new Error("settings_not_loaded");
    return { sessionId, revision, state: { ...state } };
  };

  async function reconcile(): Promise<SettingsSnapshot> {
    const [autoSync, logLevel, rawTheme, rawLifetime, retention] =
      await Promise.all([
        autoSyncPreference.load(),
        options.storage.get<RuntimeSettings["logLevel"]>("logLevel"),
        options.storage.get<unknown>("theme"),
        options.storage.get<unknown>("sharingLifetimeMs"),
        options.retention?.read(),
      ]);
    const next: RuntimeSettings = {
      theme: normalizeThemePreference(rawTheme),
      localRetentionMs: retention?.value ?? RETENTION_MS,
      retentionError:
        retention?.persistenceError ?? retention?.cleanupError ?? null,
      sharingLifetimeMs: normalizeSharingLifetime(rawLifetime),
      autoSync,
      logLevel: logLevels.includes(logLevel as RuntimeSettings["logLevel"])
        ? logLevel!
        : "info",
    };
    options.applyTheme?.(next.theme);
    options.applySharingLifetime?.(next.sharingLifetimeMs);
    options.applyAutoSync(next.autoSync);
    options.applyLogLevel(next.logLevel);
    if (
      !state ||
      next.localRetentionMs !== state.localRetentionMs ||
      next.retentionError !== state.retentionError ||
      next.sharingLifetimeMs !== state.sharingLifetimeMs ||
      next.theme !== state.theme ||
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
        const patch = { ...raw } as Record<string, unknown>;
        const keys = Object.keys(patch);
        if (
          keys.length === 0 ||
          keys.some(
            (key) =>
              ![
                "autoSync",
                "logLevel",
                "theme",
                "sharingLifetimeMs",
                "localRetentionMs",
              ].includes(key)
          ) ||
          ("localRetentionMs" in patch &&
            (!options.retention ||
              typeof patch.localRetentionMs !== "number" ||
              !Number.isFinite(patch.localRetentionMs) ||
              patch.localRetentionMs < 0)) ||
          ("sharingLifetimeMs" in patch &&
            !isSharingLifetime(patch.sharingLifetimeMs)) ||
          ("theme" in patch && !isThemePreference(patch.theme)) ||
          ("autoSync" in patch && typeof patch.autoSync !== "boolean") ||
          ("logLevel" in patch &&
            !logLevels.includes(patch.logLevel as RuntimeSettings["logLevel"]))
        ) {
          return {
            status: "rejected",
            snapshot: current,
            error: "invalid_settings",
          };
        }
        const before = current.state;
        let partialRetention = false;
        let retentionFailure = false;
        try {
          for (const key of keys) {
            if (key === "localRetentionMs") {
              const result = await options.retention!.set(
                patch.localRetentionMs as number
              );
              partialRetention = result.status === "partial";
              retentionFailure = result.failureOrigin === "localRetention";
              if (result.status !== "applied")
                throw new Error(result.error ?? "retention_save_failed");
              patch.localRetentionMs = result.value;
            } else if (key === "autoSync")
              await autoSyncPreference.set(patch.autoSync as boolean);
            else await options.storage.set(key, patch[key]);
          }
        } catch (error) {
          try {
            current = await reconcile();
            await options.publish(current);
            const changed =
              partialRetention ||
              current.state.localRetentionMs !== before.localRetentionMs ||
              current.state.sharingLifetimeMs !== before.sharingLifetimeMs ||
              current.state.theme !== before.theme ||
              current.state.autoSync !== before.autoSync ||
              current.state.logLevel !== before.logLevel;
            return {
              status: changed ? "partial" : "rejected",
              snapshot: current,
              error: (error as Error).message,
              ...(retentionFailure
                ? { failureOrigin: "localRetention" as const }
                : {}),
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
        if (
          keys.some(
            (key) => current.state[key as keyof RuntimeSettings] !== patch[key]
          )
        ) {
          const changed = keys.some(
            (key) =>
              current.state[key as keyof RuntimeSettings] !==
              before[key as keyof RuntimeSettings]
          );
          try {
            await options.publish(current);
          } catch {
            /* read-back remains authoritative */
          }
          return {
            status: changed ? "partial" : "rejected",
            snapshot: current,
            error: "settings_not_applied",
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
