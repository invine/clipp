import { ClipType } from "./enums";

/** An immutable v1 clipboard capture event. */
export interface Clip {
  id: string;
  type: "text" | "url";
  /** Exact, uncanonicalized clipboard string. */
  content: string;
  /** Canonical libp2p Peer ID of the device that captured this event. */
  originPeerId: string;
  /** Immutable UTC capture time in Unix milliseconds. */
  capturedAt: number;
  /** Immutable UTC sharing deadline in Unix milliseconds. */
  shareExpiresAt: number;
  /** @deprecated Legacy transition fields; v1 capture never writes them. */
  timestamp?: number;
  /** @deprecated Legacy transition fields; v1 capture never writes them. */
  senderId?: string;
  /** @deprecated Legacy transition fields; v1 capture never writes them. */
  expiresAt?: number;
}

export const DEFAULT_CLIP_SHARING_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const MAX_CLIP_SHARING_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_CLOCK_SKEW_ALLOWANCE_MS = 2 * 60 * 1_000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function clipContentType(value: string): Clip["type"] {
  if (value !== value.trim()) return ClipType.Text;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return ClipType.Url;
  } catch {
    // Text is the default v1 alternative.
  }
  return ClipType.Text;
}

export function isCanonicalPeerId(value: string): boolean {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (value.length === 0) return false;

  const bytes = [0];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return false;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index] * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (let index = 0; index < value.length - 1 && value[index] === "1"; index += 1) bytes.push(0);
  bytes.reverse();
  const readVarint = (start: number): { value: number; next: number } | null => {
    let decoded = 0;
    let shift = 0;
    for (let index = start; index < bytes.length && shift <= 28; index += 1) {
      const byte = bytes[index];
      decoded |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return { value: decoded, next: index + 1 };
      shift += 7;
    }
    return null;
  };
  const code = readVarint(0);
  const digestLength = code && readVarint(code.next);
  if (!code || !digestLength || digestLength.value <= 0) return false;
  if (digestLength.next + digestLength.value !== bytes.length) return false;
  // libp2p Peer IDs are either sha2-256 hashes of RSA keys or identity
  // multihashes containing the protobuf-encoded Ed25519/secp256k1 public key.
  if (code.value === 0x12) return digestLength.value === 32;
  if (code.value !== 0) return false;
  const typeTag = readVarint(digestLength.next);
  const keyType = typeTag && readVarint(typeTag.next);
  const dataTag = keyType && readVarint(keyType.next);
  const keyLength = dataTag && readVarint(dataTag.next);
  if (typeTag?.value !== 0x08 || dataTag?.value !== 0x12 || !keyType || !keyLength) return false;
  if (keyLength.next + keyLength.value !== bytes.length) return false;
  return (keyType.value === 1 && keyLength.value === 32) || (keyType.value === 2 && keyLength.value === 33);
}

/** Validate structural v1 invariants without making a local-clock decision. */
export function validateClip(clip: unknown, maxSharingLifetimeMs = MAX_CLIP_SHARING_LIFETIME_MS): clip is Clip {
  if (typeof clip !== "object" || clip === null) return false;
  const candidate = clip as Partial<Clip>;
  if (
    typeof candidate.id !== "string" ||
    !UUID_V4.test(candidate.id) ||
    (candidate.type !== ClipType.Text && candidate.type !== ClipType.Url) ||
    typeof candidate.content !== "string" ||
    candidate.content.length === 0 ||
    typeof candidate.originPeerId !== "string" ||
    !isCanonicalPeerId(candidate.originPeerId) ||
    !Number.isSafeInteger(candidate.capturedAt) ||
    !Number.isSafeInteger(candidate.shareExpiresAt)
  ) return false;

  const capturedAt = candidate.capturedAt as number;
  const shareExpiresAt = candidate.shareExpiresAt as number;
  if (shareExpiresAt <= capturedAt || shareExpiresAt - capturedAt > maxSharingLifetimeMs) return false;

  return candidate.type === clipContentType(candidate.content);
}

export function isClipAcceptable(
  clip: Clip,
  now: number,
  clockSkewAllowanceMs = DEFAULT_CLOCK_SKEW_ALLOWANCE_MS
): boolean {
  return validateClip(clip) &&
    (clip.capturedAt as number) <= now + clockSkewAllowanceMs &&
    now < (clip.shareExpiresAt as number) + clockSkewAllowanceMs;
}

export function clipsHaveEqualImmutableFields(left: Clip, right: Clip): boolean {
  return left.id === right.id &&
    left.type === right.type &&
    left.content === right.content &&
    left.originPeerId === right.originPeerId &&
    left.capturedAt === right.capturedAt &&
    left.shareExpiresAt === right.shareExpiresAt;
}

export function clipCapturedAt(clip: Clip): number {
  return clip.capturedAt;
}
