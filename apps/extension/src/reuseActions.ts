import type { ReuseClipOutcome } from "../../../packages/ui/src/clipboardActionFeedback";
type Runtime = {
  lastError?: { message?: string };
  sendMessage(message: unknown, callback: (value: unknown) => void): void;
};
/** A projection refresh cannot confirm a clipboard write without an operation receipt. */
export function reuseExtensionClip(
  runtime: Runtime,
  id: string
): Promise<ReuseClipOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("unconfirmed"), 15000);
    const finish = (reply: unknown) => {
      clearTimeout(timer);
      const response = reply as { ok?: boolean; outcome?: unknown } | undefined;
      resolve(
        !runtime.lastError &&
          response?.ok === true &&
          (response.outcome === "complete" ||
            response.outcome === "copied-without-clip")
          ? response.outcome
          : "unconfirmed"
      );
    };
    try {
      runtime.sendMessage({ type: "reuseClip", id }, finish);
    } catch {
      finish(undefined);
    }
  });
}
