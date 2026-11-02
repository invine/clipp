import type { ClipboardService } from "../../../packages/core/clipboard/service";

export async function observeExtensionClipboard(
  text: unknown,
  clipboard: Pick<ClipboardService, "processLocalText">,
  ready: Promise<unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await ready;
    if (typeof text !== "string")
      return { ok: false, error: "invalid_clipboard_observation" };
    await clipboard.processLocalText(text);
    // Ordinary observation can accept empty, unchanged or baselined text without a Clip.
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "clipboard_observation_failed",
    };
  }
}
