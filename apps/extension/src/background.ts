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

import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import {
  createIdentityManager,
  createKVIdentityRepository,
  createKVTrustedDeviceRepository,
  createTrustManager,
  IDENTITY_KEY,
  TRUST_KEY,
  TrustedDevice,
} from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { normalizeClipboardContent } from "../../../packages/core/clipboard/normalize";
import {
  createChromeExtensionRuntimeAdapter,
  createRuntimeClipboardService,
  createRuntimeNotificationSelection,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  systemRuntimeClock,
} from "../../../packages/core/runtime";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createTrustProtocolBinder } from "../../../packages/core/messaging";
import * as log from "../../../packages/core/logger";
import { deviceIdToPeerId } from "../../../packages/core/network/peerId";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../../packages/core/network/constants";
import { createClipMessage } from "../../../packages/core/protocols/clip";
import {
  createSignedTrustRequestFromKey,
  toTrustRequestPayload,
} from "../../../packages/core/protocols/clipTrust";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { decodePairingFrame, PAIRING_PROTOCOL, verifyPairingTrustRequestSignature } from "../../../packages/core/pairing/protocol";
import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending";
import { createPairingSession } from "../../../packages/core/pairing/session";
import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target";
import { decodePairingTarget, encodePairingTarget } from "../../../packages/core/pairing/v2";
import type {
  MessagingTransport,
  PeerConnectionInfo,
} from "../../../packages/core/messaging/transport";

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
const storage = new ChromeStorageBackend();
const identityRepo = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
const identitySvc = createIdentityManager({ repo: identityRepo, initialDeviceName: "Extension" });
const trustRepo = createKVTrustedDeviceRepository({ storage, key: TRUST_KEY });
const trust = createTrustManager({ trustRepo, identitySvc });

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
        reasons: ["DOM_PARSER" as any],
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
  const identity = await identitySvc.get();
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
  return createRuntimeClipboardService({
    capabilities: RUNTIME_CAPABILITIES.chromeExtension,
    getSenderId: async () => {
      const id = await identitySvc.get();
      return id.deviceId;
    },
    writeText: async (text: string) => {
      await navigator.clipboard.writeText(text);
    },
  });
}

const clipboard = createExtensionClipboardService();
const messageHandlers: Array<(msg: any) => void> = [];
const trustMessageHandlers: Array<(msg: any) => void> = [];
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
const offscreenTrustMessaging = {
  async send(target: string, msg: any) {
    await offscreenReady;
    await sendOffscreen({ action: "sendMessage", peerTarget: target, msg });
  },
  async broadcast(msg: any) {
    await offscreenReady;
    await sendOffscreen({ action: "broadcast", msg });
  },
  onMessage(cb: (msg: any) => void) {
    trustMessageHandlers.push(cb);
  },
};
const trustBinder = createTrustProtocolBinder({ trust });
trustBinder.bind(offscreenTrustMessaging as any);
function emitIncomingMessage(msg: any) {
  for (const h of messageHandlers) h(msg);
}

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

async function createServiceWorkerTrustRequest(id: any, peerId: string) {
  if (!id?.privateKey || typeof id.privateKey !== "string") {
    throw new Error("missing_private_key");
  }
  const privateKey = privateKeyFromProtobuf(base64ToBytes(id.privateKey));
  return await createSignedTrustRequestFromKey({
    from: id.deviceId,
    to: peerId,
    payload: toTrustRequestPayload(id),
    privateKey: privateKey as any,
  });
}

const clipboardSync = createClipboardSyncManager({
  clipboard,
  history,
  messaging: offscreenMessaging as any,
  getLocalDeviceId: async () => {
    const id = await identitySvc.get();
    return id.deviceId;
  },
});
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
let pairingWaiting: Array<{ targetPeerId: string; expiresAtUnixMs: bigint }> = [];

function showPairingRequestNotification(device: TrustedDevice) {
  const deviceName = device.deviceName?.trim() || "Unknown device";
  void runtimeAdapter.notifications.show({
    id: `pairing-request-${device.deviceId}`,
    title: "New pairing request",
    body: `${deviceName} wants to pair with Clipp.`,
  });
}

trust.on("request", (d) => {
  if (pendingRequests.some((p) => p.deviceId === d.deviceId)) return;
  pendingRequests.push(d);
  // @ts-ignore
  chrome.runtime.sendMessage({ type: "trustRequest", device: d });
  showPairingRequestNotification(d);
  log.info("Trust request received", d.deviceId);
});
trust.on("rejected", async (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
  log.info("Trust request rejected", d.deviceId);
});
trust.on("approved", async (d) => {
  pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
  void offscreenReady
    .then(() => sendOffscreen({ action: "connectPairedPeers" }))
    .catch(() => {});
  log.info("Device approved", d.deviceId);
});

