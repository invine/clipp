jest.mock(
  "@multiformats/multiaddr",
  () => ({
    multiaddr: (addr: string) => {
      if (!addr.startsWith("/")) throw new Error("invalid multiaddr");
      return { toString: () => addr };
    },
  }),
  { virtual: true }
);

import {
  deriveRelayPeerMultiaddrs,
  normalizeRelayAddresses,
} from "../../../packages/core/network/relayAddresses";

const relayPeerId = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
const targetPeerId = "12D3KooWAuz1FwEK4f32DznuhrHm1BWYBhP5NcZ7sPcEFdUykNMR";

describe("relay address helpers", () => {
  it("normalizes parseable relay addresses and removes duplicates", () => {
    expect(
      normalizeRelayAddresses([
        " /dns4/relay.example.com/tcp/443/wss/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex ",
        "",
        "/dns4/relay.example.com/tcp/443/wss/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex",
        "not-a-multiaddr",
      ])
    ).toEqual([`/dns4/relay.example.com/tcp/443/wss/p2p/${relayPeerId}`]);
  });

  it("derives circuit relay target addresses from relay peer addresses", () => {
    expect(
      deriveRelayPeerMultiaddrs(
        [`/dns4/relay.example.com/tcp/443/wss/p2p/${relayPeerId}`],
        targetPeerId
      )
    ).toEqual([
      `/dns4/relay.example.com/tcp/443/wss/p2p/${relayPeerId}/p2p-circuit/p2p/${targetPeerId}`,
    ]);
  });

  it("rejects obsolete WebRTC-star signalling relays", () => {
    expect(
      deriveRelayPeerMultiaddrs(
        ["/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star"],
        targetPeerId
      )
    ).toEqual([]);
  });
});
