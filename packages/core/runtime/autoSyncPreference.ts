import type { KVStorageBackend } from "../trust/index.js";

export const AUTO_SYNC_PREFERENCE_KEY = "autoSync";

export type AutoSyncPreference = {
  load(): Promise<boolean>;
  set(enabled: boolean): Promise<boolean>;
};

export function createAutoSyncPreference(options: {
  storage: Pick<KVStorageBackend, "get" | "set">;
  key?: string;
}): AutoSyncPreference {
  let writes: Promise<void> = Promise.resolve();
  const key = options.key ?? AUTO_SYNC_PREFERENCE_KEY;
  return {
    async load(): Promise<boolean> {
      await writes;
      return (await options.storage.get<boolean>(key)) !== false;
    },
    set(enabled: boolean): Promise<boolean> {
      const result = writes.then(async () => {
        const persisted = enabled !== false;
        await options.storage.set(key, persisted);
        return persisted;
      });
      writes = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}
