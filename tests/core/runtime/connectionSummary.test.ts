import { projectConnectionSummary } from "../../../packages/core/runtime/connectionSummary";

it("counts only Trusted Devices and keeps a known direct path during additional relay startup", () => {
  expect(
    projectConnectionSummary({
      devices: [{ deviceId: "trusted" }],
      peers: ["trusted", "pairing"],
      peerConnections: [{ peerId: "trusted", hasDirect: true, hasRelay: true }],
      managedRelayConfigurations: [{ key: "new" }],
      managedRelayStates: [
        {
          key: "new",
          name: "New relay",
          kind: "managed",
          status: "connecting",
        },
      ],
      connectionStateKnown: true,
    })
  ).toMatchObject({
    kind: "direct",
    label: "Direct connection available",
    direct: 1,
    relayed: 0,
  });
});

it.each([
  ["login_needed", undefined],
  ["retrying", undefined],
  ["degraded", undefined],
  ["ready", "renewal failed"],
] as const)(
  "keeps usable paths visible under independent configured-relay %s attention",
  (status, warning) => {
    const summary = projectConnectionSummary({
      devices: [{ deviceId: "trusted" }],
      peers: ["trusted"],
      peerConnections: [
        { peerId: "trusted", hasDirect: true, hasRelay: false },
      ],
      connectionStateKnown: true,
      managedRelayConfigurations: [{ key: "a" }, { key: "b" }],
      managedRelayStates: [
        { key: "a", name: "Ready", kind: "managed", status: "ready" },
        { key: "b", name: "Other", kind: "managed", status, warning },
      ],
    });
    expect(summary).toMatchObject({
      kind: "attention",
      direct: 1,
      ready: status === "ready" ? 2 : 1,
    });
    expect(summary.issues[0]).toMatchObject({
      id: `relay:b:${status}`,
      scope: "relay",
      target: "b",
    });
  }
);

it("does not turn unavailable projection data into a current healthy path", () => {
  expect(
    projectConnectionSummary({
      devices: [{ deviceId: "trusted" }],
      peers: ["trusted"],
      peerConnections: [
        { peerId: "trusted", hasDirect: true, hasRelay: false },
      ],
      connectionStateKnown: false,
    })
  ).toMatchObject({ kind: "unknown", direct: 0 });
});

it.each([
  [
    "relay",
    ["trusted"],
    [{ peerId: "trusted", hasDirect: false, hasRelay: true }],
    [],
    [],
  ],
  ["unknown", ["trusted"], [], [], []],
  ["offline", ["pairing-only"], [], [], []],
  [
    "waiting",
    [],
    [],
    [{ key: "r" }],
    [{ key: "r", name: "Relay", kind: "managed", status: "ready" }],
  ],
  ["starting", [], [], [{ key: "r" }], []],
] satisfies [
  string,
  string[],
  { peerId: string; hasDirect: boolean; hasRelay: boolean }[],
  { key: string }[],
  import("../../../packages/core/network/managedRelays").RelayState[],
][])(
  "projects %s honestly",
  (
    kind,
    peers,
    peerConnections,
    managedRelayConfigurations,
    managedRelayStates
  ) => {
    expect(
      projectConnectionSummary({
        devices: [{ deviceId: "trusted" }],
        peers,
        peerConnections,
        managedRelayConfigurations,
        managedRelayStates,
        connectionStateKnown: true,
      }).kind
    ).toBe(kind);
  }
);
it("a trust change removes a healthy path from the summary without treating an offline member as a fault", () => {
  const facts = {
    devices: [{ deviceId: "trusted" }, { deviceId: "offline" }],
    peers: ["trusted"],
    peerConnections: [{ peerId: "trusted", hasDirect: true, hasRelay: false }],
    connectionStateKnown: true,
  };
  expect(projectConnectionSummary(facts).kind).toBe("direct");
  expect(
    projectConnectionSummary({ ...facts, devices: [{ deviceId: "offline" }] })
      .kind
  ).toBe("offline");
});

it("keeps first use neutral when no Trusted Device or relay has been configured", () => {
  expect(
    projectConnectionSummary({
      devices: [],
      peers: ["pairing-only"],
      connectionStateKnown: true,
    })
  ).toMatchObject({
    kind: "idle",
    label: "No Trusted Devices yet",
    direct: 0,
    relayed: 0,
  });
});
