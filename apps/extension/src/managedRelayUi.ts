export function authorizedRelayUi(
  sender: { id?: string; url?: string } | undefined,
  extensionId: string,
  popupUrl: string,
  optionsUrl: string
): boolean {
  return (
    sender?.id === extensionId &&
    (sender.url === popupUrl || sender.url === optionsUrl)
  );
}
