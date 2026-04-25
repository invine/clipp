import type { Clip } from "../models/Clip.js";
import {
  decodeJsonMessage,
  encodeJsonMessage,
  isRecord,
  resolveSentAt,
  type ProtocolMessage,
} from "./base.js";

export const HISTORY_PROTOCOL = "/clipboard/history/1.0.0";
export const HISTORY_SYNC_MESSAGE_TYPE = "history-sync";

export type HistorySyncMessage = ProtocolMessage<
  typeof HISTORY_SYNC_MESSAGE_TYPE,
  {
    clips: Clip[];
  }
>;

export function createHistorySyncMessage(options: {
  from: string;
  clips: Clip[];
  sentAt?: number;
  now?: () => number;
}): HistorySyncMessage {
  return {
    type: HISTORY_SYNC_MESSAGE_TYPE,
    from: options.from,
    sentAt: typeof options.sentAt === "number" ? options.sentAt : (options.now ?? Date.now)(),
    payload: {
      clips: options.clips,
    },
  };
}

export function encodeHistorySyncMessage(msg: HistorySyncMessage): Uint8Array {
  return encodeJsonMessage(msg);
}

export function decodeHistorySyncMessage(data: Uint8Array, from: string): HistorySyncMessage | null {
  const parsed = decodeJsonMessage(data);
  if (!isRecord(parsed)) return null;
  if (parsed.type !== HISTORY_SYNC_MESSAGE_TYPE) return null;
  if (typeof parsed.from !== "string") return null;
  if (!isRecord(parsed.payload) || !Array.isArray(parsed.payload.clips)) return null;
  return createHistorySyncMessage({
    from,
    clips: parsed.payload.clips as Clip[],
    sentAt: resolveSentAt(parsed.sentAt),
  });
}
