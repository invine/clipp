export function toU8(chunk: any): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk && typeof chunk.subarray === "function") return chunk.subarray();
  if (chunk?.buffer && typeof chunk.byteOffset === "number" && typeof chunk.byteLength === "number") {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return new Uint8Array();
}
