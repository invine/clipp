import { validateClip, type Clip } from "../models/Clip.js";
import { peerIdFromMultihashBytes, peerIdToMultihashBytes } from "../pairing/protocol.js";

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
  const clip = message.clip;
  const payload = concatBytes([
    bytesField(1, utf8(clip.id)),
    varintField(2, clip.type === "text" ? 1n : 2n),
    bytesField(3, utf8(clip.content)),
    bytesField(4, peerIdToMultihashBytes(clip.originPeerId)),
    varintField(5, BigInt(clip.capturedAt)),
    varintField(6, BigInt(clip.shareExpiresAt)),
  ]);
  if (payload.length > maximumBytes) throw new Error("live_clip_frame_too_large");
  return concatBytes([varint(BigInt(payload.length)), payload]);
}

export function decodeLiveClipFrame(frame: Uint8Array, maximumBytes = LIVE_CLIP_MAX_FRAME_BYTES): LiveClip | null {
  const prefix = readVarint(frame, 0);
  if (!prefix || prefix.value > BigInt(maximumBytes) || prefix.value !== BigInt(frame.length - prefix.next)) return null;
  const fields = readFields(frame.slice(prefix.next), new Set([1, 2, 3, 4, 5, 6]));
  if (!fields) return null;
  const id = decodeUtf8(singleBytes(fields, 1));
  const type = singleVarint(fields, 2);
  const content = decodeUtf8(singleBytes(fields, 3));
  const origin = singleBytes(fields, 4);
  const capturedAt = safeNumber(singleVarint(fields, 5));
  const shareExpiresAt = safeNumber(singleVarint(fields, 6));
  if (!id || !content || !origin || capturedAt === null || shareExpiresAt === null) return null;
  if (type !== 1n && type !== 2n) return null;
  try {
    const clip: Clip = {
      id,
      type: type === 1n ? "text" : "url",
      content,
      originPeerId: peerIdFromMultihashBytes(origin),
      capturedAt,
      shareExpiresAt,
    };
    return validateClip(clip) ? { clip } : null;
  } catch {
    return null;
  }
}

function utf8(value: string): Uint8Array { return new TextEncoder().encode(value); }
function decodeUtf8(value: Uint8Array | null): string | null {
  if (!value) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(value); } catch { return null; }
}
function safeNumber(value: bigint | undefined): number | null {
  return value === undefined || value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}
function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concatBytes([varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value]);
}
function varintField(field: number, value: bigint): Uint8Array {
  return concatBytes([varint(BigInt(field << 3)), varint(value)]);
}
function varint(value: bigint): Uint8Array {
  if (value < 0n || value > (1n << 64n) - 1n) throw new Error("invalid_varint");
  const out: number[] = [];
  do { const byte = Number(value & 127n); value >>= 7n; out.push(value ? byte | 128 : byte); } while (value);
  return Uint8Array.from(out);
}
function readVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } | null {
  let value = 0n;
  for (let index = start, shift = 0n; index < bytes.length && index < start + 10; index += 1, shift += 7n) {
    const byte = bytes[index];
    value |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      const next = index + 1;
      return varint(value).length === next - start ? { value, next } : null;
    }
  }
  return null;
}
function readFields(bytes: Uint8Array, recognized: Set<number>): Map<number, Array<Uint8Array | bigint>> | null {
  const result = new Map<number, Array<Uint8Array | bigint>>();
  for (let offset = 0; offset < bytes.length;) {
    const key = readVarint(bytes, offset);
    if (!key || key.value === 0n || key.value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    offset = key.next;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    let value: Uint8Array | bigint;
    if (wire === 0) {
      const parsed = readVarint(bytes, offset);
      if (!parsed) return null;
      value = parsed.value;
      offset = parsed.next;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      if (!length || length.value > BigInt(bytes.length - length.next)) return null;
      const end = length.next + Number(length.value);
      value = bytes.slice(length.next, end);
      offset = end;
    } else return null;
    if (!recognized.has(field)) return null;
    result.set(field, [...(result.get(field) ?? []), value]);
  }
  return result;
}
function singleBytes(fields: Map<number, Array<Uint8Array | bigint>>, field: number): Uint8Array | null {
  const values = fields.get(field);
  return values?.length === 1 && values[0] instanceof Uint8Array ? values[0] : null;
}
function singleVarint(fields: Map<number, Array<Uint8Array | bigint>>, field: number): bigint | undefined {
  const values = fields.get(field);
  return values?.length === 1 && typeof values[0] === "bigint" ? values[0] : undefined;
}
