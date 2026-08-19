import { validateClip, type Clip } from "../models/Clip.js";
import { peerIdFromMultihashBytes, peerIdToMultihashBytes } from "../pairing/protocol.js";

/** One stream contains zero or more length-prefixed HistoryBatch frames, then EOF. */
export const HISTORY_PROTOCOL = "/clipp/history/1.0.0";
export const HISTORY_MAX_FRAME_BYTES = 256 * 1024;

export type HistoryBatch = { clips: Clip[] };

export function encodeHistoryBatchFrame(batch: HistoryBatch, maximumBytes = HISTORY_MAX_FRAME_BYTES): Uint8Array {
  if (batch.clips.length === 0) throw new Error("empty_history_batch");
  const payload = concatBytes(batch.clips.map((clip) => bytesField(1, encodeClip(clip))));
  if (payload.length > maximumBytes) throw new Error("history_batch_too_large");
  return concatBytes([varint(BigInt(payload.length)), payload]);
}

/**
 * Decodes a complete history stream. A malformed frame fails the stream, while
 * malformed Clips inside a well-framed batch are omitted independently.
 */
export function decodeHistorySnapshot(data: Uint8Array, maximumBytes = HISTORY_MAX_FRAME_BYTES): HistoryBatch[] | null {
  try {
    return Array.from(iterateHistorySnapshot(data, maximumBytes));
  } catch {
    return null;
  }
}

/** Iteration yields complete earlier batches before a later framing failure. */
export function *iterateHistorySnapshot(data: Uint8Array, maximumBytes = HISTORY_MAX_FRAME_BYTES): Generator<HistoryBatch> {
  for (let offset = 0; offset < data.length;) {
    const prefix = readVarint(data, offset);
    if (!prefix || prefix.value === 0n || prefix.value > BigInt(maximumBytes)) throw new Error("invalid_history_framing");
    const end = prefix.next + Number(prefix.value);
    if (end > data.length) throw new Error("invalid_history_framing");
    const batch = decodeHistoryBatch(data.slice(prefix.next, end));
    if (!batch) throw new Error("invalid_history_framing");
    yield batch;
    offset = end;
  }
}

function encodeClip(clip: Clip): Uint8Array {
  if (!validateClip(clip)) throw new Error("invalid_history_clip");
  return concatBytes([
    bytesField(1, uuidToBytes(clip.id)),
    bytesField(2, peerIdToMultihashBytes(clip.originPeerId)),
    varintField(3, BigInt(clip.capturedAt)),
    varintField(4, BigInt(clip.shareExpiresAt)),
    bytesField(clip.type === "text" ? 5 : 6, utf8(clip.content)),
  ]);
}

function decodeHistoryBatch(data: Uint8Array): HistoryBatch | null {
  const fields = readFields(data, new Map([[1, 2]]));
  if (!fields) return null;
  const clips = (fields.get(1) ?? [])
    .filter((value): value is Uint8Array => value instanceof Uint8Array)
    .map(decodeClip)
    .filter((clip): clip is Clip => clip !== null);
  return { clips };
}

function decodeClip(data: Uint8Array): Clip | null {
  const fields = readFields(data, new Map([[1, 2], [2, 2], [3, 0], [4, 0], [5, 2], [6, 2]]));
  if (!fields) return null;
  const idBytes = singleBytes(fields, 1);
  const origin = singleBytes(fields, 2);
  const capturedAt = safeNumber(singleVarint(fields, 3));
  const shareExpiresAt = safeNumber(singleVarint(fields, 4));
  const text = optionalSingleBytes(fields, 5);
  const url = optionalSingleBytes(fields, 6);
  if (!idBytes || !origin || capturedAt === null || shareExpiresAt === null || (text === null) === (url === null)) return null;
  try {
    const content = decodeUtf8((text ?? url)!);
    if (content === null) return null;
    const clip: Clip = {
      id: bytesToUuid(idBytes),
      type: text ? "text" : "url",
      content,
      originPeerId: peerIdFromMultihashBytes(origin),
      capturedAt,
      shareExpiresAt,
    };
    return validateClip(clip) ? clip : null;
  } catch {
    return null;
  }
}

function utf8(value: string): Uint8Array { return new TextEncoder().encode(value); }
function uuidToBytes(value: string): Uint8Array {
  const hex = value.replace(/-/g, "");
  if (hex.length !== 32) throw new Error("invalid_clip_id");
  return Uint8Array.from({ length: 16 }, (_unused, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}
function bytesToUuid(value: Uint8Array): string {
  if (value.length !== 16) throw new Error("invalid_clip_id");
  const hex = Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
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
function readFields(bytes: Uint8Array, recognized: Map<number, number>): Map<number, Array<Uint8Array | bigint>> | null {
  const result = new Map<number, Array<Uint8Array | bigint>>();
  for (let offset = 0; offset < bytes.length;) {
    const key = readVarint(bytes, offset);
    if (!key || key.value === 0n || key.value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    offset = key.next;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    const recognizedWire = recognized.get(field);
    if (recognizedWire !== undefined && wire !== recognizedWire) return null;
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
    } else if (wire === 1) {
      if (offset + 8 > bytes.length) return null;
      value = bytes.slice(offset, offset + 8);
      offset += 8;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length) return null;
      value = bytes.slice(offset, offset + 4);
      offset += 4;
    } else return null;
    if (recognizedWire !== undefined) result.set(field, [...(result.get(field) ?? []), value]);
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
function optionalSingleBytes(fields: Map<number, Array<Uint8Array | bigint>>, field: number): Uint8Array | null | undefined {
  const values = fields.get(field);
  if (!values) return null;
  return values.length === 1 && values[0] instanceof Uint8Array ? values[0] : undefined;
}
