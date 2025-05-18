/**
 * ClipboardHistoryStore implementation for cross-platform clipboard history.
 */
import { Clip } from "../models/Clip";
import { HistoryItem } from "../models/HistoryItem";
import { HistoryStorageBackend, InMemoryHistoryBackend } from "./types";
import { pruneHistoryItems } from "./prune";
import { v4 as uuidv4 } from "uuid";

export interface ClipboardHistoryStore {
  add(clip: Clip, receivedFrom: string, isLocal: boolean): Promise<void>;
  getById(id: string): Promise<HistoryItem | null>;
  listRecent(limit?: number): Promise<HistoryItem[]>;
  search(query: string): Promise<HistoryItem[]>;
  exportAll(): Promise<Clip[]>;
  importBatch(clips: Clip[]): Promise<void>;
  pruneExpired(): Promise<void>;
}

export class DefaultClipboardHistoryStore implements ClipboardHistoryStore {
  private backend: HistoryStorageBackend;
  private index: Map<string, string> = new Map(); // id -> key

  constructor(backend?: HistoryStorageBackend) {
    this.backend = backend || new InMemoryHistoryBackend();
  }

  async add(clip: Clip, receivedFrom: string, isLocal: boolean) {
    const now = Date.now();
    const item: HistoryItem = {
      clip,
      receivedFrom,
      syncedAt: now,
      isLocal,
    };
    await this.backend.set(clip.id, item);
    this.index.set(clip.id, clip.id);
  }

  async getById(id: string): Promise<HistoryItem | null> {
    return (await this.backend.get(id)) ?? null;
  }

  async listRecent(limit = 50): Promise<HistoryItem[]> {
    const all = await this.backend.getAll();
    return all
      .sort((a, b) => b.syncedAt - a.syncedAt)
      .slice(0, limit);
  }

  async search(query: string): Promise<HistoryItem[]> {
    const all = await this.backend.getAll();
    const q = query.toLowerCase();
    return all.filter((item) =>
      item.clip.content.toLowerCase().includes(q)
    );
  }

  async exportAll(): Promise<Clip[]> {
    const all = await this.backend.getAll();
    return all.map((item) => item.clip);
  }

  async importBatch(clips: Clip[]): Promise<void> {
    for (const clip of clips) {
      // Use a dummy receivedFrom and isLocal=false for imports
      await this.add(clip, "import", false);
    }
  }

  async pruneExpired(): Promise<void> {
    const all = await this.backend.getAll();
    const keep = pruneHistoryItems(all);
    const keepIds = new Set(keep.map((item) => item.clip.id));
    for (const item of all) {
      if (!keepIds.has(item.clip.id)) {
        await this.backend.remove(item.clip.id);
        this.index.delete(item.clip.id);
      }
    }
  }
}
