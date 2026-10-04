import { shell } from "electron";
import {
  acceptanceTransportAllows,
  type RelayAcceptanceTransport,
} from "./relayAcceptance.js";
import {
  canonicalDiscoveryUrl,
  normalizeDiscoveryResponse,
  type ManagedRelayAdapter,
  type RelayState,
} from "../../../packages/core/network/managedRelays.js";
import type { createManagedRelayHost } from "../../../packages/core/network/managedRelayHost.js";
import type { createElectronManagedRelayAuth } from "./managedRelayAuth.js";

type Host = Pick<
  ReturnType<typeof createManagedRelayHost>,
  | "supportsAddress"
  | "dial"
  | "authenticate"
  | "reserve"
  | "register"
  | "signedPeerRecord"
  | "unregister"
>;
type Auth = ReturnType<typeof createElectronManagedRelayAuth>;

export function createElectronManagedRelayAdapter(options: {
  auth: Auth;
  acceptanceTransport?: RelayAcceptanceTransport;
  host(): Host;
  onStateChange(states: RelayState[]): void;
}): ManagedRelayAdapter {
  return {
    accessToken: (url) => options.auth.accessToken(url),
    async discover(url, token, signal) {
      url = canonicalDiscoveryUrl(url);
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "manual",
        signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "invalid_credentials" : "discovery_failed"
        );
      if (
        response.headers.get("content-length") &&
        Number(response.headers.get("content-length")) > 16_384
      )
        throw new Error("discovery_too_large");
      const text = await response.text();
      if (Buffer.byteLength(text) > 16_384)
        throw new Error("discovery_too_large");
      return normalizeDiscoveryResponse(JSON.parse(text));
    },
    supportsAddress: (address) =>
      (!options.acceptanceTransport ||
        acceptanceTransportAllows(options.acceptanceTransport, address)) &&
      options.host().supportsAddress(address),
    // libp2p joins same-peer dials, so a stalled TCP attempt can prevent
    // the later public WebSocket candidate from starting before our deadline.
    addressPriority: (address) =>
      address.includes("/webrtc-direct/")
        ? 2
        : /\/(?:wss?|tls\/ws)\/p2p\//.test(address)
          ? 0
          : 1,
    dial: (address, signal) => options.host().dial(address, signal),
    authenticate: (connection, token, signal) =>
      options.host().authenticate(connection, token, signal),
    reserve: (connection, signal) => options.host().reserve(connection, signal),
    register: (connection, record, version, signal) =>
      options.host().register(connection, record, version, signal),
    signedPeerRecord: () => options.host().signedPeerRecord(),
    eraseCredentials: (url) => options.auth.erase(url),
    interactiveLogin: (url) => options.auth.interactiveLogin(url),
    openAccount: async (url) => {
      await shell.openExternal(new URL("/", canonicalDiscoveryUrl(url)).href);
    },
    unregister: (connection, signal) =>
      options.host().unregister(connection, signal),
    onStateChange: options.onStateChange,
  };
}
