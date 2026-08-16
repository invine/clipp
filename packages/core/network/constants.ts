/**
 * Ordered Circuit Relay v2 defaults shared by every runtime.  These are relay
 * peer addresses, never WebRTC-star signalling endpoints.
 */
export const DEFAULT_CIRCUIT_RELAY_ADDRESSES = [
  "/ip4/141.147.116.147/tcp/47891/ws/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex",
];

/** @deprecated Use DEFAULT_CIRCUIT_RELAY_ADDRESSES. */
export const DEFAULT_WEBRTC_STAR_RELAYS = DEFAULT_CIRCUIT_RELAY_ADDRESSES;
