import {
  normalizeClipboardContent,
} from "../../../packages/core/clipboard/normalize";
import { validateClip } from "../../../packages/core/models/Clip";

describe("Clipboard Normalizer - Additional", () => {
  const senderId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

  it("does not detect URL without protocol", () => {
    expect(normalizeClipboardContent("www.example.com", senderId)?.type).toBe("text");
  });

  it("rejects image and file objects because v1 carries text only", () => {
    const imgObj = { base64: "iVBOR", mime: "image/png" };
    const fileObj = { base64: "AAAA", mime: "application/pdf" };
    const imgClip = normalizeClipboardContent(imgObj, senderId);
    const fileClip = normalizeClipboardContent(fileObj, senderId);
    expect(imgClip).toBeNull();
    expect(fileClip).toBeNull();
  });

  it("preserves control characters and emoji exactly", () => {
    const dirty = "\x00\x1F\x7F  hello\t\n😀  ";
    const clip = normalizeClipboardContent(dirty, senderId, {
      now: () => 1_000,
      makeId: () => "00000000-0000-4000-8000-000000000012",
    });
    expect(validateClip(clip)).toBe(true);
    expect(clip?.content).toBe(dirty);
  });
});
