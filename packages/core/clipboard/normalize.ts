/**
 * Clipboard normalization and type detection utilities.
 */
import { Clip } from "../models/Clip.js";
import { ClipType } from "../models/enums.js";
import { v4 as uuidv4 } from "uuid";

// Helper: Remove data URI prefix from base64
function stripDataUriPrefix(data: string): string {
  const match = data.match(/^data:[^;]+;base64,(.*)$/);
  return match ? match[1] : data;
}

// Helper: Sanitize text (trim, remove control chars)
export function sanitizeText(input: string): string {
  return input.replace(/[\x00-\x1F\x7F]+/g, "").trim();
}

// Helper: Guess MIME type from base64 or filename
export function guessMimeType(content: string, filename?: string): string {
  if (content.startsWith("/9j/")) return "image/jpeg";
  if (content.startsWith("iVBOR")) return "image/png";
  if (filename) {
    if (filename.endsWith(".png")) return "image/png";
    if (filename.endsWith(".jpg") || filename.endsWith(".jpeg"))
      return "image/jpeg";
    if (filename.endsWith(".txt")) return "text/plain";
    // Add more as needed
  }
  return "application/octet-stream";
}

// Detect clipboard type
export function detectClipType(content: unknown): Clip["type"] {
  if (typeof content === "string") {
    const text = content.trim();
    try {
      const url = new URL(text);
      if (url.protocol === "http:" || url.protocol === "https:")
        return ClipType.Url;
    } catch {}
    if (/^data:image\/(png|jpeg);base64,/.test(text)) return ClipType.Image;
    if (/^data:.*;base64,/.test(text)) return ClipType.File;
    return ClipType.Text;
  }
  if (typeof content === "object" && content && "base64" in content) {
    // File or image object
    const c = content as any;
    if (c.mime && c.mime.startsWith("image/")) return ClipType.Image;
    return ClipType.File;
  }
  return ClipType.Text;
}

// Normalize clipboard content into a Clip
export function normalizeClipboardContent(
  input: any,
  senderId: string,
  deps: { now?: () => number; makeId?: () => string } = {}
): Clip | null {
  const now = deps.now ?? Date.now;
  const makeId = deps.makeId ?? uuidv4;
  const ts = now();
  let type = detectClipType(input);
  let content = "";
  let expiresAt: number | undefined = undefined;

  if (type === ClipType.Text) {
    content = sanitizeText(typeof input === "string" ? input : String(input));
    if (!content) return null;
  } else if (type === ClipType.Url) {
    content = sanitizeText(input);
    try {
      new URL(content);
    } catch {
      return null;
    }
  } else if (type === ClipType.Image || type === ClipType.File) {
    if (typeof input === "string") {
      content = stripDataUriPrefix(input);
    } else if (input && typeof input.base64 === "string") {
      content = stripDataUriPrefix(input.base64);
    } else {
      return null;
    }
    // Optionally set expiresAt for files/images (e.g., 30 days)
    expiresAt = ts + 30 * 24 * 60 * 60 * 1000;
  }

  return {
    id: makeId(),
    type,
    content,
    timestamp: ts,
    senderId,
    ...(expiresAt ? { expiresAt } : {}),
  };
}
