import type { KVStorageBackend } from "../trust/index.js";

export const AUTO_SYNC_PREFERENCE_KEY = "autoSync";

export type AutoSyncPreference = {
  load(): Promise<boolean>;
  set(enabled: boolean): Promise<boolean>;
};

export function createAutoSyncPreference(options: {
  storage: KVStorageBackend;
  key?: string;
}): AutoSyncPreference {
  const key = options.key ?? AUTO_SYNC_PREFERENCE_KEY;
  return {
    async load(): Promise<boolean> {
      return (await options.storage.get<boolean>(key)) !== false;
    },
    async set(enabled: boolean): Promise<boolean> {
      const persisted = enabled !== false;
      await options.storage.set(key, persisted);
      return persisted;
    },
  };
}