const runtimeProtocolHandlers = new Map<string, Array<(from: string, data: Uint8Array) => void>>();
const runtimePeerConnectedHandlers = new Set<(peerId: string) => void>();
const runtimePeerDisconnectedHandlers = new Set<(peerId: string) => void>();
const runtimeSelfPeerUpdateHandlers = new Set<(multiaddrs: string[]) => void>();
let runtimeConnectedPeers = new Set<string>();

const extensionNetwork: MessagingTransport = {
  async start() {
    await offscreenReady;
  },
  async stop() {
    // The offscreen document remains available across service-worker suspension.
  },
  async send(protocol, target, data) {
    await offscreenReady;
    await sendOffscreen({ action: "runtimeSend", protocol, peerTarget: target, data: Array.from(data) });
  },
  async connect(target) {
    await offscreenReady;
    await sendOffscreen({ action: "runtimeConnect", peerTarget: target });
  },
  onMessage(protocol, handler) {
    const handlers = runtimeProtocolHandlers.get(protocol) ?? [];
    runtimeProtocolHandlers.set(protocol, [...handlers, handler]);
    if (handlers.length === 0) {
      void offscreenReady
        .then(() => sendOffscreen({ action: "runtimeRegisterProtocol", protocol }))
        .catch(() => {});
    }
  },
  onPeerConnected(handler) {
    runtimePeerConnectedHandlers.add(handler);
  },
  onPeerDisconnected(handler) {
    runtimePeerDisconnectedHandlers.add(handler);
  },
  onSelfPeerUpdate(handler) {
    runtimeSelfPeerUpdateHandlers.add(handler);
  },
  getConnectedPeers: () => [...runtimeConnectedPeers],
  async getSignedPeerRecord() {
    const result = await sendOffscreen<{ record?: number[] }>({ action: "runtimeGetSignedPeerRecord" });
    if (!Array.isArray(result?.record)) throw new Error("signed_peer_record_unavailable");
    return Uint8Array.from(result.record);
  },
  async importSignedPeerRecord(peerId, record) {
    const result = await sendOffscreen<{ ok?: boolean }>({ action: "runtimeImportSignedPeerRecord", peerId, record: Array.from(record) });
    if (!result?.ok) throw new Error("invalid_signed_peer_record");
  },
};
const notificationSelection = createRuntimeNotificationSelection();

