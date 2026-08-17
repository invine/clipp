import { clipCapturedAt, Clip } from "../models/Clip";
import { HistoryItem } from "../models/HistoryItem";
import { AtomicHistoryAcceptance, HistoryStorageBackend, InMemoryHistoryBackend } from "./types";

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ClipHistoryStore {
  accept(clip: Clip, options?: { liveHandled?: boolean }): Promise<HistoryAcceptance>;
  add(clip: Clip, source: string, isLocal: boolean): Promise<void>;
  getById(id: string): Promise<HistoryItem | null>;
  query(opts?: { type?: Clip["type"]; search?: string; since?: number; limit?: number }): Promise<HistoryItem[]>;
  exportAll(): Promise<Clip[]>;
  importBatch(clips: Clip[]): Promise<void>;
  pruneExpired(): Promise<void>;
  onNew(cb: (item: HistoryItem) => void): void;
  remove(id: string): Promise<void>;
  suppress(id: string, suppressedUntil: number): Promise<void>;
  clearAll(): Promise<void>;
}

export type HistoryAcceptance = AtomicHistoryAcceptance;

const SUPPRESSION_KEY_PREFIX = "__clipp_suppression__:";

function suppressionKey(id: string): string {
  return `${SUPPRESSION_KEY_PREFIX}${id}`;
}

function isHistoryItem(value: unknown): value is HistoryItem {
  return value !== null && typeof value === "object" && "clip" in value && "firstStoredAt" in value;
}

export class MemoryHistoryStore implements ClipHistoryStore {
  private backend: HistoryStorageBackend;
  private listeners: Array<(item: HistoryItem) => void> = [];
  private acceptanceQueue = Promise.resolve();

  constructor(backend: HistoryStorageBackend = new InMemoryHistoryBackend()) {
    this.backend = backend;
  }

  async add(clip: Clip, source: string, isLocal: boolean): Promise<void> {
    void source;
    await this.accept(clip, { liveHandled: isLocal });
  }

  async accept(clip: Clip, options: { liveHandled?: boolean } = {}): Promise<HistoryAcceptance> {
    const run = async (): Promise<HistoryAcceptance> => {
      const firstStoredAt = Date.now();
      const result = await this.backend.acceptClip({
        clip,
        suppressionKey: suppressionKey(clip.id),
        firstStoredAt,
        liveHandled: options.liveHandled === true,
        now: Date.now(),
      });
      if (result.kind === "newly-stored") {
        const item: HistoryItem = {
          clip,
          firstStoredAt,
          liveHandled: options.liveHandled === true,
        };
        for (const listener of this.listeners) listener(item);
      }
      return result;
    };
    const next = this.acceptanceQueue.then(run, run);
    this.acceptanceQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async getById(id: string): Promise<HistoryItem | null> {
    const item = await this.backend.get(id);
    return isHistoryItem(item) ? item : null;
  }

  private async allItems(): Promise<HistoryItem[]> {
    return (await this.backend.getAll()).filter(isHistoryItem);
  }

  async query(opts: { type?: Clip["type"]; search?: string; since?: number; limit?: number } = {}): Promise<HistoryItem[]> {
    let items = await this.allItems();
    if (opts.type) items = items.filter((i) => i.clip.type === opts.type);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((i) => i.clip.content.toLowerCase().includes(q));
    }
    const since = opts.since;
    if (since !== undefined) items = items.filter((i) => clipCapturedAt(i.clip) >= since);
    items.sort((a, b) => clipCapturedAt(b.clip) - clipCapturedAt(a.clip));
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
      const retentionStart = item.clip.originPeerId ? item.firstStoredAt : clipCapturedAt(item.clip);
      if (retentionStart < now - RETENTION_MS) {
        await this.backend.remove(item.clip.id);
      }
    }
  }

  async remove(id: string): Promise<void> {
    await this.backend.remove(id);
  }

  async suppress(id: string, suppressedUntil: number): Promise<void> {
    const run = () => this.backend.suppressClip({
      clipId: id,
      suppressionKey: suppressionKey(id),
      suppressedUntil,
    });
    const next = this.acceptanceQueue.then(run, run);
    this.acceptanceQueue = next.then(() => undefined, () => undefined);
    await next;
  }

  async clearAll(): Promise<void> {
    await this.backend.clearAll();
  }

  onNew(cb: (item: HistoryItem) => void): void {
    this.listeners.push(cb);
  }
}
