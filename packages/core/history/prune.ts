/**
 * Prune history items that exceed their local retention period.
 */
import { clipCapturedAt } from "../models/Clip";
import { HistoryItem } from "../models/HistoryItem";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function shouldPrune(
  item: HistoryItem,
  now: number = Date.now()
): boolean {
  // Clip sharing expiry controls exchange only; retained history follows local policy.
  const baseTime = item.clip.originPeerId ? item.firstStoredAt : clipCapturedAt(item.clip);
  if (item.clip.expiresAt !== undefined && item.clip.expiresAt < now) return true;
  if (baseTime < now - ONE_YEAR_MS) return true;
  return false;
}

export function pruneHistoryItems(
  items: HistoryItem[],
  now: number = Date.now()
): HistoryItem[] {
  return items.filter((item) => !shouldPrune(item, now));
}
