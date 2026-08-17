import { v4 as uuidv4 } from "uuid";
import {
  clipContentType,
  DEFAULT_CLIP_SHARING_LIFETIME_MS,
  MAX_CLIP_SHARING_LIFETIME_MS,
  type Clip,
} from "../models/Clip.js";

/** v1 has no text sanitization: clipboard content is an event payload. */
export function sanitizeText(input: string): string {
  return input;
}

/** @deprecated v1 never classifies image or file clips. */
export function guessMimeType(): string {
  return "application/octet-stream";
}

/** Retained only as a compatibility helper; v1 accepts text and HTTP(S) URLs. */
export function detectClipType(content: unknown): Clip["type"] {
  return clipContentType(typeof content === "string" ? content : String(content));
}

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

  return {
    id: (deps.makeId ?? uuidv4)(),
    type: clipContentType(input),
    content: input,
    originPeerId,
    capturedAt,
    shareExpiresAt: capturedAt + sharingLifetimeMs,
  };
}
