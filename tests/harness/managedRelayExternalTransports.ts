import assert from "node:assert/strict";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { PeerRecord, RecordEnvelope } from "@libp2p/peer-record";
import { multiaddr } from "@multiformats/multiaddr";
import { createClipboardNode } from "../../packages/core/network/node.js";
import { createManagedRelayHost } from "../../packages/core/network/managedRelayHost.js";
import {
  ManagedRelayController,
  normalizeDiscoveryResponse,
} from "../../packages/core/network/managedRelays.js";

async function until(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(label);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Owned Go fixture only: real HTTPS discovery, WSS trust, TCP/WebRTC and opaque Circuit Relay. */
export async function runExternalTransports(
  discoveryUrl: string,
  tokenA: string,
  tokenB: string
): Promise<void> {
  const discover = async (url: string, token: string, signal: AbortSignal) => {
    const result = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
      signal,
    });
    assert.equal(result.status, 200);
    return normalizeDiscoveryResponse(await result.json());
  };
  const document = await discover(
    discoveryUrl,
    tokenA,
    AbortSignal.timeout(10_000)
  );
  const peer = document.relay.peerId;
  async function client(token: string) {
    const key = await generateKeyPair("Ed25519");
    const node = await createClipboardNode({
      privateKey: key,
      relayAddresses: [],
      enableRelayReservations: false,
      enableTcp: true,
      enableWebRTCDirect: true,
      relayOnly: { isRelayPeer: (id) => id === peer },
    });
    await node.start();
    let controller: ManagedRelayController;
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
            key
          )
        ).marshal(),
      (connection) => {
        void controller.connectionLost("owned-go", connection);
      }
    );
    controller = new ManagedRelayController({
      ...host,
      accessToken: async () => token,
      discover,
      addressPriority: (address) =>
        address.includes("/webrtc-direct/")
          ? 2
          : /\/ws\/|\/wss\//.test(address)
            ? 0
            : 1,
      eraseCredentials: async () => {},
      interactiveLogin: async () => {},
      openAccount: async () => {},
    });
    return { node, host, controller, identity: node.peerId.toString() };
  }
  const a = await client(tokenA);
  const b = await client(tokenB);
  try {
    const configurations = [
      {
        key: "owned-go",
        name: "Owned Go fixture",
        kind: "managed" as const,
        discoveryUrl,
      },
    ];
    await Promise.all([
      a.controller.setConfigurations(configurations),
      b.controller.setConfigurations(configurations),
    ]);
    for (const endpoint of [a, b]) {
      assert.equal(
        endpoint.controller.states()[0].status,
        "ready",
        JSON.stringify(endpoint.controller.states())
      );
      const connections = endpoint.node
        .getConnections()
        .filter((connection) => connection.remotePeer.toString() === peer);
      assert.equal(
        connections.length,
        3,
        "one Device Identity must retain every physical family"
      );
      assert.equal(
        new Set(connections.map((connection) => connection.id)).size,
        3
      );
      assert.ok(
        connections.some((connection) =>
          connection.remoteAddr.toString().includes("/webrtc-direct/")
        )
      );
      assert.ok(
        connections.some((connection) =>
          /\/ws\/|\/wss\//.test(connection.remoteAddr.toString())
        )
      );
      assert.equal(
        endpoint.controller
          .states()[0]
          .transports?.filter((transport) => transport.reservationOwner).length,
        1
      );
      assert.equal(endpoint.node.peerId.toString(), endpoint.identity);
    }
    assert.ok(
      await b.host.lookupPeer(a.identity, AbortSignal.timeout(10_000)),
      "registration must publish a valid Signed Peer Record"
    );
    const received: string[] = [];
    await a.node.handle(
      "/clipp/transport-conformance/1.0.0",
      async (data: any) => {
        const stream = data.stream ?? data;
        let body = "";
        for await (const value of stream)
          body += new TextDecoder().decode(value.subarray?.() ?? value);
        received.push(body);
      },
      { runOnLimitedConnection: true }
    );
    async function transfer(body: string) {
      const address = document.relay.addresses.find((candidate) =>
        /\/ws\/|\/wss\//.test(candidate)
      )!;
      const stream = await b.node.dialProtocol(
        multiaddr(`${address}/p2p-circuit/p2p/${a.identity}`),
        "/clipp/transport-conformance/1.0.0",
        { signal: AbortSignal.timeout(10_000), runOnLimitedConnection: true }
      );
      stream.send(new TextEncoder().encode(body));
      await stream.close();
      await until(
        () => received.includes(body),
        "opaque Circuit Relay transfer failed"
      );
      // Close the app-peer circuit so the next transfer must establish a new STOP path.
      await Promise.all(
        b.node
          .getConnections()
          .filter(
            (connection) => connection.remotePeer.toString() === a.identity
          )
          .map((connection) => connection.close())
      );
    }
    await transfer("before owner loss");
    const family = a.controller
      .states()[0]
      .transports!.find((transport) => transport.reservationOwner)!.family;
    const owner = a.node
      .getConnections()
      .find(
        (connection) =>
          connection.remotePeer.toString() === peer &&
          (family === "webrtc-direct"
            ? connection.remoteAddr.toString().includes("/webrtc-direct/")
            : family === "wss"
              ? /\/ws\/|\/wss\//.test(connection.remoteAddr.toString())
              : !/\/ws\/|\/wss\/|\/webrtc-direct\//.test(
                  connection.remoteAddr.toString()
                ))
      )!;
    await owner.close();
    await until(
      () =>
        a.controller
          .states()[0]
          .transports!.some(
            (transport) =>
              transport.reservationOwner && transport.family !== family
          ),
      `reservation promotion failed: ${JSON.stringify(a.controller.states())}`
    );
    assert.ok(
      await b.host.lookupPeer(a.identity, AbortSignal.timeout(10_000)),
      "promotion must preserve Rendezvous lookup"
    );
    await transfer("after owner loss");
    await until(() => {
      const transports = a.controller.states()[0].transports;
      return (
        transports?.length === 3 &&
        transports.every((transport) => transport.status === "ready") &&
        a.node
          .getConnections()
          .filter((connection) => connection.remotePeer.toString() === peer)
          .length === 3
      );
    }, "lost family did not recover independently");
    assert.equal(
      a.node
        .getConnections()
        .filter((connection) => connection.remotePeer.toString() === peer)
        .length,
      3
    );
    assert.equal(a.node.peerId.toString(), a.identity);
    console.log(
      JSON.stringify({
        ok: true,
        physicalConnectionsPerDevice: 3,
        families: ["tcp", "wss", "webrtc-direct"],
        reservationOwners: 1,
        promoted: true,
        recovered: true,
        opaqueTransfers: received.length,
      })
    );
  } finally {
    await Promise.all([a.controller.stop(), b.controller.stop()]);
    await Promise.all([a.node.stop(), b.node.stop()]);
  }
}
