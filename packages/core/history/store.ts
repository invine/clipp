import { Clip } from "../models/Clip";
import { HistoryItem } from "../models/HistoryItem";
import { HistoryStorageBackend, InMemoryHistoryBackend } from "./types";

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ClipHistoryStore {
  add(clip: Clip, source: string, isLocal: boolean): Promise<void>;
  getById(id: string): Promise<HistoryItem | null>;
  query(opts?: { type?: Clip["type"]; search?: string; since?: number; limit?: number }): Promise<HistoryItem[]>;
  exportAll(): Promise<Clip[]>;
  importBatch(clips: Clip[]): Promise<void>;
  pruneExpired(): Promise<void>;
  onNew(cb: (item: HistoryItem) => void): void;
  remove(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export class MemoryHistoryStore implements ClipHistoryStore {
  private backend: HistoryStorageBackend;
  private listeners: Array<(item: HistoryItem) => void> = [];

  constructor(backend: HistoryStorageBackend = new InMemoryHistoryBackend()) {
    this.backend = backend;
  }

  async add(clip: Clip, source: string, isLocal: boolean): Promise<void> {
    const item: HistoryItem = {
      clip,
      receivedFrom: source,
      syncedAt: Date.now(),
      isLocal,
    };
    await this.backend.set(clip.id, item);
    for (const l of this.listeners) l(item);
  }

  async getById(id: string): Promise<HistoryItem | null> {
    return (await this.backend.get(id)) ?? null;
  }

  private async allItems(): Promise<HistoryItem[]> {
    return await this.backend.getAll();
  }

  async query(opts: { type?: Clip["type"]; search?: string; since?: number; limit?: number } = {}): Promise<HistoryItem[]> {
    let items = await this.allItems();
    if (opts.type) items = items.filter((i) => i.clip.type === opts.type);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((i) => i.clip.content.toLowerCase().includes(q));
    }
    const since = opts.since;
    if (since !== undefined) items = items.filter((i) => i.clip.timestamp >= since);
    items.sort((a, b) => b.clip.timestamp - a.clip.timestamp);
    if (opts.limit) items = items.slice(0, opts.limit);
    return items;
  }

  async exportAll(): Promise<Clip[]> {
    const items = await this.allItems();
    return items.map((i) => i.clip);
  }

  async importBatch(clips: Clip[]): Promise<void> {
    for (const clip of clips) {
      const existing = await this.backend.get(clip.id);
      if (!existing) {
        await this.add(clip, "import", false);
      }
    }
  }

  async pruneExpired(): Promise<void> {
    const now = Date.now();
    const items = await this.allItems();
    for (const item of items) {
      const ts = item.clip.timestamp;
      if (ts < now - RETENTION_MS) {
        await this.backend.remove(item.clip.id);
      }
    }
  }

  async remove(id: string): Promise<void> {
    await this.backend.remove(id);
  }

  async clearAll(): Promise<void> {
    await this.backend.clearAll();
  }

  onNew(cb: (item: HistoryItem) => void): void {
    this.listeners.push(cb);
  }
}
