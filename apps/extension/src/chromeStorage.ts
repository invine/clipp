import type { KVStorageBackend } from "../../../packages/core/trust";

export type ChromeStorageArea = {
  get(
    keys: string[],
    callback: (result: Record<string, unknown>) => void
  ): void;
  set(items: Record<string, unknown>, callback: () => void): void;
  remove(key: string, callback: () => void): void;
};

export class ChromeStorageBackend implements KVStorageBackend {
  constructor(
    private readonly storageArea: ChromeStorageArea = defaultChromeStorageArea(),
    private readonly getLastError: () =>
      string | undefined = defaultChromeStorageError
  ) {}

  async get<T = any>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.storageArea.get([key], (res) => {
        const error = this.getLastError();
        if (error) reject(new Error(error));
        else resolve(res[key] as T | undefined);
      });
    });
  }
  async set<T = any>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageArea.set({ [key]: value }, () => {
        const error = this.getLastError();
        if (error) reject(new Error(error));
        else resolve();
      });
    });
  }
  async remove(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageArea.remove(key, () => {
        const error = this.getLastError();
        if (error) reject(new Error(error));
        else resolve();
      });
    });
  }
}

function defaultChromeStorageArea(): ChromeStorageArea {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { storage?: { local?: ChromeStorageArea } };
  };
  const storageArea = runtime.chrome?.storage?.local;
  if (!storageArea) throw new Error("chrome_storage_unavailable");
  return storageArea;
}

function defaultChromeStorageError(): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { runtime?: { lastError?: { message?: string } } };
  };
  return runtime.chrome?.runtime?.lastError?.message;
}

import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import type { HistoryStorageBackend } from "../../../packages/core/history/types";
import { createRuntimeIdentityRotationCoordinator } from "../../../packages/core/runtime/identityInitialization";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { createIdentityRotationCommitter } from "../../../packages/core/trust/identityRotation";
import {
  identityResetStorageKeys,
  type IdentityResetLifecycle,
} from "../../../packages/core/trust/identityResetStorage";

type ChromeRotationOptions = Omit<
  Parameters<typeof createRuntimeIdentityRotationCoordinator>[0],
  "capabilities" | "committer" | "manualReset" | "storage"
> & {
  storage: ChromeStorageBackend;
  history: HistoryStorageBackend;
  identityKey: string;
  lifecycle?: IdentityResetLifecycle;
};

/** Background's single transition owner; reset admission is supplied by package 29. */
export function createChromeIdentityRotationCoordinator(
  options: ChromeRotationOptions
) {
  const { storage, history, identityKey, lifecycle, ...rotation } = options;
  if (lifecycle && !(history instanceof IndexedDBHistoryBackend)) {
    throw new Error("identity_reset_durable_history_required");
  }
  const keys = identityResetStorageKeys(identityKey);
  const persistentHistory = history as IndexedDBHistoryBackend;
  return createRuntimeIdentityRotationCoordinator({
    ...rotation,
    storage,
    capabilities: RUNTIME_CAPABILITIES.chromeExtension,
    committer: createIdentityRotationCommitter({
      repository: rotation.repository,
      storage,
      history,
    }),
    ...(lifecycle
      ? {
          manualReset: {
            ...lifecycle,
            storage,
            async clearIdentityBoundData() {
              // The ordinary owner must settle automatic backup/markers first.
              if (
                (await storage.get(rotation.stateKey ?? "identityRotation")) !==
                undefined
              )
                throw new Error("automatic_rotation_pending");
              await persistentHistory.clearIdentityResetData();
              for (const key of keys) await storage.remove(key);
            },
            async installIdentity(candidate) {
              await storage.set(identityKey, candidate);
            },
            async verifyCleanup() {
              await persistentHistory.verifyIdentityResetDataCleared();
              for (const key of keys.filter((key) => key !== identityKey)) {
                if ((await storage.get(key)) !== undefined)
                  throw new Error("identity_reset_cleanup_incomplete");
              }
              if (
                (await storage.get(rotation.stateKey ?? "identityRotation")) !==
                undefined
              )
                throw new Error("automatic_rotation_pending");
            },
          },
        }
      : {}),
  });
}
