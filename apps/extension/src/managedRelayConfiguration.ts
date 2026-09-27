import {
  canonicalDiscoveryUrl,
  normalizeRelayConfigurations,
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

export async function replaceManagedRelayConfigurations(
  previous: RelayConfiguration[],
  values: unknown,
  operations: {
    erase(discoveryUrl: string): Promise<void>;
    write(configurations: RelayConfiguration[]): Promise<void>;
  }
): Promise<RelayConfiguration[]> {
  const next = normalizeRelayConfigurations(values);
  const currentEndpoints = new Set(
    next
      .filter((entry) => entry.kind === "managed")
      .map((entry) => entry.discoveryUrl)
  );
  for (const entry of previous) {
    if (entry.kind === "managed" && !currentEndpoints.has(entry.discoveryUrl))
      await operations.erase(entry.discoveryUrl);
  }
  await operations.write(next);
  return next;
}
