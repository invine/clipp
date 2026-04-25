import type { Clip } from "../models/Clip.js";
import {
  decodeJsonMessage,
  encodeJsonMessage,
  isRecord,
  resolveSentAt,
  type ProtocolMessage,
} from "./base.js";

export const CLIP_PROTOCOL = "/clipboard/1.0.0";
export const CLIP_MESSAGE_TYPE = "clip";

export type ClipMessage = ProtocolMessage<
  typeof CLIP_MESSAGE_TYPE,
  {
    clip: Clip;
  }
>;

export function createClipMessage(options: {
  from: string;
  clip: Clip;
  sentAt?: number;
  now?: () => number;
}): ClipMessage {
  return {
    type: CLIP_MESSAGE_TYPE,
    from: options.from,
    sentAt: typeof options.sentAt === "number" ? options.sentAt : (options.now ?? Date.now)(),
    payload: {
      clip: options.clip,
    },
  };
}

function fromWireClipMessage(parsed: Record<string, any>, from: string): ClipMessage | null {
  if (parsed.type !== CLIP_MESSAGE_TYPE) return null;
  if (typeof parsed.from !== "string") return null;
  if (!isRecord(parsed.payload) || parsed.payload.clip == null) return null;
  return createClipMessage({
    from,
    clip: parsed.payload.clip as Clip,
    sentAt: resolveSentAt(parsed.sentAt),
  });
}

export function encodeClipMessage(msg: ClipMessage): Uint8Array {
  return encodeJsonMessage(msg);
}

export function decodeClipMessage(data: Uint8Array, from: string): ClipMessage | null {
  const parsed = decodeJsonMessage(data);
  if (!isRecord(parsed)) return null;
  return fromWireClipMessage(parsed, from);
}
