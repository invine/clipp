// packages/core/pairing/protocol.ts
var PAIRING_MAX_FRAME_BYTES = 16 * 1024;
var TRUST_REQUEST_DOMAIN = new TextEncoder().encode("clipp:trust-request:v1\0");
var DEFAULT_TRUST_REQUEST_VALIDITY_MS = 10 * 60 * 1e3;
var DEFAULT_TRUST_REQUEST_CLOCK_SKEW_MS = 2 * 60 * 1e3;
function createPairingTrustRequestVerifier(publicKeyForPeerId) {
  return async (signedPayload, signature, peerId) => {
    try {
      const key = await publicKeyForPeerId(peerId);
      if (!key || typeof key.verify !== "function") return false;
      return await key.verify(
        concatPairingBytes(TRUST_REQUEST_DOMAIN, signedPayload),
        signature
      );
    } catch {
      return false;
    }
  };
}
var verifyPairingTrustRequestSignature = createPairingTrustRequestVerifier(async (peerId) => {
  const { peerIdFromString } = await import("@libp2p/peer-id");
  return peerIdFromString(peerId).publicKey;
});
function peerIdToMultihashBytes(value) {
  const decoded = base58Decode(value);
  validateMultihashBytes(decoded);
  if (base58Encode(decoded) !== value) throw new Error("invalid_peer_id");
  return decoded;
}
function peerIdFromMultihashBytes(value) {
  validateMultihashBytes(value);
  const text = base58Encode(value);
  const canonical = base58Decode(text);
  if (canonical.length !== value.length || canonical.some((byte, index) => byte !== value[index])) throw new Error("invalid_peer_id");
  return text;
}
function validateMultihashBytes(value) {
  const code = decodeVarint(value, 0);
  if (!code || code.value < 0n || encodeVarint(code.value).length !== code.next) throw new Error("invalid_peer_id");
  const length = decodeVarint(value, code.next);
  if (!length || length.value <= 0n || encodeVarint(length.value).length !== length.next - code.next) throw new Error("invalid_peer_id");
  if (length.value !== BigInt(value.length - length.next)) throw new Error("invalid_peer_id");
  const digest = value.slice(length.next);
  if (code.value !== 0n || digest.length !== 36 || digest[0] !== 8 || digest[1] !== 1 || digest[2] !== 18 || digest[3] !== 32) throw new Error("invalid_peer_id");
}
var MAX_UINT64 = (1n << 64n) - 1n;
function encodeVarint(value) {
  if (value < 0n) throw new Error("invalid_varint");
  const out = [];
  do {
    const byte = Number(value & 127n);
    value >>= 7n;
    out.push(value ? byte | 128 : byte);
  } while (value);
  return Uint8Array.from(out);
}
function decodeVarint(bytes, start) {
  let value = 0n;
  for (let index = start, shift = 0n; index < bytes.length && index < start + 10; index += 1, shift += 7n) {
    const byte = bytes[index];
    value |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      const next = index + 1;
      return encodeVarint(value).length === next - start ? { value, next } : null;
    }
  }
  return null;
}
function concatPairingBytes(...parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
var BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(value) {
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
    while (carry > 0) {
      bytes.unshift(carry & 255);
      carry >>= 8;
    }
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
function base58Encode(value) {
  if (!value.length) throw new Error("invalid_peer_id");
  const digits = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.unshift(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leading = 0;
  while (leading < value.length && value[leading] === 0) leading += 1;
  return "1".repeat(leading) + digits.map((digit) => BASE58[digit]).join("");
}

// packages/core/pairing/presentation.ts
function normalizeDeviceName(value) {
  const normalized = value.normalize("NFC").trim();
  return normalized && [...normalized].length <= 64 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(normalized) ? normalized : void 0;
}

// packages/core/pairing/qrTransport.ts
import { deflate, Inflate } from "pako";
var BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
var RAW_PREFIX = "CLIPP:PAIR:B1:";
var DEFLATE_PREFIX = "CLIPP:PAIR:Z1:";
function decodePairingQrPayload(raw, maximumBytes) {
  const compressed = raw.startsWith(DEFLATE_PREFIX);
  const prefix = compressed ? DEFLATE_PREFIX : RAW_PREFIX;
  if (!raw.startsWith(prefix) || !raw.endsWith(":")) return null;
  const encodedLength = raw.length - prefix.length - 1;
  if (encodedLength <= 0 || encodedLength > Math.ceil(maximumBytes * 3 / 2))
    return null;
  const bytes = decodeBase45(raw.slice(prefix.length, -1));
  if (!bytes) return null;
  if (!compressed) return bytes.length <= maximumBytes ? bytes : null;
  try {
    const output = new Uint8Array(maximumBytes);
    const inflater = new Inflate({
      windowBits: 15,
      chunkSize: Math.min(1024, maximumBytes + 1)
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
function decodeBase45(encoded) {
  if (encoded.length % 3 === 1) return null;
  const bytes = new Uint8Array(Math.floor(encoded.length * 2 / 3));
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

// packages/core/pairing/v2.ts
var PAIRING_TARGET_PREFIX = "clipp:pair:";
var PAIRING_TARGET_VERSION = 2;
var PAIRING_TARGET_MAX_BYTES = 16 * 1024;
function encodePairingTarget(target, maximumBytes = PAIRING_TARGET_MAX_BYTES) {
  const deviceNameHint = target.deviceNameHint === void 0 ? void 0 : normalizeDeviceName(target.deviceNameHint);
  const payload = concat(
    fieldVarint(1, PAIRING_TARGET_VERSION),
    fieldBytes(2, peerIdToMultihashBytes(target.targetPeerId)),
    fieldBytes(3, target.signedPeerRecord),
    deviceNameHint === void 0 ? new Uint8Array() : fieldBytes(4, utf8(deviceNameHint))
  );
  if (payload.length > maximumBytes)
    throw new Error("pairing_target_too_large");
  return `${PAIRING_TARGET_PREFIX}${toBase64Url(payload)}`;
}
function decodePairingTarget(raw, maximumBytes = PAIRING_TARGET_MAX_BYTES) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) return null;
  if (raw.startsWith("CLIPP:PAIR:")) {
    const bytes2 = decodePairingQrPayload(raw, maximumBytes);
    return bytes2 ? decodePairingTargetBytes(bytes2) : null;
  }
  if (!raw.startsWith(PAIRING_TARGET_PREFIX)) return null;
  const encoded = raw.slice(PAIRING_TARGET_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  if (encoded.length > Math.ceil(maximumBytes * 4 / 3)) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes || bytes.length > maximumBytes) return null;
  if (toBase64Url(bytes) !== encoded) return null;
  return decodePairingTargetBytes(bytes);
}
function decodePairingTargetBytes(bytes) {
  let version;
  let targetPeerId;
  let signedPeerRecord;
  let deviceNameHint;
  let deviceNameHintSeen = false;
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (!key) return null;
    offset = key.next;
    const field = key.value >>> 3;
    const wire = key.value & 7;
    if (field === 1 && wire !== 0 || (field === 2 || field === 3 || field === 4) && wire !== 2) {
      return null;
    }
    if (field === 1 && wire === 0) {
      const value = readVarint(bytes, offset);
      if (!value || version !== void 0) return null;
      version = value.value;
      offset = value.next;
    } else if ((field === 2 || field === 3 || field === 4) && wire === 2) {
      const value = readLengthDelimited(bytes, offset);
      if (!value) return null;
      offset = value.next;
      if (field === 2) {
        if (targetPeerId !== void 0) return null;
        try {
          targetPeerId = peerIdFromMultihashBytes(value.value);
        } catch {
          return null;
        }
      } else if (field === 3) {
        if (signedPeerRecord !== void 0) return null;
        signedPeerRecord = value.value;
      } else {
        if (deviceNameHintSeen) return null;
        deviceNameHintSeen = true;
        try {
          deviceNameHint = normalizeDeviceName(decodeUtf8(value.value));
        } catch {
          deviceNameHint = void 0;
        }
      }
    } else {
      const next = skipField(bytes, offset, wire);
      if (next === null) return null;
      offset = next;
    }
  }
  if (version !== PAIRING_TARGET_VERSION || !targetPeerId || !signedPeerRecord?.length)
    return null;
  return {
    version,
    targetPeerId,
    signedPeerRecord,
    ...deviceNameHint ? { deviceNameHint } : {}
  };
}
function fieldVarint(field, value) {
  return concat(writeVarint(field << 3 | 0), writeVarint(value));
}
function fieldBytes(field, value) {
  return concat(
    writeVarint(field << 3 | 2),
    writeVarint(value.length),
    value
  );
}
function writeVarint(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("invalid_varint");
  const out = [];
  while (value > 127) {
    out.push(value & 127 | 128);
    value = Math.floor(value / 128);
  }
  out.push(value);
  return Uint8Array.from(out);
}
function readVarint(bytes, start) {
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
function readLengthDelimited(bytes, start) {
  const length = readVarint(bytes, start);
  if (!length || length.value > bytes.length - length.next) return null;
  return {
    value: bytes.slice(length.next, length.next + length.value),
    next: length.next + length.value
  };
}
function skipField(bytes, offset, wire) {
  if (wire === 0) return readVarint(bytes, offset)?.next ?? null;
  if (wire === 1) return offset + 8 <= bytes.length ? offset + 8 : null;
  if (wire === 2) return readLengthDelimited(bytes, offset)?.next ?? null;
  if (wire === 5) return offset + 4 <= bytes.length ? offset + 4 : null;
  return null;
}
function concat(...parts) {
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function utf8(value) {
  return new TextEncoder().encode(value);
}
function decodeUtf8(value) {
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}
function toBase64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(value) {
  try {
    return Uint8Array.from(
      Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    );
  } catch {
    return null;
  }
}
export {
  PAIRING_TARGET_MAX_BYTES,
  PAIRING_TARGET_PREFIX,
  PAIRING_TARGET_VERSION,
  decodePairingTarget,
  encodePairingTarget
};
