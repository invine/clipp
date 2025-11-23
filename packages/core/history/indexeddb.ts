import { HistoryStorageBackend } from "./types";

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function runTx<T>(
  dbPromise: Promise<any>,
  mode: "readonly" | "readwrite",
  fn: (store: any) => any
): Promise<T> {
  const db = await dbPromise;
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req: any = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

export class IndexedDBHistoryBackend implements HistoryStorageBackend {
  private dbPromise: Promise<any>;

  constructor() {
    this.dbPromise = openDb();
  }

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
}
