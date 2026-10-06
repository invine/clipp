import { deflate, Inflate } from "pako";

const BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const RAW_PREFIX = "CLIPP:PAIR:B1:";
const DEFLATE_PREFIX = "CLIPP:PAIR:Z1:";

/** Wrap exact protobuf bytes; never rewrite the signed envelope inside them. */
export function encodePairingQrPayload(payload: Uint8Array): string {
  const compressed = deflate(payload, { level: 9 });
  const useCompression = compressed.length < payload.length;
  return `${useCompression ? DEFLATE_PREFIX : RAW_PREFIX}${encodeBase45(useCompression ? compressed : payload)}:`;
}

export function decodePairingQrPayload(
  raw: string,
  maximumBytes: number
): Uint8Array | null {
  const compressed = raw.startsWith(DEFLATE_PREFIX);
  const prefix = compressed ? DEFLATE_PREFIX : RAW_PREFIX;
  if (!raw.startsWith(prefix) || !raw.endsWith(":")) return null;
  // Bound even compressed input before slicing or allocating. The QR encoder
  // only uses compressed bytes when they are smaller than the original payload.
  const encodedLength = raw.length - prefix.length - 1;
  if (encodedLength <= 0 || encodedLength > Math.ceil((maximumBytes * 3) / 2))
    return null;
  const bytes = decodeBase45(raw.slice(prefix.length, -1));
  if (!bytes) return null;
  if (!compressed) return bytes.length <= maximumBytes ? bytes : null;

  try {
    // Pako's streaming output is bounded independently of the input's claimed
    // compression ratio. Abort in onData instead of inflating a bomb first.
    const output = new Uint8Array(maximumBytes);
    const inflater = new Inflate({
      windowBits: 15,
      chunkSize: Math.min(1024, maximumBytes + 1),
    });
    let length = 0;
    let complete = false;
    inflater.onStart = (stream) => {
      inflater.onEnd = (status) => {
        complete = status === 0 && stream.avail_in === 0;
      };
    };
    inflater.onData = (chunk) => {
      if (length + chunk.length > maximumBytes)
        throw new Error("pairing_target_too_large");
      output.set(chunk, length);
      length += chunk.length;
    };
    if (!inflater.push(bytes, true) || !complete) return null;
    return output.slice(0, length);
  } catch {
    return null;
  }
}

function encodeBase45(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 2) {
    const pair = index + 1 < bytes.length;
    let value = pair ? bytes[index] * 256 + bytes[index + 1] : bytes[index];
    encoded += BASE45_ALPHABET[value % 45];
    value = Math.floor(value / 45);
    encoded += BASE45_ALPHABET[value % 45];
    if (pair) encoded += BASE45_ALPHABET[Math.floor(value / 45)];
  }
  return encoded;
}

function decodeBase45(encoded: string): Uint8Array | null {
  if (encoded.length % 3 === 1) return null;
  const bytes = new Uint8Array(Math.floor((encoded.length * 2) / 3));
  let offset = 0;
  for (let index = 0; index < encoded.length; index += 3) {
    const pair = index + 2 < encoded.length;
    const first = BASE45_ALPHABET.indexOf(encoded[index]);
    const second = BASE45_ALPHABET.indexOf(encoded[index + 1]);
    const third = pair ? BASE45_ALPHABET.indexOf(encoded[index + 2]) : 0;
    if (first < 0 || second < 0 || third < 0) return null;
    const value = first + second * 45 + third * 2025;
    if (value > (pair ? 65535 : 255)) return null;
    if (pair) bytes[offset++] = Math.floor(value / 256);
    bytes[offset++] = value % 256;
  }
  return bytes;
}
