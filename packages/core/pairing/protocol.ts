
export const PAIRING_PROTOCOL = "/clipp/pairing/1.0.0";
export const PAIRING_MAX_FRAME_BYTES = 16 * 1024;
export const TRUST_REQUEST_DOMAIN = new TextEncoder().encode("clipp:trust-request:v1\0");
export const DEFAULT_TRUST_REQUEST_VALIDITY_MS = 10 * 60 * 1000;
export const DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS = 2 * 60 * 1000;

export type TrustRequestPayload = {
  initiatorPeerId: string;
  targetPeerId: string;
  deviceName: string;
  nameRevision: bigint;
  issuedAtUnixMs: bigint;
};

export type TrustRequestEnvelope = { signedPayload: Uint8Array; signature: Uint8Array };
export type TrustResponse = {
  decision: "accepted" | "rejected";
  requestEnvelope: Uint8Array;
  responderDeviceName: string;
  responderNameRevision: bigint;
};

export function encodeTrustRequestPayload(payload: TrustRequestPayload): Uint8Array {
  return concatPairingBytes(
    bytesField(1, peerIdBytes(payload.initiatorPeerId)),
    bytesField(2, peerIdBytes(payload.targetPeerId)),
    bytesField(3, new TextEncoder().encode(payload.deviceName)),
    varintField(4, payload.nameRevision),
    varintField(5, payload.issuedAtUnixMs)
  );
}

export function decodeTrustRequestPayload(bytes: Uint8Array): TrustRequestPayload | null {
  const fields = decodeFields(bytes, new Set([1, 2, 3, 4, 5]));
  if (!fields) return null;
  const initiator = requiredBytes(fields, 1);
  const target = requiredBytes(fields, 2);
  const name = requiredBytes(fields, 3);
  const revision = requiredVarint(fields, 4);
  const issuedAt = requiredVarint(fields, 5);
  if (!initiator || !target || !name || revision === null || issuedAt === null) return null;
  try {
    return {
      initiatorPeerId: peerIdFromBytes(initiator),
      targetPeerId: peerIdFromBytes(target),
      deviceName: decodePresentationName(name),
      nameRevision: revision,
      issuedAtUnixMs: issuedAt,
    };
  } catch {
    return null;
  }
}

export function encodeTrustRequestEnvelope(envelope: TrustRequestEnvelope): Uint8Array {
  return concatPairingBytes(bytesField(1, envelope.signedPayload), bytesField(2, envelope.signature));
}

export function decodeTrustRequestEnvelope(bytes: Uint8Array): TrustRequestEnvelope | null {
  const fields = decodeFields(bytes, new Set([1, 2]));
  if (!fields) return null;
  const signedPayload = requiredBytes(fields, 1);
  const signature = requiredBytes(fields, 2);
  return signedPayload && signature ? { signedPayload, signature } : null;
}

export function encodePairingFrame(message: { kind: "request"; envelope: Uint8Array } | { kind: "response"; response: TrustResponse }): Uint8Array {
  const payload = message.kind === "request"
    ? bytesField(1, message.envelope)
    : bytesField(2, encodeTrustResponse(message.response));
  if (payload.length > PAIRING_MAX_FRAME_BYTES) throw new Error("pairing_frame_too_large");
  return concatPairingBytes(encodeVarint(BigInt(payload.length)), payload);
}

export function decodePairingFrame(frame: Uint8Array, maximumBytes = PAIRING_MAX_FRAME_BYTES): { kind: "request"; envelope: Uint8Array } | { kind: "response"; response: TrustResponse } | null {
  const result = inspectPairingFrame(frame, maximumBytes);
  return result.ok ? result.message : null;
}

export type PairingFrameInspection =
  | { ok: true; message: { kind: "request"; envelope: Uint8Array } | { kind: "response"; response: TrustResponse } }
  | { ok: false; reason: "invalid_framing" | "oversized_frame" | "protobuf_decoding_failed" };

