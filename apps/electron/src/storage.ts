import {
  AtomicHistoryAcceptance,
  AtomicHistoryAcceptInput,
  AtomicHistorySuppressInput,
  ClipSuppression,
  HistoryStorageBackend,
} from "../../../packages/core/history/types";
import { clipsHaveEqualImmutableFields } from "../../../packages/core/models/Clip";
import type { HistoryItem } from "../../../packages/core/models/HistoryItem";
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

  async acceptClip(input: AtomicHistoryAcceptInput): Promise<AtomicHistoryAcceptance> {
    return this.db.transaction((value: AtomicHistoryAcceptInput): AtomicHistoryAcceptance => {
      const read = (key: string): any => {
        const row = this.db.prepare("SELECT value FROM history WHERE id = ?").get(key);
        return row ? JSON.parse(row.value) : null;
      };
      const suppression = read(value.suppressionKey) as ClipSuppression | null;
      if (suppression && suppression.suppressedUntil > value.now) {
        return { kind: "locally-suppressed", clip: value.clip, liveHandled: false };
      }
      if (suppression) this.db.prepare("DELETE FROM history WHERE id = ?").run(value.suppressionKey);

      const existing = read(value.clip.id) as HistoryItem | null;
      if (existing) {
        if (!clipsHaveEqualImmutableFields(existing.clip, value.clip)) {
          return { kind: "immutable-conflict", clip: existing.clip, liveHandled: false };
        }
        const needsLiveHandled = value.liveHandled && !existing.liveHandled;
        if (needsLiveHandled) {
          this.db.prepare("UPDATE history SET value = ? WHERE id = ?")
            .run(JSON.stringify({ ...existing, liveHandled: true }), value.clip.id);
        }
        return { kind: "exact-duplicate", clip: existing.clip, liveHandled: needsLiveHandled };
      }

      this.db.prepare("INSERT INTO history(id, value) VALUES(?, ?)").run(value.clip.id, JSON.stringify({
        clip: value.clip,
        firstStoredAt: value.firstStoredAt,
        liveHandled: value.liveHandled,
      } satisfies HistoryItem));
      return { kind: "newly-stored", clip: value.clip, liveHandled: value.liveHandled };
    })(input);
  }

  async suppressClip(input: AtomicHistorySuppressInput): Promise<void> {
    this.db.transaction((value: AtomicHistorySuppressInput) => {
      this.db.prepare("DELETE FROM history WHERE id = ?").run(value.clipId);
      this.db.prepare("INSERT OR REPLACE INTO history(id, value) VALUES(?, ?)").run(
        value.suppressionKey,
        JSON.stringify({
          clipId: value.clipId,
          suppressedUntil: value.suppressedUntil,
        } satisfies ClipSuppression),
      );
    })(input);
  }
}
