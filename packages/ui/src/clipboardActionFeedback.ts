export type ReuseClipOutcome =
  "complete" | "copied-without-clip" | "unconfirmed";
export type ShareNowFailureCode = "clipboard_read_failed" | "share_now_failed";

export type ClipboardActionFeedback = {
  message: string;
  action: "retry" | "dismiss";
  requiresAcknowledgement?: boolean;
};

export function reuseClipFeedback(
  outcome: unknown
): ClipboardActionFeedback | null {
  if (outcome === "complete") return null;
  if (outcome === "copied-without-clip")
    return {
      message:
        "Copied to clipboard, but Clipp could not save or share a new Clip.",
      action: "dismiss",
    };
  if (outcome === "write-failed")
    return {
      message:
        "Could not copy this Clip. Your clipboard and history were not changed.",
      action: "retry",
    };
  return {
    message:
      "The Copy result is unconfirmed. Your clipboard or History may have changed, and the Clip may have been shared. Refreshing cannot confirm this Copy. Dismiss this notice before choosing a new Copy; another Copy may capture or share another Clip.",
    action: "dismiss",
    requiresAcknowledgement: true,
  };
}

export function normalizeShareNowFailureCode(
  error: unknown
): ShareNowFailureCode {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (code === "clipboard_read_failed" || code === "share_now_failed")
      return code;
  }
  return "share_now_failed";
}

export function shareNowFailureFeedback(
  errorCode: ShareNowFailureCode
): ClipboardActionFeedback {
  return errorCode === "clipboard_read_failed"
    ? {
        message:
          "Could not read the current clipboard. Keep Clipp open and try again.",
        action: "retry",
      }
    : {
        message: "Could not save or share the current clipboard.",
        action: "retry",
      };
}
