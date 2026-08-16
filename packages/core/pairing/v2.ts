import { peerIdFromMultihashBytes, peerIdToMultihashBytes } from "./protocol";

export const PAIRING_TARGET_PREFIX = "clipp:pair:";
export const PAIRING_TARGET_VERSION = 2;
export const PAIRING_TARGET_MAX_BYTES = 16 * 1024;

export type PairingTarget = {
  version: typeof PAIRING_TARGET_VERSION;
  targetPeerId: string;
  signedPeerRecord: Uint8Array;
  deviceNameHint?: string;
};

type PairingTargetInput = Omit<PairingTarget, "version">;

/**
 * Encodes the public bootstrap data used to contact a pairing target.  The
 * signed peer record is intentionally opaque here: its signature is verified
 * by the networking adapter before it is imported as reachability information.
 */
export function encodePairingTarget(target: PairingTargetInput, maximumBytes = PAIRING_TARGET_MAX_BYTES): string {
  const deviceNameHint = target.deviceNameHint === undefined ? undefined : normalizeDeviceName(target.deviceNameHint);
  const payload = concat(
    fieldVarint(1, PAIRING_TARGET_VERSION),
    fieldBytes(2, peerIdToMultihashBytes(target.targetPeerId)),
    fieldBytes(3, target.signedPeerRecord),
    deviceNameHint === undefined ? new Uint8Array() : fieldBytes(4, utf8(deviceNameHint))
  );
  if (payload.length > maximumBytes) throw new Error("pairing_target_too_large");
  return `${PAIRING_TARGET_PREFIX}${toBase64Url(payload)}`;
}

export function decodePairingTarget(raw: string, maximumBytes = PAIRING_TARGET_MAX_BYTES): PairingTarget | null {
  if (!raw.startsWith(PAIRING_TARGET_PREFIX)) return null;
  const encoded = raw.slice(PAIRING_TARGET_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  // Base64URL can expand by no more than 4/3. Reject before allocating the
  // decoded buffer, which keeps oversized QR input bounded at the boundary.
  if (encoded.length > Math.ceil(maximumBytes * 4 / 3)) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes || bytes.length > maximumBytes) return null;
  if (toBase64Url(bytes) !== encoded) return null;

  let version: number | undefined;
  let targetPeerId: string | undefined;
  let signedPeerRecord: Uint8Array | undefined;
  let deviceNameHint: string | undefined;
  let deviceNameHintSeen = false;
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (!key) return null;
    offset = key.next;
    const field = key.value >>> 3;
    const wire = key.value & 7;
    if (field === 1 && wire === 0) {
      const value = readVarint(bytes, offset);
      if (!value || version !== undefined) return null;
      version = value.value;
      offset = value.next;
    } else if ((field === 2 || field === 3 || field === 4) && wire === 2) {
      const value = readLengthDelimited(bytes, offset);
      if (!value) return null;
      offset = value.next;
      if (field === 2) {
        if (targetPeerId !== undefined) return null;
        try {
          targetPeerId = peerIdFromMultihashBytes(value.value);
        } catch {
          return null;
        }
      } else if (field === 3) {
        if (signedPeerRecord !== undefined) return null;
        signedPeerRecord = value.value;
      } else {
        if (deviceNameHintSeen) return null;
        deviceNameHintSeen = true;
        try {
          deviceNameHint = normalizeDeviceName(decodeUtf8(value.value));
        } catch {
          deviceNameHint = undefined;
        }
      }
    } else {
      const next = skipField(bytes, offset, wire);
      if (next === null) return null;
      offset = next;
    }
  }
  if (version !== PAIRING_TARGET_VERSION || !targetPeerId || !signedPeerRecord?.length) return null;
  return { version, targetPeerId, signedPeerRecord, ...(deviceNameHint ? { deviceNameHint } : {}) };
}

/** Invalid presentation metadata never invalidates an otherwise valid target. */
function normalizeDeviceName(value: string): string | undefined {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > 64 || /[\u0000-\u001f\u007f]/.test(normalized)) return undefined;
  return normalized;
}

function fieldVarint(field: number, value: number): Uint8Array {
  return concat(writeVarint((field << 3) | 0), writeVarint(value));
}

function fieldBytes(field: number, value: Uint8Array): Uint8Array {
  return concat(writeVarint((field << 3) | 2), writeVarint(value.length), value);
}

function writeVarint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_varint");
  const out: number[] = [];
  while (value > 127) {
    out.push((value & 127) | 128);
    value = Math.floor(value / 128);
  }
  out.push(value);
  return Uint8Array.from(out);
}

function readVarint(bytes: Uint8Array, start: number): { value: number; next: number } | null {
  let value = 0;
  let factor = 1;
  for (let index = start; index < bytes.length && index < start + 10; index += 1) {
    const byte = bytes[index];
    value += (byte & 127) * factor;
    if (value > Number.MAX_SAFE_INTEGER) return null;
    if ((byte & 128) === 0) {
      const next = index + 1;
      return writeVarint(value).length === next - start ? { value, next } : null;
    }
    factor *= 128;
  }
  return null;
}

function readLengthDelimited(bytes: Uint8Array, start: number): { value: Uint8Array; next: number } | null {
  const length = readVarint(bytes, start);
  if (!length || length.value > bytes.length - length.next) return null;
  return { value: bytes.slice(length.next, length.next + length.value), next: length.next + length.value };
}

function skipField(bytes: Uint8Array, offset: number, wire: number): number | null {
  if (wire === 0) return readVarint(bytes, offset)?.next ?? null;
  if (wire === 1) return offset + 8 <= bytes.length ? offset + 8 : null;
  if (wire === 2) return readLengthDelimited(bytes, offset)?.next ?? null;
  if (wire === 5) return offset + 4 <= bytes.length ? offset + 4 : null;
  return null;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  } catch {
    return null;
  }
}
