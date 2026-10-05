import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { PeerRecord, RecordEnvelope } from "@libp2p/peer-record";
import { multiaddr } from "@multiformats/multiaddr";

// Synthetic, owned Go fixture only. No profiles or external credentials.
const [endpoint, tokenA, tokenB, expectedFamily] = process.argv.slice(2);
assert.ok(["127.0.0.1", "localhost"].includes(new URL(endpoint).hostname));
assert.equal(tokenA, "a");
assert.equal(tokenB, "b");
assert.ok(["tcp", "websocket", "webrtc-direct"].includes(expectedFamily));
const sourceRoot = process.env.CLIPP_CLIENT_SOURCE_ROOT;
assert.ok(
  sourceRoot,
  "CLIPP_CLIENT_SOURCE_ROOT must identify the client checkout"
);
const load = (file: string) =>
  import(pathToFileURL(path.join(sourceRoot!, file)).href);
const { createClipboardNode } = await load("packages/core/network/node.ts");
const { createManagedRelayHost } = await load(
  "packages/core/network/managedRelayHost.ts"
);
const { ManagedRelayController, normalizeDiscoveryResponse } = await load(
  "packages/core/network/managedRelays.ts"
);
const { writeMessageStream, closeMessageStream } = await load(
  "packages/core/network/messageStream.ts"
);

function family(address: string): string {
  if (address.includes("/webrtc-direct/")) return "webrtc-direct";
  if (/\/(?:ws|wss)(?:\/|$)/.test(address)) return "websocket";
  return "tcp";
}
async function until(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (!check()) {
    assert.ok(
      performance.now() < deadline,
      "opaque relay transfer did not arrive"
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
const discover = async (url: string, token: string, signal: AbortSignal) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
    signal,
  });
  assert.equal(response.status, 200);
  const document = normalizeDiscoveryResponse(await response.json());
  for (const address of document.relay.addresses)
    assert.match(address, /^\/(?:ip4\/127\.0\.0\.1|dns4\/localhost)\//);
  return document;
};
const document = await discover(endpoint, tokenA, AbortSignal.timeout(10_000));
const peer = document.relay.peerId;
async function client(token: string) {
  const privateKey = await generateKeyPair("Ed25519");
  const node = await createClipboardNode({
    privateKey,
    relayAddresses: [],
    enableRelayReservations: false,
    enableTcp: true,
    enableWebRTCDirect: true,
    relayOnly: { isRelayPeer: (id: string) => id === peer },
  });
  await node.start();
  let controller: InstanceType<typeof ManagedRelayController>;
  const host = createManagedRelayHost(
    node,
    async () =>
      (
        await RecordEnvelope.seal(
          new PeerRecord({
            peerId: node.peerId,
            multiaddrs: node.getMultiaddrs(),
            seqNumber: BigInt(Date.now()),
          }),
          privateKey
        )
      ).marshal(),
    (connection: unknown) => {
      void controller.connectionLost("owned-go", connection);
    }
  );
  controller = new ManagedRelayController({
    ...host,
    accessToken: async () => token,
    discover,
    eraseCredentials: async () => {},
    interactiveLogin: async () => {},
    openAccount: async () => {},
  });
  return { node, controller, host, identity: node.peerId.toString() };
}
const clients: Awaited<ReturnType<typeof client>>[] = [];
let transfers = 0;
try {
  const a = await client(tokenA);
  clients.push(a);
  const b = await client(tokenB);
  clients.push(b);
  const configurations = [
    {
      key: "owned-go",
      name: "Owned Go",
      kind: "managed",
      discoveryUrl: endpoint,
    },
  ];
  await Promise.all(
    clients.map((c) => c.controller.setConfigurations(configurations))
  );
  for (const c of clients) {
    assert.equal(c.controller.states()[0].status, "ready");
    const physical = c.node
      .getConnections()
      .filter((connection: any) => connection.remotePeer.toString() === peer);
    assert.equal(physical.length, 1, "retain exactly one relay connection");
    assert.equal(family(physical[0].remoteAddr.toString()), expectedFamily);
    assert.equal(c.node.peerId.toString(), c.identity);
  }
  assert.ok(await b.host.lookupPeer(a.identity, AbortSignal.timeout(10_000)));
  const received: string[] = [];
  await a.node.handle(
    "/clipp/fallback-conformance/1.0.0",
    async (data: any) => {
      const stream = data.stream ?? data;
      let body = "";
      for await (const chunk of stream)
        body += new TextDecoder().decode(chunk.subarray?.() ?? chunk);
      received.push(body);
    },
    { runOnLimitedConnection: true }
  );
  const address = document.relay.addresses.find(
    (candidate: string) => family(candidate) === expectedFamily
  );
  assert.ok(address);
  const stream = await b.node.dialProtocol(
    multiaddr(`${address}/p2p-circuit/p2p/${a.identity}`),
    "/clipp/fallback-conformance/1.0.0",
    {
      signal: AbortSignal.timeout(10_000),
      runOnLimitedConnection: true,
    }
  );
  await writeMessageStream(
    stream,
    new TextEncoder().encode("synthetic fallback clip")
  );
  await closeMessageStream(stream);
  await until(() => received.includes("synthetic fallback clip"));
  transfers = received.length;
  for (const c of clients)
    assert.equal(
      c.node
        .getConnections()
        .filter((connection: any) => connection.remotePeer.toString() === peer)
        .length,
      1
    );
} finally {
  const stopped = await Promise.allSettled(
    clients.map((c) => c.controller.stop())
  );
  const nodes = await Promise.allSettled(clients.map((c) => c.node.stop()));
  const failure = [...stopped, ...nodes].find(
    (result) => result.status === "rejected"
  );
  if (failure?.status === "rejected") throw failure.reason;
}
// Success requires cleanup and normal child exit; the Go wrapper enforces both.
console.log(
  JSON.stringify({
    ok: true,
    selectedFamily: expectedFamily,
    physicalConnectionsPerDevice: 1,
    opaqueTransfers: transfers,
  })
);
