import { clipsHaveEqualImmutableFields, type Clip } from "../models/Clip";
import type { HistoryItem } from "../models/HistoryItem";

export const SUPPRESSION_KEY_PREFIX = "__clipp_suppression__:";

export function historySuppressionKey(id: string): string {
  return `${SUPPRESSION_KEY_PREFIX}${id}`;
}

export type ClipSuppression = {
  clipId: string;
  suppressedUntil: number;
};

export type HistoryPolicy = {
  retentionMs: number;
  maxUnpinnedClips: number;
  maxUnpinnedBytes: number;
  clockSkewAllowanceMs: number;
  maxSuppressionRecords: number;
  maxSuppressionBytes: number;
  pinPersistence?: "durable" | "session";
  sessionPinnedIds?: readonly string[];
};

export type AtomicHistoryAcceptance = {
  kind: "newly-stored" | "exact-duplicate" | "immutable-conflict" | "locally-suppressed";
  clip: Clip;
  liveHandled: boolean;
};

export type HistoryAcceptanceOptions = {
  liveHandled?: boolean;
  /** Local captures and live delivery displace older unpinned records. */
  admissionPriority?: boolean;
};

export type HistoryMutation =
  | {
      kind: "accept";
      clip: Clip;
      firstStoredAt: number;
      liveHandled: boolean;
      admissionPriority: boolean;
      now: number;
      policy: HistoryPolicy;
    }
  | { kind: "remove"; clipId: string; now: number; policy: HistoryPolicy }
  | { kind: "clear"; now: number; policy: HistoryPolicy }
  | { kind: "set-pin"; clipId: string; pinned: boolean; now: number; policy: HistoryPolicy }
  | { kind: "cleanup"; now: number; policy: HistoryPolicy }
  | { kind: "suppress"; clipId: string; suppressedUntil: number; now: number; policy: HistoryPolicy };

export type HistoryMutationResult = {
  acceptance?: AtomicHistoryAcceptance;
  pinnedIds?: string[];
};

export type HistoryMutationPlan = {
  writes: Map<string, unknown>;
  deletes: Set<string>;
  result: HistoryMutationResult;
};

export class HistoryPolicyError extends Error {
  constructor(readonly code: "clip_capacity" | "suppression_capacity") {
    super(code);
    this.name = "HistoryPolicyError";
  }
}

export function isHistoryItem(value: unknown): value is HistoryItem {
  return value !== null &&
    typeof value === "object" &&
    "clip" in value &&
    "firstStoredAt" in value &&
    "liveHandled" in value;
}

