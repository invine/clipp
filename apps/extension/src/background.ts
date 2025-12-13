// MV3 background (service worker) lacks window; some deps expect it.
if (typeof globalThis.window === "undefined") {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.window = globalThis;
}
if (typeof globalThis.navigator === "undefined") {
  // Provide minimal navigator for libraries that sniff userAgent
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.navigator = { userAgent: "chrome-extension" };
}

const supportsWebRTC =
  typeof (globalThis as any).RTCPeerConnection !== "undefined" ||
  typeof (globalThis as any).webkitRTCPeerConnection !== "undefined";

import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import {
  createTrustManager,
  TrustedDevice,
} from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { normalizeClipboardContent } from "../../../packages/core/clipboard/normalize";
import { createManualClipboardService } from "../../../packages/core/clipboard/service";
import { createClipboardSyncController } from "../../../packages/core/sync/clipboardSync";
import * as log from "../../../packages/core/logger";
import { deviceIdToPeerId, deviceIdToPeerIdObject } from "../../../packages/core/network/peerId";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../../packages/core/network/constants";

// Initialize log level from storage
chrome.storage.local.get(["logLevel"], (res) => {
  if (res.logLevel) {
    log.setLogLevel(res.logLevel);
  }
  log.info("Background script initialized");
});

const historyBackend =
  typeof (globalThis as any).indexedDB !== "undefined"
    ? new IndexedDBHistoryBackend()
    : new InMemoryHistoryBackend();
const history = new MemoryHistoryStore(historyBackend);
const trust = createTrustManager(new ChromeStorageBackend());

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen || typeof chrome.offscreen.createDocument !== "function") return;
  const has = (chrome.offscreen as any).hasDocument
    ? await (chrome.offscreen as any).hasDocument()
    : false;
  if (!has) {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["DOM_PARSER"],
        justification: "Run libp2p WebRTC networking off the service worker",
      });
    } catch (err) {
      log.error("Failed to create offscreen document", err);
      throw err;
    }
  }
}

async function sendOffscreen<T = any>(message: any, attempt = 0): Promise<T> {
  await ensureOffscreenDocument();
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ target: "offscreen", ...message }, (resp) => {
      // @ts-ignore
      const err = chrome.runtime.lastError;
      if (err) {
        if (attempt < 5) {
          setTimeout(() => {
            sendOffscreen<T>(message, attempt + 1).then(resolve).catch(reject);
          }, 200 * (attempt + 1));
          return;
        }
        reject(new Error(err.message || "offscreen_unavailable"));
        return;
      }
      resolve(resp as T);
    });
  });
}

