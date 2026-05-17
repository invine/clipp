import { multiaddr } from "@multiformats/multiaddr";

const BASE58_RE = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function dedupeMultiaddrs(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function repairRelayAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const p2pIdx = trimmed.indexOf("/p2p/");
  if (p2pIdx >= 0) {
    const match = trimmed.match(
      new RegExp(`^(.*\\/p2p\\/[${BASE58_RE}]+)(?:[^${BASE58_RE}].*)?$`)
    );
    if (match?.[1]) return match[1];
  }

  return trimmed;
}

export function normalizeRelayAddresses(values: unknown[]): string[] {
  const cleaned = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const unique = dedupeMultiaddrs(cleaned);
  const valid: string[] = [];

  for (const value of unique) {
    const repaired = repairRelayAddress(value);
    if (!repaired) continue;
    try {
      multiaddr(repaired);
      valid.push(repaired);
    } catch {
      // Invalid user-entered relay addresses are ignored by callers.
    }
  }

  return valid;
}

export function deriveRelayPeerMultiaddrs(relayAddresses: string[], peerId: string): string[] {
  const derived = normalizeRelayAddresses(relayAddresses)
    .map((relayAddress) => {
      const relay = relayAddress.replace(/\/+$/, "");
      if (relay.endsWith(`/p2p/${peerId}`)) return relay;
      if (relay.includes("/p2p-webrtc-star")) return `${relay}/p2p/${peerId}`;
      if (relay.includes("/p2p-circuit")) return `${relay}/p2p/${peerId}`;
      return `${relay}/p2p-circuit/p2p/${peerId}`;
    })
    .filter((addr) => {
      try {
        multiaddr(addr);
        return true;
      } catch {
        return false;
      }
    });

  return dedupeMultiaddrs(derived);
}
