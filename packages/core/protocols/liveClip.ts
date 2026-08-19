import { validateClip, type Clip } from "../models/Clip.js";
import { decodeClip, encodeClip } from "./clipCodec.js";
import { bytesField, concatBytes, readFields, readVarint, singleBytes, varint } from "./protobuf.js";

/** One authenticated, short-lived stream transports exactly one of these frames. */
export const LIVE_CLIP_PROTOCOL = "/clipp/clip/1.0.0";
export const LIVE_CLIP_MAX_FRAME_BYTES = 256 * 1024;

export type LiveClip = { clip: Clip };

/**
 * Encodes the wire-only Clip.  The immediate sender is deliberately absent:
 * libp2p supplies that identity from the authenticated connection.
 */
export function encodeLiveClipFrame(message: LiveClip, maximumBytes = LIVE_CLIP_MAX_FRAME_BYTES): Uint8Array {
  if (!validateClip(message.clip)) throw new Error("invalid_live_clip");
  const payload = bytesField(1, encodeClip(message.clip));
  if (payload.length > maximumBytes) throw new Error("live_clip_frame_too_large");
  return concatBytes([varint(BigInt(payload.length)), payload]);
}

export function decodeLiveClipFrame(frame: Uint8Array, maximumBytes = LIVE_CLIP_MAX_FRAME_BYTES): LiveClip | null {
  const prefix = readVarint(frame, 0);
  if (!prefix || prefix.value > BigInt(maximumBytes) || prefix.value !== BigInt(frame.length - prefix.next)) return null;
  const liveFields = readFields(frame.slice(prefix.next), new Map([[1, 2]]));
  const encodedClip = liveFields && singleBytes(liveFields, 1);
  if (!encodedClip) return null;

  const clip = decodeClip(encodedClip);
  return clip ? { clip } : null;
}
