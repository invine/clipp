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
  it("keeps one owner when concurrent address dials share a physical connection", async () => {
    const peer = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
    let finishDial: ((raw: typeof connection) => void) | undefined;
    const connection = {
      remotePeer: { toString: () => peer },
      close: jest.fn(async () => {}),
      newStream: async () => ({
        send: () => true,
        close: async () => {},
        async *[Symbol.asyncIterator]() {
          yield framed({
            ok: true,
            sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            renewAfterMillis: 30_000,
          });
        },
      }),
    };
    const pending = new Promise<typeof connection>((resolve) => {
      finishDial = resolve;
    });
    const node = { getConnections: () => [], dial: () => pending };
    const host = createManagedRelayHost(node, async () => new Uint8Array());
    const signal = new AbortController().signal;
    const first = host.dial(
      `/dns4/relay.example/tcp/443/tls/ws/p2p/${peer}`,
      signal
    );
    const second = host.dial(`/ip4/10.0.5.241/tcp/4001/p2p/${peer}`, signal);
    finishDial?.(connection);
    const results = await Promise.allSettled([first, second]);
    expect(results[1]).toMatchObject({
      status: "rejected",
      reason: new Error("relay_connection_not_new"),
    });
    expect(connection.close).not.toHaveBeenCalled();
    const owned = await first;
    await expect(
      host.authenticate(owned, "test-access", signal)
    ).resolves.toEqual(expect.objectContaining({ renewAfterMillis: 30_000 }));
    await owned.close();
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it.each(["CircuitRelayTransportListener", "fG"])(
    "authenticates and reserves with listener class %s",
    async (className) => {
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
          let writeClosed = false;
          let reading = false;
          let receiveEof: (() => void) | undefined;
          const eof = new Promise<void>((resolve) => {
            receiveEof = resolve;
          });
          return {
            send: (bytes: Uint8Array) => {
              sent.push(bytes);
              return true;
            },
            // Installed libp2p streams expose close() as the writable half-close.
            // They do not expose the older closeWrite() method.
            close: async () => {
              if (protocol.includes("relay-auth") && !reading)
                throw new Error("response_reader_not_started");
              if (!writeClosed && protocol.includes("relay-auth"))
                events.push("half-close");
              writeClosed = true;
              receiveEof?.();
            },
            async *[Symbol.asyncIterator]() {
              reading = true;
              if (protocol.includes("relay-auth")) await eof;
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
                      leaseExpiresAt: new Date(
                        Date.now() + 60_000
                      ).toISOString(),
                    }
              );
            },
          };
        },
      };
      let onReservation: ((event: unknown) => void) | undefined;
      const store = {
        addEventListener: (_name: string, cb: (event: unknown) => void) => {
          onReservation = cb;
        },
        removeEventListener: () => {
          onReservation = undefined;
        },
      };
      const listener = {
        constructor: { name: className },
        reservationStore: store,
        close: async () => {
          events.push("release");
        },
      };
      const listeners: unknown[] = [];
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
                reservationStore: store,
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
    }
  );

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
              reservationStore: store,
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

describe("managed relay exact lookup", () => {
  it.each([1, 2] as const)(
    "looks up fresh reachability on its authenticated v%s connection",
    async (version) => {
      const payloads: any[] = [];
      const record = Uint8Array.of(1, 2, 3);
      const raw = {
        remotePeer: { toString: () => "relay" },
        status: "open",
        close: jest.fn(async () => {}),
        newStream: jest.fn(async () => {
          let sent!: () => void;
          const written = new Promise<void>((resolve) => {
            sent = resolve;
          });
          return {
            send(bytes: Uint8Array) {
              payloads.push(
                JSON.parse(
                  new TextDecoder().decode(
                    version === 2 ? bytes.subarray(1) : bytes
                  )
                )
              );
              sent();
              return true;
            },
            close: async () => {},
            async *[Symbol.asyncIterator]() {
              await written;
              const value =
                payloads.at(-1).action === "lookup"
                  ? {
                      ok: true,
                      record: {
                        peer: "peer-1",
                        signedPeerRecord: version === 2 ? "AQID" : [1, 2, 3],
                      },
                    }
                  : { ok: true };
              yield version === 2
                ? framed(value)
                : new TextEncoder().encode(JSON.stringify(value));
            },
          };
        }),
      };
      const host = createManagedRelayHost(
        { getConnections: () => [], dial: async () => raw },
        async () => record
      );
      const connection = await host.dial(
        "/ip4/127.0.0.1/tcp/9/ws/p2p/relay",
        new AbortController().signal
      );
      await host.register(
        connection,
        record,
        version,
        new AbortController().signal
      );
      const found = await host.lookupPeer(
        "peer-1",
        new AbortController().signal
      );
      expect(found).toEqual(record);
      expect(payloads.at(-1)).toEqual({
        action: "lookup",
        topic: "clipp",
        peerId: "peer-1",
      });
      expect(raw.newStream.mock.calls).toHaveLength(2);
      expect(raw.close).not.toHaveBeenCalled();
    }
  );
});

