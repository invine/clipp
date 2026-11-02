import {
  createRelayMutationOwner,
  type RelayMutationOperations,
} from "../../../packages/core/network/relayMutations";
import {
  canonicalDiscoveryUrl,
  type RelayConfiguration,
} from "../../../packages/core/network/managedRelays";

export function isConfiguredManagedEndpoint(
  configurations: RelayConfiguration[],
  discoveryUrl: string
): boolean {
  let url: string;
  try {
    url = canonicalDiscoveryUrl(discoveryUrl);
  } catch {
    return false;
  }
  return configurations.some(
    (configuration) =>
      configuration.kind === "managed" && configuration.discoveryUrl === url
  );
}

export function createChromeRelayMutationOwner(
  operations: RelayMutationOperations & { erase(url: string): Promise<void> }
) {
  return createRelayMutationOwner(operations);
}
