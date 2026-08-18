import {
  decideAtomicHistoryMutation,
  type HistoryMutation,
  type HistoryMutationResult,
  type HistoryStorageBackend,
} from "./types";

const DB_NAME = "clipp-history";
const STORE_NAME = "history";
const DB_VERSION = 1;

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

  async set(key: string, value: any): Promise<void> {
    await runTx(this.dbPromise, "readwrite", (store) => store.put(value, key));
  }
  async get(key: string): Promise<any> {
    return await runTx(this.dbPromise, "readonly", (store) => store.get(key));
  }
  async getAll(): Promise<any[]> {
    return await runTx(this.dbPromise, "readonly", (store) => store.getAll());
  }
  async remove(key: string): Promise<void> {
    await runTx(this.dbPromise, "readwrite", (store) => store.delete(key));
  }
  async clearAll(): Promise<void> {
    await runTx(this.dbPromise, "readwrite", (store) => store.clear());
  }

  async applyHistoryMutation(input: HistoryMutation): Promise<HistoryMutationResult> {
    const db = await this.dbPromise;
    return await new Promise<HistoryMutationResult>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const valuesRequest = store.getAll();
      const keysRequest = store.getAllKeys();
      let values: unknown[] | undefined;
      let keys: string[] | undefined;
      let result: HistoryMutationResult | undefined;
      const plan = () => {
        if (!values || !keys) return;
        const entries = new Map<string, unknown>();
        keys.forEach((key, index) => entries.set(String(key), values![index]));
        const mutation = decideAtomicHistoryMutation(entries, input);
        for (const key of mutation.deletes) store.delete(key);
        for (const [key, value] of mutation.writes) store.put(value, key);
        result = mutation.result;
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
      tx.onabort = () => reject(tx.error || new Error("IndexedDB history mutation aborted"));
    });
  }
}
