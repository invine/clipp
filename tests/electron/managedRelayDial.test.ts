jest.mock("electron", () => ({ shell: { openExternal: jest.fn() } }), {
  virtual: true,
});
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (address: string) => ({ toString: () => address }) }),
  { virtual: true }
);
import { createElectronManagedRelayAdapter } from "../../apps/electron/src/managedRelayAdapter";
import { createElectronManagedRelayAuth } from "../../apps/electron/src/managedRelayAuth";
import {
  ManagedRelayController,
  type ManagedRelayConnection,
} from "../../packages/core/network/managedRelays";

it("reaches WSS when private TCP would stall the same-peer libp2p dial queue", async () => {
  jest.useFakeTimers();
  const peer = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
  const tcp = `/ip4/10.0.5.241/tcp/4001/p2p/${peer}`;
  const wss = `/dns4/relay.example/tcp/443/tls/ws/p2p/${peer}`;
  const endpoint = "https://relay.example/v1/relay";
  const connection = { verifiedPeerId: peer, close: jest.fn(async () => {}) };
  const auth = createElectronManagedRelayAuth({
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },
    protection: {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => "",
    },
    openExternal: async () => {},
  });
  await auth.acceptTokens(endpoint, {
    access_token: "test-access",
    refresh_token: "test-refresh",
    token_type: "Bearer",
    expires_in: 900,
  });
  let flight: Promise<ManagedRelayConnection> | undefined;
  const host = {
    supportsAddress: () => true,
    dial: jest.fn(
      (
        address: string,
        signal: AbortSignal
      ): Promise<ManagedRelayConnection> => {
        // The real libp2p DialQueue joins a pending dial for the same Peer ID,
        // even when the later call supplies a different transport address.
        if (flight) return flight;
        flight =
          address === tcp
            ? new Promise((_resolve, reject) => {
                signal.addEventListener(
                  "abort",
                  () => reject(new Error("aborted")),
                  { once: true }
                );
              })
            : Promise.resolve(connection);
        return flight;
      }
    ),
    authenticate: jest.fn(async () => ({
      sessionExpiresAt: Date.now() + 60_000,
      renewAfterMillis: 40_000,
    })),
    reserve: async () => ({ release: async () => {} }),
    register: async () => {},
    unregister: async () => {},
    signedPeerRecord: async () => new Uint8Array(),
  };
  const adapter = createElectronManagedRelayAdapter({
    auth,
    host: () => host,
    onStateChange: () => {},
  });
  adapter.discover = async () => ({
    version: 1,
    relay: { peerId: peer, addresses: [wss, tcp] },
    validUntil: Date.now() + 30_000,
  });
  const controller = new ManagedRelayController(adapter, () => 0);
  try {
    const setup = controller.setConfigurations([
      { key: "relay", name: "Relay", kind: "managed", discoveryUrl: endpoint },
    ]);
    await jest.advanceTimersByTimeAsync(20_001);
    await setup;
    expect(controller.states()[0].status).toBe("ready");
    expect(host.dial.mock.calls[0][0]).toBe(wss);
    expect(host.authenticate).toHaveBeenCalled();
  } finally {
    await controller.stop();
    jest.useRealTimers();
  }
});
