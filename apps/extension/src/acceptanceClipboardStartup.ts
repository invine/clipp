declare global {
  const __CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__: boolean;
  interface Window {
    readonly __clippAcceptanceMemoryClipboard?: boolean;
    readonly __clippAcceptanceEarlyMemoryClipboard?: boolean;
  }
}
/** Explicit build-only isolation; normal and transport-only builds keep native clipboard behavior. */
const enabled =
  typeof __CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__ !== "undefined" &&
  __CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__;
let memoryText = "";
if (enabled) {
  try {
    // A CDP init script may already have installed the same boundary in a fresh
    // context. A retained profile instead reaches this module before attachment.
    if (window.__clippAcceptanceMemoryClipboard !== true) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: false,
        value: Object.freeze({
          readText: async () => memoryText,
          writeText: async (text: string) => {
            memoryText = text;
          },
        }),
      });
      Object.defineProperty(window, "__clippAcceptanceMemoryClipboard", {
        value: true,
      });
    }
    const execCommand = document.execCommand.bind(document);
    document.execCommand = (command, showUI, value) =>
      /^(?:copy|cut|paste)$/i.test(command)
        ? false
        : execCommand(command, showUI, value);
    Object.defineProperty(window, "__clippAcceptanceEarlyMemoryClipboard", {
      value: true,
    });
  } catch {
    window.stop();
    throw new Error("acceptance_memory_clipboard_startup_failed");
  }
}
/** The offscreen bridge applies its own app-owned payload into private context memory. */
export async function writeAcceptanceMemoryClipboard(
  text: string
): Promise<void> {
  if (!enabled || window.__clippAcceptanceEarlyMemoryClipboard !== true)
    throw new Error("acceptance_memory_clipboard_startup_required");
  await navigator.clipboard.writeText(text);
}
