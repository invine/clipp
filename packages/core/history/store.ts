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
  accept(
    clip: Clip,
    options?: HistoryAcceptanceOptions
  ): Promise<HistoryAcceptance>;
  getById(id: string): Promise<HistoryItem | null>;
  query(opts?: {
    type?: Clip["type"];
    search?: string;
    since?: number;
    limit?: number;
  }): Promise<HistoryItem[]>;
  exportAll(): Promise<Clip[]>;
  importBatch(clips: Clip[]): Promise<void>;
  pruneExpired(): Promise<void>;
  setRetention(retentionMs: number): Promise<number>;
  setPinned(id: string, pinned: boolean): Promise<string[]>;
  pinnedIds(): Promise<string[]>;
  onNew(cb: (item: HistoryItem) => void): void;
  onChanged(cb: (revision: number) => void): void;
  snapshot(): Promise<HistorySnapshot>;
  completeShareNow(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  suppress(id: string, suppressedUntil: number): Promise<void>;
  clearAll(): Promise<void>;
}

export type HistoryAcceptance = AtomicHistoryAcceptance;

export type HistorySnapshot = {
  revision: number;
  clips: Clip[];
  pinnedIds: string[];
};

export type MemoryHistoryStoreOptions = Partial<HistoryPolicy> & {
  now?: () => number;
};

export type HistoryRetentionCleanup = {
  stop(): void;
  retry(): Promise<void>;
};

/** Runs ordinary retention cleanup while a runtime remains active. */
export function startHistoryRetentionCleanup(
  history: Pick<ClipHistoryStore, "pruneExpired">,
  intervalMs = 60 * 60 * 1000,
  onError?: (error: unknown | null) => void
): HistoryRetentionCleanup {
  let stopped = false;
  const cleanup = async (): Promise<void> => {
    if (stopped) return;
    try {
      await history.pruneExpired();
      if (!stopped) onError?.(null);
    } catch (error) {
      if (!stopped) onError?.(error);
    }
  };
  void cleanup();
  const timer = setInterval(() => void cleanup(), intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    retry: cleanup,
  };
}

function normalizeRetention(retentionMs: number): number {
  if (!Number.isFinite(retentionMs) || retentionMs < 0)
    throw new RangeError("invalid_history_retention");
  return Math.min(retentionMs, MAX_RETENTION_MS);
}

export class MemoryHistoryStore implements ClipHistoryStore {
  private listeners: Array<(item: HistoryItem) => void> = [];
  private changeListeners: Array<(revision: number) => void> = [];
  private revision = 0;
  private queue = Promise.resolve();
  private readonly now: () => number;
  private policy: HistoryPolicy;
  private readonly pinPersistence: "durable" | "session";
  private readonly sessionPinnedIds = new Set<string>();

  constructor(
    private readonly backend: HistoryStorageBackend = new InMemoryHistoryBackend(),
    options: MemoryHistoryStoreOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.pinPersistence = options.pinPersistence ?? "durable";
    this.policy = {
      retentionMs: normalizeRetention(options.retentionMs ?? RETENTION_MS),
      maxUnpinnedClips: options.maxUnpinnedClips ?? DEFAULT_MAX_UNPINNED_CLIPS,
      maxUnpinnedBytes: options.maxUnpinnedBytes ?? DEFAULT_MAX_UNPINNED_BYTES,
      clockSkewAllowanceMs:
        options.clockSkewAllowanceMs ?? DEFAULT_CLOCK_SKEW_ALLOWANCE_MS,
      maxSuppressionRecords:
        options.maxSuppressionRecords ?? DEFAULT_MAX_SUPPRESSION_RECORDS,
      maxSuppressionBytes:
        options.maxSuppressionBytes ?? DEFAULT_MAX_SUPPRESSION_BYTES,
      pinPersistence: this.pinPersistence,
    };
  }

  private mutationPolicy(policy = this.policy): HistoryPolicy {
    return this.pinPersistence === "session"
      ? { ...policy, sessionPinnedIds: [...this.sessionPinnedIds] }
      : policy;
  }

