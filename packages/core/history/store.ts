import { clipCapturedAt, Clip } from "../models/Clip";
import { HistoryItem } from "../models/HistoryItem";
import {
  AtomicHistoryAcceptance,
  HistoryAcceptanceOptions,
  HistoryPolicy,
  HistoryStorageBackend,
  InMemoryHistoryBackend,
  isHistoryItem,
} from "./types";

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_UNPINNED_CLIPS = 10_000;
export const DEFAULT_MAX_UNPINNED_BYTES = 100 * 1024 * 1024;
export const DEFAULT_MAX_SUPPRESSION_RECORDS = 100_000;
export const DEFAULT_MAX_SUPPRESSION_BYTES = 16 * 1024 * 1024;
export const DEFAULT_CLOCK_SKEW_ALLOWANCE_MS = 2 * 60 * 1000;

export interface ClipHistoryStore {
  accept(clip: Clip, options?: HistoryAcceptanceOptions): Promise<HistoryAcceptance>;
  add(clip: Clip, source: string, isLocal: boolean): Promise<void>;
  getById(id: string): Promise<HistoryItem | null>;
  query(opts?: { type?: Clip["type"]; search?: string; since?: number; limit?: number }): Promise<HistoryItem[]>;
  exportAll(): Promise<Clip[]>;
  importBatch(clips: Clip[]): Promise<void>;
  pruneExpired(): Promise<void>;
  setRetention(retentionMs: number): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  pinnedIds(): Promise<string[]>;
  onNew(cb: (item: HistoryItem) => void): void;
  remove(id: string): Promise<void>;
  suppress(id: string, suppressedUntil: number): Promise<void>;
  clearAll(): Promise<void>;
}

export type HistoryAcceptance = AtomicHistoryAcceptance;

export type MemoryHistoryStoreOptions = Partial<HistoryPolicy> & {
  now?: () => number;
};

/** Runs ordinary retention cleanup while a runtime remains active. */
export function startHistoryRetentionCleanup(
  history: Pick<ClipHistoryStore, "pruneExpired">,
  intervalMs = 60 * 60 * 1000,
): () => void {
  const cleanup = () => { void history.pruneExpired().catch(() => {}); };
  cleanup();
  const timer = setInterval(cleanup, intervalMs);
  return () => clearInterval(timer);
}

function normalizeRetention(retentionMs: number): number {
  if (!Number.isFinite(retentionMs) || retentionMs < 0) throw new RangeError("invalid_history_retention");
  return Math.min(retentionMs, MAX_RETENTION_MS);
}

export class MemoryHistoryStore implements ClipHistoryStore {
  private listeners: Array<(item: HistoryItem) => void> = [];
  private queue = Promise.resolve();
  private readonly now: () => number;
  private policy: HistoryPolicy;

  constructor(
    private readonly backend: HistoryStorageBackend = new InMemoryHistoryBackend(),
    options: MemoryHistoryStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.policy = {
      retentionMs: normalizeRetention(options.retentionMs ?? RETENTION_MS),
      maxUnpinnedClips: options.maxUnpinnedClips ?? DEFAULT_MAX_UNPINNED_CLIPS,
      maxUnpinnedBytes: options.maxUnpinnedBytes ?? DEFAULT_MAX_UNPINNED_BYTES,
      clockSkewAllowanceMs: options.clockSkewAllowanceMs ?? DEFAULT_CLOCK_SKEW_ALLOWANCE_MS,
      maxSuppressionRecords: options.maxSuppressionRecords ?? DEFAULT_MAX_SUPPRESSION_RECORDS,
      maxSuppressionBytes: options.maxSuppressionBytes ?? DEFAULT_MAX_SUPPRESSION_BYTES,
    };
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async add(clip: Clip, source: string, isLocal: boolean): Promise<void> {
    void source;
    await this.accept(clip, { liveHandled: isLocal, admissionPriority: isLocal });
  }

  async accept(clip: Clip, options: HistoryAcceptanceOptions = {}): Promise<HistoryAcceptance> {
    return await this.serialized(async () => {
      const firstStoredAt = this.now();
      const result = await this.backend.applyHistoryMutation({
        kind: "accept",
        clip,
        firstStoredAt,
        liveHandled: options.liveHandled === true,
        admissionPriority: options.admissionPriority ?? true,
        now: this.now(),
        policy: this.policy,
      });
      const acceptance = result.acceptance!;
      if (acceptance.kind === "newly-stored") {
        const item = await this.getById(clip.id);
        if (item) for (const listener of this.listeners) listener(item);
      }
      return acceptance;
    });
  }

  async getById(id: string): Promise<HistoryItem | null> {
    const item = await this.backend.get(id);
    return isHistoryItem(item) ? { ...item, pinned: item.pinned === true } : null;
  }

  private async allItems(): Promise<HistoryItem[]> {
    return (await this.backend.getAll())
      .filter(isHistoryItem)
      .map((item) => ({ ...item, pinned: item.pinned === true }));
  }

  async query(opts: { type?: Clip["type"]; search?: string; since?: number; limit?: number } = {}): Promise<HistoryItem[]> {
    let items = await this.allItems();
    if (opts.type) items = items.filter((item) => item.clip.type === opts.type);
    if (opts.search) {
      const query = opts.search.toLowerCase();
      items = items.filter((item) => item.clip.content.toLowerCase().includes(query));
    }
    if (opts.since !== undefined) items = items.filter((item) => clipCapturedAt(item.clip) >= opts.since!);
    items.sort((left, right) => clipCapturedAt(right.clip) - clipCapturedAt(left.clip));
    return opts.limit ? items.slice(0, opts.limit) : items;
  }

  async exportAll(): Promise<Clip[]> {
    return (await this.allItems()).map((item) => item.clip);
  }

  async importBatch(clips: Clip[]): Promise<void> {
    for (const clip of clips) await this.accept(clip, { admissionPriority: false });
  }

  async pruneExpired(): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({ kind: "cleanup", now: this.now(), policy: this.policy });
    });
  }

  async setRetention(retentionMs: number): Promise<void> {
    await this.serialized(async () => {
      this.policy = { ...this.policy, retentionMs: normalizeRetention(retentionMs) };
      await this.backend.applyHistoryMutation({ kind: "cleanup", now: this.now(), policy: this.policy });
    });
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({ kind: "set-pin", clipId: id, pinned, now: this.now(), policy: this.policy });
    });
  }

  async pinnedIds(): Promise<string[]> {
    return (await this.allItems()).filter((item) => item.pinned).map((item) => item.clip.id);
  }

  async remove(id: string): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({ kind: "remove", clipId: id, now: this.now(), policy: this.policy });
    });
  }

  async suppress(id: string, suppressedUntil: number): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({
        kind: "suppress",
        clipId: id,
        suppressedUntil,
        now: this.now(),
        policy: this.policy,
      });
    });
  }

  async clearAll(): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({ kind: "clear", now: this.now(), policy: this.policy });
    });
  }

  onNew(cb: (item: HistoryItem) => void): void {
    this.listeners.push(cb);
  }
}
