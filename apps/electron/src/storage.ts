import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HistoryStorageBackend } from "../../../packages/core/history/types";
import type { StorageBackend } from "../../../packages/core/trust";

type FileDBData = {
  kv: Record<string, any>;
  history: Record<string, any>;
};

export type FileDatabase = {
  filePath: string;
  data: FileDBData;
};

function defaultData(): FileDBData {
  return { kv: {}, history: {} };
}

function loadData(filePath: string): FileDBData {
  if (!existsSync(filePath)) return defaultData();
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        kv: (parsed as any).kv && typeof (parsed as any).kv === "object" ? (parsed as any).kv : {},
        history:
          (parsed as any).history && typeof (parsed as any).history === "object"
            ? (parsed as any).history
            : {},
      };
    }
  } catch (err: any) {
    console.warn("[storage] failed to parse DB file, using empty store", err?.message || err);
  }
  return defaultData();
}

function persist(db: FileDatabase) {
  writeFileSync(db.filePath, JSON.stringify(db.data, null, 2), "utf8");
}

export function openDatabase(dbPath: string): FileDatabase {
  const dir = path.dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  const data = loadData(dbPath);
  return { filePath: dbPath, data };
}

export class FileKVStore implements StorageBackend {
  constructor(private db: FileDatabase) {}

  async get<T = any>(key: string): Promise<T | undefined> {
    return this.db.data.kv[key] as T | undefined;
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    this.db.data.kv[key] = value;
    persist(this.db);
  }

  async remove(key: string): Promise<void> {
    delete this.db.data.kv[key];
    persist(this.db);
  }
}

export class FileHistoryBackend implements HistoryStorageBackend {
  constructor(private db: FileDatabase) {}

  async set(key: string, value: any): Promise<void> {
    this.db.data.history[key] = value;
    persist(this.db);
  }

  async get(key: string): Promise<any> {
    return this.db.data.history[key] ?? null;
  }

  async getAll(): Promise<any[]> {
    return Object.values(this.db.data.history);
  }

  async remove(key: string): Promise<void> {
    delete this.db.data.history[key];
    persist(this.db);
  }

  async clearAll(): Promise<void> {
    this.db.data.history = {};
    persist(this.db);
  }
}
