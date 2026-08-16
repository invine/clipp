export function normalizeDeviceName(value: string): string | undefined {
  const normalized = value.normalize("NFC").trim();
  return normalized && [...normalized].length <= 64 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(normalized)
    ? normalized
    : undefined;
}

export function shortenPeerId(peerId: string): string {
  return `${peerId.slice(0, 8)}…${peerId.slice(-6)}`;
}
