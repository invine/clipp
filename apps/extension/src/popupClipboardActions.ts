class PopupClipboardReadError extends Error {
  readonly code = "clipboard_read_failed";

  constructor() {
    super("clipboard_read_failed");
    this.name = "PopupClipboardReadError";
  }
}

export async function shareCurrentPopupClipboard(
  readText: () => Promise<string>,
  shareNow: (text: string) => Promise<void>,
): Promise<void> {
  let text: string;
  try {
    text = await readText();
  } catch {
    throw new PopupClipboardReadError();
  }
  await shareNow(text);
}

export function isAuthorizedPopupShareNowSender(
  senderUrl: string | undefined,
  popupUrl: string,
): boolean {
  return senderUrl === popupUrl;
}
