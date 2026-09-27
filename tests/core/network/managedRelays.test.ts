jest.mock(
  "@multiformats/multiaddr",
  () => ({
    multiaddr: (address: string) => {
      if (!address.startsWith("/")) throw new Error("invalid multiaddr");
      return { toString: () => address };
    },
  }),
  { virtual: true }
);

import {
  normalizeRelayConfigurations,
  loadManagedRelayConfigurations,
  saveManagedRelayConfigurations,
  normalizeDiscoveryResponse,
  normalizeRelayAuthResponse,
} from "../../../packages/core/network/managedRelays";

describe("managed relay configuration", () => {
  it("canonicalizes discovery URLs and rejects duplicate endpoints", () => {
    expect(() =>
      normalizeRelayConfigurations([
        {
          key: "one",
          name: "First",
          kind: "managed",
          discoveryUrl: "https://EXAMPLE.com:443/v1/relay",
        },
        {
          key: "two",
          name: "Second",
          kind: "managed",
          discoveryUrl: "https://example.com/v1/relay",
        },
      ])
    ).toThrow(/duplicate discovery/i);
  });
});

import {
  ManagedRelayController,
  type ManagedRelayAdapter,
  RelayOperationError,
} from "../../../packages/core/network/managedRelays";

const peer = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
const address = `/dns4/relay.example/tcp/443/wss/p2p/${peer}`;

function adapterHarness() {
  const calls: string[] = [];
  const connection = {
    verifiedPeerId: peer,
    close: jest.fn(async () => {
      calls.push("close");
    }),
  };
  const adapter: ManagedRelayAdapter = {
    accessToken: jest.fn(async () => {
      calls.push("token");
      return "secret";
    }),
    discover: jest.fn(async () => {
      calls.push("discover");
      return {
        version: 1 as const,
        relay: { peerId: peer, addresses: [address] },
        validUntil: Date.now() + 30_000,
      };
    }),
    supportsAddress: () => true,
    dial: jest.fn(async () => {
      calls.push("dial");
      return connection;
    }),
    authenticate: jest.fn(async () => {
      calls.push("auth");
      return {
        sessionExpiresAt: Date.now() + 60_000,
        renewAfterMillis: 40_000,
      };
    }),
    reserve: jest.fn(async () => {
      calls.push("reserve");
      return {
        release: jest.fn(async () => {
          calls.push("release");
        }),
      };
    }),
    register: jest.fn(async () => {
      calls.push("register");
    }),
    unregister: jest.fn(async () => {
      calls.push("unregister");
    }),
    signedPeerRecord: jest.fn(async () => Uint8Array.of(1, 2, 3)),
    eraseCredentials: jest.fn(async () => {
      calls.push("erase");
    }),
    interactiveLogin: jest.fn(async () => {
      calls.push("login");
    }),
    openAccount: jest.fn(async () => {
      calls.push("account");
    }),
  };
  return { adapter, calls, connection };
}

describe("managed relay controller", () => {
  it("establishes a managed relay only after verified dial and authentication", async () => {
    const { adapter, calls } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([
      {
        key: "a",
        name: "Alpha",
        kind: "managed",
        discoveryUrl: "https://relay.example/v1/relay",
      },
    ]);
    expect(controller.states()).toEqual([
      expect.objectContaining({ key: "a", status: "ready", peerId: peer }),
    ]);
    expect(calls.slice(0, 6)).toEqual([
      "token",
      "discover",
      "dial",
      "auth",
      "reserve",
      "register",
    ]);
    await controller.stop();
  });
});

