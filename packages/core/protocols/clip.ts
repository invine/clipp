import type { Clip } from "../models/Clip.js";

/**
 * Clipboard content sync protocol (legacy value kept for compatibility).
 */
export const CLIP_PROTOCOL = "/clipboard/1.0.0";

export type ClipMessage = {
  type: "CLIP";
  from: string;
  clip: Clip;
  sentAt: number;
};

export function encodeClipMessage(msg: ClipMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeClipMessage(data: Uint8Array, from: string): ClipMessage | null {
  try {
    const raw = new TextDecoder().decode(data);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.type !== "CLIP") return null;
    if (parsed.clip == null) return null;
    const sentAt = typeof parsed.sentAt === "number" ? parsed.sentAt : Date.now();
    return { type: "CLIP", from, clip: parsed.clip as Clip, sentAt };
  } catch {
    return null;
  }
}

