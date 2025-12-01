import { createMessagingLayer } from "../../../packages/core/network/engine.js";
import { createTrustManager } from "../../../packages/core/trust/index.js";
import { ChromeStorageBackend } from "./chromeStorage.js";
import { deviceIdToPeerIdObject } from "../../../packages/core/network/peerId.js";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../../packages/core/network/constants.js";
import * as log from "../../../packages/core/logger.js";

let messaging = null;
let trust = createTrustManager(new ChromeStorageBackend());

async function initMessaging(identity, relays = DEFAULT_WEBRTC_STAR_RELAYS) {
  if (messaging) return;
  const peerId = await deviceIdToPeerIdObject(identity.deviceId);
  messaging = createMessagingLayer({ peerId, relayAddresses: relays, trustStore: trust });
  messaging.onMessage(async (msg) => {
    chrome.runtime.sendMessage({ source: "offscreen", action: "incoming", msg }).catch(() => {});
  });
  await messaging.start();
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
    if (!messaging) {
      sendResponse({ ok: false, error: "not_initialized" });
      return;
    }
    if (msg.action === "broadcast" && msg.msg) {
      await messaging.broadcast(msg.msg);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "sendMessage" && msg.target && msg.msg) {
      await messaging.sendMessage(msg.target, msg.msg);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "getPeers") {
      const peers = messaging.getConnectedPeers ? messaging.getConnectedPeers() : [];
      sendResponse({ peers });
      return;
    }
    sendResponse({ ok: false, error: "unknown_action" });
  })().catch((err) => {
    log.error("Offscreen handler error", err);
    sendResponse({ ok: false, error: err?.message || "offscreen_error" });
  });
  return true;
});
