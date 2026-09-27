import assert from "node:assert/strict";
import { multiaddr } from "@multiformats/multiaddr";
import { normalizeRelayConfigurations } from "../../packages/core/network/managedRelays.js";

const peerId = "12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
const bare = `/p2p/${peerId}`;
const complete = `/dns4/relay.example/tcp/443/wss/p2p/${peerId}`;
assert.equal(
  multiaddr(bare).toString(),
  bare,
  "the real parser accepts bare Peer IDs"
);
assert.throws(
  () =>
    normalizeRelayConfigurations([
      {
        key: "bare",
        name: "Bare",
        kind: "explicit",
        peerId,
        addresses: [bare],
      },
    ]),
  /complete dialable/
);
assert.deepEqual(
  normalizeRelayConfigurations([
    {
      key: "complete",
      name: "Complete",
      kind: "explicit",
      peerId,
      addresses: [complete],
    },
  ])[0],
  {
    key: "complete",
    name: "Complete",
    kind: "explicit",
    peerId,
    addresses: [complete],
  }
);
