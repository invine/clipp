import { clipsHaveEqualImmutableFields, type Clip } from "../models/Clip";
import type { HistoryItem } from "../models/HistoryItem";

export type ClipSuppression = {
  clipId: string;
  suppressedUntil: number;
};

export type AtomicHistoryAcceptance = {
  kind: "newly-stored" | "exact-duplicate" | "immutable-conflict" | "locally-suppressed";
  clip: Clip;
  liveHandled: boolean;
};

export type AtomicHistoryAcceptInput = {
  clip: Clip;
  suppressionKey: string;
  firstStoredAt: number;
  liveHandled: boolean;
  now: number;
};

export type AtomicHistorySuppressInput = {
  clipId: string;
  suppressionKey: string;
  suppressedUntil: number;
};

/**
 * Storage backend interface for clipboard history.
 */
export interface HistoryStorageBackend {
  set(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
  getAll(): Promise<any[]>;
  remove(key: string): Promise<void>;
  clearAll(): Promise<void>;
  acceptClip(input: AtomicHistoryAcceptInput): Promise<AtomicHistoryAcceptance>;
  suppressClip(input: AtomicHistorySuppressInput): Promise<void>;
}

/**
 * In-memory default backend (for browser/mobile portability).
 */
export class InMemoryHistoryBackend implements HistoryStorageBackend {
  private store = new Map<string, any>();

  async set(key: string, value: any) {
    this.store.set(key, value);
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async getAll() {
    return Array.from(this.store.values());
  }
  async remove(key: string) {
    this.store.delete(key);
  }
  async clearAll() {
    this.store.clear();
  }

  async acceptClip(input: AtomicHistoryAcceptInput): Promise<AtomicHistoryAcceptance> {
    const suppression = this.store.get(input.suppressionKey) as ClipSuppression | undefined;
    if (suppression && suppression.suppressedUntil > input.now) {
      return { kind: "locally-suppressed", clip: input.clip, liveHandled: false };
    }
    if (suppression) this.store.delete(input.suppressionKey);

    const existing = this.store.get(input.clip.id) as HistoryItem | undefined;
    if (existing) {
      if (!clipsHaveEqualImmutableFields(existing.clip, input.clip)) {
        return { kind: "immutable-conflict", clip: existing.clip, liveHandled: false };
      }
      const needsLiveHandled = input.liveHandled && !existing.liveHandled;
      if (needsLiveHandled) this.store.set(input.clip.id, { ...existing, liveHandled: true });
      return { kind: "exact-duplicate", clip: existing.clip, liveHandled: needsLiveHandled };
    }

    const item: HistoryItem = {
      clip: input.clip,
      firstStoredAt: input.firstStoredAt,
      liveHandled: input.liveHandled,
    };
    this.store.set(input.clip.id, item);
    return { kind: "newly-stored", clip: input.clip, liveHandled: input.liveHandled };
  }

  async suppressClip(input: AtomicHistorySuppressInput): Promise<void> {
    this.store.delete(input.clipId);
    this.store.set(input.suppressionKey, {
      clipId: input.clipId,
      suppressedUntil: input.suppressedUntil,
    } satisfies ClipSuppression);
  }
}
