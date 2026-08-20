import { v4 as uuidv4 } from "uuid";
import {
  clipContentType,
  DEFAULT_CLIP_SHARING_LIFETIME_MS,
  MAX_CLIP_SHARING_LIFETIME_MS,
  type Clip,
  validateClip,
} from "../models/Clip.js";

export function normalizeClipboardContent(
  input: unknown,
  originPeerId: string,
  deps: { now?: () => number; makeId?: () => string; sharingLifetimeMs?: number } = {}
): Clip | null {
  if (typeof input !== "string" || input.length === 0) return null;
  const capturedAt = (deps.now ?? Date.now)();
  const sharingLifetimeMs = deps.sharingLifetimeMs ?? DEFAULT_CLIP_SHARING_LIFETIME_MS;
  if (
    !Number.isSafeInteger(capturedAt) ||
    !Number.isSafeInteger(sharingLifetimeMs) ||
    sharingLifetimeMs <= 0 ||
    sharingLifetimeMs > MAX_CLIP_SHARING_LIFETIME_MS
  ) return null;

  const clip: Clip = {
    id: (deps.makeId ?? uuidv4)(),
    type: clipContentType(input),
    content: input,
    originPeerId,
    capturedAt,
    shareExpiresAt: capturedAt + sharingLifetimeMs,
  };
  return validateClip(clip) ? clip : null;
}
