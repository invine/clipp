/**
 * Lightweight harness to exercise pairing + clip transfer without the UI.
 * Run manually with a WebRTC-capable runtime (browser, or Node with `wrtc` installed):
 *   node --loader ts-node/esm tests/harness/pairing-harness.ts
 *
 * The harness starts two messaging layers, trusts each other, and sends a sample clip.
 * It will no-op if WebRTC is unavailable.
 */
import { createMessagingLayer } from "../../packages/core/network/engine";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../packages/core/network/constants";
import { createTrustManager, MemoryStorageBackend } from "../../packages/core/trust";
import { normalizeClipboardContent } from "../../packages/core/clipboard/normalize";

async function boot(label: string) {
  const trust = createTrustManager(new MemoryStorageBackend());
  const messaging = createMessagingLayer({ trustStore: trust, relayAddresses: DEFAULT_WEBRTC_STAR_RELAYS });
  await messaging.start();
  const identity = await trust.getLocalIdentity();
  return { trust, messaging, identity, label };
}

async function main() {
  if (typeof (globalThis as any).RTCPeerConnection === "undefined") {
    console.warn("Harness requires WebRTC (browser or Node with `wrtc`).");
    return;
  }

  const a = await boot("A");
  const b = await boot("B");

  await a.trust.add({ ...b.identity, lastSeen: Date.now() });
  await b.trust.add({ ...a.identity, lastSeen: Date.now() });

  a.messaging.onMessage((msg) => console.log("[A] received", msg.type, "from", msg.from));
  b.messaging.onMessage((msg) => console.log("[B] received", msg.type, "from", msg.from));

  const clip = normalizeClipboardContent("hello from A", a.identity.deviceId);
  if (clip) {
    const target = b.identity.multiaddrs?.[0] || b.identity.deviceId;
    await a.messaging.sendMessage(target, {
      type: "CLIP",
      from: a.identity.deviceId,
      clip,
      sentAt: Date.now(),
    });
  }
}

main().catch((err) => {
  console.error("Harness failed", err);
  process.exitCode = 1;
});