describe("managed relay adapter conformance", () => {
  const config = {
    key: "a",
    name: "Alpha",
    kind: "managed" as const,
    discoveryUrl: "https://relay.example/v1/relay",
  };

  it("rejects mixed and duplicate explicit configurations", () => {
    expect(() =>
      normalizeRelayConfigurations([{ ...config, addresses: [address] }])
    ).toThrow(/mixed/i);
    expect(() =>
      normalizeRelayConfigurations([
        {
          key: "a",
          name: "A",
          kind: "explicit",
          peerId: peer,
          addresses: [address],
        },
        {
          key: "b",
          name: "B",
          kind: "explicit",
          peerId: peer,
          addresses: [address],
        },
      ])
    ).toThrow(/duplicate explicit/i);
  });

  it("rejects wrong verified Peer ID before authentication and closes the candidate", async () => {
    const { adapter } = adapterHarness();
    const wrong = {
      verifiedPeerId: "wrong",
      close: jest.fn(async () => undefined),
    };
    adapter.dial = jest.fn(async () => wrong);
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([config]);
    expect(adapter.authenticate).not.toHaveBeenCalled();
    expect(wrong.close).toHaveBeenCalledTimes(1);
    expect(controller.states()[0].status).toBe("retrying");
    await controller.stop();
  });

  it("keeps the reservation and repairs Rendezvous after registration failure", async () => {
    const { adapter, connection } = adapterHarness();
    const register = adapter.register as jest.Mock;
    register.mockRejectedValueOnce(new Error("rv_down"));
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([config]);
    expect(controller.states()[0].status).toBe("degraded");
    expect(connection.close).not.toHaveBeenCalled();
    await controller.retry("a");
    expect(controller.states()[0].status).toBe("degraded");
    await controller.stop();
  });

  it("only falls back to Rendezvous v1 when v2 negotiation is unsupported", async () => {
    const { adapter } = adapterHarness();
    const register = adapter.register as jest.Mock;
    register.mockRejectedValueOnce(new Error("unsupported_protocol"));
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([config]);
    expect(register).toHaveBeenCalledTimes(1);
    expect(controller.states()[0].status).toBe("degraded");
    await controller.stop();
  });

  it("keeps credentials on refusal and honors a longer retry hint even for manual retry", async () => {
    const { adapter } = adapterHarness();
    adapter.authenticate = jest.fn(async () => {
      throw new RelayOperationError("quota_exhausted", 600_000);
    });
    let now = 1_000_000;
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: { peerId: peer, addresses: [address] },
      validUntil: now + 30_000,
    }));
    const controller = new ManagedRelayController(
      adapter,
      () => 0,
      () => now
    );
    await controller.setConfigurations([config]);
    expect(controller.states()[0]).toEqual(
      expect.objectContaining({ status: "refused", retryAt: now + 600_000 })
    );
    await controller.retry("a");
    expect(adapter.authenticate).toHaveBeenCalledTimes(1);
    now += 600_000;
    await controller.retry("a");
    expect(adapter.authenticate).toHaveBeenCalledTimes(2);
    expect(adapter.eraseCredentials).not.toHaveBeenCalled();
    await controller.stop();
  });
});

describe("independent relay ownership", () => {
  const a = {
    key: "a",
    name: "A",
    kind: "managed" as const,
    discoveryUrl: "https://a.example/v1/relay",
  };
  const b = {
    key: "b",
    name: "B",
    kind: "managed" as const,
    discoveryUrl: "https://b.example/v1/relay",
  };

  it("flags same-Peer-ID discovery conflict without giving the second endpoint a token to authenticate", async () => {
    const { adapter } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([a]);
    await controller.setConfigurations([a, b]);
    expect(controller.states().map((state) => state.status)).toEqual([
      "ready",
      "conflict",
    ]);
    expect(adapter.authenticate).toHaveBeenCalledTimes(1);
    await controller.stop();
  });

  it("preserves the owned connection across metadata and address edits, then removes only that relay", async () => {
    const { adapter, connection } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    const explicit = {
      key: "a",
      name: "Old",
      kind: "explicit" as const,
      peerId: peer,
      addresses: [address],
    };
    await controller.setConfigurations([explicit]);
    await controller.setConfigurations([
      {
        ...explicit,
        name: "New",
        addresses: [address, `/dns4/new.example/tcp/443/wss/p2p/${peer}`],
      },
    ]);
    expect(adapter.dial).toHaveBeenCalledTimes(1);
    expect(connection.close).not.toHaveBeenCalled();
    expect(controller.states()[0]).toEqual(
      expect.objectContaining({ name: "New", status: "ready" })
    );
    await controller.setConfigurations([]);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(adapter.eraseCredentials).not.toHaveBeenCalled();
    await controller.stop();
  });

  it("starts empty and never starts interactive login or imports legacy addresses", async () => {
    const { adapter } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([]);
    expect(controller.states()).toEqual([]);
    expect(adapter.dial).not.toHaveBeenCalled();
    expect(adapter.interactiveLogin).not.toHaveBeenCalled();
    await controller.stop();
  });

  it("caps active setup at four and closes a late losing dial candidate", async () => {
    const { adapter } = adapterHarness();
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    adapter.dial = jest.fn(async (addr: string) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return {
        verifiedPeerId: addr.split("/p2p/").pop()!,
        close: jest.fn(async () => undefined),
      };
    });
    const configs = Array.from({ length: 5 }, (_, index) => ({
      key: `${index}`,
      name: `${index}`,
      kind: "explicit" as const,
      peerId: `peer-${index}`,
      addresses: [`/dns4/${index}.example/tcp/443/wss/p2p/peer-${index}`],
    }));
    const controller = new ManagedRelayController(adapter);
    const starting = controller.setConfigurations(configs);
    await new Promise((resolve) => setImmediate(resolve));
    expect(maximum).toBe(4);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setImmediate(resolve));
    releases.splice(0).forEach((release) => release());
    await starting;
    expect(controller.states().every((state) => state.status === "ready")).toBe(
      true
    );
    await controller.stop();
  });
});

