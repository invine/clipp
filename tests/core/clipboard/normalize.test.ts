import {
  detectClipType,
  normalizeClipboardContent,
  sanitizeText,
} from "../../../packages/core/clipboard/normalize";
import { validateClip } from "../../../packages/core/models/Clip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

describe("v1 Clipboard Normalizer", () => {
  it("classifies only complete untrimmed HTTP(S) URLs", () => {
    expect(detectClipType("hello")).toBe("text");
    expect(detectClipType("https://example.com")).toBe("url");
    expect(detectClipType(" https://example.com ")).toBe("text");
    expect(detectClipType("ftp://example.com")).toBe("text");
  });

  it("preserves exact non-empty clipboard text", () => {
    const clip = normalizeClipboardContent("  hello\n", originPeerId, {
      now: () => 1_000,
      makeId: () => "00000000-0000-4000-8000-000000000001",
    });
    expect(clip).toMatchObject({ type: "text", content: "  hello\n", capturedAt: 1_000, shareExpiresAt: 86_401_000 });
    expect(validateClip(clip)).toBe(true);
    expect(sanitizeText("  hello\n")).toBe("  hello\n");
  });

  it("rejects empty input and unsupported sharing lifetimes", () => {
    expect(normalizeClipboardContent("", originPeerId)).toBeNull();
    expect(normalizeClipboardContent("value", originPeerId, { sharingLifetimeMs: 0 })).toBeNull();
  });
});
