/**
 * Prune history items that exceed their local retention period.
 */
import { HistoryItem } from "../models/HistoryItem";
import { RETENTION_MS } from "./store";

export function shouldPrune(
  item: HistoryItem,
  now: number = Date.now(),
  retentionMs: number = RETENTION_MS,
): boolean {
  // Clip Sharing Lifetime controls exchange only; pinned history is exempt.
  return !item.pinned && item.firstStoredAt <= now - retentionMs;
}

export function pruneHistoryItems(
  items: HistoryItem[],
  now: number = Date.now(),
  retentionMs: number = RETENTION_MS,
): HistoryItem[] {
  return items.filter((item) => !shouldPrune(item, now, retentionMs));
}