describe("three-relay adapter scenario", () => {
  const relayA = {
    key: "a",
    name: "Account A",
    kind: "managed" as const,
    discoveryUrl: "https://a.example/v1/relay",
  };
  const relayB = {
    key: "b",
    name: "Account B",
    kind: "managed" as const,
    discoveryUrl: "https://b.example/v1/relay",
  };
  const relayC = {
    key: "c",
    name: "Community",
    kind: "explicit" as const,
    peerId: "peer-c",
    addresses: ["/dns4/c.example/tcp/443/wss/p2p/peer-c"],
  };

  it("keeps two managed relays, an explicit relay and a direct peer independent through failure and edit", async () => {
    const events: string[] = [];
    const directPeer = { close: jest.fn(async () => undefined) };
    const connections = new Map<
      string,
      { verifiedPeerId: string; close: jest.Mock }
    >();
    const adapter: ManagedRelayAdapter = {
      accessToken: jest.fn(async (url) => `token:${url}`),
      discover: jest.fn(async (url) => {
        const host = new URL(url).hostname;
        return {
          version: 1 as const,
          relay: {
            peerId: host,
            addresses: [`/dns4/${host}/tcp/443/wss/p2p/${host}`],
          },
          validUntil: Date.now() + 30_000,
        };
      }),
      supportsAddress: () => true,
      dial: jest.fn(async (addr) => {
        const verifiedPeerId = addr.split("/p2p/").pop()!;
        const connection = {
          verifiedPeerId,
          close: jest.fn(async () => {
            events.push(`close:${verifiedPeerId}`);
          }),
        };
        connections.set(verifiedPeerId, connection);
        return connection;
      }),
      authenticate: jest.fn(async (connection, token) => {
        events.push(`auth:${connection.verifiedPeerId}:${token}`);
        return {
          sessionExpiresAt: Date.now() + 60_000,
          renewAfterMillis: 40_000,
        };
      }),
      reserve: jest.fn(async (connection) => {
        events.push(`reserve:${connection.verifiedPeerId}`);
        return {
          release: async () => {
            events.push(`release:${connection.verifiedPeerId}`);
          },
        };
      }),
      register: jest.fn(async (connection) => {
        events.push(`register:${connection.verifiedPeerId}`);
      }),
      signedPeerRecord: jest.fn(async () => Uint8Array.of(9)),
      unregister: jest.fn(async () => undefined),
      eraseCredentials: jest.fn(async (url) => {
        events.push(`erase:${url}`);
      }),
      interactiveLogin: jest.fn(async () => undefined),
      openAccount: jest.fn(async () => undefined),
    };
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([relayA, relayB, relayC]);
    expect(controller.states().map((state) => state.status)).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(
      events.indexOf("auth:a.example:token:https://a.example/v1/relay")
    ).toBeLessThan(events.indexOf("reserve:a.example"));
    expect(
      events.indexOf("auth:b.example:token:https://b.example/v1/relay")
    ).toBeLessThan(events.indexOf("reserve:b.example"));
    expect(events).not.toContain(
      "auth:peer-c:token:https://a.example/v1/relay"
    );
    await controller.connectionLost("a", connections.get("a.example"));
    expect(controller.states().map((state) => state.status)).toEqual([
      "retrying",
      "ready",
      "ready",
    ]);
    expect(connections.get("b.example")!.close).not.toHaveBeenCalled();
    expect(connections.get("peer-c")!.close).not.toHaveBeenCalled();
    await controller.setConfigurations([
      { ...relayA, discoveryUrl: "https://a-new.example/v1/relay" },
      relayB,
      relayC,
    ]);
    expect(controller.states().map((state) => state.status)).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(events).toContain("erase:https://a.example/v1/relay");
    expect(connections.get("b.example")!.close).not.toHaveBeenCalled();
    expect(directPeer.close).not.toHaveBeenCalled();
    await controller.stop();
  });

  it("closes the late loser of a two-address race", async () => {
    const { adapter } = adapterHarness();
    const slow = {
      verifiedPeerId: peer,
      close: jest.fn(async () => undefined),
    };
    const fast = {
      verifiedPeerId: peer,
      close: jest.fn(async () => undefined),
    };
    let releaseSlow: (() => void) | undefined;
    adapter.dial = jest.fn((addr: string) =>
      addr.includes("slow")
        ? new Promise((resolve) => {
            releaseSlow = () => resolve(slow);
          })
        : Promise.resolve(fast)
    );
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([
      {
        key: "x",
        name: "X",
        kind: "explicit",
        peerId: peer,
        addresses: [
          `/dns4/slow.example/tcp/443/wss/p2p/${peer}`,
          `/dns4/fast.example/tcp/443/wss/p2p/${peer}`,
        ],
      },
    ]);
    expect(controller.states()[0].status).toBe("ready");
    releaseSlow?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(slow.close).toHaveBeenCalledTimes(1);
    expect(fast.close).not.toHaveBeenCalled();
    await controller.stop();
  });
});

