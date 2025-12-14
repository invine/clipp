import type { Clip } from "../models/Clip.js";

export const HISTORY_PROTOCOL = "/clipboard/history/1.0.0";

export type HistorySyncMessage = {
  type: "sync-history";
  from: string;
  payload: Clip[];
  sentAt: number;
};

export function encodeHistorySyncMessage(msg: HistorySyncMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeHistorySyncMessage(data: Uint8Array, from: string): HistorySyncMessage | null {
  try {
    const raw = new TextDecoder().decode(data);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.type !== "sync-history") return null;
    if (!Array.isArray(parsed.payload)) return null;
    const sentAt = typeof parsed.sentAt === "number" ? parsed.sentAt : Date.now();
    return { type: "sync-history", from, payload: parsed.payload as Clip[], sentAt };
  } catch {
    return null;
  }
}

