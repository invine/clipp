import {
  normalizeShareNowFailureCode,
  reuseClipFeedback,
  shareNowFailureFeedback,
} from "../../packages/ui/src/clipboardActionFeedback";

describe("clipboard action feedback", () => {
  it("distinguishes complete reuse, partial reuse, and write failure", () => {
    expect(reuseClipFeedback("complete")).toBeNull();
    expect(reuseClipFeedback("copied-without-clip")).toEqual({
      message: "Copied to clipboard, but Clipp could not save or share a new Clip.",
      action: "dismiss",
    });
    expect(reuseClipFeedback("write-failed")).toEqual({
      message: "Could not copy this Clip. Your clipboard and history were not changed.",
      action: "retry",
    });
  });

  it("distinguishes Share Now read failure from capture failure", () => {
    expect(shareNowFailureFeedback("clipboard_read_failed")).toEqual({
      message: "Could not read the current clipboard. Keep Clipp open and try again.",
      action: "retry",
    });
    expect(shareNowFailureFeedback("share_now_failed")).toEqual({
      message: "Could not save or share the current clipboard.",
      action: "retry",
    });
  });

  it("normalizes runtime failures to closed Share Now failure codes", () => {
    expect(normalizeShareNowFailureCode(Object.assign(
      new Error("clipboard_read_failed"),
      { code: "clipboard_read_failed" },
    )))
      .toBe("clipboard_read_failed");
    expect(normalizeShareNowFailureCode(new Error("clipboard_read_failed")))
      .toBe("share_now_failed");
    expect(normalizeShareNowFailureCode(new Error("clip_capture_failed")))
      .toBe("share_now_failed");
    expect(normalizeShareNowFailureCode("clipboard_read_failed"))
      .toBe("share_now_failed");
  });
});
