/// <reference types="chrome" />

jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import { createExtensionManagedRelayController } from "../../apps/extension/src/managedRelayOffscreen";

const peer = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
const wss = `/dns4/relay.example/tcp/443/wss/p2p/${peer}`;
const direct = `/ip4/192.0.2.1/udp/443/webrtc-direct/certhash/uEiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/p2p/${peer}`;
const configuration = {
  key: "managed",
  name: "Managed",
  kind: "managed" as const,
  discoveryUrl: "https://relay.example/v1/relay",
};

describe("Chrome offscreen managed relay controller", () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  });

  it.each([
    { acceptanceTransport: "wss" as const, expected: wss },
    { acceptanceTransport: "webrtc-direct" as const, expected: direct },
  ])(
    "uses only $acceptanceTransport for isolated relay acceptance",
    async ({ acceptanceTransport, expected }) => {
      let reply: (value: unknown) => void = () => {};
      globalThis.chrome = {
        runtime: {
          connect: () => ({
            onMessage: {
              addListener: (listener: typeof reply) => {
                reply = listener;
              },
            },
            onDisconnect: { addListener: () => {} },
            disconnect: () => {},
            postMessage: () =>
              queueMicrotask(() => reply({ accessToken: "synthetic-access" })),
          }),
        },
      } as unknown as typeof chrome;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            version: 1,
            relay: { peerId: peer, addresses: [wss, direct] },
            validUntil: new Date(Date.now() + 60_000).toISOString(),
          })
        );
      const dialed: string[] = [];
      const controller = createExtensionManagedRelayController({
        ...{ acceptanceTransport },
        host: {
          supportsAddress: () => true,
          async dial(address) {
            dialed.push(address);
            return { verifiedPeerId: peer, close: async () => {} };
          },
          authenticate: async () => ({
            sessionExpiresAt: Date.now() + 60_000,
            renewAfterMillis: 40_000,
          }),
          reserve: async () => ({ release: async () => {} }),
          register: async () => {},
          unregister: async () => {},
          signedPeerRecord: async () => Uint8Array.of(1),
        },
        onStateChange: () => {},
      });
      try {
        await controller.setConfigurations([configuration]);
        expect(controller.states()[0].status).toBe("ready");
        expect(dialed).toEqual([expected]);
      } finally {
        await controller.stop();
      }
    }
  );
});
