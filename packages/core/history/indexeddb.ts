import {
  decideAtomicHistoryMutation,
  type HistoryMutation,
  type HistoryMutationResult,
  type HistoryStorageBackend,
} from "./types";

const DB_NAME = "clipp-history";
const STORE_NAME = "history";
const DB_VERSION = 1;
const GENERATION_META_KEY = "__clipp_history_generation__";
const GENERATION_KEY_PREFIX = "__clipp_history_generation_entry__:";
const LEGACY_GENERATION = "legacy";

type IdentityRotationCheckpoint = {
  kind: "indexeddb-history-generation";
  previousGeneration: string;
  replacementGeneration: string;
};

function isIdentityRotationCheckpoint(value: unknown): value is IdentityRotationCheckpoint {
  return Boolean(value)
    && typeof value === "object"
    && (value as Partial<IdentityRotationCheckpoint>).kind === "indexeddb-history-generation"
    && typeof (value as Partial<IdentityRotationCheckpoint>).previousGeneration === "string"
    && typeof (value as Partial<IdentityRotationCheckpoint>).replacementGeneration === "string";
}

function physicalKey(generation: string, logicalKey: string): string {
  return generation === LEGACY_GENERATION
    ? logicalKey
    : `${GENERATION_KEY_PREFIX}${generation}:${logicalKey}`;
}

function logicalKey(generation: string, key: string): string | undefined {
  if (generation === LEGACY_GENERATION) {
    return key === GENERATION_META_KEY || key.startsWith(GENERATION_KEY_PREFIX) ? undefined : key;
  }
  const prefix = `${GENERATION_KEY_PREFIX}${generation}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
}

function openDb(): Promise<any> {
  return new Promise((resolve, reject) => {
    const idb = (globalThis as any).indexedDB;
    if (!idb) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function runTx<T>(
  dbPromise: Promise<any>,
  mode: "readonly" | "readwrite",
  fn: (store: any) => any,
): Promise<T> {
  const db = await dbPromise;
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

export class IndexedDBHistoryBackend implements HistoryStorageBackend {
  private readonly dbPromise = openDb();

  private async currentGeneration(): Promise<string> {
    return (await runTx<string | undefined>(
      this.dbPromise,
      "readonly",
      (store) => store.get(GENERATION_META_KEY),
    )) ?? LEGACY_GENERATION;
  }

  private async deleteGeneration(generation: string): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const keysRequest = store.getAllKeys();
      keysRequest.onsuccess = () => {
        for (const keyValue of keysRequest.result as IDBValidKey[]) {
          const key = String(keyValue);
          if (logicalKey(generation, key) !== undefined) store.delete(keyValue);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB generation cleanup failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB generation cleanup aborted"));
    });
  }

  async set(key: string, value: any): Promise<void> {
    const generation = await this.currentGeneration();
    await runTx(this.dbPromise, "readwrite", (store) => store.put(value, physicalKey(generation, key)));
  }
  async get(key: string): Promise<any> {
    const generation = await this.currentGeneration();
    return await runTx(this.dbPromise, "readonly", (store) => store.get(physicalKey(generation, key)));
  }
  async getAll(): Promise<any[]> {
    const generation = await this.currentGeneration();
    const db = await this.dbPromise;
    return await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const valuesRequest = store.getAll();
      const keysRequest = store.getAllKeys();
      tx.oncomplete = () => {
        const values = valuesRequest.result as unknown[];
        const keys = keysRequest.result as IDBValidKey[];
        resolve(values.filter((_value, index) => logicalKey(generation, String(keys[index])) !== undefined));
      };
      tx.onerror = () => reject(tx.error || new Error("IndexedDB history read failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB history read aborted"));
    });
  }
  async remove(key: string): Promise<void> {
    const generation = await this.currentGeneration();
    await runTx(this.dbPromise, "readwrite", (store) => store.delete(physicalKey(generation, key)));
  }
  async clearAll(): Promise<void> {
    await this.deleteGeneration(await this.currentGeneration());
  }

  async applyHistoryMutation(input: HistoryMutation): Promise<HistoryMutationResult> {
    const db = await this.dbPromise;
    return await new Promise<HistoryMutationResult>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const generationRequest = store.get(GENERATION_META_KEY);
      const valuesRequest = store.getAll();
      const keysRequest = store.getAllKeys();
      let generation: string | undefined;
      let values: unknown[] | undefined;
      let keys: string[] | undefined;
      let result: HistoryMutationResult | undefined;
      let planningError: unknown;
      const plan = () => {
        if (!generation || !values || !keys) return;
        try {
          const entries = new Map<string, unknown>();
          keys.forEach((key, index) => {
            const logical = logicalKey(generation!, String(key));
            if (logical !== undefined) entries.set(logical, values![index]);
          });
          const mutation = decideAtomicHistoryMutation(entries, input);
          for (const key of mutation.deletes) store.delete(physicalKey(generation, key));
          for (const [key, value] of mutation.writes) store.put(value, physicalKey(generation, key));
          result = mutation.result;
        } catch (error) {
          planningError = error;
          tx.abort();
        }
      };
      generationRequest.onsuccess = () => {
        generation = generationRequest.result ?? LEGACY_GENERATION;
        plan();
      };
      valuesRequest.onsuccess = () => {
        values = valuesRequest.result as unknown[];
        plan();
      };
      keysRequest.onsuccess = () => {
        keys = keysRequest.result as string[];
        plan();
      };
      tx.oncomplete = () => result
        ? resolve(result)
        : reject(new Error("IndexedDB history mutation completed without a result"));
      tx.onerror = () => reject(tx.error || new Error("IndexedDB history mutation failed"));
      tx.onabort = () => reject(planningError ?? tx.error ?? new Error("IndexedDB history mutation aborted"));
    });
  }

  async prepareIdentityRotation(backupId: string): Promise<IdentityRotationCheckpoint> {
    return {
      kind: "indexeddb-history-generation",
      previousGeneration: await this.currentGeneration(),
      replacementGeneration: `rotation-${backupId}`,
    };
  }

  async commitIdentityRotation(checkpoint: unknown): Promise<void> {
    if (!isIdentityRotationCheckpoint(checkpoint)) throw new Error("invalid_history_rotation_checkpoint");
    await runTx(this.dbPromise, "readwrite", (store) =>
      store.put(checkpoint.replacementGeneration, GENERATION_META_KEY));
  }

  async rollbackIdentityRotation(checkpoint: unknown): Promise<void> {
    if (!isIdentityRotationCheckpoint(checkpoint)) throw new Error("invalid_history_rotation_checkpoint");
    await runTx(this.dbPromise, "readwrite", (store) => checkpoint.previousGeneration === LEGACY_GENERATION
      ? store.delete(GENERATION_META_KEY)
      : store.put(checkpoint.previousGeneration, GENERATION_META_KEY));
    await this.deleteGeneration(checkpoint.replacementGeneration);
  }

  async finalizeIdentityRotation(checkpoint: unknown): Promise<void> {
    if (!isIdentityRotationCheckpoint(checkpoint)) throw new Error("invalid_history_rotation_checkpoint");
    await this.deleteGeneration(checkpoint.previousGeneration);
  }
}
