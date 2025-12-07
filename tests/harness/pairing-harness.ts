/**
 * Lightweight harness to exercise pairing + clip transfer without the UI.
 * Run manually with a WebRTC-capable runtime (browser, or Node with `wrtc` installed):
 *   node --loader ts-node/esm tests/harness/pairing-harness.ts
 *
 * The harness starts two messaging layers, trusts each other, and sends a sample clip.
 * It will no-op if WebRTC is unavailable.
 */
import { createMessagingLayer } from "../../packages/core/network/engine.ts";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../packages/core/network/constants.ts";
import { createTrustManager, MemoryStorageBackend } from "../../packages/core/trust/index.ts";
import { normalizeClipboardContent } from "../../packages/core/clipboard/normalize.ts";

async function boot(label: string) {
  const trust = createTrustManager(new MemoryStorageBackend());
  const messaging = createMessagingLayer({ trustStore: trust, relayAddresses: DEFAULT_WEBRTC_STAR_RELAYS });
  await messaging.start();
  const identity = await trust.getLocalIdentity();
  return { trust, messaging, identity, label };
}

async function waitForPeer(messaging: any, label: string, timeoutMs = 5000): Promise<string> {
  const existing = messaging.getConnectedPeers?.();
  if (existing && existing.length) return existing[0];
  return await new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(`[${label}] timed out waiting for peer`));
      }
    }, timeoutMs);
    messaging.onPeerConnected?.((pid: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(pid);
    });
  });
}

async function ensureWebRTC() {
  if (typeof (globalThis as any).RTCPeerConnection !== "undefined") return true;
  const candidates = ["wrtc", "@koush/wrtc"];
  for (const name of candidates) {
    try {
      const wrtc = await import(name);
      const impl: any = (wrtc as any).default ?? wrtc;
      (globalThis as any).RTCPeerConnection = impl.RTCPeerConnection;
      (globalThis as any).RTCSessionDescription = impl.RTCSessionDescription;
      (globalThis as any).RTCIceCandidate = impl.RTCIceCandidate;
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function main() {
  if (!(await ensureWebRTC())) {
    console.warn(
      "Harness requires WebRTC. Install wrtc/@koush/wrtc or run in a browser-like runtime."
    );
    return;
  }

  const a = await boot("A");
  const b = await boot("B");

  await a.trust.add({ ...b.identity, lastSeen: Date.now() });
  await b.trust.add({ ...a.identity, lastSeen: Date.now() });

  a.messaging.onMessage((msg) => console.log("[A] received", msg.type, "from", msg.from));
  b.messaging.onMessage((msg) => console.log("[B] received", msg.type, "from", msg.from));

  const targetPeerId = await waitForPeer(a.messaging, "A");

  const clip = normalizeClipboardContent("hello from A", a.identity.deviceId);
  if (clip) {
    await a.messaging.sendMessage(targetPeerId, {
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
