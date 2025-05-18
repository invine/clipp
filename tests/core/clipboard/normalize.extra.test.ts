import {
  detectClipType,
  normalizeClipboardContent,
  sanitizeText,
} from "../../../packages/core/clipboard/normalize";
import { validateClip } from "../../../packages/core/clipboard/validate";

describe("Clipboard Normalizer - Additional", () => {
  const senderId = "peer-abc";

  it("does not detect URL without protocol", () => {
    expect(detectClipType("www.example.com")).toBe("text");
  });

  it("detects image/file object normalization", () => {
    const imgObj = { base64: "iVBOR", mime: "image/png" };
    const fileObj = { base64: "AAAA", mime: "application/pdf" };
    const imgClip = normalizeClipboardContent(imgObj, senderId);
    const fileClip = normalizeClipboardContent(fileObj, senderId);
    expect(imgClip?.type).toBe("image");
    expect(fileClip?.type).toBe("file");
    expect(validateClip(imgClip!)).toBe(true);
    expect(validateClip(fileClip!)).toBe(true);
  });

  it("sanitizes text with control chars and emoji", () => {
    const dirty = "\x00\x1F\x7F  hello\t\n😀  ";
    expect(sanitizeText(dirty)).toBe("hello😀");
  });
});
