import {
  ManagedRelayController,
  normalizeDiscoveryResponse,
  type ManagedRelayAdapter,
  type RelayState,
} from "../../../packages/core/network/managedRelays";
import { MANAGED_RELAY_PORT, parseAccessReply } from "./managedRelayBridge";
import {
  extensionRelayTransportAllows,
  type ExtensionRelayAcceptanceTransport,
} from "./relayAcceptance";

type ManagedRelayHost = Pick<
  ManagedRelayAdapter,
  | "supportsAddress"
  | "dial"
  | "authenticate"
  | "reserve"
  | "register"
  | "unregister"
  | "signedPeerRecord"
>;

function shortAccessToken(
  discoveryUrl: string
): Promise<{ accessToken: string | null; warning?: string }> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: MANAGED_RELAY_PORT });
    const timeout = setTimeout(() => {
      port.disconnect();
      reject(new Error("relay_access_timeout"));
    }, 10_000);
    port.onMessage.addListener((value: unknown) => {
      clearTimeout(timeout);
      port.disconnect();
      const reply = parseAccessReply(value);
      if (!reply || "error" in reply) {
        reject(new Error("relay_access_unavailable"));
        return;
      }
      resolve(reply);
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout);
      reject(new Error("relay_access_disconnected"));
    });
    port.postMessage({ action: "accessToken", discoveryUrl });
  });
}

export function createExtensionManagedRelayController(options: {
  host: ManagedRelayHost;
  acceptanceTransport?: ExtensionRelayAcceptanceTransport;
  onStateChange(states: RelayState[]): void;
}) {
  const warnings = new Map<string, string>();
  let controller: ManagedRelayController;
  const adapter: ManagedRelayAdapter = {
    async accessToken(discoveryUrl) {
      const reply = await shortAccessToken(discoveryUrl);
      if (reply.warning) warnings.set(discoveryUrl, reply.warning);
      else warnings.delete(discoveryUrl);
      return reply.accessToken;
    },
    async discover(discoveryUrl, token, signal) {
      const response = await fetch(discoveryUrl, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "invalid_credentials"
            : "relay_discovery_unavailable"
        );
      return normalizeDiscoveryResponse(await response.json());
    },
    supportsAddress(address) {
      return (
        (!options.acceptanceTransport ||
          extensionRelayTransportAllows(
            options.acceptanceTransport,
            address
          )) &&
        (/\/wss\/|\/tls\/(?:sni\/[^/]+\/)?ws\//.test(address) ||
          /\/webrtc-direct\//.test(address)) &&
        options.host.supportsAddress(address)
      );
    },
    dial: (address, signal) => options.host.dial(address, signal),
    authenticate: (connection, token, signal) =>
      options.host.authenticate(connection, token, signal),
    reserve: (connection, signal) => options.host.reserve(connection, signal),
    register: (connection, record, version, signal) =>
      options.host.register(connection, record, version, signal),
    unregister: (connection, signal) =>
      options.host.unregister(connection, signal),
    signedPeerRecord: () => options.host.signedPeerRecord(),
    async eraseCredentials() {
      // The background persists and erases credentials before delivering configuration changes.
    },
    async interactiveLogin() {
      throw new Error("relay_login_requires_ui_action");
    },
    async openAccount() {
      throw new Error("relay_account_requires_ui_action");
    },
    onStateChange(states) {
      const endpoints = new Map(
        controller
          .configurations()
          .filter(
            (
              configuration
            ): configuration is Extract<
              typeof configuration,
              { kind: "managed" }
            > => configuration.kind === "managed"
          )
          .map((configuration) => [
            configuration.key,
            configuration.discoveryUrl,
          ])
      );
      options.onStateChange(
        states.map((state) => ({
          ...state,
          warning:
            state.kind === "managed"
              ? (warnings.get(endpoints.get(state.key) ?? "") ?? state.warning)
              : state.warning,
        }))
      );
    },
  };
  controller = new ManagedRelayController(adapter);
  return controller;
}
