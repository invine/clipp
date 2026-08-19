import { validateClip, type Clip } from "../models/Clip.js";
import { peerIdFromMultihashBytes, peerIdToMultihashBytes } from "../pairing/protocol.js";
import {
  bytesField,
  concatBytes,
  optionalSingleBytes,
  readFields,
  singleBytes,
  singleVarint,
  varintField,
} from "./protobuf.js";

export function encodeClip(clip: Clip): Uint8Array {
  if (!validateClip(clip)) throw new Error("invalid_clip");
  return concatBytes([
    bytesField(1, uuidToBytes(clip.id)),
    bytesField(2, peerIdToMultihashBytes(clip.originPeerId)),
    varintField(3, BigInt(clip.capturedAt)),
    varintField(4, BigInt(clip.shareExpiresAt)),
    bytesField(clip.type === "text" ? 5 : 6, new TextEncoder().encode(clip.content)),
  ]);
}

export function decodeClip(data: Uint8Array): Clip | null {
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
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    return null;
  }
}

function safeNumber(value: bigint | undefined): number | null {
  return value === undefined || value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}