export function isClipSuppression(value: unknown): value is ClipSuppression {
  return value !== null &&
    typeof value === "object" &&
    typeof (value as ClipSuppression).clipId === "string" &&
    typeof (value as ClipSuppression).suppressedUntil === "number";
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compareClipIds(left: string, right: string): number {
  const leftBytes = left.replace(/-/g, "");
  const rightBytes = right.replace(/-/g, "");
  return leftBytes < rightBytes ? -1 : leftBytes > rightBytes ? 1 : 0;
}

function isSuppressionRequired(clip: Clip, now: number, policy: HistoryPolicy): boolean {
  return clip.shareExpiresAt + policy.clockSkewAllowanceMs > now;
}

/**
 * Plans a complete local history transition against one transactional snapshot.
 * Backends apply its writes and deletes in their native transaction boundary.
 */
export function decideAtomicHistoryMutation(
  entries: ReadonlyMap<string, unknown>,
  input: HistoryMutation,
): HistoryMutationPlan {
  const next = new Map(entries);
  const deletes = new Set<string>();
  const writes = new Map<string, unknown>();
  const set = (key: string, value: unknown): void => {
    next.set(key, value);
    deletes.delete(key);
    writes.set(key, value);
  };
  const remove = (key: string): void => {
    next.delete(key);
    writes.delete(key);
    deletes.add(key);
  };
  const policy = input.policy;
  const sessionPinnedIds = new Set(policy.sessionPinnedIds ?? []);
  const isPinned = (id: string, item: HistoryItem): boolean =>
    policy.pinPersistence === "session" ? sessionPinnedIds.has(id) : item.pinned === true;

  for (const [key, value] of next) {
    if (isClipSuppression(value) && value.suppressedUntil <= input.now) remove(key);
  }

  const historyItems = (): Array<[string, HistoryItem]> =>
    Array.from(next.entries()).filter((entry): entry is [string, HistoryItem] => isHistoryItem(entry[1]));
  const suppressions = (): Array<[string, ClipSuppression]> =>
    Array.from(next.entries()).filter((entry): entry is [string, ClipSuppression] => isClipSuppression(entry[1]));
  const assertSuppressionCapacity = (): void => {
    const allSuppressions = suppressions();
    const bytes = allSuppressions.reduce((total, [, suppression]) => total + encodedBytes(suppression), 0);
    if (allSuppressions.length > policy.maxSuppressionRecords || bytes > policy.maxSuppressionBytes) {
      throw new HistoryPolicyError("suppression_capacity");
    }
  };

  const addSuppressionsAndRemove = (clips: Clip[]): void => {
    const required = clips.filter((clip) => isSuppressionRequired(clip, input.now, policy));
    for (const clip of required) {
      const key = historySuppressionKey(clip.id);
      const existing = next.get(key);
      const suppressedUntil = clip.shareExpiresAt + policy.clockSkewAllowanceMs;
      if (!isClipSuppression(existing) || existing.suppressedUntil < suppressedUntil) {
        set(key, { clipId: clip.id, suppressedUntil } satisfies ClipSuppression);
      }
    }
    assertSuppressionCapacity();
    for (const clip of clips) remove(clip.id);
  };

  const cleanup = (admissionPriorityId?: string): string[] => {
    const expired = historyItems()
      .filter(([id, item]) => !isPinned(id, item) && item.firstStoredAt <= input.now - policy.retentionMs)
      .map(([, item]) => item.clip);
    const expiredIds = new Set(expired.map((clip) => clip.id));
    const unpinned = historyItems()
      .filter(([id, item]) => !isPinned(id, item) && !expiredIds.has(id))
      .map(([, item]) => item);
    const byEvictionOrder = (left: HistoryItem, right: HistoryItem): number =>
      left.clip.capturedAt - right.clip.capturedAt || compareClipIds(left.clip.id, right.clip.id);
    let count = unpinned.length;
    let bytes = unpinned.reduce((total, item) => total + encodedBytes(item.clip), 0);
    const evicted: Clip[] = [];
    const protectedItem = admissionPriorityId
      ? unpinned.find((item) => item.clip.id === admissionPriorityId)
      : undefined;
    if (protectedItem && (1 > policy.maxUnpinnedClips || encodedBytes(protectedItem.clip) > policy.maxUnpinnedBytes)) {
      throw new HistoryPolicyError("clip_capacity");
    }
    const candidates = unpinned
      .filter((item) => item.clip.id !== admissionPriorityId)
      .sort(byEvictionOrder);
    const historicalCandidates = !admissionPriorityId ? [...unpinned].sort(byEvictionOrder) : candidates;
    for (const item of historicalCandidates) {
      if (count <= policy.maxUnpinnedClips && bytes <= policy.maxUnpinnedBytes) break;
      evicted.push(item.clip);
      count -= 1;
      bytes -= encodedBytes(item.clip);
    }
    if (count > policy.maxUnpinnedClips || bytes > policy.maxUnpinnedBytes) {
      throw new HistoryPolicyError("clip_capacity");
    }
    const removed = [...expired, ...evicted];
    if (removed.length > 0) addSuppressionsAndRemove(removed);
    return removed.map((clip) => clip.id);
  };

  if (input.kind === "accept") {
    const suppression = next.get(historySuppressionKey(input.clip.id));
    if (isClipSuppression(suppression) && suppression.suppressedUntil > input.now) {
      return { writes, deletes, result: { acceptance: { kind: "locally-suppressed", clip: input.clip, liveHandled: false } } };
    }
    const existing = next.get(input.clip.id);
    if (isHistoryItem(existing)) {
      if (!clipsHaveEqualImmutableFields(existing.clip, input.clip)) {
        return { writes, deletes, result: { acceptance: { kind: "immutable-conflict", clip: existing.clip, liveHandled: false } } };
      }
      const needsLiveHandled = input.liveHandled && !existing.liveHandled;
      if (needsLiveHandled) set(input.clip.id, { ...existing, liveHandled: true });
      return {
        writes,
        deletes,
        result: { acceptance: { kind: "exact-duplicate", clip: existing.clip, liveHandled: needsLiveHandled } },
      };
    }
    const item: HistoryItem = {
      clip: input.clip,
      firstStoredAt: input.firstStoredAt,
      liveHandled: input.liveHandled,
      pinned: false,
    };
    set(input.clip.id, item);
    const removedIds = cleanup(input.admissionPriority ? input.clip.id : undefined);
    const acceptance: AtomicHistoryAcceptance = removedIds.includes(input.clip.id)
      ? { kind: "locally-suppressed", clip: input.clip, liveHandled: false }
      : { kind: "newly-stored", clip: input.clip, liveHandled: input.liveHandled };
    return { writes, deletes, result: { acceptance } };
  }

  if (input.kind === "remove") {
    const existing = next.get(input.clipId);
    if (isHistoryItem(existing)) addSuppressionsAndRemove([existing.clip]);
    return { writes, deletes, result: {} };
  }

  if (input.kind === "clear") {
    addSuppressionsAndRemove(historyItems().map(([, item]) => item.clip));
    return { writes, deletes, result: {} };
  }

  if (input.kind === "suppress") {
    const existing = next.get(input.clipId);
    if (isHistoryItem(existing)) remove(input.clipId);
    if (input.suppressedUntil > input.now) {
      set(historySuppressionKey(input.clipId), { clipId: input.clipId, suppressedUntil: input.suppressedUntil } satisfies ClipSuppression);
      assertSuppressionCapacity();
    }
    return { writes, deletes, result: {} };
  }

  if (input.kind === "set-pin") {
    const existing = next.get(input.clipId);
    if (!isHistoryItem(existing)) {
      const pinnedIds = historyItems()
        .filter(([id, item]) => isPinned(id, item))
        .map(([, item]) => item.clip.id);
      return { writes, deletes, result: { pinnedIds } };
    }
    const pinned = input.pinned;
    set(input.clipId, { ...existing, pinned });
    if (!pinned) cleanup();
    const pinnedIds = historyItems()
      .filter(([id, item]) => isPinned(id, item))
      .map(([, item]) => item.clip.id);
    return { writes, deletes, result: { pinnedIds } };
  }

  cleanup();
  return { writes, deletes, result: {} };
}

export interface HistoryIdentityRotation {
  prepare(backupId: string): Promise<unknown>;
  commit(checkpoint: unknown): Promise<void>;
  rollback(checkpoint: unknown): Promise<void>;
  finalize(checkpoint: unknown): Promise<void>;
}

export interface HistoryStorageBackend {
  set(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
  getAll(): Promise<any[]>;
  remove(key: string): Promise<void>;
  clearAll(): Promise<void>;
  applyHistoryMutation(input: HistoryMutation): Promise<HistoryMutationResult>;
  identityRotation?: HistoryIdentityRotation;
}

export class InMemoryHistoryBackend implements HistoryStorageBackend {
  private store = new Map<string, any>();

  async set(key: string, value: any): Promise<void> { this.store.set(key, value); }
  async get(key: string): Promise<any> { return this.store.get(key) ?? null; }
  async getAll(): Promise<any[]> { return Array.from(this.store.values()); }
  async remove(key: string): Promise<void> { this.store.delete(key); }
  async clearAll(): Promise<void> { this.store.clear(); }

  async applyHistoryMutation(input: HistoryMutation): Promise<HistoryMutationResult> {
    const plan = decideAtomicHistoryMutation(this.store, input);
    for (const key of plan.deletes) this.store.delete(key);
    for (const [key, value] of plan.writes) this.store.set(key, value);
    return plan.result;
  }
}
