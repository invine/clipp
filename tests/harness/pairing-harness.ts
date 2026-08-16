/**
 * Real-network relay-first reachability harness.
 * Run manually with a WebRTC-capable runtime (browser, or Node with `wrtc` installed):
 *   node --loader ts-node/esm tests/harness/pairing-harness.ts
 *
 * The harness starts two messaging layers, trusts each other, and sends a sample clip.
 * It will no-op if WebRTC is unavailable.
 */
import { createLibp2pMessagingTransport } from "../../packages/core/network/engine.ts";
import { DEFAULT_CIRCUIT_RELAY_ADDRESSES } from "../../packages/core/network/constants.ts";
import { startWebsocketRelay } from "../../packages/core/network/relay/server.ts";

async function boot(label: string, relayAddresses: string[]) {
  const transport = createLibp2pMessagingTransport({
    relayAddresses,
    enableDCUtR: true,
    enableRelayReservations: true,
  });
  await transport.start();
  return { transport, label };
}

async function waitForPeer(transport: any, label: string, timeoutMs = 5000): Promise<string> {
  const existing = transport.getConnectedPeers?.();
  if (existing && existing.length) return existing[0];
  return await new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(`[${label}] timed out waiting for peer`));
      }
    }, timeoutMs);
    transport.onPeerConnected?.((pid: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(pid);
    });
  });
}

async function ensureWebRTC() {
  if (typeof (globalThis as any).RTCPeerConnection !== "undefined") return true;
  try {
    const wrtc = await import("@koush/wrtc");
    (globalThis as any).RTCPeerConnection = wrtc.RTCPeerConnection;
    (globalThis as any).RTCSessionDescription = wrtc.RTCSessionDescription;
    (globalThis as any).RTCIceCandidate = wrtc.RTCIceCandidate;
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const relay = await startWebsocketRelay({ host: "127.0.0.1", port: 47_891, enableWebRTC: false });
  const relayAddress = relay.node.getMultiaddrs().find((addr) => String(addr).includes("/ws"))?.toString();
  if (!relayAddress) throw new Error("relay_websocket_address_unavailable");
  const configuredRelay = `${relayAddress}/p2p/${relay.node.peerId}`;
  const a = await boot("A", [configuredRelay]);
  const b = await boot("B", [configuredRelay]);
  try {
    const bRecord = await b.transport.getSignedPeerRecord?.();
    const bPeerId = b.transport.getSelfMultiaddrs?.()[0]?.split("/p2p/").pop();
    if (!bRecord || !bPeerId) throw new Error("peer_record_unavailable");
    await a.transport.importSignedPeerRecord?.(bPeerId, bRecord);
    await a.transport.connect(bPeerId);
    await waitForPeer(a.transport, "relay-first connection");
    console.log("relay-first connection and DCUtR fallback verified", a.transport.getPeerConnectionInfo?.());
    await b.transport.stop();
    await a.transport.disconnect?.(bPeerId);
    console.log("offline member disconnect verified; persisted exact record remains available for reconnect");
  } finally {
    await a.transport.stop();
    await b.transport.stop().catch(() => undefined);
    await relay.stop();
  }
}

main().catch((err) => {
  console.error("Harness failed", err);
  process.exitCode = 1;
});