describe("signed reachability route selection", () => {
  it("keeps direct routes and ignores unconfigured relays without changing the input", async () => {
    const { adapter } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    const direct = "/dns4/device.example/tcp/443/wss/p2p/device";
    const allowed = `${address}/p2p-circuit/p2p/device`;
    const unknown =
      "/dns4/other.example/tcp/443/wss/p2p/other-relay/p2p-circuit/p2p/device";
    const signedAddresses = [direct, allowed, unknown];
    expect(controller.eligibleDialAddresses(signedAddresses)).toEqual([direct]);
    await controller.setConfigurations([
      {
        key: "a",
        name: "A",
        kind: "explicit",
        peerId: peer,
        addresses: [address],
      },
    ]);
    expect(controller.eligibleDialAddresses(signedAddresses)).toEqual([
      direct,
      allowed,
    ]);
    expect(signedAddresses).toEqual([direct, allowed, unknown]);
    await controller.stop();
  });
});

describe("timing and credential actions", () => {
  const config = {
    key: "a",
    name: "A",
    kind: "managed" as const,
    discoveryUrl: "https://a.example/v1/relay",
  };

  it("bounds discovery by ten seconds even if the adapter never completes", async () => {
    jest.useFakeTimers();
    try {
      const { adapter } = adapterHarness();
      adapter.discover = jest.fn(() => new Promise(() => undefined));
      const controller = new ManagedRelayController(adapter, () => 0);
      const starting = controller.setConfigurations([config]);
      await jest.advanceTimersByTimeAsync(10_000);
      await starting;
      expect(controller.states()[0]).toEqual(
        expect.objectContaining({
          status: "retrying",
          reason: "deadline_exceeded",
        })
      );
      await controller.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it("refreshes discovery after its validity expires", async () => {
    const { adapter, connection } = adapterHarness();
    let now = 1_000_000;
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: { peerId: peer, addresses: [address] },
      validUntil: now + 30_000,
    }));
    const controller = new ManagedRelayController(
      adapter,
      () => 0,
      () => now
    );
    await controller.setConfigurations([config]);
    now += 31_000;
    await controller.connectionLost("a", connection);
    now += 1_000;
    await controller.retry("a");
    expect(adapter.discover).toHaveBeenCalledTimes(2);
    await controller.stop();
  });

  it("single-flights concurrent refresh and opens login only after an explicit action", async () => {
    const { adapter } = adapterHarness();
    let resolveToken: ((token: string) => void) | undefined;
    const access = adapter.accessToken as jest.Mock;
    access
      .mockImplementationOnce(async () => "initial")
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveToken = resolve;
          })
      );
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([config]);
    const first = controller.refreshSession("a");
    const second = controller.refreshSession("a");
    await Promise.resolve();
    expect(access).toHaveBeenCalledTimes(2);
    expect(adapter.interactiveLogin).not.toHaveBeenCalled();
    resolveToken?.("renewed");
    await Promise.all([first, second]);
    expect(adapter.authenticate).toHaveBeenCalledTimes(2);
    await controller.manageAccount("a");
    expect(adapter.openAccount).toHaveBeenCalledWith(config.discoveryUrl);
    expect(adapter.interactiveLogin).not.toHaveBeenCalled();
    await controller.stop();
  });
});