const offscreenReady = (async () => {
  await ensureOffscreenDocument();
  const identity = await trust.getLocalIdentity();
  // simple ping/handshake retry
  for (let i = 0; i < 5; i++) {
    try {
      await sendOffscreen({ action: "ping" });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  await sendOffscreen({
    action: "init",
    identity,
    relays: DEFAULT_WEBRTC_STAR_RELAYS,
  });
})();

// Background state

function createExtensionClipboardService() {
  return createManualClipboardService({
    getSenderId: async () => {
      const id = await trust.getLocalIdentity();
      return id.deviceId;
    },
    writeText: async (text: string) => {
      await navigator.clipboard.writeText(text);
    },
  });
}

const clipboard = createExtensionClipboardService();
const messageHandlers: Array<(msg: any) => void> = [];
const offscreenMessaging = {
  async broadcast(msg: any) {
    log.debug("Broadcasting clip");
    await offscreenReady;
    await sendOffscreen({ action: "broadcast", msg });
  },
  onMessage(cb: (msg: any) => void) {
    messageHandlers.push(cb);
  },
};
function emitIncomingMessage(msg: any) {
  for (const h of messageHandlers) h(msg);
}

const clipboardSync = createClipboardSyncController({
  clipboard,
  history,
  messaging: offscreenMessaging as any,
  getLocalDeviceId: async () => {
    const id = await trust.getLocalIdentity();
    return id.deviceId;
  },
});
clipboardSync.start();
// Initialize auto-sync state from storage
chrome.storage.local.get(["autoSync"], (res) => {
  clipboardSync.setAutoSync(res.autoSync !== false);
});
history.onNew((item) => {
  // Notify all extension pages about the new clip
  // @ts-ignore
  chrome.runtime.sendMessage({ type: "newClip", clip: item.clip });
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
  const target = d.multiaddrs?.[0] || d.multiaddr || d.deviceId;
  const ack = {
    type: "trust-ack" as const,
    from: id.deviceId,
    payload: { id: d.deviceId, accepted: false },
    sentAt: Date.now(),
  };
  await offscreenReady;
  await sendOffscreen({ action: "sendMessage", target, msg: ack }).catch(() => {});
  log.info("Trust request rejected", d.deviceId);
});
trust.on("approved", async (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
  const id = await trust.getLocalIdentity();
  const target = d.multiaddrs?.[0] || d.multiaddr || d.deviceId;
  const ack = {
    type: "trust-ack" as const,
    from: id.deviceId,
    payload: { id: d.deviceId, accepted: true },
    sentAt: Date.now(),
  };
  await offscreenReady;
  await sendOffscreen({ action: "sendMessage", target, msg: ack }).catch(() => {});
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
      await offscreenReady;
      await sendOffscreen({ action: "broadcast", msg: message });
      history.add(msg.clip, msg.clip.senderId, true);
      sendResponse({ ok: true });
    });
    return true;
  }
  // Handle getPeerStatus from popup
  if (msg.type === "getPeerStatus") {
    // Example: get peer count and connection status from messaging layer
    offscreenReady
      .then(() => sendOffscreen<{ peers: string[] }>({ action: "getPeers" }))
      .then((resp) => {
        const peers = Array.isArray(resp?.peers) ? resp!.peers : [];
        sendResponse({ peerCount: peers.length, connected: peers.length > 0 });
      })
      .catch(() => sendResponse({ peerCount: 0, connected: false }));
    return true;
  }
  // Handle clipboard history for options page
  if (msg.type === "getClipHistory") {
    history.exportAll().then((clips) => {
      sendResponse({ clips });
    });
    return true;
  }
  if (msg.type === "clearHistory") {
    history
      .clearAll()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        log.warn("Failed to clear history", err);
        sendResponse({ ok: false, error: "clear_failed" });
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
        await offscreenReady;
        await sendOffscreen({ action: "broadcast", msg: message });
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
  if (msg.type === "renameLocalIdentity" && typeof msg.name === "string") {
    trust.renameLocalIdentity(msg.name).then((id) => {
      sendResponse({ identity: id });
    });
    return true;
  }
  if (msg.type === "pairDevice" && msg.pairing) {
    trust.getLocalIdentity().then(async (id) => {
      const peerId = await deviceIdToPeerId(msg.pairing.deviceId);
      const targetAddrs =
        msg.pairing.multiaddrs ||
        (msg.pairing.multiaddr ? [msg.pairing.multiaddr] : []);
      const candidates = [
        ...targetAddrs,
        ...DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${peerId}`),
      ];
      log.info("Sending trust request", {
        target: candidates[0],
        targetAddrs: candidates,
        localId: id.deviceId,
      });
      const request = {
        type: "trust-request" as const,
        from: id.deviceId,
        payload: id,
        sentAt: Date.now(),
      };
      let sent = false;
      for (const target of candidates) {
        try {
          await offscreenReady;
          await sendOffscreen({ action: "sendMessage", target, msg: request });
          sent = true;
          break;
        } catch (err) {
          log.warn("Failed to send trust request", {
            target,
            error: (err as any)?.message || String(err),
          });
        }
      }
      sendResponse(sent ? { ok: true } : { ok: false, error: "dial_failed" });
    });
    return true;
  }
  if (msg.type === "getStatus") {
    offscreenReady
      .then(() => sendOffscreen<{ peers: string[] }>({ action: "getPeers" }))
      .then((resp) => {
        const peers = Array.isArray(resp?.peers) ? resp!.peers : [];
        sendResponse({ peerCount: peers.length, autoSync: clipboardSync.isAutoSync() });
      })
      .catch(() => sendResponse({ peerCount: 0, autoSync: clipboardSync.isAutoSync() }));
    return true;
  }
  if (msg.type === "getConnectedPeers") {
    offscreenReady
      .then(() => sendOffscreen<{ peers: string[] }>({ action: "getPeers" }))
      .then((resp) => sendResponse({ peers: Array.isArray(resp?.peers) ? resp!.peers : [] }))
      .catch(() => sendResponse({ peers: [] }));
    return true;
  }
  // Handle trusted device list for options page
  if (msg.type === "getTrustedDevices") {
    trust.list().then((devices) => {
      sendResponse({ devices });
    });
    return true;
  }
  if (msg.type === "deleteClip" && msg.id) {
    history.remove(msg.id).then(() => sendResponse({ ok: true }));
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
      ["autoSync", "expiryDays", "typesEnabled", "logLevel"],
      (res) => {
        sendResponse({
          autoSync: res.autoSync !== false,
          expiryDays: res.expiryDays || 365,
          typesEnabled: res.typesEnabled || {
            text: true,
            image: true,
            file: true,
          },
          logLevel: res.logLevel || "info",
        });
      }
    );
    return true;
  }
  if (msg.type === "setSettings" && msg.settings) {
    // @ts-ignore
    chrome.storage.local.set(msg.settings, () => sendResponse({ ok: true }));
    if (msg.settings.logLevel) {
      log.setLogLevel(msg.settings.logLevel);
    }
    if (msg.settings.autoSync !== undefined) {
      clipboardSync.setAutoSync(msg.settings.autoSync !== false);
    }
    return true;
  }
  // Add more message handlers as needed
});

// Listen for messages forwarded from offscreen (libp2p)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.source !== "offscreen" || msg?.action !== "incoming") return;
  const payload = msg.msg;
  emitIncomingMessage(payload);
  if (payload?.type === "trust-request") {
    const dev = payload.payload as TrustedDevice;
    log.debug("Received trust request from", dev?.deviceId);
    void trust.handleTrustRequest(dev);
  }
});

// Kick off offscreen + clipboard
void offscreenReady.then(() => {
  log.info("Background services started (offscreen networking)");
});