/** Decode a pairing stream while preserving a privacy-safe rejection category. */
export function inspectPairingFrame(frame: Uint8Array, maximumBytes = PAIRING_MAX_FRAME_BYTES): PairingFrameInspection {
  const prefix = decodeVarint(frame, 0);
  if (!prefix || prefix.value !== BigInt(frame.length - prefix.next)) return { ok: false, reason: "invalid_framing" };
  if (prefix.value > BigInt(maximumBytes)) return { ok: false, reason: "oversized_frame" };
  const fields = decodeFields(frame.slice(prefix.next), new Set([1, 2]));
  if (!fields) return { ok: false, reason: "protobuf_decoding_failed" };
  const request = optionalBytes(fields, 1);
  const response = optionalBytes(fields, 2);
  if (!!request === !!response) return { ok: false, reason: "protobuf_decoding_failed" };
  if (request) return { ok: true, message: { kind: "request", envelope: request } };
  const parsed = response && decodeTrustResponse(response);
  return parsed
    ? { ok: true, message: { kind: "response", response: parsed } }
    : { ok: false, reason: "protobuf_decoding_failed" };
}

export function validateTrustRequestTime(payload: TrustRequestPayload, now: number, options: { validityWindowMs?: number; clockSkewAllowanceMs?: number } = {}): boolean {
  const validity = BigInt(options.validityWindowMs ?? DEFAULT_TRUST_REQUEST_VALIDITY_MS);
  const skew = BigInt(options.clockSkewAllowanceMs ?? DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS);
  const current = BigInt(now);
  return payload.issuedAtUnixMs <= current + skew && current <= payload.issuedAtUnixMs + validity + skew;
}

/** Verify a v2 request against the public key embedded in its authenticated Peer ID. */
export async function verifyPairingTrustRequestSignature(signedPayload: Uint8Array, signature: Uint8Array, peerId: string): Promise<boolean> {
  try {
    const { peerIdFromString } = await import("@libp2p/peer-id");
    const key = (peerIdFromString(peerId) as any).publicKey;
    if (!key || typeof key.verify !== "function") return false;
    return await key.verify(concatPairingBytes(TRUST_REQUEST_DOMAIN, signedPayload), signature);
  } catch {
    return false;
  }
}

function encodeTrustResponse(response: TrustResponse): Uint8Array {
  return concatPairingBytes(varintField(1, response.decision === "accepted" ? 1n : 2n), bytesField(2, response.requestEnvelope), bytesField(3, new TextEncoder().encode(response.responderDeviceName)), varintField(4, response.responderNameRevision));
}

function decodeTrustResponse(bytes: Uint8Array): TrustResponse | null {
  const fields = decodeFields(bytes, new Set([1, 2, 3, 4]));
  if (!fields) return null;
  const decision = requiredVarint(fields, 1);
  const requestEnvelope = requiredBytes(fields, 2);
  const name = requiredBytes(fields, 3);
  const revision = requiredVarint(fields, 4);
  if ((decision !== 1n && decision !== 2n) || !requestEnvelope || !name || revision === null) return null;
  return { decision: decision === 1n ? "accepted" : "rejected", requestEnvelope, responderDeviceName: decodePresentationName(name), responderNameRevision: revision };
}

