import {
  AtomicHistoryAcceptance,
  AtomicHistoryAcceptInput,
  AtomicHistorySuppressInput,
  ClipSuppression,
  decideAtomicHistoryAcceptance,
  HistoryStorageBackend,
} from "./types";
import { HistoryItem } from "../models/HistoryItem";

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

  async clearAll(): Promise<void> {
    await runTx(this.dbPromise, "readwrite", (store) => store.clear());
  }

  async acceptClip(input: AtomicHistoryAcceptInput): Promise<AtomicHistoryAcceptance> {
    const db = await this.dbPromise;
    return await new Promise<AtomicHistoryAcceptance>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const existingRequest = store.get(input.clip.id);
      const suppressionRequest = store.get(input.suppressionKey);
      let existing: HistoryItem | undefined;
      let suppression: ClipSuppression | undefined;
      let reads = 2;
      let result: AtomicHistoryAcceptance | undefined;
      const finishReads = () => {
        reads -= 1;
        if (reads !== 0) return;
        const transition = decideAtomicHistoryAcceptance(input, existing, suppression);
        if (transition.deleteSuppression) store.delete(input.suppressionKey);
        if (transition.storedItem) store.put(transition.storedItem satisfies HistoryItem, input.clip.id);
        result = transition.acceptance;
      };
      existingRequest.onsuccess = () => {
        existing = existingRequest.result as HistoryItem | undefined;
        finishReads();
      };
      suppressionRequest.onsuccess = () => {
        suppression = suppressionRequest.result as ClipSuppression | undefined;
        finishReads();
      };
      tx.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("IndexedDB atomic acceptance completed without a result"));
      };
      tx.onerror = () => reject(tx.error || new Error("IndexedDB atomic acceptance failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB atomic acceptance aborted"));
    });
  }

  async suppressClip(input: AtomicHistorySuppressInput): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(input.clipId);
      store.put({
        clipId: input.clipId,
        suppressedUntil: input.suppressedUntil,
      } satisfies ClipSuppression, input.suppressionKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB suppression failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB suppression aborted"));
    });
  }
}
