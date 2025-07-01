import { createMessagingLayer } from "../../../packages/core/network/engine";
import { MemoryHistoryStore } from "../../../packages/core/history/store";
import {
  createTrustManager,
  TrustedDevice,
} from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { normalizeClipboardContent } from "../../../packages/core/clipboard/normalize";
import { createClipboardService } from "../../../packages/core/clipboard/service";
import * as log from "../../../packages/core/logger";

// Background state
log.info("Background script initialized");
const messaging = createMessagingLayer();
const history = new MemoryHistoryStore();
const trust = createTrustManager(new ChromeStorageBackend());

async function ensureOffscreen() {
  if (!chrome.offscreen) return;
  const has = await chrome.offscreen.hasDocument?.();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: "src/offscreen.html",
      // url: chrome.runtime.getURL("src/offscreen.html"),
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: "monitor clipboard changes",
    });
    log.info("Offscreen document created");
  }
}

// In MV3 the service worker may stop when idle and isn't guaranteed to start
// automatically on browser launch. Listen for startup and install events to
// create the offscreen document so clipboard monitoring works in the
// background.
chrome.runtime.onStartup.addListener(() => {
  void ensureOffscreen();
});
chrome.runtime.onInstalled.addListener(() => {
  void ensureOffscreen();
});

const clipboard = createClipboardService("chrome", {
  async sendClip(clip) {
    const id = await trust.getLocalIdentity();
    const message = {
      type: "CLIP" as const,
      from: id.deviceId,
      clip,
      sentAt: Date.now(),
    };
    log.debug("Broadcasting clip");
    await messaging.broadcast(message as any);
  },
});
clipboard.onLocalClip((clip) => {
  void trust.getLocalIdentity().then((id) => {
    history.add(clip, id.deviceId, true);
  });
});
let pendingRequests: TrustedDevice[] = [];

trust.on("request", (d) => {
  pendingRequests.push(d);
  // @ts-ignore
  chrome.runtime.sendMessage({ type: "trustRequest", device: d });
  log.info("Trust request received", d.deviceId);
});
trust.on("rejected", async (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
  const id = await trust.getLocalIdentity();
  const ack = {
    type: "trust-ack" as const,
    from: id.deviceId,
    payload: { id: d.deviceId, accepted: false },
    sentAt: Date.now(),
  };
  await messaging.sendMessage(d.deviceId, ack as any).catch(() => {});
  log.info("Trust request rejected", d.deviceId);
});
trust.on("approved", async (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
  const id = await trust.getLocalIdentity();
  const ack = {
    type: "trust-ack" as const,
    from: id.deviceId,
    payload: { id: d.deviceId, accepted: true },
    sentAt: Date.now(),
  };
  await messaging.sendMessage(d.deviceId, ack as any).catch(() => {});
  log.info("Device approved", d.deviceId);
});

// Listen for clipboard changes (MV3: use chrome.clipboard or content script)
// Listen for messages from popup/options
// @ts-ignore
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getLatestClip") {
    history.query({ limit: 1 }).then((items) => {
      sendResponse({ clip: items[0]?.clip || null });
    });
    return true;
  }
  // Handle shareClip from popup
  if (msg.type === "shareClip" && msg.clip) {
    trust.getLocalIdentity().then(async (id) => {
      const message = {
        type: "CLIP" as const,
        from: id.deviceId,
        clip: msg.clip,
        sentAt: Date.now(),
      };
      log.debug("Broadcasting clip");
      await messaging.broadcast(message as any);
      history.add(msg.clip, msg.clip.senderId, true);
      sendResponse({ ok: true });
    });
    return true;
  }
  // Handle getPeerStatus from popup
  if (msg.type === "getPeerStatus") {
    // Example: get peer count and connection status from messaging layer
    const peers = messaging.getConnectedPeers
      ? messaging.getConnectedPeers()
      : [];
    sendResponse({
      peerCount: Array.isArray(peers) ? peers.length : 0,
      connected: Array.isArray(peers) ? peers.length > 0 : false,
    });
    return true;
  }
  // Handle clipboard history for options page
  if (msg.type === "getClipHistory") {
    history.exportAll().then((clips) => {
      sendResponse({ clips });
    });
    return true;
  }
  if (msg.type === "searchClipHistory") {
    history.query({ search: msg.query || "" }).then((items) => {
      sendResponse({ clips: items.map((i) => i.clip) });
    });
    return true;
  }
  if (msg.type === "getPendingRequests") {
    sendResponse(pendingRequests);
    return true;
  }
  if (msg.type === "respondTrust") {
    pendingRequests = pendingRequests.filter((p) => p.deviceId !== msg.id);
    if (msg.accept && msg.device) {
      trust.add(msg.device);
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "clipboardUpdate" && msg.text) {
    void clipboard.processLocalText(msg.text).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "shareNow") {
    navigator.clipboard.readText().then(async (text) => {
      const id = await trust.getLocalIdentity();
      const clip = normalizeClipboardContent(text, id.deviceId);
      if (clip) {
        history.add(clip, id.deviceId, true);
        const message = {
          type: "CLIP" as const,
          from: id.deviceId,
          clip,
          sentAt: Date.now(),
        };
        log.debug("Broadcasting clip");
        await messaging.broadcast(message as any);
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "getLocalIdentity") {
    trust.getLocalIdentity().then((id) => {
      sendResponse({ identity: id });
    });
    return true;
  }
  if (msg.type === "pairDevice" && msg.pairing) {
    trust.getLocalIdentity().then(async (id) => {
      const request = {
        type: "trust-request" as const,
        from: id.deviceId,
        payload: id,
        sentAt: Date.now(),
      };
      await messaging
        .sendMessage(msg.pairing.deviceId, request as any)
        .catch(() => {});
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "getStatus") {
    const peers = messaging.getConnectedPeers
      ? messaging.getConnectedPeers()
      : [];
    sendResponse({ peerCount: peers.length, autoSync: clipboard.isAutoSync() });
    return true;
  }
  // Handle trusted device list for options page
  if (msg.type === "getTrustedDevices") {
    trust.list().then((devices) => {
      sendResponse({ devices });
    });
    return true;
  }
  if (msg.type === "revokeDevice" && msg.id) {
    trust.remove(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  // Settings: auto-sync, expiry, type filters
  if (msg.type === "getSettings") {
    // @ts-ignore
    chrome.storage.local.get(
      ["autoSync", "expiryDays", "typesEnabled"],
      (res) => {
        sendResponse({
          autoSync: res.autoSync !== false,
          expiryDays: res.expiryDays || 365,
          typesEnabled: res.typesEnabled || {
            text: true,
            image: true,
            file: true,
          },
        });
      }
    );
    return true;
  }
  if (msg.type === "setSettings" && msg.settings) {
    // @ts-ignore
    chrome.storage.local.set(msg.settings, () => sendResponse({ ok: true }));
    return true;
  }
  // Add more message handlers as needed
});

// Listen for incoming clips from peers
messaging.onMessage(async (msg) => {
  if (msg.type === "CLIP") {
    log.debug("Received clip from", msg.from);
    await history.add(msg.clip!, msg.from, false);
    // Optionally notify popup/options
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "newClip", clip: msg.clip });
  } else if (msg.type === "trust-request") {
    log.debug("Received trust request from", (msg.payload as TrustedDevice).deviceId);
    const dev = msg.payload as TrustedDevice;
    await trust.handleTrustRequest(dev);
  }
});

// Start services after ensuring offscreen page exists
ensureOffscreen().finally(() => {
  log.info("Background services starting");
  messaging.start();
  clipboard.start();
  log.info("Background services started");
});