// Peer IDs are protobuf multihash bytes.  The libp2p textual form is base58btc;
// keeping this tiny conversion local makes the wire codec usable in browser
// runtimes without importing libp2p's Node-oriented peer-id implementation.
/** Convert libp2p's canonical base58 peer-id text to its multihash bytes. */
export function peerIdToMultihashBytes(value: string): Uint8Array {
  const decoded = base58Decode(value);
  validateMultihashBytes(decoded);
  if (base58Encode(decoded) !== value) throw new Error("invalid_peer_id");
  return decoded;
}
/** Convert canonical peer-id multihash bytes back to base58 text. */
export function peerIdFromMultihashBytes(value: Uint8Array): string {
  validateMultihashBytes(value);
  const text = base58Encode(value);
  // Round-trip to reject non-canonical encodings (for example a leading zero).
  const canonical = base58Decode(text);
  if (canonical.length !== value.length || canonical.some((byte, index) => byte !== value[index])) throw new Error("invalid_peer_id");
  return text;
}
function validateMultihashBytes(value: Uint8Array): void {
  const code = decodeVarint(value, 0);
  if (!code || code.value < 0n || encodeVarint(code.value).length !== code.next) throw new Error("invalid_peer_id");
  const length = decodeVarint(value, code.next);
  if (!length || length.value <= 0n || encodeVarint(length.value).length !== length.next - code.next) throw new Error("invalid_peer_id");
  if (length.value !== BigInt(value.length - length.next)) throw new Error("invalid_peer_id");
  // Device Network Sync v1 identities are Ed25519 Peer IDs: an identity
  // multihash containing the canonical protobuf-encoded 32-byte public key.
  const digest = value.slice(length.next);
  if (code.value !== 0n || digest.length !== 36 || digest[0] !== 0x08 || digest[1] !== 0x01 || digest[2] !== 0x12 || digest[3] !== 0x20) throw new Error("invalid_peer_id");
}
const peerIdBytes = peerIdToMultihashBytes;
const peerIdFromBytes = peerIdFromMultihashBytes;
const MAX_UINT64 = (1n << 64n) - 1n;
function varintField(field: number, value: bigint): Uint8Array { if (value > MAX_UINT64) throw new Error("invalid_uint64"); return concatPairingBytes(encodeVarint(BigInt(field << 3)), encodeVarint(value)); }
function bytesField(field: number, value: Uint8Array): Uint8Array { return concatPairingBytes(encodeVarint(BigInt((field << 3) | 2)), encodeVarint(BigInt(value.length)), value); }
function encodeVarint(value: bigint): Uint8Array { if (value < 0n) throw new Error("invalid_varint"); const out: number[] = []; do { const byte = Number(value & 127n); value >>= 7n; out.push(value ? byte | 128 : byte); } while (value); return Uint8Array.from(out); }
function decodeVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } | null { let value = 0n; for (let index = start, shift = 0n; index < bytes.length && index < start + 10; index += 1, shift += 7n) { const byte = bytes[index]; value |= BigInt(byte & 127) << shift; if ((byte & 128) === 0) { const next = index + 1; return encodeVarint(value).length === next - start ? { value, next } : null; } } return null; }
type Field = { wire: number; value: Uint8Array | bigint };
function decodeFields(bytes: Uint8Array, recognizedFields: Set<number>): Map<number, Field> | null { const result = new Map<number, Field>(); for (let offset = 0; offset < bytes.length;) { const key = decodeVarint(bytes, offset); if (!key || key.value > BigInt(Number.MAX_SAFE_INTEGER)) return null; offset = key.next; const field = Number(key.value >> 3n); const wire = Number(key.value & 7n); if (field === 0) return null; const recognized = recognizedFields.has(field); if (recognized && result.has(field)) return null; if (wire === 0) { const value = decodeVarint(bytes, offset); if (!value) return null; if (recognized) result.set(field, { wire, value: value.value }); offset = value.next; } else if (wire === 1) { if (offset + 8 > bytes.length) return null; offset += 8; } else if (wire === 2) { const length = decodeVarint(bytes, offset); if (!length || length.value > BigInt(bytes.length - length.next)) return null; const end = length.next + Number(length.value); if (recognized) result.set(field, { wire, value: bytes.slice(length.next, end) }); offset = end; } else if (wire === 5) { if (offset + 4 > bytes.length) return null; offset += 4; } else return null; } return result; }
function requiredBytes(fields: Map<number, Field>, field: number): Uint8Array | null { return optionalBytes(fields, field); }
function optionalBytes(fields: Map<number, Field>, field: number): Uint8Array | null { const value = fields.get(field); return value?.wire === 2 && value.value instanceof Uint8Array ? value.value : null; }
function requiredVarint(fields: Map<number, Field>, field: number): bigint | null { const value = fields.get(field); return value?.wire === 0 && typeof value.value === "bigint" && value.value <= MAX_UINT64 ? value.value : null; }
export function concatPairingBytes(...parts: Uint8Array[]): Uint8Array { const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function decodePresentationName(value: Uint8Array): string { try { return new TextDecoder("utf-8", { fatal: true }).decode(value); } catch { return ""; } }
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) throw new Error("invalid_base58");
    let carry = digit;
    for (let index = bytes.length - 1; index >= 0; index -= 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) { bytes.unshift(carry & 255); carry >>= 8; }
  }
  for (const character of value) { if (character !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}
function base58Encode(value: Uint8Array): string {
  if (!value.length) throw new Error("invalid_peer_id");
  const digits = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.unshift(carry % 58); carry = Math.floor(carry / 58); }
  }
  let leading = 0;
  while (leading < value.length && value[leading] === 0) leading += 1;
  return "1".repeat(leading) + digits.map((digit) => BASE58[digit]).join("");
}
