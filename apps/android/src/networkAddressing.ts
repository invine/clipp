import { DEFAULT_CIRCUIT_RELAY_ADDRESSES } from "@core/network/constants";

const DEFAULT_RELAY_PEER_IDS = new Set(
  DEFAULT_CIRCUIT_RELAY_ADDRESSES.map((address) => {
    const components = address.split("/p2p/");
    return components[components.length - 1];
  }).filter((peerId): peerId is string => Boolean(peerId))
);

export function androidCircuitRelayAddresses(): string[] {
  return [...DEFAULT_CIRCUIT_RELAY_ADDRESSES];
}

export function filterAndroidDialAddresses(
  addresses: string[],
  managedEligibleAddresses: string[] = []
): string[] {
  const managedEligible = new Set(managedEligibleAddresses);
  return addresses.filter((address) => {
    const circuitIndex = address.indexOf("/p2p-circuit");
    if (circuitIndex < 0) return true;
    const components = address.slice(0, circuitIndex).split("/p2p/");
    const relayPeerId = components[components.length - 1];
    return (
      (relayPeerId !== undefined && DEFAULT_RELAY_PEER_IDS.has(relayPeerId)) ||
      managedEligible.has(address)
    );
  });
}
