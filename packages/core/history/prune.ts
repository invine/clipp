/**
 * Prune expired or old history items (older than 1 year or expired).
 */
import { HistoryItem } from "../models/HistoryItem";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function shouldPrune(
  item: HistoryItem,
  now: number = Date.now()
): boolean {
  // Prune if the clip is older than 1 year from its timestamp or syncedAt, or if expiresAt is in the past
  const baseTime = item.clip.timestamp || item.syncedAt;
  if (item.clip.expiresAt && item.clip.expiresAt < now) return true;
  if (baseTime < now - ONE_YEAR_MS) return true;
  return false;
}

export function pruneHistoryItems(
  items: HistoryItem[],
  now: number = Date.now()
): HistoryItem[] {
  return items.filter((item) => !shouldPrune(item, now));
}
