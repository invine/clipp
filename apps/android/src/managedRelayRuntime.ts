import {
  normalizeDiscoveryResponse,
  RelayOperationError,
  type ManagedRelayAdapter,
  type DiscoveryDocument,
  type RelayState,
} from "@core/network/managedRelays";
import type { AndroidManagedRelayAuth } from "./managedRelayAuth";

export type AndroidManagedRelayHost = Pick<
  ManagedRelayAdapter,
  | "supportsAddress"
  | "dial"
  | "authenticate"
  | "reserve"
  | "register"
  | "unregister"
  | "signedPeerRecord"
>;

type NativeDiscovery = {
  getDiscovery(
    discoveryUrl: string,
    accessToken: string
  ): Promise<{ status: number; body: string }>;
};

function isAndroidRelayAddress(address: string): boolean {
  return (
    address.includes("/wss/") ||
    address.endsWith("/wss") ||
    /\/tls\/(?:sni\/[^/]+\/)?ws\//.test(address) ||
    address.includes("/webrtc-direct/") ||
    address.endsWith("/webrtc-direct")
  );
}

function preference(address: string): number {
  return address.includes("/webrtc-direct") ? 1 : 0;
}

/** Android attempts WSS before WebRTC Direct, including explicit relay addresses. */
export function androidRelayAddressOrder(addresses: string[]): string[] {
  return [...addresses].sort((a, b) => preference(a) - preference(b));
}

export function createAndroidManagedRelayAdapter(
  host: AndroidManagedRelayHost,
  auth: AndroidManagedRelayAuth,
  native: NativeDiscovery,
  onStateChange: (states: RelayState[]) => void
): ManagedRelayAdapter {
  return {
    accessToken: (url, signal) => auth.accessToken(url, signal),
    async discover(url, token, signal): Promise<DiscoveryDocument> {
      if (signal.aborted) throw new Error("aborted");
      const response = await native.getDiscovery(url, token);
      if (signal.aborted) throw new Error("aborted");
      if (response.status === 401)
        throw new RelayOperationError("authentication_failed");
      if (response.status === 429)
        throw new RelayOperationError("rate_limited");
      if (response.status !== 200)
        throw new RelayOperationError("temporarily_unavailable");
      if (new TextEncoder().encode(response.body).length > 16_384)
        throw new Error("discovery_too_large");
      const document = normalizeDiscoveryResponse(JSON.parse(response.body));
      return {
        ...document,
        relay: {
          ...document.relay,
          addresses: androidRelayAddressOrder(document.relay.addresses),
        },
      };
    },
    supportsAddress: (address) =>
      isAndroidRelayAddress(address) && host.supportsAddress(address),
    dial: (address, signal) => host.dial(address, signal),
    authenticate: (connection, token, signal) =>
      host.authenticate(connection, token, signal),
    reserve: (connection, signal) => host.reserve(connection, signal),
    register: (connection, record, version, signal) =>
      host.register(connection, record, version, signal),
    unregister: (connection, signal) => host.unregister(connection, signal),
    signedPeerRecord: () => host.signedPeerRecord(),
    eraseCredentials: (url) => auth.erase(url),
    interactiveLogin: (url) => auth.login(url),
    openAccount: (url) => auth.openAccount(url),
    onStateChange,
  };
}
