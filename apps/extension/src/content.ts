// Content script used to observe clipboard updates. Service workers in MV3
// cannot access `navigator.clipboard`, so we listen for `copy`/`cut` events on
// the page and forward the clipboard text to the background script.

async function notifyBackground(text: string) {
  try {
    await chrome.runtime.sendMessage({ type: "clipboardUpdate", text });
  } catch {
    // ignore failures (e.g. no background listener)
  }
}

async function handleClipboardEvent(e: ClipboardEvent) {
  let text = e.clipboardData?.getData("text/plain") || "";
  if (!text) {
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
  }
  if (text) void notifyBackground(text);
}

document.addEventListener("copy", handleClipboardEvent);
document.addEventListener("cut", handleClipboardEvent);

export {};