describe("configured reservation renewal", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function fixture() {
    const callbacks = new Map<string, Set<(event: any) => void>>();
    const store = {
      addEventListener(name: string, callback: (event: any) => void) {
        const list = callbacks.get(name) ?? new Set();
        list.add(callback);
        callbacks.set(name, list);
      },
      removeEventListener(name: string, callback: (event: any) => void) {
        callbacks.get(name)?.delete(callback);
      },
    };
    const emit = (name: string, event: any) =>
      callbacks.get(name)?.forEach((callback) => callback(event));
    const payloads: any[] = [];
    const raw = {
      id: "authenticated",
      status: "open",
      remotePeer: { toString: () => "relay" },
      close: jest.fn(async () => {}),
      newStream: async () => ({
        send: (bytes: Uint8Array) => {
          payloads.push(
            JSON.parse(new TextDecoder().decode(bytes.subarray(1)))
          );
          return true;
        },
        close: async () => {},
        async *[Symbol.asyncIterator]() {
          yield framed({
            ok: true,
            leaseExpiresAt: new Date(Date.now() + 10_000).toISOString(),
          });
        },
      }),
    };
    let addresses: string[] = [];
    const listener = {
      reservationStore: store,
      getAddrs: () => addresses,
      addedRelay: jest.fn(() => {
        addresses = ["/ip4/127.0.0.1/tcp/9/ws/p2p/relay/p2p-circuit"];
      }),
      listeningAddrs: [],
      safeDispatchEvent: jest.fn(),
    };
    const listeners: any[] = [];
    const reservation = {
      detail: {
        relay: raw.remotePeer,
        details: { type: "configured", connection: raw.id },
      },
    };
    const host = createManagedRelayHost(
      {
        getConnections: () => [],
        getMultiaddrs: () => addresses,
        dial: async () => raw,
        components: {
          transportManager: {
            getListeners: () => listeners,
            getTransports: () => [
              {
                [Symbol.toStringTag]: "@libp2p/circuit-relay-v2-transport",
                reservationStore: store,
              },
            ],
            listen: async () => {
              listeners.push(listener);
              listener.addedRelay();
              emit("relay:created-reservation", reservation);
            },
          },
        },
        peerStore: { merge: async () => {} },
      },
      async () => Uint8Array.of(2)
    );
    const owned = await host.dial(
      "/ip4/127.0.0.1/tcp/9/ws/p2p/relay",
      new AbortController().signal
    );
    const handle = await host.reserve(owned, new AbortController().signal);
    return {
      host,
      raw,
      owned,
      handle,
      callbacks,
      payloads,
      addresses: () => addresses,
      remove: () => {
        addresses = [];
        emit("relay:removed", reservation);
      },
      renew: (connection = raw.id) =>
        emit("relay:created-reservation", {
          detail: {
            ...reservation.detail,
            details: { ...reservation.detail.details, connection },
          },
        }),
    };
  }

  it("restores advertised addresses only for its authenticated connection and detaches on release", async () => {
    const f = await fixture();
    f.remove();
    f.renew("unrelated");
    expect(f.addresses()).toHaveLength(0);
    f.renew();
    expect(f.addresses()).toHaveLength(1);
    await f.handle.release();
    expect(f.callbacks.get("relay:created-reservation")?.size).toBe(0);
    expect(f.callbacks.get("relay:removed")?.size).toBe(0);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(f.raw.close).toHaveBeenCalledTimes(1);
  });

  it("refreshes registration before lease expiry using current reachability and stops after release", async () => {
    const f = await fixture();
    await f.host.register(
      f.owned,
      Uint8Array.of(1),
      2,
      new AbortController().signal
    );
    await jest.advanceTimersByTimeAsync(5_000);
    expect(f.payloads).toEqual([
      { action: "register", topic: "clipp", signedPeerRecord: "AQ" },
      { action: "register", topic: "clipp", signedPeerRecord: "Ag" },
    ]);
    await f.handle.release();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(f.payloads).toHaveLength(2);
  });

  it("closes lost reservation ownership after the renewal grace period", async () => {
    const f = await fixture();
    f.remove();
    await jest.advanceTimersByTimeAsync(5_999);
    expect(f.raw.close).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(f.raw.close).toHaveBeenCalledTimes(1);
    expect(f.callbacks.get("relay:created-reservation")?.size).toBe(0);
    await f.handle.release();
  });
});

it("rejects and closes a fresh raw connection that arrives after dial cancellation", async () => {
  let finish: ((raw: typeof connection) => void) | undefined;
  const connection = {
    remotePeer: { toString: () => "relay" },
    close: jest.fn(async () => {}),
  };
  const host = createManagedRelayHost(
    {
      getConnections: () => [],
      dial: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    async () => new Uint8Array()
  );
  const controller = new AbortController();
  const dialing = host.dial(
    "/dns4/relay.example/tcp/4001/p2p/relay",
    controller.signal
  );
  controller.abort();
  finish?.(connection);
  await expect(dialing).rejects.toThrow("relay_dial_aborted");
  expect(connection.close).toHaveBeenCalledTimes(1);
});
