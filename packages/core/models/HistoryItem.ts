/**
 * Represents a locally stored clip history item.
 */
import { Clip } from "./Clip";

export interface HistoryItem {
  /** The clipboard item */
  clip: Clip;
  /** Peer ID from which the clip was received */
  receivedFrom: string;
  /** When the clip was synced (epoch ms) */
  syncedAt: number;
  /** True if the clip originated locally */
  isLocal: boolean;
}

/**
 * Validate a HistoryItem object.
 */
export function validateHistoryItem(item: HistoryItem): boolean {
  return (
    typeof item.receivedFrom === "string" &&
    typeof item.syncedAt === "number" &&
    typeof item.isLocal === "boolean"
  );
}
