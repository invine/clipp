export type ProtobufField = Uint8Array | bigint;
export type ProtobufFields = Map<number, ProtobufField[]>;

const MAX_UINT64 = (1n << 64n) - 1n;

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concatBytes([varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value]);
}

export function varintField(field: number, value: bigint): Uint8Array {
  return concatBytes([varint(BigInt(field << 3)), varint(value)]);
}

export function varint(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_UINT64) throw new Error("invalid_varint");
  const out: number[] = [];
  do {
    const byte = Number(value & 127n);
    value >>= 7n;
    out.push(value ? byte | 128 : byte);
  } while (value);
  return Uint8Array.from(out);
}

export function readVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } | null {
  let value = 0n;
  for (let index = start, shift = 0n; index < bytes.length && index < start + 10; index += 1, shift += 7n) {
    const byte = bytes[index];
    value |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      const next = index + 1;
      if (value > MAX_UINT64) return null;
      return varint(value).length === next - start ? { value, next } : null;
    }
  }
  return null;
}

export function readFields(bytes: Uint8Array, recognized: Map<number, number>): ProtobufFields | null {
  const result: ProtobufFields = new Map();
  for (let offset = 0; offset < bytes.length;) {
    const key = readVarint(bytes, offset);
    if (!key || key.value === 0n || key.value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    offset = key.next;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    const recognizedWire = recognized.get(field);
    if (recognizedWire !== undefined && wire !== recognizedWire) return null;
    let value: ProtobufField;
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
    } else {
      return null;
    }
    if (recognizedWire !== undefined) {
      const values = result.get(field);
      if (values) values.push(value);
      else result.set(field, [value]);
    }
  }
  return result;
}

export function singleBytes(fields: ProtobufFields, field: number): Uint8Array | null {
  const values = fields.get(field);
  return values?.length === 1 && values[0] instanceof Uint8Array ? values[0] : null;
}

export function singleVarint(fields: ProtobufFields, field: number): bigint | undefined {
  const values = fields.get(field);
  return values?.length === 1 && typeof values[0] === "bigint" ? values[0] : undefined;
}

export function optionalSingleBytes(fields: ProtobufFields, field: number): Uint8Array | null | undefined {
  const values = fields.get(field);
  if (!values) return null;
  return values.length === 1 && values[0] instanceof Uint8Array ? values[0] : undefined;
}
