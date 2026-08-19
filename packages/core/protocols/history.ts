import { validateClip, type Clip } from "../models/Clip.js";
import { decodeClip, encodeClip } from "./clipCodec.js";
import { bytesField, concatBytes, readFields, readVarint, singleBytes, varint } from "./protobuf.js";

/** One stream contains zero or more length-prefixed HistoryFrame batch bodies, then EOF. */
export const HISTORY_PROTOCOL = "/clipp/history/1.0.0";
export const HISTORY_MAX_FRAME_BYTES = 256 * 1024;

export type HistoryBatch = { clips: Clip[] };

export function encodeHistoryBatchFrame(batch: HistoryBatch, maximumBytes = HISTORY_MAX_FRAME_BYTES): Uint8Array {
  if (batch.clips.length === 0) throw new Error("empty_history_batch");
  if (!batch.clips.every((clip) => validateClip(clip))) throw new Error("invalid_history_clip");
  const encodedBatch = concatBytes(batch.clips.map((clip) => bytesField(1, encodeClip(clip))));
  const payload = bytesField(1, encodedBatch);
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
  const decoder = new HistorySnapshotDecoder(maximumBytes);
  yield *decoder.push(data);
  decoder.finish();
}

/** Decodes bounded History Batch frames as chunks arrive on one snapshot stream. */
export async function *readHistorySnapshot(
  chunks: AsyncIterable<Uint8Array>,
  maximumBytes = HISTORY_MAX_FRAME_BYTES,
): AsyncGenerator<HistoryBatch> {
  const decoder = new HistorySnapshotDecoder(maximumBytes);
  for await (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) throw new Error("invalid_history_framing");
    for (const batch of decoder.push(chunk)) yield batch;
  }
  decoder.finish();
}

class HistorySnapshotDecoder {
  private readonly prefix: number[] = [];
  private payload: Uint8Array | null = null;
  private payloadOffset = 0;

  constructor(private readonly maximumBytes: number) {}

  *push(chunk: Uint8Array): Generator<HistoryBatch> {
    for (const byte of chunk) {
      if (!this.payload) {
        this.prefix.push(byte);
        if (this.prefix.length > 10) throw new Error("invalid_history_framing");
        if ((byte & 0x80) !== 0) continue;
        const prefix = readVarint(Uint8Array.from(this.prefix), 0);
        if (!prefix || prefix.value === 0n || prefix.value > BigInt(this.maximumBytes)) {
          throw new Error("invalid_history_framing");
        }
        this.payload = new Uint8Array(Number(prefix.value));
        this.payloadOffset = 0;
        continue;
      }

      this.payload[this.payloadOffset] = byte;
      this.payloadOffset += 1;
      if (this.payloadOffset !== this.payload.length) continue;
      const batch = decodeHistoryFrame(this.payload);
      this.prefix.length = 0;
      this.payload = null;
      this.payloadOffset = 0;
      if (!batch) throw new Error("invalid_history_framing");
      yield batch;
    }
  }

  finish(): void {
    if (this.prefix.length > 0 || this.payload) throw new Error("invalid_history_framing");
  }
}

function decodeHistoryFrame(data: Uint8Array): HistoryBatch | null {
  const historyFrame = readFields(data, new Map([[1, 2], [2, 2]]));
  const encodedBatch = historyFrame && singleBytes(historyFrame, 1);
  if (!encodedBatch || historyFrame!.has(2)) return null;
  return decodeHistoryBatch(encodedBatch);
}

function decodeHistoryBatch(data: Uint8Array): HistoryBatch | null {
  const fields = readFields(data, new Map([[1, 2]]));
  if (!fields) return null;
  const encodedClips = fields.get(1) ?? [];
  if (encodedClips.length === 0) return null;
  const clips = encodedClips
    .filter((value): value is Uint8Array => value instanceof Uint8Array)
    .map(decodeClip)
    .filter((clip): clip is Clip => clip !== null);
  return { clips };
}
