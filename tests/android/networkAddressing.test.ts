import {
  androidCircuitRelayAddresses,
  filterAndroidDialAddresses,
} from "../../apps/android/src/networkAddressing";

describe("Android relay reachability", () => {
  test("starts with the shared default Circuit Relay v2 addresses", () => {
    expect(androidCircuitRelayAddresses()).toEqual([
      "/ip4/141.147.116.147/tcp/47891/ws/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex",
    ]);
  });

  test("keeps default and active managed circuit routes while dropping inactive ones", () => {
    const defaultRoute =
      `${androidCircuitRelayAddresses()[0]}/p2p-circuit/p2p/target-peer`;
    const inactiveManagedRoute =
      "/ip4/192.0.2.8/tcp/443/wss/p2p/managed-peer/p2p-circuit/p2p/target-peer";
    const activeManagedRoute =
      "/ip4/192.0.2.9/tcp/443/wss/p2p/active-peer/p2p-circuit/p2p/target-peer";
    const directRoute = "/ip4/192.168.2.248/udp/9000/webrtc-direct/p2p/target-peer";

    expect(
      filterAndroidDialAddresses(
        [defaultRoute, inactiveManagedRoute, activeManagedRoute, directRoute],
        [activeManagedRoute]
      )
    ).toEqual([defaultRoute, activeManagedRoute, directRoute]);
  });
});
