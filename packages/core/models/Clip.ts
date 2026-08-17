import { ClipType } from "./enums";

/** An immutable v1 clipboard capture event. */
export interface Clip {
  id: string;
  type: "text" | "url";
  /** Exact, uncanonicalized clipboard string. */
  content: string;
  /** Canonical libp2p Peer ID of the device that captured this event. */
  originPeerId?: string;
  /** Immutable UTC capture time in Unix milliseconds. */
  capturedAt?: number;
  /** Immutable UTC sharing deadline in Unix milliseconds. */
  shareExpiresAt?: number;
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
  // The capture boundary receives the already-canonical textual Peer ID from
  // the identity service. Wire codecs perform byte-level multihash validation.
  return /^(?:12D3KooW|Qm)[1-9A-HJ-NP-Za-km-z]+$/.test(value);
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

  return candidate.type === ClipType.Text || clipContentType(candidate.content) === ClipType.Url;
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
  return clip.capturedAt ?? clip.timestamp ?? 0;
}
