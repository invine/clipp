jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (address: string) => ({ toString: () => address }) }),
  { virtual: true }
);

import { createManagedRelayHost } from "../../../packages/core/network/managedRelayHost";

function framed(value: object): Uint8Array {
  const body = Buffer.from(JSON.stringify(value));
  const head: number[] = [];
  let length = body.length;
  while (length >= 128) {
    head.push((length & 127) | 128);
    length >>= 7;
  }
  head.push(length);
  return Buffer.concat([Buffer.from(head), body]);
}

describe("managed relay host boundary", () => {
  it("authenticates on the newly verified physical connection before reserving", async () => {
    const events: string[] = [];
    const peer = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
    const address = `/dns4/relay.example/tcp/443/wss/p2p/${peer}`;
    const sent: Uint8Array[] = [];
    const raw = {
      id: "new",
      remotePeer: { toString: () => peer },
      close: async () => {
        events.push("close:new");
      },
      newStream: async (protocol: string) => {
        events.push(`stream:${protocol}`);
        return {
          send: (bytes: Uint8Array) => {
            sent.push(bytes);
            return true;
          },
          closeWrite: async () => {
            events.push("half-close");
          },
          close: async () => undefined,
          async *[Symbol.asyncIterator]() {
            yield framed(
              protocol.includes("relay-auth")
                ? {
                    ok: true,
                    sessionExpiresAt: new Date(
                      Date.now() + 60_000
                    ).toISOString(),
                    renewAfterMillis: 30_000,
                  }
                : {
                    ok: true,
                    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                  }
            );
          },
        };
      },
    };
    const listener = {
      constructor: { name: "CircuitRelayTransportListener" },
      close: async () => {
        events.push("release");
      },
    };
    const listeners: unknown[] = [];
    let onReservation: ((event: unknown) => void) | undefined;
    let multiaddrs: string[] = [];
    const node = {
      getConnections: () => [],
      dial: async () => {
        events.push("dial");
        return raw;
      },
      getMultiaddrs: () => multiaddrs,
      components: {
        transportManager: {
          getListeners: () => listeners,
          getTransports: () => [
            {
              [Symbol.toStringTag]: "@libp2p/circuit-relay-v2-transport",
              reservationStore: {
                addEventListener: (
                  _name: string,
                  cb: (event: unknown) => void
                ) => {
                  onReservation = cb;
                },
                removeEventListener: () => {
                  onReservation = undefined;
                },
              },
            },
          ],
          listen: async () => {
            events.push("reserve");
            listeners.push(listener);
            multiaddrs = [`${address}/p2p-circuit`];
            onReservation?.({
              detail: {
                relay: raw.remotePeer,
                details: { type: "configured", connection: raw.id },
              },
            });
          },
        },
      },
      peerStore: { merge: async () => undefined },
    };
    const host = createManagedRelayHost(node, async () => Uint8Array.of(1));
    const connection = await host.dial(address, new AbortController().signal);
    expect(connection.verifiedPeerId).toBe(peer);
    await host.authenticate(
      connection,
      "access-secret",
      new AbortController().signal
    );
    const reservation = await host.reserve(
      connection,
      new AbortController().signal
    );
    expect(events).toEqual([
      "dial",
      "stream:/clipp/relay-auth/1.0.0",
      "half-close",
      "reserve",
    ]);
    expect(Array.from(sent[0])).toEqual([
      31,
      ...new TextEncoder().encode('{"accessToken":"access-secret"}'),
    ]);
    await host.register(
      connection,
      Uint8Array.of(1, 2, 3),
      2,
      new AbortController().signal
    );
    expect(Array.from(sent[1])).toEqual([
      63,
      ...new TextEncoder().encode(
        '{"action":"register","topic":"clipp","signedPeerRecord":"AQID"}'
      ),
    ]);
    await reservation.release();
    await connection.close();
    expect(events.slice(-2)).toEqual(["release", "close:new"]);
  });
});
