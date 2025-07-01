import { info } from "../../../packages/core/logger";

let lastText = "";

async function checkClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text !== lastText) {
      lastText = text;
      await chrome.runtime.sendMessage({ type: "clipboardUpdate", text });
    }
  } catch {
    // ignore
  }
}

info("Clipboard monitoring started");
setInterval(checkClipboard, 2000);
// initial check
void checkClipboard();