const runtimeAdapter = createChromeExtensionRuntimeAdapter({
  storage,
  identityKey: IDENTITY_KEY,
  applicationStateKey: "runtimeApplicationState",
  initialApplicationState: () => ({} as Record<string, unknown>),
  clipboard: {
    readText: async () => navigator.clipboard.readText(),
    writeText: async (text) => navigator.clipboard.writeText(text),
  },
  notifications: {
    async show(message) {
      if (!chrome.notifications?.create) return;
      await chrome.notifications.create(message.id, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon-128.png"),
        title: message.title,
        message: message.body,
      });
    },
    async dismiss(id) {
      if (chrome.notifications?.clear) await chrome.notifications.clear(id);
    },
    onSelect: notificationSelection.onSelect,
  },
  lifecycle: {
    onShutdown(handler) {
      const listener = () => void handler();
      chrome.runtime.onSuspend?.addListener(listener);
      return () => chrome.runtime.onSuspend?.removeListener(listener);
    },
    openApprovalView() {
      if (typeof chrome.action?.openPopup === "function") {
        void chrome.action.openPopup().catch(() => {});
      } else {
        void chrome.runtime.sendMessage({ type: "openPairingApproval" });
      }
    },
  },
  network: extensionNetwork,
  clock: systemRuntimeClock,
  publicState: {
    async read() {
      const [clips, devices, identity, peerState] = await Promise.all([
        history.exportAll(),
        trust.list(),
        identitySvc.get(),
        offscreenReady
          .then(() => sendOffscreen<{ peers?: string[]; peerConnections?: PeerConnectionInfo[] }>({ action: "getPeers" }))
          .catch(() => ({ peers: [], peerConnections: [] })),
      ]);
      return {
        clips,
        devices,
        pending: pendingRequests,
        waiting: pairingWaiting,
        peers: peerState.peers ?? [],
        peerConnections: peerState.peerConnections ?? [],
        identity,
        pinnedIds: [],
        relayAddresses: DEFAULT_WEBRTC_STAR_RELAYS,
      };
    },
    async publish(state) {
      await chrome.runtime.sendMessage({ type: "runtimeState", state }).catch(() => {});
    },
  },
  relays: {
    readAddresses: async () => [...DEFAULT_WEBRTC_STAR_RELAYS],
  },
});
const pairingPending = createPendingTrustRequestCoordinator({
  localPeerId: async () => deviceIdToPeerId((await identitySvc.get()).deviceId),
  store: createKVPendingTrustRequestStore({ storage, key: "pairingPendingRequests" }),
  notifications: runtimeAdapter.notifications,
  lifecycle: runtimeAdapter.lifecycle,
  clock: systemRuntimeClock,
  verify: verifyPairingTrustRequestSignature,
  sendResponse: (peerId, frame) => extensionNetwork.send(PAIRING_PROTOCOL, peerId, frame),
  responseIdentity: async () => { const identity = await identitySvc.get(); return { deviceName: identity.deviceName, nameRevision: BigInt(identity.nameRevision ?? 0) }; },
  onRejected: (reason) => log.warn("Pairing request rejected", { reason }),
});
const pairingSessions = new Map<string, ReturnType<typeof createPairingSession>>();
extensionNetwork.onMessage(PAIRING_PROTOCOL, (from, frame) => {
  if (decodePairingFrame(frame)?.kind === "response") void pairingSessions.get(from)?.receiveResponse(from, frame).then((decision) => { if (decision) pairingSessions.delete(from); }).catch((error) => log.warn("Pairing response processing failed", error));
  else void pairingPending.receive(from, frame).then(async (accepted) => {
    if (!accepted) return;
    const requests = await pairingPending.list();
    pendingRequests = [...pendingRequests.filter((pending) => !requests.some((request) => request.initiatorPeerId === pending.deviceId)), ...requests.map((request) => ({ deviceId: request.initiatorPeerId, deviceName: request.deviceName, publicKey: "", createdAt: Number(request.expiresAtUnixMs) }))];
    await runtimeAdapter.publicState.publish(await runtimeAdapter.publicState.read());
  }).catch((error) => log.warn("Pairing request processing failed", error));
});
chrome.notifications?.onClicked?.addListener((id) => {
  notificationSelection.emit(id);
});
const sharedRuntime = createRuntimeOrchestrator({
  adapter: runtimeAdapter,
  start: async () => {
    await offscreenReady;
    clipboardSync.start();
    await extensionNetwork.start();
    await pairingPending.start();
    const requests = await pairingPending.list();
    pendingRequests = [...pendingRequests.filter((pending) => !requests.some((request) => request.initiatorPeerId === pending.deviceId)), ...requests.map((request) => ({ deviceId: request.initiatorPeerId, deviceName: request.deviceName, publicKey: "", createdAt: Number(request.expiresAtUnixMs) }))];
  },
  stop: async () => {
    clipboardSync.stop();
  },
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
    identitySvc.get().then(async (id) => {
      const message = createClipMessage({
        from: id.deviceId,
        clip: msg.clip,
        sentAt: Date.now(),
      });
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
      .then(() => sendOffscreen<{ peers: string[]; peerConnections?: PeerConnectionInfo[] }>({ action: "getPeers" }))
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
    pairingPending.decide(msg.id, msg.accept ? "accepted" : "rejected").then((handled) => {
      if (!handled) log.warn("No valid pairing request to decide");
    }).catch((error) => log.warn("Pairing response failed", error));
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
      const id = await identitySvc.get();
      const clip = normalizeClipboardContent(text, id.deviceId);
      if (clip) {
        history.add(clip, id.deviceId, true);
        const message = createClipMessage({
          from: id.deviceId,
          clip,
          sentAt: Date.now(),
        });
        log.debug("Broadcasting clip");
        await offscreenReady;
        await sendOffscreen({ action: "broadcast", msg: message });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === "getLocalIdentity") {
    identitySvc.get().then((id) => {
      sendResponse({ identity: id });
    });
    return true;
  }
  if (msg.type === "getPairingTarget") {
    void (async () => {
      try {
        await offscreenReady;
        const identity = await identitySvc.get();
        const signedPeerRecord = await extensionNetwork.getSignedPeerRecord();
        sendResponse({ text: encodePairingTarget({ targetPeerId: await deviceIdToPeerId(identity.deviceId), signedPeerRecord, deviceNameHint: identity.deviceName }) });
      } catch (error) {
        sendResponse({ error: (error as Error).message });
      }
    })();
    return true;
  }
  if (msg.type === "renameLocalIdentity" && typeof msg.name === "string") {
    identitySvc.rename(msg.name).then(async () => {
      sendResponse({ identity: await identitySvc.get() });
    });
    return true;
  }
  if (msg.type === "pairDevice" && typeof msg.pairingText === "string") {
    void (async () => {
      try {
        await offscreenReady;
        const id = await identitySvc.get();
        if (!id.privateKey) throw new Error("missing_private_key");
        const privateKey = privateKeyFromProtobuf(base64ToBytes(id.privateKey));
        const session = createPairingSession({
          identity: async () => ({ peerId: await deviceIdToPeerId(id.deviceId), deviceName: id.deviceName, nameRevision: id.nameRevision ?? 0 }),
          sign: async (bytes) => privateKey.sign(bytes),
          verify: verifyPairingTrustRequestSignature,
          send: (peerId, frame) => extensionNetwork.send(PAIRING_PROTOCOL, peerId, frame),
          clock: systemRuntimeClock,
          onWaitingChanged: (waiting) => { pairingWaiting = waiting; void runtimeAdapter.publicState.publish(runtimeAdapter.publicState.read() as any); },
        });
        const target = decodePairingTarget(msg.pairingText);
        if (!target) throw new Error("invalid_pairing_target");
        pairingSessions.set(target.targetPeerId, session);
        await importPairingTargetAndRequest({ text: msg.pairingText, network: extensionNetwork, request: session.request });
        sendResponse({ ok: true });
      } catch (error) {
        const target = decodePairingTarget(msg.pairingText);
        if (target) pairingSessions.delete(target.targetPeerId);
        sendResponse({ ok: false, error: (error as Error).message });
      }
    })();
    return true;
  }
  if (msg.type === "getStatus") {
    offscreenReady
      .then(() => sendOffscreen<{ peers: string[]; peerConnections?: PeerConnectionInfo[] }>({ action: "getPeers" }))
      .then((resp) => {
        const peers = Array.isArray(resp?.peers) ? resp!.peers : [];
        sendResponse({ peerCount: peers.length, autoSync: clipboardSync.isAutoSync() });
      })
      .catch(() => sendResponse({ peerCount: 0, autoSync: clipboardSync.isAutoSync() }));
    return true;
  }
  if (msg.type === "getConnectedPeers") {
    offscreenReady
      .then(() => sendOffscreen<{ peers: string[]; peerConnections?: PeerConnectionInfo[] }>({ action: "getPeers" }))
      .then((resp) =>
        sendResponse({
          peers: Array.isArray(resp?.peers) ? resp!.peers : [],
          peerConnections: Array.isArray(resp?.peerConnections) ? resp!.peerConnections : [],
        })
      )
      .catch(() => sendResponse({ peers: [], peerConnections: [] }));
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
  if (msg.type === "renameDevice" && msg.id && typeof msg.name === "string") {
    trust.rename(msg.id, msg.name).then((device) => sendResponse({ ok: true, device }));
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
  if (msg?.source !== "offscreen") return;
  if (msg?.action === "selfPeerUpdate" && Array.isArray(msg.multiaddrs)) {
    void identitySvc.updateMultiaddrs(msg.multiaddrs);
    runtimeSelfPeerUpdateHandlers.forEach((handler) => handler(msg.multiaddrs));
    return;
  }
  if (
    msg?.action === "runtimeProtocol" &&
    typeof msg.protocol === "string" &&
    typeof msg.from === "string" &&
    Array.isArray(msg.data)
  ) {
    const data = Uint8Array.from(msg.data);
    runtimeProtocolHandlers.get(msg.protocol)?.forEach((handler) => handler(msg.from, data));
    return;
  }
  if (msg?.action === "peers" && Array.isArray(msg.peers)) {
    const nextPeers = new Set<string>(msg.peers.filter((peer: unknown): peer is string => typeof peer === "string"));
    nextPeers.forEach((peerId) => {
      if (!runtimeConnectedPeers.has(peerId)) {
        runtimePeerConnectedHandlers.forEach((handler) => handler(peerId));
      }
    });
    runtimeConnectedPeers.forEach((peerId) => {
      if (!nextPeers.has(peerId)) {
        runtimePeerDisconnectedHandlers.forEach((handler) => handler(peerId));
      }
    });
    runtimeConnectedPeers = nextPeers;
    return;
  }
  if (msg?.action !== "incoming") return;
  const payload = msg.msg;
  emitIncomingMessage(payload);
  if (
    payload?.type === "trust-request" ||
    payload?.type === "trust-ack" ||
    payload?.type === "trusted-peers"
  ) {
    for (const h of trustMessageHandlers) h(payload);
  }
});

// Kick off offscreen + clipboard
void sharedRuntime.start().then(() => {
  log.info("Background services started (offscreen networking)");
});
