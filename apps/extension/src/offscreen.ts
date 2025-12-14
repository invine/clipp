import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine";
import { createTrustManager } from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { deviceIdToPeerIdObject } from "../../../packages/core/network/peerId";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../../packages/core/network/constants";
import { createTrustMessenger, createTrustedClipMessenger, createTrustedHistoryMessenger } from "../../../packages/core/messaging";
import * as log from "../../../packages/core/logger";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";

let transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
let clipMessaging: any = null;
let trustMessaging: any = null;
let historyMessaging: any = null;
let trust = createTrustManager(new ChromeStorageBackend());
let started = false;

function base64ToBytes(b64: string): Uint8Array {
  try {
    // eslint-disable-next-line no-undef
    if (typeof Buffer !== "undefined") {
      // eslint-disable-next-line no-undef
      return Uint8Array.from(Buffer.from(b64, "base64"));
    }
  } catch {
    // ignore
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function initMessaging(identity: any, relays: string[] = DEFAULT_WEBRTC_STAR_RELAYS) {
  if (transport) return;
  const peerId = await deviceIdToPeerIdObject(identity.deviceId);
  const privateKey =
    identity?.privateKey && typeof identity.privateKey === "string"
      ? await privateKeyFromProtobuf(base64ToBytes(identity.privateKey))
      : undefined;
  transport = createLibp2pMessagingTransport({ peerId, privateKey, relayAddresses: relays });

  clipMessaging = createTrustedClipMessenger(transport, (id) => trust.isTrusted(id));
  trustMessaging = createTrustMessenger(transport);
  historyMessaging = createTrustedHistoryMessenger(transport, (id) => trust.isTrusted(id));

  clipMessaging.onMessage((msg: any) => {
    chrome.runtime.sendMessage({ source: "offscreen", action: "incoming", msg }).catch(() => {});
  });
  trustMessaging.onMessage((msg: any) => {
    chrome.runtime.sendMessage({ source: "offscreen", action: "incoming", msg }).catch(() => {});
  });
  historyMessaging.onMessage((msg: any) => {
    chrome.runtime.sendMessage({ source: "offscreen", action: "incoming", msg }).catch(() => {});
  });

  await transport.start();
  started = true;
  const peers = transport.getConnectedPeers ? transport.getConnectedPeers() : [];
  chrome.runtime.sendMessage({ source: "offscreen", action: "peers", peers }).catch(() => {});
  log.info("Offscreen messaging started");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  (async () => {
    if (msg.action === "init") {
      await initMessaging(msg.identity, msg.relays);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "ping") {
      sendResponse({ ok: true });
      return;
    }
    if (!transport) {
      sendResponse({ ok: false, error: "not_initialized" });
      return;
    }
    if (msg.action === "broadcast" && msg.msg) {
      const m = msg.msg as any;
      if (m?.type === "CLIP") {
        await clipMessaging.broadcast(m);
      } else if (m?.type === "sync-history") {
        await historyMessaging.broadcast(m);
      } else {
        await trustMessaging.broadcast(m);
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "sendMessage" && msg.target && msg.msg) {
      const target = msg.target as string;
      const m = msg.msg as any;
      if (m?.type === "CLIP") {
        await clipMessaging.send(target, m);
      } else if (m?.type === "sync-history") {
        await historyMessaging.send(target, m);
      } else {
        await trustMessaging.send(target, m);
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "getPeers") {
      const peers = transport.getConnectedPeers ? transport.getConnectedPeers() : [];
      sendResponse({ peers });
      return;
    }
    if (msg.action === "getStatus") {
      const peers = transport.getConnectedPeers ? transport.getConnectedPeers() : [];
      sendResponse({ peers, started });
      return;
    }
    sendResponse({ ok: false, error: "unknown_action" });
  })().catch((err) => {
    log.error("Offscreen handler error", err);
    sendResponse({ ok: false, error: (err as any)?.message || "offscreen_error" });
  });
  return true;
});
