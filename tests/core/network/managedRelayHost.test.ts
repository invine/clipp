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
    expect(
      host.supportsAddress(`/dns4/relay.example/tcp/443/tls/ws/p2p/${peer}`)
    ).toBe(true);
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
    expect(events).not.toContain("release");
    expect(events.filter((event) => event === "close:new")).toHaveLength(1);
  });

  it("releases one reservation without cancelling another and reuses its idle listener", async () => {
    const active = new Set<string>();
    const listeners: any[] = [];
    const callbacks = new Set<(event: unknown) => void>();
    let created = 0;
    let cancelledAll = 0;
    let failCloseForE = true;
    const removedObserved: string[] = [];
    const store = {
      addEventListener: (_name: string, callback: (event: unknown) => void) => {
        callbacks.add(callback);
      },
      removeEventListener: (
        _name: string,
        callback: (event: unknown) => void
      ) => {
        callbacks.delete(callback);
      },
      cancelReservations: () => {
        cancelledAll++;
        active.clear();
      },
    };
    const reserve = async (address: string) => {
      const peer = address.split("/p2p/")[1].split("/")[0];
      active.add(peer);
      for (const callback of callbacks)
        callback({
          detail: {
            relay: { toString: () => peer },
            details: { type: "configured", connection: `connection-${peer}` },
          },
        });
    };
    const node = {
      getConnections: () => [],
      dial: async (address: { toString(): string }) => {
        const peer = address.toString().split("/p2p/")[1];
        return {
          id: `connection-${peer}`,
          remotePeer: { toString: () => peer },
          close: async () => {
            if (peer === "e" && failCloseForE) {
              failCloseForE = false;
              throw new Error("connection_close_failed");
            }
            active.delete(peer);
          },
        };
      },
      getMultiaddrs: () =>
        [...active].map(
          (peer) =>
            `/dns4/${peer}.example/tcp/443/tls/ws/p2p/${peer}/p2p-circuit`
        ),
      components: {
        transportManager: {
          getListeners: () => listeners,
          getTransports: () => [
            {
              [Symbol.toStringTag]: "@libp2p/circuit-relay-v2-transport",
              reservationStore: store,
            },
          ],
          listen: async (addresses: Array<{ toString(): string }>) => {
            const listener = {
              constructor: { name: "CircuitRelayTransportListener" },
              listeningAddrs: [] as string[],
              getAddrs() {
                return this.listeningAddrs;
              },
              addressManager: {
                removeObservedAddr: (address: string) => {
                  removedObserved.push(address);
                },
              },
              listen: async (address: { toString(): string }) => {
                await reserve(address.toString());
                listener.listeningAddrs = [address.toString()];
              },
              close: async () => store.cancelReservations(),
            };
            created++;
            listeners.push(listener);
            await listener.listen(addresses[0]);
            if (addresses[0].toString().includes("/p2p/d/"))
              throw new Error("partial_listen_failed");
          },
        },
      },
      peerStore: {
        merge: async (peer: { toString(): string }) => {
          if (peer.toString() === "a") throw new Error("tag_cleanup_failed");
        },
      },
    };
    const host = createManagedRelayHost(node, async () => new Uint8Array());
    const a = await host.dial(
      "/dns4/a.example/tcp/443/tls/ws/p2p/a",
      new AbortController().signal
    );
    const reservationA = await host.reserve(a, new AbortController().signal);
    const b = await host.dial(
      "/dns4/b.example/tcp/443/tls/ws/p2p/b",
      new AbortController().signal
    );
    await host.reserve(b, new AbortController().signal);
    await reservationA.release();
    expect(active).toEqual(new Set(["b"]));
    expect(cancelledAll).toBe(0);
    expect(removedObserved).toEqual([
      "/dns4/a.example/tcp/443/tls/ws/p2p/a/p2p-circuit",
    ]);
    const c = await host.dial(
      "/dns4/c.example/tcp/443/tls/ws/p2p/c",
      new AbortController().signal
    );
    await host.reserve(c, new AbortController().signal);
    expect(created).toBe(2);
    expect(active).toEqual(new Set(["b", "c"]));
    const d = await host.dial(
      "/dns4/d.example/tcp/443/tls/ws/p2p/d",
      new AbortController().signal
    );
    await expect(host.reserve(d, new AbortController().signal)).rejects.toThrow(
      "partial_listen_failed"
    );
    expect(active).toEqual(new Set(["b", "c"]));
    expect(cancelledAll).toBe(0);
    const e = await host.dial(
      "/dns4/e.example/tcp/443/tls/ws/p2p/e",
      new AbortController().signal
    );
    const reservationE = await host.reserve(e, new AbortController().signal);
    await expect(reservationE.release()).rejects.toThrow(
      "connection_close_failed"
    );
    expect(active).toContain("e");
    await reservationE.release();
    expect(active).toEqual(new Set(["b", "c"]));
  });
});
