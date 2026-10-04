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

describe("managed relay discovery clock difference", () => {
  it.each([
    { lifetime: 60_194, accepted: true },
    { lifetime: 65_000, accepted: true },
    { lifetime: 65_001, accepted: false },
    { lifetime: 0, accepted: false },
  ])(
    "validates a $lifetime ms remaining lifetime",
    async ({ lifetime, accepted }) => {
      const { adapter, calls } = adapterHarness();
      const now = Date.now();
      adapter.discover = jest.fn(async () =>
        normalizeDiscoveryResponse({
          version: 1,
          relay: { peerId: peer, addresses: [address] },
          validUntil: new Date(now + lifetime).toISOString(),
        })
      );
      const controller = new ManagedRelayController(
        adapter,
        () => 0,
        () => now
      );
      try {
        await controller.setConfigurations([
          {
            key: "clock-probe",
            name: "Clock probe",
            kind: "managed",
            discoveryUrl: "https://relay.example/v1/relay",
          },
        ]);
        if (accepted) {
          expect(controller.states()[0].status).toBe("ready");
          expect(calls).toContain("auth");
        } else {
          expect(controller.states()[0].reason).toBe("invalid_discovery");
          expect(calls).not.toContain("dial");
        }
      } finally {
        await controller.stop();
      }
    }
  );

  it("refreshes a clock-ahead discovery document within one local minute", async () => {
    jest.useFakeTimers();
    const { adapter } = adapterHarness();
    adapter.discover = jest.fn(async () =>
      normalizeDiscoveryResponse({
        version: 1,
        relay: { peerId: peer, addresses: [address] },
        validUntil: new Date(Date.now() + 60_194).toISOString(),
      })
    );
    const controller = new ManagedRelayController(adapter);
    try {
      await controller.setConfigurations([
        {
          key: "clock-probe",
          name: "Clock probe",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay",
        },
      ]);
      expect(controller.states()[0].status).toBe("ready");
      await jest.advanceTimersByTimeAsync(59_999);
      expect(adapter.discover).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(adapter.discover).toHaveBeenCalledTimes(2);
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
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
    adapter.eraseCredentials = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishErase = resolve;
          })
      )
      .mockImplementation(async () => undefined);
    const older = controller.setConfigurations([second]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishErase).toBeDefined();
    const newer = controller.setConfigurations([]);
    finishErase?.();
    await Promise.all([older, newer]);
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

describe("public settings mutation ordering", () => {
  const original = {
    key: "a",
    name: "A",
    kind: "managed" as const,
    discoveryUrl: "https://a.example/v1/relay",
  };

  it("applies a direct remove after an in-flight identity replacement", async () => {
    const { adapter } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([original]);
    let finishUnregister: (() => void) | undefined;
    adapter.unregister = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishUnregister = resolve;
          })
      )
      .mockImplementation(async () => undefined);
    const replacement = {
      ...original,
      discoveryUrl: "https://new.example/v1/relay",
    };
    const updating = controller.setConfigurations([replacement]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishUnregister).toBeDefined();
    const removing = controller.remove("a");
    finishUnregister?.();
    await Promise.all([updating, removing]);
    expect(controller.configurations()).toEqual([]);
    await controller.stop();
  });

  it("finishes old endpoint erasure before a later re-add acquires fresh credentials", async () => {
    const { adapter } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    let storedCredential: string | null = "old";
    let accessCount = 0;
    adapter.accessToken = jest.fn(async () => {
      accessCount++;
      if (accessCount > 1) storedCredential = "new";
      return storedCredential;
    });
    await controller.setConfigurations([original]);
    let finishErase: (() => void) | undefined;
    adapter.eraseCredentials = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishErase = () => {
            storedCredential = null;
            resolve();
          };
        })
    );
    const removing = controller.setConfigurations([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishErase).toBeDefined();
    const adding = controller.setConfigurations([original]);
    finishErase?.();
    await Promise.all([removing, adding]);
    expect(storedCredential).toBe("new");
    expect(controller.states()[0].status).toBe("ready");
    await controller.stop();
  });
});

