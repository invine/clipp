export function isAuthorizedPopupShareNowSender(
  senderUrl: string | undefined,
  popupUrl: string
): boolean {
  return senderUrl === popupUrl;
}
