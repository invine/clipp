/**
 * Clip validation utility for clipboard sync.
 */
import { Clip } from "../models/Clip";

export function validateClip(clip: Clip): boolean {
  return (
    typeof clip.id === "string" &&
    typeof clip.type === "string" &&
    typeof clip.content === "string" &&
    typeof clip.timestamp === "number" &&
    typeof clip.senderId === "string" &&
    (clip.expiresAt === undefined || typeof clip.expiresAt === "number")
  );
}
