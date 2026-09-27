jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (address: string) => ({ toString: () => address }) }),
  { virtual: true }
);

import { createAndroidManagedRelayAdapter } from "../../apps/android/src/managedRelayRuntime";
import type { AndroidManagedRelayHost } from "../../apps/android/src/managedRelayRuntime";
import type { AndroidManagedRelayAuth } from "../../apps/android/src/managedRelayAuth";

const endpoint = "https://relay.example/v1/relay";
const peer = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
const webrtc = `/dns4/relay.example/udp/443/webrtc-direct/p2p/${peer}`;
const wss = `/dns4/relay.example/tcp/443/wss/p2p/${peer}`;

describe("Android managed relay runtime adapter", () => {
  it("prefers WSS, rejects unsupported transports, and never moves the discovery request to another endpoint", async () => {
    const host = {
      supportsAddress: jest.fn((_address: string) => true),
    } as unknown as AndroidManagedRelayHost;
    const auth = {} as AndroidManagedRelayAuth;
    const native = {
      getDiscovery: jest.fn(async (_url: string, _token: string) => ({
        status: 200,
        body: JSON.stringify({
          version: 1,
          relay: { peerId: peer, addresses: [webrtc, wss] },
          validUntil: new Date(Date.now() + 30_000).toISOString(),
        }),
      })),
    };
    const adapter = createAndroidManagedRelayAdapter(
      host,
      auth,
      native,
      () => undefined
    );
    expect(
      adapter.supportsAddress(`/dns4/relay.example/tcp/443/p2p/${peer}`)
    ).toBe(false);
    expect(adapter.supportsAddress(wss)).toBe(true);
    const result = await adapter.discover(
      endpoint,
      "access-only-for-this-relay",
      new AbortController().signal
    );
    expect(native.getDiscovery).toHaveBeenCalledWith(
      endpoint,
      "access-only-for-this-relay"
    );
    expect(result.relay.addresses).toEqual([wss, webrtc]);
  });

  it("rejects oversized discovery without returning a document", async () => {
    const host = {
      supportsAddress: () => true,
    } as unknown as AndroidManagedRelayHost;
    const adapter = createAndroidManagedRelayAdapter(
      host,
      {} as AndroidManagedRelayAuth,
      {
        getDiscovery: async () => ({ status: 200, body: "x".repeat(16_385) }),
      },
      () => undefined
    );
    await expect(
      adapter.discover(endpoint, "token", new AbortController().signal)
    ).rejects.toThrow("discovery_too_large");
  });
});
