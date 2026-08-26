export type ReuseClipOutcome = "complete" | "copied-without-clip";

export type ClipboardActionFeedback = {
  message: string;
  action: "retry" | "dismiss";
};

export function reuseClipFeedback(
  outcome: ReuseClipOutcome | "write-failed",
): ClipboardActionFeedback | null {
  if (outcome === "complete") return null;
  if (outcome === "copied-without-clip") {
    return {
      message: "Copied to clipboard, but Clipp could not save or share a new Clip.",
      action: "dismiss",
    };
  }
  return {
    message: "Could not copy this Clip. Your clipboard and history were not changed.",
    action: "retry",
  };
}

export function shareNowFailureFeedback(errorCode: string): ClipboardActionFeedback {
  return errorCode === "clipboard_read_failed"
    ? {
      message: "Could not read the current clipboard. Keep Clipp open and try again.",
      action: "retry",
    }
    : {
      message: "Could not save or share the current clipboard.",
      action: "retry",
    };
}