describe("independent public relay teardown", () => {
  const a = {
    key: "a",
    name: "A",
    kind: "explicit" as const,
    peerId: "peer-a",
    addresses: ["/dns4/a.example/tcp/443/wss/p2p/peer-a"],
  };
  const b = {
    key: "b",
    name: "B",
    kind: "explicit" as const,
    peerId: "peer-b",
    addresses: ["/dns4/b.example/tcp/443/wss/p2p/peer-b"],
  };

  it("removes B while A unregister is still pending", async () => {
    const { adapter } = adapterHarness();
    const connections = new Map<
      string,
      { verifiedPeerId: string; close: jest.Mock }
    >();
    adapter.dial = jest.fn(async (addr) => {
      const verifiedPeerId = addr.split("/p2p/").pop()!;
      const connection = {
        verifiedPeerId,
        close: jest.fn(async () => undefined),
      };
      connections.set(verifiedPeerId, connection);
      return connection;
    });
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([a, b]);
    let finishA: (() => void) | undefined;
    adapter.unregister = jest.fn((connection) =>
      connection.verifiedPeerId === "peer-a"
        ? new Promise<void>((resolve) => {
            finishA = resolve;
          })
        : Promise.resolve()
    );
    const removingA = controller.remove("a");
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishA).toBeDefined();
    const removingB = controller.remove("b");
    await new Promise((resolve) => setImmediate(resolve));
    expect(connections.get("peer-b")!.close).toHaveBeenCalledTimes(1);
    finishA?.();
    await Promise.all([removingA, removingB]);
    await controller.stop();
  });

  it("stops B while A credential erasure is still pending", async () => {
    const { adapter } = adapterHarness();
    const managedA = {
      key: "a",
      name: "A",
      kind: "managed" as const,
      discoveryUrl: "https://a.example/v1/relay",
    };
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: { peerId: "peer-a", addresses: a.addresses },
      validUntil: Date.now() + 30_000,
    }));
    const connections = new Map<
      string,
      { verifiedPeerId: string; close: jest.Mock }
    >();
    adapter.dial = jest.fn(async (addr) => {
      const verifiedPeerId = addr.split("/p2p/").pop()!;
      const connection = {
        verifiedPeerId,
        close: jest.fn(async () => undefined),
      };
      connections.set(verifiedPeerId, connection);
      return connection;
    });
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([managedA, b]);
    let finishErase: (() => void) | undefined;
    adapter.eraseCredentials = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishErase = resolve;
        })
    );
    const removingA = controller.remove("a");
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishErase).toBeDefined();
    const stopping = controller.stop();
    await new Promise((resolve) => setImmediate(resolve));
    expect(connections.get("peer-b")!.close).toHaveBeenCalledTimes(1);
    finishErase?.();
    await Promise.all([removingA, stopping]);
  });
});

