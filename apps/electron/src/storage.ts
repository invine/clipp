import type { HistoryStorageBackend } from "../../../packages/core/history/types";
// import type { StorageBackend } from "../../../packages/core/trust";
import type { KVStorageBackend } from "../../../packages/core/trust"
import Database from "better-sqlite3";

type DB = any;

export function openDatabase(dbPath: string): DB {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

export class SQLiteKVStore implements KVStorageBackend {
  constructor(private db: DB) {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      )
      .run();
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as T;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    const payload = JSON.stringify(value);
    this.db
      .prepare("INSERT OR REPLACE INTO kv(key, value) VALUES(?, ?)")
      .run(key, payload);
  }

  async remove(key: string): Promise<void> {
    this.db.prepare("DELETE FROM kv WHERE key = ?").run(key);
  }
}

export class SQLiteHistoryBackend implements HistoryStorageBackend {
  constructor(private db: DB) {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      )
      .run();
  }

  async set(key: string, value: any): Promise<void> {
    this.db
      .prepare("INSERT OR REPLACE INTO history(id, value) VALUES(?, ?)")
      .run(key, JSON.stringify(value));
  }

  async get(key: string): Promise<any> {
    const row = this.db.prepare("SELECT value FROM history WHERE id = ?").get(key);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async getAll(): Promise<any[]> {
    const rows = this.db.prepare("SELECT value FROM history").all();
    return rows
      .map((row: any) => {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      })
      .filter(Boolean);
  }

  async remove(key: string): Promise<void> {
    this.db.prepare("DELETE FROM history WHERE id = ?").run(key);
  }

  async clearAll(): Promise<void> {
    this.db.prepare("DELETE FROM history").run();
  }
}
