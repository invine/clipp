import assert from "node:assert/strict";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import {
  circuitRelayServer,
  circuitRelayTransport,
} from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { patchGlobalMultiaddrCompat } from "../../packages/core/network/multiaddrCompat.js";
import { createManagedRelayHost } from "../../packages/core/network/managedRelayHost.js";
import { ManagedRelayController } from "../../packages/core/network/managedRelays.js";

import { runExternalTransports } from "./managedRelayExternalTransports.js";

async function runStockFixture(): Promise<void> {
  patchGlobalMultiaddrCompat();
  const relay = await createLibp2p({
    addresses: { listen: ["/ip4/127.0.0.1/tcp/0", "/ip4/127.0.0.1/tcp/0/ws"] },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify(), relay: circuitRelayServer() },
  });
  const client = await createLibp2p({
    transports: [tcp(), webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() },
  });
  const peer = relay.peerId.toString();
  const addresses = relay.getMultiaddrs().map(String);
  assert.equal(addresses.length, 2);
  for (const protocol of [
    "/clipp/relay-auth/1.0.0",
    "/clipp/rendezvous/2.0.0",
  ]) {
    await relay.handle(protocol, async (data: any) => {
      const stream = data.stream ?? data;
      // Consume an auth request through EOF, and a Rendezvous request through its frame.
      for await (const _chunk of stream) {
        if (!protocol.includes("relay-auth")) break;
      }
      const body = Buffer.from(
        JSON.stringify(
          protocol.includes("relay-auth")
            ? {
                ok: true,
                sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                renewAfterMillis: 40_000,
              }
            : {
                ok: true,
                leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
              }
        )
      );
      assert.ok(body.length < 128);
      stream.send(Buffer.concat([Buffer.from([body.length]), body]));
      await stream.close();
    });
  }
  let controller: ManagedRelayController;
  const host = createManagedRelayHost(
    client,
    async () => Uint8Array.of(1),
    (connection) => {
      void controller.connectionLost("stock", connection);
    }
  );
  controller = new ManagedRelayController({
    ...host,
    accessToken: async () => "owned-fixture-token",
    discover: async () => ({
      version: 1,
      relay: { peerId: peer, addresses },
      validUntil: Date.now() + 30_000,
    }),
    eraseCredentials: async () => {},
    interactiveLogin: async () => {},
    openAccount: async () => {},
  });
  try {
    const identity = client.peerId.toString();
    await controller.setConfigurations([
      {
        key: "stock",
        name: "Stock SDK",
        kind: "managed",
        discoveryUrl: "https://owned.invalid/v1/relay",
      },
    ]);
    assert.equal(
      controller.states()[0].status,
      "ready",
      JSON.stringify(controller.states())
    );
    const physical = client.getConnections(relay.peerId);
    assert.equal(
      physical.length,
      2,
      "stock SDK must keep two distinct physical transports"
    );
    assert.equal(new Set(physical.map((connection) => connection.id)).size, 2);
    assert.ok(
      physical.some((connection) =>
        connection.remoteAddr.toString().includes("/ws/")
      )
    );
    assert.ok(
      physical.some(
        (connection) => !connection.remoteAddr.toString().includes("/ws/")
      )
    );
    assert.equal(
      controller
        .states()[0]
        .transports?.filter((transport) => transport.reservationOwner).length,
      1
    );
    const ownerFamily = controller
      .states()[0]
      .transports?.find((transport) => transport.reservationOwner)?.family;
    const owner = physical.find(
      (connection) =>
        connection.remoteAddr.toString().includes("/ws/") ===
        (ownerFamily === "wss")
    )!;
    await owner.close();
    await new Promise<void>((resolve, reject) => {
      const until = Date.now() + 5_000;
      const check = () => {
        if (
          controller
            .states()[0]
            .transports?.some(
              (transport) =>
                transport.reservationOwner && transport.family !== ownerFamily
            )
        )
          return resolve();
        if (Date.now() > until)
          return reject(
            new Error(
              `owner promotion failed: ${JSON.stringify(controller.states())}`
            )
          );
        setTimeout(check, 25);
      };
      check();
    });
    assert.equal(client.peerId.toString(), identity);
    console.log(
      JSON.stringify({
        ok: true,
        physicalConnections: 2,
        families: ["tcp", "ws"],
        reservationOwners: 1,
        promoted: true,
      })
    );
  } finally {
    await controller.stop();
    await client.stop();
    await relay.stop();
  }
}

const [discoveryUrl, tokenA, tokenB] = process.argv.slice(2);
if (discoveryUrl) await runExternalTransports(discoveryUrl, tokenA, tokenB);
else await runStockFixture();
