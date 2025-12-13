import {
  detectClipType,
  normalizeClipboardContent,
  sanitizeText,
  guessMimeType,
} from "../../../packages/core/clipboard/normalize";
import { validateClip } from "../../../packages/core/models/Clip";

describe("Clipboard Normalizer", () => {
  const senderId = "peer-abc";

  it("detects text", () => {
    expect(detectClipType("hello")).toBe("text");
  });
  it("detects url", () => {
    expect(detectClipType("https://example.com")).toBe("url");
  });
  it("detects image base64", () => {
    expect(detectClipType("data:image/png;base64,iVBOR")).toBe("image");
  });
  it("detects file base64", () => {
    expect(detectClipType("data:application/pdf;base64,AAAA")).toBe("file");
  });
  it("normalizes text", () => {
    const clip = normalizeClipboardContent("  hello\n", senderId);
    expect(clip?.type).toBe("text");
    expect(clip?.content).toBe("hello");
    expect(validateClip(clip!)).toBe(true);
  });
  it("normalizes url", () => {
    const clip = normalizeClipboardContent("https://foo.com", senderId);
    expect(clip?.type).toBe("url");
    expect(validateClip(clip!)).toBe(true);
  });
  it("normalizes image", () => {
    const clip = normalizeClipboardContent(
      "data:image/png;base64,iVBOR",
      senderId
    );
    expect(clip?.type).toBe("image");
    expect(validateClip(clip!)).toBe(true);
  });
  it("normalizes file", () => {
    const clip = normalizeClipboardContent(
      "data:application/pdf;base64,AAAA",
      senderId
    );
    expect(clip?.type).toBe("file");
    expect(validateClip(clip!)).toBe(true);
  });
  it("returns null for empty text", () => {
    expect(normalizeClipboardContent("   ", senderId)).toBeNull();
  });
});
