import { ClipboardMessagingLayer } from "../../../packages/core/network/messaging";
import { DefaultClipboardHistoryStore } from "../../../packages/core/history/store";
import { createTrustManager, TrustedDevice } from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { normalizeClipboardContent } from "../../../packages/core/clipboard/normalize";

// Background state
const messaging = new ClipboardMessagingLayer();
const history = new DefaultClipboardHistoryStore();
const trust = createTrustManager(new ChromeStorageBackend());
let pendingRequests: TrustedDevice[] = [];

trust.on('request', (d) => {
  pendingRequests.push(d);
  // @ts-ignore
  chrome.runtime.sendMessage({ type: 'trustRequest', device: d });
});
trust.on('rejected', (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
});
trust.on('approved', (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
});

// Listen for clipboard changes (MV3: use chrome.clipboard or content script)
// Listen for messages from popup/options
// @ts-ignore
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Example: handle getLatestClip
  if (msg.type === "getLatestClip") {
    history.listRecent(1).then((items) => {
      sendResponse({ clip: items[0]?.clip || null });
    });
    return true;
  }
  // Handle shareClip from popup
  if (msg.type === "shareClip" && msg.clip) {
    // Send to all peers via messaging layer
    if (
      typeof messaging.sendClip === "function" &&
      typeof messaging.getConnectedPeers === "function"
    ) {
      const peers = messaging.getConnectedPeers();
      for (const peerId of peers) {
        messaging.sendClip(peerId, msg.clip);
      }
    }
    // Optionally add to local history
    history.add(msg.clip, msg.clip.senderId, true);
    sendResponse({ ok: true });
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
    history.search(msg.query || "").then((items) => {
      sendResponse({ clips: items.map((i) => i.clip) });
    });
    return true;
  }
  if (msg === "getPendingRequests") {
    sendResponse(pendingRequests);
    return true;
  }
  if (msg.cmd === "respondTrust") {
    pendingRequests = pendingRequests.filter((p) => p.deviceId !== msg.id);
    if (msg.accept && msg.device) {
      trust.add(msg.device);
    }
    sendResponse({ ok: true });
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
    await history.add(msg.clip, msg.from, false);
    // Optionally notify popup/options
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "newClip", clip: msg.clip });
  } else if (msg.type === "trust-request") {
    const dev = msg.payload as TrustedDevice;
    await trust.handleTrustRequest(dev);
  }
});

// Start messaging layer
messaging.start();