describe("bounded independent shutdown", () => {
  it("reports an incomplete stop within fifteen seconds while closing an unrelated relay", async () => {
    jest.useFakeTimers();
    try {
      const { adapter } = adapterHarness();
      adapter.discover = jest.fn(async () => ({
        version: 1 as const,
        relay: {
          peerId: "peer-a",
          addresses: ["/dns4/a.example/tcp/443/wss/p2p/peer-a"],
        },
        validUntil: Date.now() + 30_000,
      }));
      const connections = new Map<
        string,
        { verifiedPeerId: string; close: jest.Mock }
      >();
      adapter.dial = jest.fn(async (addr) => {
        const verifiedPeerId = addr.split("/p2p/").pop()!;
        const connection = {
          verifiedPeerId,
          close: jest.fn(async () => undefined),
        };
        connections.set(verifiedPeerId, connection);
        return connection;
      });
      const controller = new ManagedRelayController(adapter);
      await controller.setConfigurations([
        {
          key: "a",
          name: "A",
          kind: "managed",
          discoveryUrl: "https://a.example/v1/relay",
        },
        {
          key: "b",
          name: "B",
          kind: "explicit",
          peerId: "peer-b",
          addresses: ["/dns4/b.example/tcp/443/wss/p2p/peer-b"],
        },
      ]);
      adapter.eraseCredentials = jest.fn(
        () => new Promise<void>(() => undefined)
      );
      void controller.remove("a").catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);
      let stopOutcome = "pending";
      void controller.stop().then(
        () => {
          stopOutcome = "completed";
        },
        (error) => {
          stopOutcome = (error as Error).message;
        }
      );
      await jest.advanceTimersByTimeAsync(15_000);
      expect(connections.get("peer-b")!.close).toHaveBeenCalledTimes(1);
      expect(stopOutcome).toBe("deadline_exceeded");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("relay ownership during teardown", () => {
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

  it("keeps a conflicting Peer ID claimed until its prior reservation and connection are released", async () => {
    const { adapter, calls } = adapterHarness();
    adapter.dial = jest.fn(async () => ({
      verifiedPeerId: peer,
      close: jest.fn(async () => {
        calls.push("close");
      }),
    }));
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([a, b]);
    expect(controller.states().find((state) => state.key === "b")?.status).toBe(
      "conflict"
    );
    let finishUnregister: (() => void) | undefined;
    adapter.unregister = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishUnregister = resolve;
          })
      )
      .mockImplementation(async () => undefined);
    const removing = controller.remove("a");
    await new Promise((resolve) => setImmediate(resolve));
    expect(finishUnregister).toBeDefined();
    expect(controller.states().find((state) => state.key === "b")?.status).toBe(
      "conflict"
    );
    expect(adapter.authenticate).toHaveBeenCalledTimes(1);
    expect(adapter.reserve).toHaveBeenCalledTimes(1);
    finishUnregister?.();
    await removing;
    await new Promise((resolve) => setImmediate(resolve));
    expect(controller.states().find((state) => state.key === "b")?.status).toBe(
      "ready"
    );
    expect(calls.indexOf("release")).toBeLessThan(calls.lastIndexOf("auth"));
    await controller.stop();
  });

  it("does not reacquire a managed endpoint whose credential erasure failed", async () => {
    const { adapter } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([a]);
    const initialTokenCalls = (adapter.accessToken as jest.Mock).mock.calls
      .length;
    adapter.eraseCredentials = jest.fn(async () => {
      throw new Error("erase_failed");
    });
    await expect(controller.remove("a")).rejects.toThrow("erase_failed");
    await new Promise((resolve) => setImmediate(resolve));
    await expect(controller.setConfigurations([a])).rejects.toThrow(
      "erase_failed"
    );
    expect(adapter.accessToken).toHaveBeenCalledTimes(initialTokenCalls);
    expect(adapter.authenticate).toHaveBeenCalledTimes(1);
    expect(controller.states()).toEqual([]);
    await controller.stop();
  });

  it("closes a detached relay even when the state observer throws", async () => {
    const { adapter, connection } = adapterHarness();
    const controller = new ManagedRelayController(adapter);
    const explicit = {
      key: "a",
      name: "A",
      kind: "explicit" as const,
      peerId: peer,
      addresses: [address],
    };
    await controller.setConfigurations([explicit]);
    adapter.onStateChange = jest.fn(() => {
      throw new Error("observer_failed");
    });
    await controller.remove("a");
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(controller.states()).toEqual([]);
    await controller.stop();
  });

  it("sets up a relay when the state observer throws during addition", async () => {
    const { adapter } = adapterHarness();
    adapter.onStateChange = jest.fn(() => {
      throw new Error("observer_failed");
    });
    const controller = new ManagedRelayController(adapter);
    await controller.setConfigurations([a]);
    expect(controller.states()[0].status).toBe("ready");
    await controller.stop();
  });
});

describe("all supported relay transports", () => {
  it("keeps TCP, WSS and WebRTC authenticated with one reservation owner", async () => {
    const { adapter } = adapterHarness();
    const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
    const rtc = `/ip4/127.0.0.1/udp/4002/webrtc-direct/certhash/uEiAB/p2p/${peer}`;
    const active = new Set<string>();
    adapter.discover = async () => ({
      version: 1,
      relay: { peerId: peer, addresses: [tcp, address, rtc] },
      validUntil: Date.now() + 30_000,
    });
    adapter.dial = async (value) => {
      active.add(value);
      return {
        verifiedPeerId: peer,
        close: async () => {
          active.delete(value);
        },
      };
    };
    const controller = new ManagedRelayController(adapter);
    try {
      await controller.setConfigurations([
        {
          key: "all",
          name: "All",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay",
        },
      ]);
      expect([...active].sort()).toEqual([tcp, address, rtc].sort());
      expect(adapter.authenticate).toHaveBeenCalledTimes(3);
      expect(adapter.reserve).toHaveBeenCalledTimes(1);
      expect(adapter.register).toHaveBeenCalledTimes(1);
      expect(controller.states()[0]).toMatchObject({
        status: "ready",
        transports: [
          { family: "tcp", status: "ready" },
          { family: "wss", status: "ready" },
          { family: "webrtc-direct", status: "ready" },
        ],
      });
    } finally {
      await controller.stop();
    }
    expect(active.size).toBe(0);
  });
});

describe("independent transport lifecycle", () => {
  const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
  const rtc = `/ip4/127.0.0.1/udp/4002/webrtc-direct/certhash/uEiAB/p2p/${peer}`;
  const config = {
    key: "lanes",
    name: "Lanes",
    kind: "managed" as const,
    discoveryUrl: "https://relay.example/v1/relay",
  };
  function fixture() {
    const { adapter } = adapterHarness();
    const connections = new Map<
      string,
      { verifiedPeerId: string; close: jest.Mock }
    >();
    adapter.discover = async () => ({
      version: 1,
      relay: { peerId: peer, addresses: [tcp, address, rtc] },
      validUntil: Date.now() + 30_000,
    });
    adapter.dial = jest.fn(async (value) => {
      const connection = {
        verifiedPeerId: peer,
        close: jest.fn(async () => {}),
      };
      connections.set(value, connection);
      return connection;
    });
    return {
      adapter,
      connections,
      controller: new ManagedRelayController(adapter, () => 0),
    };
  }
  it("promotes a healthy authenticated transport after reservation owner loss", async () => {
    const { adapter, connections, controller } = fixture();
    try {
      await controller.setConfigurations([config]);
      const owner = (adapter.reserve as jest.Mock).mock.calls[0][0];
      const healthy = [...connections.values()].filter(
        (connection) => connection !== owner
      );
      await controller.connectionLost(config.key, owner);
      expect(adapter.reserve).toHaveBeenCalledTimes(2);
      expect(healthy).toContain(
        (adapter.reserve as jest.Mock).mock.calls[1][0]
      );
      for (const connection of healthy)
        expect(connection.close).not.toHaveBeenCalled();
      expect(
        controller.eligibleDialAddresses([
          `${address}/p2p-circuit/p2p/destination`,
        ])
      ).toHaveLength(1);
      expect(controller.states()[0].status).toBe("ready");
    } finally {
      await controller.stop();
    }
  });
  it("retries a failed family without redialing or closing healthy families", async () => {
    jest.useFakeTimers();
    const { adapter, connections, controller } = fixture();
    const dial = adapter.dial;
    let fail = true;
    adapter.dial = jest.fn(async (value, signal) => {
      if (value === rtc && fail) throw new Error("transport_unavailable");
      return dial(value, signal);
    });
    try {
      await controller.setConfigurations([config]);
      const tcpConnection = connections.get(tcp)!;
      const wssConnection = connections.get(address)!;
      expect(controller.states()[0]).toMatchObject({
        status: "ready",
        transports: [
          expect.objectContaining({ family: "tcp", status: "ready" }),
          expect.objectContaining({ family: "wss", status: "ready" }),
          expect.objectContaining({
            family: "webrtc-direct",
            status: "retrying",
          }),
        ],
      });
      fail = false;
      await jest.advanceTimersByTimeAsync(500);
      expect(controller.states()[0].status).toBe("ready");
      expect(connections.get(tcp)).toBe(tcpConnection);
      expect(connections.get(address)).toBe(wssConnection);
      expect(tcpConnection.close).not.toHaveBeenCalled();
      expect(wssConnection.close).not.toHaveBeenCalled();
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
  });
  it("retains physical-session refusal on one family while others remain usable", async () => {
    const { adapter, connections, controller } = fixture();
    adapter.authenticate = jest.fn(async (connection) => {
      if (connection === connections.get(rtc))
        throw new RelayOperationError("session_limit_exceeded");
      return {
        sessionExpiresAt: Date.now() + 60_000,
        renewAfterMillis: 40_000,
      };
    });
    try {
      await controller.setConfigurations([config]);
      expect(controller.states()[0].transports).toContainEqual(
        expect.objectContaining({
          family: "webrtc-direct",
          status: "refused",
          reason: "session_limit_exceeded",
        })
      );
      expect(controller.states()[0].status).toBe("ready");
      expect(connections.get(tcp)!.close).not.toHaveBeenCalled();
      expect(connections.get(address)!.close).not.toHaveBeenCalled();
      expect(connections.get(rtc)!.close).toHaveBeenCalledTimes(1);
      expect(adapter.eraseCredentials).not.toHaveBeenCalled();
    } finally {
      await controller.stop();
    }
  });
});

describe("transport setup bounds", () => {
  it("uses at most two active address dials across all families", async () => {
    jest.useFakeTimers();
    const { adapter } = adapterHarness();
    const addresses = [
      `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`,
      `/ip4/127.0.0.2/tcp/4001/p2p/${peer}`,
      address,
      `/dns4/alternative.example/tcp/443/wss/p2p/${peer}`,
      `/ip4/127.0.0.1/udp/4002/webrtc-direct/certhash/uEiAB/p2p/${peer}`,
    ];
    let active = 0;
    let maximum = 0;
    const finishes: Array<() => void> = [];
    adapter.discover = async () => ({
      version: 1,
      relay: { peerId: peer, addresses },
      validUntil: Date.now() + 30_000,
    });
    adapter.dial = (_address, signal) =>
      new Promise((resolve, reject) => {
        active++;
        maximum = Math.max(maximum, active);
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          active--;
          if (signal.aborted) reject(new Error("aborted"));
          else resolve({ verifiedPeerId: peer, close: async () => {} });
        };
        finishes.push(finish);
        signal.addEventListener("abort", finish, { once: true });
      });
    const controller = new ManagedRelayController(adapter);
    try {
      const setting = controller.setConfigurations([
        {
          key: "bounds",
          name: "Bounds",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay",
        },
      ]);
      await jest.advanceTimersByTimeAsync(100);
      expect(active).toBe(2);
      for (let index = 0; index < 5; index++) {
        finishes[index]?.();
        await jest.advanceTimersByTimeAsync(0);
      }
      await setting;
      expect(maximum).toBe(2);
      expect(controller.states()[0].status).toBe("ready");
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
  });
  it("adds a newly advertised family while retaining its existing authenticated connection", async () => {
    jest.useFakeTimers();
    const { adapter, connection } = adapterHarness();
    const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
    let expanded = false;
    adapter.discover = async () => ({
      version: 1,
      relay: { peerId: peer, addresses: expanded ? [address, tcp] : [address] },
      validUntil: Date.now() + 1_000,
    });
    adapter.dial = jest.fn(async (value) =>
      value === address
        ? connection
        : { verifiedPeerId: peer, close: jest.fn(async () => {}) }
    );
    const controller = new ManagedRelayController(adapter);
    try {
      await controller.setConfigurations([
        {
          key: "new-family",
          name: "New family",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay",
        },
      ]);
      expanded = true;
      await jest.advanceTimersByTimeAsync(1_000);
      expect(controller.states()[0].transports).toContainEqual(
        expect.objectContaining({ family: "tcp", status: "ready" })
      );
      expect(connection.close).not.toHaveBeenCalled();
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
  });
});

describe("configuration discovery ownership", () => {
  it("keeps refreshing discovery when the primary transport is lost and another remains healthy", async () => {
    jest.useFakeTimers();
    const { adapter } = adapterHarness();
    const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
    const connections = new Map<
      string,
      { verifiedPeerId: string; close(): Promise<void> }
    >();
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: { peerId: peer, addresses: [tcp, address] },
      validUntil: Date.now() + 2_000,
    }));
    adapter.dial = async (value) => {
      const connection = { verifiedPeerId: peer, close: async () => {} };
      connections.set(value, connection);
      return connection;
    };
    const controller = new ManagedRelayController(adapter, () => 0);
    try {
      await controller.setConfigurations([
        {
          key: "discovery",
          name: "Discovery",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay",
        },
      ]);
      await controller.connectionLost("discovery", connections.get(tcp));
      await jest.advanceTimersByTimeAsync(2_000);
      expect(adapter.discover).toHaveBeenCalledTimes(2);
      expect(controller.states()[0].status).toBe("ready");
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
  });
});

describe("relay identity replacement across transports", () => {
  it("publishes and releases the new peer claim when a secondary reconnects before a refused primary", async () => {
    jest.useFakeTimers();
    const { adapter } = adapterHarness();
    const newPeer = "12D3KooWNewRelayGeneration";
    let publishedPeer = peer;
    const connections = new Map<
      string,
      { verifiedPeerId: string; close(): Promise<void> }
    >();
    adapter.discover = jest.fn(async () => ({
      version: 1 as const,
      relay: {
        peerId: publishedPeer,
        addresses: [
          `/dns4/relay.example/tcp/443/wss/p2p/${publishedPeer}`,
          `/ip4/127.0.0.1/tcp/4001/p2p/${publishedPeer}`,
        ],
      },
      validUntil: Date.now() + 1_000,
    }));
    adapter.dial = async (value) => {
      const connection = {
        verifiedPeerId: value.split("/p2p/")[1],
        close: async () => {},
      };
      connections.set(value, connection);
      return connection;
    };
    adapter.authenticate = async (connection) => {
      if (
        connections.get(`/dns4/relay.example/tcp/443/wss/p2p/${peer}`) ===
        connection
      )
        throw new RelayOperationError("quota_exhausted");
      return {
        sessionExpiresAt: Date.now() + 60_000,
        renewAfterMillis: 40_000,
      };
    };
    const controller = new ManagedRelayController(adapter, () => 0);
    const config = {
      key: "identity",
      name: "Identity",
      kind: "managed" as const,
      discoveryUrl: "https://relay.example/v1/relay",
    };
    try {
      await controller.setConfigurations([config]);
      expect(controller.states()[0].status).toBe("ready");
      publishedPeer = newPeer;
      await jest.advanceTimersByTimeAsync(1_000);
      await controller.connectionLost(
        config.key,
        connections.get(`/ip4/127.0.0.1/tcp/4001/p2p/${peer}`)
      );
      await jest.advanceTimersByTimeAsync(500);
      expect(controller.states()[0]).toMatchObject({
        status: "ready",
        peerId: newPeer,
      });
      await controller.remove(config.key);
      await controller.setConfigurations([{ ...config, key: "replacement" }]);
      expect(controller.states()[0]).toMatchObject({
        key: "replacement",
        peerId: newPeer,
        status: "ready",
      });
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
  });
});

describe("explicit relay transport edits", () => {
  it("connects newly configured families while retaining the existing connection", async () => {
    const { adapter, connection } = adapterHarness();
    const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
    const rtc = `/ip4/127.0.0.1/udp/4002/webrtc-direct/certhash/uEiAB/p2p/${peer}`;
    const active = new Set<string>();
    adapter.dial = async (value) => {
      active.add(value);
      if (value === address) return connection;
      return {
        verifiedPeerId: peer,
        close: async () => {
          active.delete(value);
        },
      };
    };
    const controller = new ManagedRelayController(adapter);
    const config = {
      key: "explicit-edit",
      name: "Explicit",
      kind: "explicit" as const,
      peerId: peer,
      addresses: [address],
    };
    try {
      await controller.setConfigurations([config]);
      await controller.setConfigurations([
        { ...config, addresses: [address, tcp, rtc] },
      ]);
      expect([...active].sort()).toEqual([address, tcp, rtc].sort());
      expect(connection.close).not.toHaveBeenCalled();
      expect(adapter.authenticate).not.toHaveBeenCalled();
      expect(controller.states()[0].status).toBe("ready");
    } finally {
      await controller.stop();
    }
  });
});

describe("explicit relay family withdrawal", () => {
  it("releases only the withdrawn owner family, updates settings and reconnects it when re-added", async () => {
    const { adapter } = adapterHarness();
    const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
    const connections = new Map<
      string,
      { verifiedPeerId: string; close: jest.Mock }
    >();
    adapter.dial = async (value) => {
      const connection = {
        verifiedPeerId: peer,
        close: jest.fn(async () => {}),
      };
      connections.set(value, connection);
      return connection;
    };
    const controller = new ManagedRelayController(adapter);
    const config = {
      key: "withdraw",
      name: "Original",
      kind: "explicit" as const,
      peerId: peer,
      addresses: [address, tcp],
    };
    try {
      await controller.setConfigurations([config]);
      const wss = connections.get(address)!;
      const tcpConnection = connections.get(tcp)!;
      await controller.setConfigurations([
        { ...config, name: "Updated", addresses: [tcp] },
      ]);
      expect(wss.close).toHaveBeenCalledTimes(1);
      expect(tcpConnection.close).not.toHaveBeenCalled();
      expect(controller.configurations()).toEqual([
        { ...config, name: "Updated", addresses: [tcp] },
      ]);
      expect(controller.states()[0].transports).toEqual([
        expect.objectContaining({
          family: "tcp",
          status: "ready",
          reservationOwner: true,
        }),
      ]);
      await controller.setConfigurations([{ ...config, name: "Updated" }]);
      expect(connections.get(address)).not.toBe(wss);
      expect(connections.get(tcp)).toBe(tcpConnection);
      expect(controller.configurations()).toEqual([
        { ...config, name: "Updated" },
      ]);
      expect(controller.states()[0].transports).toContainEqual(
        expect.objectContaining({ family: "wss", status: "ready" })
      );
    } finally {
      await controller.stop();
    }
  });
});

describe("explicit relay unsupported transport edits", () => {
  it("releases the peer claim when an edit withdraws every runtime-supported family", async () => {
    const { adapter } = adapterHarness();
    adapter.supportsAddress = (value) => value.includes("/wss/");
    adapter.dial = async () => ({
      verifiedPeerId: peer,
      close: jest.fn(async () => {}),
    });
    const controller = new ManagedRelayController(adapter);
    const explicit = {
      key: "unsupported-edit",
      name: "Explicit",
      kind: "explicit" as const,
      peerId: peer,
      addresses: [address],
    };
    const unsupported = {
      ...explicit,
      addresses: [`/ip4/127.0.0.1/tcp/4001/p2p/${peer}`],
    };
    try {
      await controller.setConfigurations([explicit]);
      await controller.setConfigurations([unsupported]);
      expect(controller.states()[0]).toMatchObject({
        status: "retrying",
        reason: "no_supported_addresses",
        transports: [],
      });
      await controller.setConfigurations([
        unsupported,
        {
          key: "eligible",
          name: "Eligible",
          kind: "managed",
          discoveryUrl: "https://relay.example/v1/relay",
        },
      ]);
      expect(
        controller.states().find((state) => state.key === "eligible")
      ).toMatchObject({ status: "ready", peerId: peer });
    } finally {
      await controller.stop();
    }
  });
});

describe("concurrent explicit transport edits", () => {
  it("keeps the latest WSS-only settings when an older family addition resumes later", async () => {
    jest.useFakeTimers();
    const { adapter } = adapterHarness();
    const tcp = `/ip4/127.0.0.1/tcp/4001/p2p/${peer}`;
    const config = {
      key: "concurrent-edit",
      name: "Concurrent",
      kind: "explicit" as const,
      peerId: peer,
      addresses: [address],
    };
    const controller = new ManagedRelayController(adapter);
    try {
      await controller.setConfigurations([config]);
      const adding = controller.setConfigurations([
        { ...config, addresses: [address, tcp] },
      ]);
      const withdrawing = controller.setConfigurations([config]);
      await Promise.all([adding, withdrawing]);
      expect(controller.configurations()).toEqual([config]);
      expect(controller.states()[0].transports).toEqual([
        expect.objectContaining({ family: "wss", status: "ready" }),
      ]);
      expect(adapter.dial).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(2_000);
      expect(controller.states()[0].transports).toEqual([
        expect.objectContaining({ family: "wss", status: "ready" }),
      ]);
      expect(adapter.dial).toHaveBeenCalledTimes(1);
    } finally {
      await controller.stop();
      jest.useRealTimers();
    }
  });
});
