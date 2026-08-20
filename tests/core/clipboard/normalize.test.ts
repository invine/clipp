import {
  normalizeClipboardContent,
} from "../../../packages/core/clipboard/normalize";
import { validateClip } from "../../../packages/core/models/Clip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

describe("v1 Clipboard Normalizer", () => {
  it("classifies only complete untrimmed HTTP(S) URLs", () => {
    expect(normalizeClipboardContent("hello", originPeerId)?.type).toBe("text");
    expect(normalizeClipboardContent("https://example.com", originPeerId)?.type).toBe("url");
    expect(normalizeClipboardContent(" https://example.com ", originPeerId)?.type).toBe("text");
    expect(normalizeClipboardContent("ftp://example.com", originPeerId)?.type).toBe("text");
  });

  it("preserves exact non-empty clipboard text", () => {
    const clip = normalizeClipboardContent("  hello\n", originPeerId, {
      now: () => 1_000,
      makeId: () => "00000000-0000-4000-8000-000000000001",
    });
    expect(clip).toMatchObject({ type: "text", content: "  hello\n", capturedAt: 1_000, shareExpiresAt: 86_401_000 });
    expect(validateClip(clip)).toBe(true);
  });

  it("rejects empty input and unsupported sharing lifetimes", () => {
    expect(normalizeClipboardContent("", originPeerId)).toBeNull();
    expect(normalizeClipboardContent("value", originPeerId, { sharingLifetimeMs: 0 })).toBeNull();
  });

  it("rejects invalid immutable values before a Clip can be emitted", () => {
    expect(normalizeClipboardContent("value", "not-a-peer-id", {
      makeId: () => "not-a-uuid",
    })).toBeNull();
    expect(normalizeClipboardContent("value", originPeerId, {
      now: () => Number.MAX_SAFE_INTEGER,
      makeId: () => "00000000-0000-4000-8000-000000000002",
    })).toBeNull();
  });
});
