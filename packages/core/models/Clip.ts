/**
 * Represents a clipboard item shared across devices.
 */
import { ClipType } from "./enums";

export interface Clip {
  /** Unique identifier (UUID) */
  id: string;
  /** Type of clipboard item */
  type: ClipType | string;
  /** Content (base64 for image/file, raw text for others) */
  content: string;
  /** Creation timestamp (epoch ms) */
  timestamp: number;
  /** Sender's Peer ID or device UUID */
  senderId: string;
  /** Optional expiration timestamp (epoch ms) */
  expiresAt?: number;
}

/**
 * Validate a Clip object.
 */
export function validateClip(clip: Clip): boolean {
  return (
    typeof clip.id === "string" &&
    typeof clip.type === "string" &&
    typeof clip.content === "string" &&
    typeof clip.timestamp === "number" &&
    typeof clip.senderId === "string"
  );
}
