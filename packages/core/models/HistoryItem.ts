/**
 * Represents a locally stored clip history item.
 */
import { Clip } from "./Clip";

export interface HistoryItem {
  /** Immutable clipboard event. */
  clip: Clip;
  /** Local retention start; never exchanged or refreshed by duplicates. */
  firstStoredAt: number;
  /** Local-only first-live-delivery marker. */
  liveHandled: boolean;
  /** Local-only retention exemption; never exchanged with a Clip. */
  pinned?: boolean;
}

/**
 * Validate a HistoryItem object.
 */
export function validateHistoryItem(item: HistoryItem): boolean {
  return (
    typeof item.firstStoredAt === "number" &&
    typeof item.liveHandled === "boolean"
  );
}
