/**
 * Represents a message exchanged between peers during clipboard sync.
 */
import { MessageType } from "./enums";

export interface SyncMessage {
  /** Message type */
  type: MessageType | string;
  /** Message payload (Clip, list of Clips, etc.) */
  payload: any;
  /** Sender's Peer ID */
  senderId: string;
  /** Timestamp (epoch ms) */
  timestamp: number;
}

/**
 * Validate a SyncMessage object.
 */
export function validateSyncMessage(msg: SyncMessage): boolean {
  return (
    typeof msg.type === "string" &&
    typeof msg.senderId === "string" &&
    typeof msg.timestamp === "number"
  );
}