  private itemPinned(item: HistoryItem): boolean {
    return this.pinPersistence === "session"
      ? this.sessionPinnedIds.has(item.clip.id)
      : item.pinned === true;
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private changed(): void {
    this.revision += 1;
    for (const listener of this.changeListeners) {
      try {
        listener(this.revision);
      } catch {
        // An observer cannot undo the committed History mutation.
      }
    }
  }

  async accept(
    clip: Clip,
    options: HistoryAcceptanceOptions = {}
  ): Promise<HistoryAcceptance> {
    return await this.serialized(async () => {
      const firstStoredAt = this.now();
      const result = await this.backend.applyHistoryMutation({
        kind: "accept",
        clip,
        firstStoredAt,
        liveHandled: options.liveHandled === true,
        shareNowPending: options.shareNowPending === true,
        admissionPriority: options.admissionPriority ?? true,
        now: this.now(),
        policy: this.mutationPolicy(),
      });
      const acceptance = result.acceptance!;
      if (acceptance.kind === "newly-stored" || result.retainedHistoryChanged) {
        this.changed();
      }
      if (acceptance.kind === "newly-stored") {
        const item = await this.getById(clip.id);
        if (item) for (const listener of this.listeners) listener(item);
      }
      return acceptance;
    });
  }

  async getById(id: string): Promise<HistoryItem | null> {
    const item = await this.backend.get(id);
    return isHistoryItem(item)
      ? { ...item, pinned: this.itemPinned(item) }
      : null;
  }

  private async allItems(): Promise<HistoryItem[]> {
    return (await this.backend.getAll())
      .filter(isHistoryItem)
      .map((item) => ({ ...item, pinned: this.itemPinned(item) }));
  }

  async query(
    opts: {
      type?: Clip["type"];
      search?: string;
      since?: number;
      limit?: number;
    } = {}
  ): Promise<HistoryItem[]> {
    let items = await this.allItems();
    if (opts.type) items = items.filter((item) => item.clip.type === opts.type);
    if (opts.search) {
      const query = opts.search.toLowerCase();
      items = items.filter((item) =>
        item.clip.content.toLowerCase().includes(query)
      );
    }
    if (opts.since !== undefined)
      items = items.filter((item) => clipCapturedAt(item.clip) >= opts.since!);
    items.sort(
      (left, right) => clipCapturedAt(right.clip) - clipCapturedAt(left.clip)
    );
    return opts.limit ? items.slice(0, opts.limit) : items;
  }

  async exportAll(): Promise<Clip[]> {
    return (await this.allItems()).map((item) => item.clip);
  }

  async snapshot(): Promise<HistorySnapshot> {
    return await this.serialized(async () => {
      const items = await this.allItems();
      items.sort(
        (left, right) => clipCapturedAt(right.clip) - clipCapturedAt(left.clip)
      );
      return {
        revision: this.revision,
        clips: items.map((item) => item.clip),
        pinnedIds: items
          .filter((item) => item.pinned)
          .map((item) => item.clip.id),
      };
    });
  }

  async importBatch(clips: Clip[]): Promise<void> {
    for (const clip of clips)
      await this.accept(clip, { admissionPriority: false });
  }

  async pruneExpired(): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({
        kind: "cleanup",
        now: this.now(),
        policy: this.mutationPolicy(),
      });
      this.changed();
    });
  }

  async setRetention(retentionMs: number): Promise<number> {
    return await this.serialized(async () => {
      const nextPolicy = {
        ...this.policy,
        retentionMs: normalizeRetention(retentionMs),
      };
      await this.backend.applyHistoryMutation({
        kind: "cleanup",
        now: this.now(),
        policy: this.mutationPolicy(nextPolicy),
      });
      this.policy = nextPolicy;
      this.changed();
      return nextPolicy.retentionMs;
    });
  }

  private async setPinnedUnserialized(
    id: string,
    pinned: boolean
  ): Promise<string[]> {
    if (this.pinPersistence === "session") {
      const existing = await this.backend.get(id);
      if (!isHistoryItem(existing)) return await this.pinnedIds();
      const wasPinned = this.sessionPinnedIds.has(id);
      if (pinned) this.sessionPinnedIds.add(id);
      else this.sessionPinnedIds.delete(id);
      try {
        if (!pinned) {
          await this.backend.applyHistoryMutation({
            kind: "cleanup",
            now: this.now(),
            policy: this.mutationPolicy(),
          });
        }
      } catch (error) {
        if (wasPinned) this.sessionPinnedIds.add(id);
        else this.sessionPinnedIds.delete(id);
        throw error;
      }
      return await this.pinnedIds();
    }
    const result = await this.backend.applyHistoryMutation({
      kind: "set-pin",
      clipId: id,
      pinned,
      now: this.now(),
      policy: this.mutationPolicy(),
    });
    return result.pinnedIds ?? [];
  }

  async setPinned(id: string, pinned: boolean): Promise<string[]> {
    return await this.serialized(async () => {
      const pinnedIds = await this.setPinnedUnserialized(id, pinned);
      this.changed();
      return pinnedIds;
    });
  }

  async pinnedIds(): Promise<string[]> {
    return (await this.allItems())
      .filter((item) => item.pinned)
      .map((item) => item.clip.id);
  }

  async remove(id: string): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({
        kind: "remove",
        clipId: id,
        now: this.now(),
        policy: this.mutationPolicy(),
      });
      this.sessionPinnedIds.delete(id);
      this.changed();
    });
  }

  async completeShareNow(id: string): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({
        kind: "complete-share-now",
        clipId: id,
        now: this.now(),
        policy: this.mutationPolicy(),
      });
      this.changed();
    });
  }

  async suppress(id: string, suppressedUntil: number): Promise<void> {
    await this.serialized(async () => {
      await this.backend.applyHistoryMutation({
        kind: "suppress",
        clipId: id,
        suppressedUntil,
        now: this.now(),
        policy: this.mutationPolicy(),
      });
      this.changed();
    });
  }

  async clearAll(): Promise<void> {
    await this.serialized(async () => {
      try {
        await this.backend.applyHistoryMutation({
          kind: "clear",
          now: this.now(),
          policy: this.mutationPolicy(),
        });
      } catch (error) {
        // A backend can report failure after partial effects. Reconcile every open view.
        this.changed();
        throw error;
      }
      this.sessionPinnedIds.clear();
      this.changed();
    });
  }

  onNew(cb: (item: HistoryItem) => void): void {
    this.listeners.push(cb);
  }

  onChanged(cb: (revision: number) => void): void {
    this.changeListeners.push(cb);
  }
}