describe("address race pacing", () => {
  it("staggers the second address candidate while keeping two as the maximum", async () => {
    jest.useFakeTimers();
    try {
      const { adapter } = adapterHarness();
      adapter.dial = jest.fn((addr: string) =>
        addr.includes("slow")
          ? new Promise(() => undefined)
          : Promise.resolve({
              verifiedPeerId: peer,
              close: jest.fn(async () => undefined),
            })
      );
      const controller = new ManagedRelayController(adapter);
      const starting = controller.setConfigurations([
        {
          key: "a",
          name: "A",
          kind: "explicit",
          peerId: peer,
          addresses: [
            `/dns4/slow.example/tcp/443/wss/p2p/${peer}`,
            `/dns4/fast.example/tcp/443/wss/p2p/${peer}`,
          ],
        },
      ]);
      await Promise.resolve();
      expect(adapter.dial).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(100);
      await starting;
      expect(adapter.dial).toHaveBeenCalledTimes(2);
      await controller.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("discovery freshness", () => {
  it("refreshes the document at validUntil without closing an active authenticated circuit", async () => {
    jest.useFakeTimers();
    try {
      const { adapter, connection } = adapterHarness();
      adapter.discover = jest.fn(async () => ({
        version: 1 as const,
        relay: { peerId: peer, addresses: [address] },
        validUntil: Date.now() + 1_000,
      }));
      const controller = new ManagedRelayController(adapter);
      await controller.setConfigurations([
        {
          key: "a",
          name: "A",
          kind: "managed",
          discoveryUrl: "https://a.example/v1/relay",
        },
      ]);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(adapter.discover).toHaveBeenCalledTimes(2);
      expect(connection.close).not.toHaveBeenCalled();
      expect(controller.states()[0].status).toBe("ready");
      await controller.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("session renewal", () => {
  it("keeps the existing reservation after a limit refusal and renews the same connection after the hint", async () => {
    const { adapter, connection } = adapterHarness();
    let now = 1_000_000;
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: { peerId: peer, addresses: [address] },
      validUntil: now + 30_000,
    }));
    const auth = jest
      .fn()
      .mockImplementationOnce(async () => ({
        sessionExpiresAt: now + 900_000,
        renewAfterMillis: 40_000,
      }))
      .mockImplementationOnce(async () => {
        throw new RelayOperationError("session_limit_exceeded", 300_000);
      })
      .mockImplementationOnce(async () => ({
        sessionExpiresAt: now + 600_000,
        renewAfterMillis: 40_000,
      }));
    adapter.authenticate = auth;
    const controller = new ManagedRelayController(
      adapter,
      () => 0,
      () => now
    );
    await controller.setConfigurations([
      {
        key: "a",
        name: "A",
        kind: "managed",
        discoveryUrl: "https://a.example/v1/relay",
      },
    ]);
    await controller.refreshSession("a");
    expect(controller.states()[0]).toEqual(
      expect.objectContaining({ status: "refused", retryAt: now + 300_000 })
    );
    expect(connection.close).not.toHaveBeenCalled();
    expect(
      controller.eligibleDialAddresses([`${address}/p2p-circuit/p2p/device`])
    ).toEqual([`${address}/p2p-circuit/p2p/device`]);
    await controller.retry("a");
    expect(auth).toHaveBeenCalledTimes(2);
    now += 300_000;
    await controller.retry("a");
    expect(auth).toHaveBeenCalledTimes(3);
    expect(adapter.dial).toHaveBeenCalledTimes(1);
    expect(controller.states()[0].status).toBe("ready");
    await controller.stop();
  });
});

describe("new-model relay settings persistence", () => {
  it("starts empty without a legacy import and retains later normalized settings", async () => {
    let saved: unknown = null;
    const store = {
      readNewModel: async () => saved,
      writeNewModel: async (values: unknown) => {
        saved = values;
      },
    };
    expect(await loadManagedRelayConfigurations(store)).toEqual([]);
    const expected = [
      {
        key: "a",
        name: "A",
        kind: "managed" as const,
        discoveryUrl: "https://relay.example/v1/relay",
      },
    ];
    await saveManagedRelayConfigurations(store, expected);
    expect(await loadManagedRelayConfigurations(store)).toEqual(expected);
  });
});

describe("late reservation ownership", () => {
  it("releases a reservation handle that arrives after the whole-operation deadline", async () => {
    jest.useFakeTimers();
    try {
      const { adapter, connection } = adapterHarness();
      const release = jest.fn(async () => undefined);
      let finishReserve:
        ((value: { release(): Promise<void> }) => void) | undefined;
      adapter.reserve = jest.fn(
        () =>
          new Promise((resolve) => {
            finishReserve = resolve;
          })
      );
      const controller = new ManagedRelayController(adapter, () => 0);
      const starting = controller.setConfigurations([
        {
          key: "a",
          name: "A",
          kind: "explicit",
          peerId: peer,
          addresses: [address],
        },
      ]);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(15_000);
      await starting;
      expect(controller.states()[0].status).toBe("retrying");
      finishReserve?.({ release });
      await Promise.resolve();
      await Promise.resolve();
      expect(release).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
      await controller.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("reviewed lifecycle races", () => {
  it("does not resurrect an older settings reconciliation after a newer empty update", async () => {
    const { adapter } = adapterHarness();
    const first = {
      key: "a",
      name: "A",
      kind: "managed" as const,
      discoveryUrl: "https://a.example/v1/relay",
    };
    const second = {
      key: "b",
      name: "B",
      kind: "managed" as const,
      discoveryUrl: "https://b.example/v1/relay",
    };
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([first]);
    let finishErase: (() => void) | undefined;
    adapter.eraseCredentials = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishErase = resolve;
        })
    );
    const older = controller.setConfigurations([second]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishErase).toBeDefined();
    await controller.setConfigurations([]);
    finishErase?.();
    await older;
    expect(controller.configurations()).toEqual([]);
    await controller.stop();
  });

  it("ignores a stale renewal result after its connection is lost", async () => {
    const { adapter, connection } = adapterHarness();
    const access = adapter.accessToken as jest.Mock;
    let finishToken: ((token: string) => void) | undefined;
    access
      .mockImplementationOnce(async () => "initial")
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finishToken = resolve;
          })
      );
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([
      {
        key: "a",
        name: "A",
        kind: "managed",
        discoveryUrl: "https://a.example/v1/relay",
      },
    ]);
    const renewing = controller.refreshSession("a");
    await Promise.resolve();
    await controller.connectionLost("a", connection);
    finishToken?.("late");
    await renewing;
    expect(controller.states()[0].status).toBe("retrying");
    expect(adapter.authenticate).toHaveBeenCalledTimes(1);
    await controller.stop();
  });

  it("ignores stale Rendezvous repair completion after connection loss", async () => {
    const { adapter, connection } = adapterHarness();
    let now = Date.now();
    let finishRegister: (() => void) | undefined;
    (adapter.register as jest.Mock)
      .mockRejectedValueOnce(new Error("rv_down"))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishRegister = resolve;
          })
      );
    const controller = new ManagedRelayController(
      adapter,
      () => 0,
      () => now
    );
    await controller.setConfigurations([
      {
        key: "a",
        name: "A",
        kind: "managed",
        discoveryUrl: "https://a.example/v1/relay",
      },
    ]);
    now += 1_000;
    const repairing = controller.retry("a");
    await Promise.resolve();
    await controller.connectionLost("a", connection);
    finishRegister?.();
    await repairing;
    expect(controller.states()[0].status).toBe("retrying");
    await controller.stop();
  });

  it("compensates a late Rendezvous registration after removal", async () => {
    jest.useFakeTimers();
    try {
      const { adapter } = adapterHarness();
      let finishRegister: (() => void) | undefined;
      adapter.register = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finishRegister = resolve;
          })
      );
      adapter.unregister = jest.fn(async () => undefined);
      const controller = new ManagedRelayController(adapter, () => 0);
      const starting = controller.setConfigurations([
        {
          key: "a",
          name: "A",
          kind: "explicit",
          peerId: peer,
          addresses: [address],
        },
      ]);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(12_000);
      await starting;
      await controller.remove("a");
      expect(adapter.unregister).toHaveBeenCalledTimes(1);
      finishRegister?.();
      await Promise.resolve();
      await Promise.resolve();
      expect(adapter.unregister).toHaveBeenCalledTimes(2);
      await controller.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("complete relay addresses", () => {
  it("rejects a bare Peer ID multiaddr for an explicit relay", () => {
    expect(() =>
      normalizeRelayConfigurations([
        {
          key: "a",
          name: "A",
          kind: "explicit",
          peerId: peer,
          addresses: [`/p2p/${peer}`],
        },
      ])
    ).toThrow(/complete|dialable/i);
  });

  it("rejects a discovery document with a bare Peer ID multiaddr before dialing", async () => {
    const { adapter } = adapterHarness();
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: { peerId: peer, addresses: [`/p2p/${peer}`] },
      validUntil: Date.now() + 30_000,
    }));
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([
      {
        key: "a",
        name: "A",
        kind: "managed",
        discoveryUrl: "https://a.example/v1/relay",
      },
    ]);
    expect(adapter.dial).not.toHaveBeenCalled();
    expect(controller.states()[0].status).toBe("retrying");
    await controller.stop();
  });
});

describe("exact discovery endpoint and Go wire timestamps", () => {
  it("rejects discovery URLs outside the exact /v1/relay route", () => {
    expect(() =>
      normalizeRelayConfigurations([
        {
          key: "a",
          name: "A",
          kind: "managed",
          discoveryUrl: "https://relay.example/other",
        },
      ])
    ).toThrow(/v1\/relay/);
    expect(() =>
      normalizeRelayConfigurations([
        {
          key: "a",
          name: "A",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay/",
        },
      ])
    ).toThrow(/v1\/relay/);
  });

  it("normalizes the actual discovery and auth RFC3339 wire fields into epoch milliseconds", () => {
    const discovery = normalizeDiscoveryResponse({
      version: 1,
      relay: { peerId: peer, addresses: [address] },
      validUntil: "2026-09-27T17:10:00Z",
    });
    expect(discovery.validUntil).toBe(Date.UTC(2026, 8, 27, 17, 10, 0));
    const auth = normalizeRelayAuthResponse({
      ok: true,
      sessionExpiresAt: "2026-09-27T17:20:00.123Z",
      renewAfterMillis: 120_000,
    });
    expect(auth).toEqual({
      sessionExpiresAt: Date.UTC(2026, 8, 27, 17, 20, 0, 123),
      renewAfterMillis: 120_000,
    });
    expect(() =>
      normalizeDiscoveryResponse({
        version: 1,
        relay: { peerId: peer, addresses: [address] },
        validUntil: Date.now(),
      })
    ).toThrow(/RFC3339/);
    expect(() =>
      normalizeRelayAuthResponse({
        ok: true,
        sessionExpiresAt: "2026-09-27T17:20:00+00:00",
        renewAfterMillis: 1_000,
      })
    ).toThrow(/RFC3339/);
  });
});
