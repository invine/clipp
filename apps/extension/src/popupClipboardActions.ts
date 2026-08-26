export async function shareCurrentPopupClipboard(
  readText: () => Promise<string>,
  shareNow: (text: string) => Promise<void>,
): Promise<void> {
  let text: string;
  try {
    text = await readText();
  } catch {
    throw new Error("clipboard_read_failed");
  }
  await shareNow(text);
}

export function isAuthorizedPopupShareNowSender(
  senderUrl: string | undefined,
  popupUrl: string,
): boolean {
  return senderUrl === popupUrl;
}
