export type ExtensionRelayAcceptanceTransport = "wss" | "webrtc-direct";

/** Build-only opt-in. Never accept a transport selection from runtime messages or storage. */
export function extensionRelayAcceptanceTransport(
  mode: string,
  transport: string | undefined
): ExtensionRelayAcceptanceTransport | undefined {
  if (mode !== "relay-acceptance") {
    if (transport) throw new Error("relay_acceptance_requires_test_build");
    return undefined;
  }
  if (transport !== "wss" && transport !== "webrtc-direct")
    throw new Error("unsupported_acceptance_transport");
  return transport;
}

export function extensionRelayTransportAllows(
  transport: ExtensionRelayAcceptanceTransport,
  address: string
): boolean {
  return transport === "wss"
    ? /\/(?:wss|tls\/ws)\/p2p\//.test(address)
    : address.includes("/webrtc-direct/");
}
