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

import {
  MemoryHistoryStore,
  RETENTION_MS,
  startHistoryRetentionCleanup,
  type HistoryRetentionCleanup,
} from "../../../packages/core/history/store";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import {
  createKVIdentityRepository,
  toPublicDeviceIdentity,
  createIdentityRotationCommitter,
  IDENTITY_KEY,
} from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { handleOffscreenStorageRequest } from "./runtimeMessageStorage";
import {
  deriveExtensionIdentityKeyMaterial,
  generateExtensionIdentityKeyMaterial,
} from "./identityKeyMaterial";
import {
  createChromeExtensionRuntimeAdapter,
  createAutoSyncPreference,
  createRuntimeIdentityManager,
  createRuntimeIdentityRotationCoordinator,
  createRuntimeIdentityRotationLifecycle,
  createRuntimeClipboardService,
  createRuntimeNotificationSelection,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  startIdentityBoundRuntimeServices,
  stopIdentityBoundRuntimeServices,
  systemRuntimeClock,
  type RuntimeClipboardHistoryError,
} from "../../../packages/core/runtime";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createHistoryReconciliation } from "../../../packages/core/sync/historyReconciliation";
import { reuseRetainedClip } from "../../../packages/core/clipboard/explicitActions";
import { createExtensionClipboardBridge } from "./clipboardBridge";
import { isAuthorizedPopupShareNowSender } from "./popupClipboardActions";
import { createLiveClipGossip } from "../../../packages/core/sync/liveClipGossip";
import * as log from "../../../packages/core/logger";
import { deviceIdToPeerId } from "../../../packages/core/network/peerId";
import {
  loadManagedRelayConfigurations,
  type RelayConfiguration,
  type RelayState,
} from "../../../packages/core/network/managedRelays";
import {
  isConfiguredManagedEndpoint,
  replaceManagedRelayConfigurations,
} from "./managedRelayConfiguration";
import { MANAGED_RELAY_CONFIGURATION_KEY } from "./managedRelayConstants";
import { createChromeManagedRelayCredentials } from "./managedRelayChrome";
import {
  authorizedManagedRelayPort,
  parseAccessRequest,
} from "./managedRelayBridge";
import { authorizedRelayUi } from "./managedRelayUi";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { PAIRING_PROTOCOL } from "../../../packages/core/pairing/protocol";
import { verifyExtensionPairingTrustRequestSignature } from "./pairingSignature";
import {
  createMembershipPeerRecordBridge,
  createMembershipReconciler,
} from "../../../packages/core/membership/reconciliation";
import {
  createKVPendingTrustRequestStore,
  createPendingTrustRequestCoordinator,
} from "../../../packages/core/pairing/pending";
import { createPairingRuntimeSessions } from "../../../packages/core/pairing/runtimeCoordinator";
import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target";
import {
  decodePairingTarget,
  encodePairingTarget,
} from "../../../packages/core/pairing/v2";
import type {
  PeerConnectionInfo,
  StreamingMessagingTransport,
} from "../../../packages/core/messaging/transport";
import { createExtensionReachabilityBridge } from "./networkBridge";
import {
  createExtensionStreamReceiver,
  isExtensionStreamMessage,
  sendBufferedExtensionStream,
} from "./streamBridge";

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
const history = new MemoryHistoryStore(historyBackend, {
  pinPersistence: "session",
});
let localRetentionMs = RETENTION_MS;
let clipboardHistoryError: RuntimeClipboardHistoryError | null = null;
let historyPolicyError: "history_cleanup_failed" | null = null;
let historyRetentionCleanup: HistoryRetentionCleanup | undefined;
let pendingRetentionMs: number | null = null;
const storage = new ChromeStorageBackend();
const managedCredentials = createChromeManagedRelayCredentials(
  import.meta.env.VITE_CLIPP_REGISTERED_EXTENSION_ID ?? ""
);
const managedConfigurationStore = {
  readNewModel: () => storage.get(MANAGED_RELAY_CONFIGURATION_KEY),
  writeNewModel: (configurations: RelayConfiguration[]) =>
    storage.set(MANAGED_RELAY_CONFIGURATION_KEY, configurations),
};
let managedConfigurations: RelayConfiguration[] = [];
let managedStates: RelayState[] = [];
const managedConfigurationsReady = loadManagedRelayConfigurations(
  managedConfigurationStore
).then((values) => {
  managedConfigurations = values;
});
let managedConfigurationUpdate: Promise<void> = Promise.resolve();
const autoSyncPreference = createAutoSyncPreference({ storage });
let autoSync = true;
const autoSyncReady = autoSyncPreference.load().then((persisted) => {
  autoSync = persisted;
});
let resolveHistoryPolicyReady: (() => void) | undefined;
const historyPolicyReady = new Promise<void>((resolve) => {
  resolveHistoryPolicyReady = resolve;
});
const identityRepo = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
const identitySvc = createRuntimeIdentityManager({
  repo: identityRepo,
  capabilities: RUNTIME_CAPABILITIES.chromeExtension,
  generateKeyMaterial: generateExtensionIdentityKeyMaterial,
  deriveKeyMaterial: deriveExtensionIdentityKeyMaterial,
});

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const POPUP_URL = chrome.runtime.getURL("src/popup.html");
const OPTIONS_URL = chrome.runtime.getURL("src/options.html");

chrome.runtime.onConnect.addListener((port) => {
  if (
    !authorizedManagedRelayPort(
      port.sender,
      chrome.runtime.id,
      OFFSCREEN_URL,
      port.name
    )
  ) {
    port.disconnect();
    return;
  }
  port.onMessage.addListener((value: unknown) => {
    const request = parseAccessRequest(value);
    if (!request) {
      port.postMessage({ error: "invalid_relay_access_request" });
      return;
    }
    void managedConfigurationsReady
      .then(() =>
        isConfiguredManagedEndpoint(managedConfigurations, request.discoveryUrl)
          ? managedCredentials.accessToken(request.discoveryUrl)
          : null
      )
      .then((accessToken) =>
        port.postMessage({
          accessToken,
          warning: managedCredentials.warning(request.discoveryUrl),
        })
      )
      .catch(() => port.postMessage({ accessToken: null }));
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.target !== "background" ||
    message?.action !== "offscreenStorage"
  )
    return;
  void handleOffscreenStorageRequest(message, sender, {
    storage,
    extensionId: chrome.runtime.id,
    offscreenUrl: OFFSCREEN_URL,
  }).then(sendResponse);
  return true;
});

function createOffscreenStartupGate(): {
  ready: Promise<void>;
  open(): void;
} {
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  return {
    ready,
    open() {
      resolveReady?.();
      resolveReady = undefined;
    },
  };
}

let offscreenCreateFlight: Promise<void> | null = null;
let offscreenInitialized = false;
let offscreenInitFlight: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  if (
    !chrome.offscreen ||
    typeof chrome.offscreen.createDocument !== "function"
  )
    return;
  if (!offscreenCreateFlight) {
    offscreenCreateFlight = (async () => {
      const has = (chrome.offscreen as any).hasDocument
        ? await (chrome.offscreen as any).hasDocument()
        : false;
      if (!has) {
        offscreenInitialized = false;
        try {
          await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: [
              chrome.offscreen.Reason.WEB_RTC,
              chrome.offscreen.Reason.CLIPBOARD,
            ],
            justification:
              "Run libp2p WebRTC networking and access the clipboard",
          });
        } catch (err) {
          log.error("Failed to create offscreen document", err);
          throw err;
        }
      }
    })().finally(() => {
      offscreenCreateFlight = null;
    });
  }
  await offscreenCreateFlight;
}

async function initializeOffscreen(): Promise<void> {
  if (offscreenInitialized) return;
  if (!offscreenInitFlight) {
    offscreenInitFlight = (async () => {
      await managedConfigurationsReady;
      await sendOffscreen({
        action: "init",
        relays: [],
        managedConfigurations,
      });
    })().finally(() => {
      offscreenInitFlight = null;
    });
  }
  await offscreenInitFlight;
}

async function stopOffscreenDocument(): Promise<void> {
  const offscreen = chrome.offscreen as typeof chrome.offscreen & {
    hasDocument?(): Promise<boolean>;
    closeDocument?(): Promise<void>;
  };
  if (!offscreen) return;
  const hasDocument = offscreen.hasDocument
    ? await offscreen.hasDocument()
    : true;
  if (!hasDocument) return;
  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage(
      { target: "offscreen", action: "shutdown" },
      () => resolve()
    );
  });
  offscreenInitialized = false;
  await offscreen.closeDocument?.();
}

async function sendOffscreen<T = any>(message: any, attempt = 0): Promise<T> {
  await ensureOffscreenDocument();
  if (
    message.action !== "init" &&
    message.action !== "ping" &&
    message.action !== "shutdown"
  ) {
    await initializeOffscreen();
  }
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ target: "offscreen", ...message }, (resp) => {
      // @ts-ignore
      const err = chrome.runtime.lastError;
      if (err) {
        if (attempt < 5) {
          setTimeout(
            () => {
              sendOffscreen<T>(message, attempt + 1)
                .then(resolve)
                .catch(reject);
            },
            200 * (attempt + 1)
          );
          return;
        }
        reject(new Error(err.message || "offscreen_unavailable"));
        return;
      }
      if (resp?.ok === false) {
        reject(new Error(resp.error || "offscreen_error"));
        return;
      }
      if (message.action === "init") offscreenInitialized = true;
      resolve(resp as T);
    });
  });
}

const extensionClipboard = createExtensionClipboardBridge((request) =>
  sendOffscreen(request)
);

const offscreenInitializationGate = createOffscreenStartupGate();
const offscreenReady = (async () => {
  await offscreenInitializationGate.ready;
  await ensureOffscreenDocument();
  // simple ping/handshake retry
  for (let i = 0; i < 5; i++) {
    try {
      await sendOffscreen({ action: "ping" });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  await initializeOffscreen();
})();

// Background state

function createExtensionClipboardService() {
  return createRuntimeClipboardService({
    capabilities: RUNTIME_CAPABILITIES.chromeExtension,
    history,
    getSenderId: async () => {
      const id = await identitySvc.get();
      return id.deviceId;
    },
    writeText: async (text: string) => {
      await extensionClipboard.writeText(text);
    },
    onHistoryErrorChanged: (error) => {
      clipboardHistoryError = error;
      void runtimeAdapter.publicState
        .read()
        .then((state) => runtimeAdapter.publicState.publish(state));
    },
  });
}

const clipboard = createExtensionClipboardService();
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

const clipboardSync = createClipboardSyncManager({
  clipboard,
  history,
  isActiveMember: async (peerId) =>
    (await identitySvc.membershipStatus(peerId)) === "active",
  getLocalDeviceId: async () => {
    const id = await identitySvc.get();
    return id.deviceId;
  },
  onAutoSyncChanged: (enabled) => historyReconciliation.setAutoSync(enabled),
});
chrome.storage.local.get(["localRetentionMs"], (res) => {
  const storedRetentionMs = res.localRetentionMs;
  const retentionMs =
    typeof storedRetentionMs === "number" &&
    Number.isFinite(storedRetentionMs) &&
    storedRetentionMs >= 0
      ? storedRetentionMs
      : RETENTION_MS;
  void history
    .setRetention(retentionMs)
    .then(async (appliedRetentionMs) => {
      localRetentionMs = appliedRetentionMs;
      if (appliedRetentionMs !== storedRetentionMs) {
        await storage.set("localRetentionMs", appliedRetentionMs);
      }
    })
    .catch((error) => {
      pendingRetentionMs = retentionMs;
      historyPolicyError = "history_cleanup_failed";
      log.warn(
        "Initial local history cleanup failed; runtime will retry",
        error
      );
    })
    .finally(() => {
      resolveHistoryPolicyReady?.();
      resolveHistoryPolicyReady = undefined;
    });
});
history.onNew((item) => {
  // Notify all extension pages about the new clip
  // @ts-ignore
  chrome.runtime.sendMessage({ type: "newClip", clip: item.clip });
});
let pendingRequests: Array<{ deviceId: string; deviceName: string }> = [];
const pairingSessions = createPairingRuntimeSessions({
  identity: async () => {
    const current = await identitySvc.get();
    return {
      peerId: await deviceIdToPeerId(current.deviceId),
      deviceName: current.deviceName,
      nameRevision: current.nameRevision ?? 0,
    };
  },
  send: (targetPeerId, frame) =>
    extensionNetwork.send(PAIRING_PROTOCOL, targetPeerId, frame),
  sign: async (bytes) => {
    const identity = await identitySvc.get();
    if (!identity.privateKey) throw new Error("identity_unavailable");
    return privateKeyFromProtobuf(base64ToBytes(identity.privateKey)).sign(
      bytes
    );
  },
  verify: verifyExtensionPairingTrustRequestSignature,
  membership: identitySvc,
  clock: systemRuntimeClock,
  connectionPath: (remotePeerId) => {
    const path = extensionNetwork
      .getPeerConnectionInfo?.()
      .find((entry) => entry.peerId === remotePeerId)?.path;
    return path === "relay" ? "relayed" : (path ?? "unknown");
  },
  onRejected: (diagnostic) => {
    log.warn(diagnostic.event, diagnostic);
    if (diagnostic.authenticatedPeerId)
      void identitySvc
        .membershipStatus(diagnostic.authenticatedPeerId)
        .then((status) => {
          if (status !== "active")
            return extensionNetwork.disconnect?.(
              diagnostic.authenticatedPeerId!
            );
        });
  },
  onChanged: () =>
    runtimeAdapter.publicState
      .read()
      .then((current) => runtimeAdapter.publicState.publish(current)),
});

const runtimeProtocolHandlers = new Map<
  string,
  Array<(from: string, data: Uint8Array) => void>
>();
const extensionStreamReceiver = createExtensionStreamReceiver();
const runtimeRegisteredStreamProtocols = new Set<string>();
const runtimePeerConnectedHandlers = new Set<(peerId: string) => void>();
const runtimePeerDisconnectedHandlers = new Set<(peerId: string) => void>();
const runtimeSelfPeerUpdateHandlers = new Set<(multiaddrs: string[]) => void>();
let runtimeConnectedPeers = new Set<string>();
let runtimePeerConnections: PeerConnectionInfo[] = [];

const extensionNetwork: StreamingMessagingTransport = {
  async start() {
    await offscreenReady;
  },
  async stop() {
    await stopOffscreenDocument();
  },
  async send(protocol, target, data) {
    await offscreenReady;
    await sendOffscreen({
      action: "runtimeSend",
      protocol,
      peerTarget: target,
      data: Array.from(data),
    });
  },
  async sendStream(protocol, target, frames, options) {
    await offscreenReady;
    await sendBufferedExtensionStream({
      protocol,
      target,
      frames,
      signal: options?.signal,
      idleTimeoutMs: options?.idleTimeoutMs,
      send: (message) => sendOffscreen(message),
    });
  },
  async connect(target) {
    await offscreenReady;
    await sendOffscreen({ action: "runtimeConnect", peerTarget: target });
  },
  async disconnect(peerId) {
    await offscreenReady;
    await sendOffscreen({ action: "runtimeDisconnect", peerId });
  },
  onMessage(protocol, handler) {
    const handlers = runtimeProtocolHandlers.get(protocol) ?? [];
    runtimeProtocolHandlers.set(protocol, [...handlers, handler]);
    if (handlers.length === 0) {
      void offscreenReady
        .then(() =>
          sendOffscreen({ action: "runtimeRegisterProtocol", protocol })
        )
        .catch(() => {});
    }
  },
  onStream(protocol, handler) {
    extensionStreamReceiver.onStream(protocol, handler);
    if (runtimeRegisteredStreamProtocols.has(protocol)) return;
    runtimeRegisteredStreamProtocols.add(protocol);
    void offscreenReady
      .then(() =>
        sendOffscreen({ action: "runtimeRegisterStreamProtocol", protocol })
      )
      .catch(() => {});
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
  getPeerConnectionInfo: () => [...runtimePeerConnections],
  ...createExtensionReachabilityBridge((message) => sendOffscreen(message)),
};
const liveClipGossip = createLiveClipGossip({
  transport: extensionNetwork,
  membershipStatus: (peerId) => identitySvc.membershipStatus(peerId),
});
clipboardSync.bindLiveGossip(liveClipGossip);
const historyReconciliation = createHistoryReconciliation({
  transport: extensionNetwork,
  history,
  getLocalDeviceId: async () => (await identitySvc.get()).deviceId,
  membershipStatus: (peerId) => identitySvc.membershipStatus(peerId),
  onMembershipChanged: (listener) => identitySvc.onMembershipChanged(listener),
  autoSync,
});
const notificationSelection = createRuntimeNotificationSelection();
let membershipReconciler: ReturnType<typeof createMembershipReconciler>;
let identityRotationRecovery = false;
let identityRotationLifecycle: ReturnType<
  typeof createRuntimeIdentityRotationLifecycle
>;
const identityRotation = createRuntimeIdentityRotationCoordinator({
  repository: identityRepo,
  storage,
  capabilities: RUNTIME_CAPABILITIES.chromeExtension,
  generateKeyMaterial: generateExtensionIdentityKeyMaterial,
  deriveKeyMaterial: deriveExtensionIdentityKeyMaterial,
  runtimeCleanup: {
    prepare: () => clipboardSync.prepareIdentityRotationCleanup(),
  },
  shutdown: async () => {
    historyRetentionCleanup?.stop();
    historyRetentionCleanup = undefined;
    await historyPolicyReady;
    membershipReconciler?.stop();
    await stopIdentityBoundRuntimeServices([
      () => pairingSessions.stop(),
      () => pairingPending.stop(),
      () => clipboardSync.stop(),
      () => historyReconciliation.stop(),
      () => extensionNetwork.stop(),
    ]);
  },
  committer: createIdentityRotationCommitter({
    repository: identityRepo,
    storage,
    history: historyBackend,
  }),
});
membershipReconciler = createMembershipReconciler({
  transport: extensionNetwork,
  identity: identitySvc,
  ...createMembershipPeerRecordBridge({
    transport: extensionNetwork,
    identity: identitySvc,
  }),
  onLocalRevoked: () => identityRotationLifecycle.rotateRevoked(),
  onChanged: () =>
    runtimeAdapter.publicState
      .read()
      .then((state) => runtimeAdapter.publicState.publish(state)),
});

const runtimeAdapter = createChromeExtensionRuntimeAdapter({
  storage,
  identityKey: IDENTITY_KEY,
  applicationStateKey: "runtimeApplicationState",
  initialApplicationState: () => ({}) as Record<string, unknown>,
  clipboard: {
    readText: async () => {
      throw new Error("clipboard_read_unsupported");
    },
    writeText: extensionClipboard.writeText,
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
      const [clips, pinnedIds, devices, identity, peerState, rotationNotice] =
        await Promise.all([
          historyPolicyReady.then(() => history.exportAll()),
          historyPolicyReady.then(() => history.pinnedIds()),
          identitySvc.trustedDevices(),
          identityRotationRecovery ? Promise.resolve(null) : identitySvc.get(),
          identityRotationRecovery
            ? Promise.resolve({ peers: [], peerConnections: [] })
            : offscreenReady
                .then(() =>
                  sendOffscreen<{
                    peers?: string[];
                    peerConnections?: PeerConnectionInfo[];
                  }>({ action: "getPeers" })
                )
                .catch(() => ({ peers: [], peerConnections: [] })),
          identityRotation.notice(),
        ]);
      return {
        clips,
        devices,
        pending: pendingRequests,
        waiting: pairingSessions.waiting(),
        pairingErrors: pairingSessions.errors(),
        peers: peerState.peers ?? [],
        peerConnections: peerState.peerConnections ?? [],
        identity: identity ? toPublicDeviceIdentity(identity) : null,
        pinnedIds,
        clipboardHistoryError,
        historyPolicyError,
        identityRotationRecovery,
        identityRotationNotice: rotationNotice?.reason ?? null,
        autoSync: clipboardSync.isAutoSync(),
        relayAddresses: [],
        managedRelayConfigurations: managedConfigurations,
        managedRelayStates: managedStates,
      };
    },
    async publish(state) {
      await chrome.runtime
        .sendMessage({ type: "runtimeState", state })
        .catch(() => {});
    },
  },
  relays: {
    readAddresses: async () => [],
  },
});
const pairingPending = createPendingTrustRequestCoordinator({
  localPeerId: async () => deviceIdToPeerId((await identitySvc.get()).deviceId),
  store: createKVPendingTrustRequestStore({
    storage,
    key: "pairingPendingRequests",
  }),
  notifications: runtimeAdapter.notifications,
  lifecycle: runtimeAdapter.lifecycle,
  clock: systemRuntimeClock,
  verify: verifyExtensionPairingTrustRequestSignature,
  membership: identitySvc,
  sendResponse: (peerId, frame) =>
    extensionNetwork.send(PAIRING_PROTOCOL, peerId, frame),
  responseIdentity: async () => {
    const identity = await identitySvc.get();
    return {
      deviceName: identity.deviceName,
      nameRevision: BigInt(identity.nameRevision ?? 0),
    };
  },
  connectionPath: (remotePeerId) => {
    const path = extensionNetwork
      .getPeerConnectionInfo?.()
      .find((entry) => entry.peerId === remotePeerId)?.path;
    return path === "relay" ? "relayed" : (path ?? "unknown");
  },
  onRejected: (diagnostic) => {
    log.warn(diagnostic.event, diagnostic);
    if (diagnostic.authenticatedPeerId)
      void identitySvc
        .membershipStatus(diagnostic.authenticatedPeerId)
        .then((status) => {
          if (status !== "active")
            return extensionNetwork.disconnect?.(
              diagnostic.authenticatedPeerId!
            );
        });
  },
  onChanged: async (requests) => {
    pendingRequests = requests.map((request) => ({
      deviceId: request.initiatorPeerId,
      deviceName: request.deviceName,
    }));
    await runtimeAdapter.publicState.publish(
      await runtimeAdapter.publicState.read()
    );
  },
});
identityRotationLifecycle = createRuntimeIdentityRotationLifecycle({
  rotation: identityRotation,
  loadIdentity: () => identitySvc.get(),
  restart: () => chrome.runtime.reload(),
  startLocalRecovery: () => clipboardSync.startLocalOnly(),
  publishState: () =>
    runtimeAdapter.publicState
      .read()
      .then((state) => runtimeAdapter.publicState.publish(state)),
  onRecoveryChanged: (recovering) => {
    identityRotationRecovery = recovering;
  },
});
extensionNetwork.onMessage(PAIRING_PROTOCOL, (from, frame) => {
  void pairingPending
    .start()
    .then(() =>
      pairingSessions.receive(from, frame, (peerId, requestFrame) =>
        pairingPending.receive(peerId, requestFrame)
      )
    )
    .catch((error) => log.warn("Pairing message processing failed", error));
});
chrome.notifications?.onClicked?.addListener((id) => {
  notificationSelection.emit(id);
});
const sharedRuntime = createRuntimeOrchestrator({
  adapter: runtimeAdapter,
  start: () =>
    startIdentityBoundRuntimeServices({
      initializeIdentity: () => identityRotationLifecycle.initialize(),
      startLocalServices: async () => {
        await autoSyncReady;
        clipboardSync.setAutoSync(autoSync);
        await historyPolicyReady;
        historyRetentionCleanup ??= startHistoryRetentionCleanup(
          {
            pruneExpired: async () => {
              if (pendingRetentionMs === null) {
                await history.pruneExpired();
                return;
              }
              const appliedRetentionMs =
                await history.setRetention(pendingRetentionMs);
              localRetentionMs = appliedRetentionMs;
              pendingRetentionMs = null;
              await storage.set("localRetentionMs", appliedRetentionMs);
            },
          },
          undefined,
          (error) => {
            historyPolicyError = error ? "history_cleanup_failed" : null;
            void runtimeAdapter.publicState
              .read()
              .then((state) => runtimeAdapter.publicState.publish(state));
          }
        );
        if (identityRotationLifecycle.startLocalOnlyIfRecovering()) return;
        pairingSessions.start();
        clipboardSync.start();
      },
      startNetworkServices: async () => {
        offscreenInitializationGate.open();
        await offscreenReady;
        await extensionNetwork.start();
        membershipReconciler.start();
        historyReconciliation.start();
        await pairingPending.start();
      },
      onNetworkingFailure: (error) => {
        log.warn(
          "Extension networking failed to start; local capture remains active",
          error
        );
      },
    }),
  stop: async () => {
    historyRetentionCleanup?.stop();
    historyRetentionCleanup = undefined;
    await pairingSessions.stop();
    await clipboardSync.stop();
    await historyReconciliation.stop();
  },
});

// Listen for clipboard changes (MV3: use chrome.clipboard or content script)
// Listen for messages from popup/options
// @ts-ignore
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof msg?.type === "string" && msg.type.startsWith("managedRelay")) {
    if (!authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)) {
      sendResponse({ ok: false, error: "relay_ui_unauthorized" });
      return false;
    }
    void (async () => {
      await managedConfigurationsReady;
      if (msg.type === "managedRelayGet") {
        return {
          ok: true,
          configurations: managedConfigurations,
          states: managedStates,
        };
      }
      if (msg.type === "managedRelaySet") {
        const update = managedConfigurationUpdate.then(async () => {
          const next = await replaceManagedRelayConfigurations(
            managedConfigurations,
            msg.configurations,
            {
              erase: (url) => managedCredentials.eraseCredentials(url),
              write: (configurations) =>
                managedConfigurationStore.writeNewModel(configurations),
            }
          );
          managedConfigurations = next;
          await offscreenReady;
          await sendOffscreen({
            action: "setManagedRelays",
            configurations: next,
          });
        });
        managedConfigurationUpdate = update.catch(() => undefined);
        await update;
        return { ok: true, configurations: managedConfigurations };
      }
      if (typeof msg.key !== "string") throw new Error("invalid_relay_key");
      const config = managedConfigurations.find(
        (entry) => entry.key === msg.key
      );
      if (!config) throw new Error("relay_not_found");
      if (msg.type === "managedRelayLogin") {
        if (config.kind !== "managed")
          throw new Error("relay_login_not_supported");
        await managedCredentials.interactiveLogin(config.discoveryUrl);
        await offscreenReady;
        await sendOffscreen({ action: "retryManagedRelay", key: config.key });
        return { ok: true };
      }
      if (msg.type === "managedRelayAccount") {
        if (config.kind !== "managed")
          throw new Error("relay_account_not_supported");
        await managedCredentials.openAccount(config.discoveryUrl);
        return { ok: true };
      }
      if (msg.type === "managedRelayRetry") {
        await offscreenReady;
        await sendOffscreen({ action: "retryManagedRelay", key: config.key });
        return { ok: true };
      }
      throw new Error("unknown_relay_action");
    })()
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "getRuntimeState") {
    runtimeAdapter.publicState
      .read()
      .then((state) => sendResponse({ state }))
      .catch((error) => sendResponse({ error: (error as Error).message }));
    return true;
  }
  if (msg.type === "getInitializationError") {
    identitySvc
      .getInitializationError()
      .then((error) => sendResponse({ error: error ?? null }));
    return true;
  }
  if (msg.type === "retryIdentityInitialization") {
    identitySvc
      .retryInitialization()
      .then(() => {
        sendResponse({ ok: true });
        chrome.runtime.reload();
      })
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "getLatestClip") {
    historyPolicyReady
      .then(() => history.query({ limit: 1 }))
      .then((items) => {
        sendResponse({ clip: items[0]?.clip || null });
      });
    return true;
  }
  // Handle shareClip from popup
  if (msg.type === "shareClip" && msg.clip) {
    historyPolicyReady
      .then(() => clipboard.processLocalText(msg.clip.content))
      .then(async () => {
        sendResponse({ ok: true });
      });
    return true;
  }
  // Handle getPeerStatus from popup
  if (msg.type === "getPeerStatus") {
    // Example: get peer count and connection status from messaging layer
    offscreenReady
      .then(() =>
        sendOffscreen<{
          peers: string[];
          peerConnections?: PeerConnectionInfo[];
        }>({ action: "getPeers" })
      )
      .then((resp) => {
        const peers = Array.isArray(resp?.peers) ? resp!.peers : [];
        sendResponse({ peerCount: peers.length, connected: peers.length > 0 });
      })
      .catch(() => sendResponse({ peerCount: 0, connected: false }));
    return true;
  }
  // Handle clipboard history for options page
  if (msg.type === "getClipHistory") {
    historyPolicyReady
      .then(() => history.exportAll())
      .then((clips) => {
        sendResponse({ clips });
      });
    return true;
  }
  if (msg.type === "clearHistory") {
    historyPolicyReady
      .then(() => clipboard.clearHistory(() => history.clearAll()))
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((err) => {
        log.warn("Failed to clear history", err);
        sendResponse({ ok: false, error: "clear_failed" });
      });
    return true;
  }
  if (msg.type === "searchClipHistory") {
    historyPolicyReady
      .then(() => history.query({ search: msg.query || "" }))
      .then((items) => {
        sendResponse({ clips: items.map((i) => i.clip) });
      });
    return true;
  }
  if (msg.type === "getPendingRequests") {
    sendResponse(pendingRequests);
    return true;
  }
  if (msg.type === "respondTrust") {
    void pairingPending
      .decide(msg.id, msg.accept ? "accepted" : "rejected")
      .then((handled) => {
        if (!handled) log.warn("No valid pairing request to decide");
        sendResponse({ ok: handled });
      })
      .catch((error) => {
        log.warn("Pairing response failed", error);
        sendResponse({ ok: false, error: "pairing_decision_failed" });
      });
    return true;
  }
  if (msg.type === "clipboardUpdate" && msg.text) {
    void historyPolicyReady
      .then(() => clipboard.processLocalText(msg.text))
      .then(() => {
        sendResponse({ ok: true });
      });
    return true;
  }
  if (msg.type === "shareNow") {
    if (
      typeof msg.text !== "string" ||
      !isAuthorizedPopupShareNowSender(sender.url, POPUP_URL)
    ) {
      sendResponse({ ok: false, error: "share_now_unauthorized" });
      return false;
    }
    historyPolicyReady
      .then(() => clipboard.processLocalText(msg.text, { shareNow: true }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "reuseClip" && msg.id) {
    historyPolicyReady
      .then(() => reuseRetainedClip(msg.id, { history, clipboard }))
      .then((outcome) => sendResponse({ ok: true, outcome: outcome.status }))
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "getLocalIdentity") {
    identitySvc.get().then((id) => {
      sendResponse({ identity: toPublicDeviceIdentity(id) });
    });
    return true;
  }
  if (msg.type === "getPairingTarget") {
    void (async () => {
      try {
        await offscreenReady;
        const identity = await identitySvc.get();
        if (!extensionNetwork.getSignedPeerRecord)
          throw new Error("signed_peer_record_unavailable");
        const signedPeerRecord = await extensionNetwork.getSignedPeerRecord();
        sendResponse({
          text: encodePairingTarget({
            targetPeerId: await deviceIdToPeerId(identity.deviceId),
            signedPeerRecord,
            deviceNameHint: identity.deviceName,
          }),
        });
      } catch (error) {
        sendResponse({ error: (error as Error).message });
      }
    })();
    return true;
  }
  if (msg.type === "renameLocalIdentity" && typeof msg.name === "string") {
    identitySvc.rename(msg.name).then(async () => {
      sendResponse({
        identity: toPublicDeviceIdentity(await identitySvc.get()),
      });
    });
    return true;
  }
  if (msg.type === "pairDevice" && typeof msg.pairingText === "string") {
    void (async () => {
      try {
        await offscreenReady;
        const id = await identitySvc.get();
        if (!id.privateKey) throw new Error("missing_private_key");
        const target = decodePairingTarget(msg.pairingText);
        if (!target) throw new Error("invalid_pairing_target");
        await importPairingTargetAndRequest({
          text: msg.pairingText,
          network: extensionNetwork,
          request: pairingSessions.request,
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: (error as Error).message });
      }
    })();
    return true;
  }
  if (msg.type === "getStatus") {
    offscreenReady
      .then(() =>
        sendOffscreen<{
          peers: string[];
          peerConnections?: PeerConnectionInfo[];
        }>({ action: "getPeers" })
      )
      .then((resp) => {
        const peers = Array.isArray(resp?.peers) ? resp!.peers : [];
        sendResponse({
          peerCount: peers.length,
          autoSync: clipboardSync.isAutoSync(),
        });
      })
      .catch(() =>
        sendResponse({ peerCount: 0, autoSync: clipboardSync.isAutoSync() })
      );
    return true;
  }
  if (msg.type === "getConnectedPeers") {
    offscreenReady
      .then(() =>
        sendOffscreen<{
          peers: string[];
          peerConnections?: PeerConnectionInfo[];
        }>({ action: "getPeers" })
      )
      .then((resp) =>
        sendResponse({
          peers: Array.isArray(resp?.peers) ? resp!.peers : [],
          peerConnections: Array.isArray(resp?.peerConnections)
            ? resp!.peerConnections
            : [],
        })
      )
      .catch(() => sendResponse({ peers: [], peerConnections: [] }));
    return true;
  }
  if (msg.type === "getTrustedDevices") {
    identitySvc.trustedDevices().then((devices) => {
      sendResponse({ devices });
    });
    return true;
  }
  if (msg.type === "deleteClip" && msg.id) {
    historyPolicyReady
      .then(() => history.remove(msg.id))
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "setPin" && msg.id && typeof msg.pinned === "boolean") {
    historyPolicyReady
      .then(() => history.setPinned(msg.id, msg.pinned))
      .then((pinnedIds) => sendResponse({ ok: true, pinnedIds }))
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "dismissClipboardHistoryError") {
    clipboard.dismissHistoryError?.();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "acknowledgeIdentityRotationNotice") {
    identityRotation
      .acknowledgeNotice()
      .then(async () => {
        await runtimeAdapter.publicState.publish(
          await runtimeAdapter.publicState.read()
        );
        sendResponse({ ok: true });
      })
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "retryHistoryCleanup") {
    historyRetentionCleanup
      ?.retry()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "setLocalRetention" && typeof msg.retentionMs === "number") {
    historyPolicyReady
      .then(() => history.setRetention(msg.retentionMs))
      .then(async (appliedRetentionMs) => {
        localRetentionMs = appliedRetentionMs;
        pendingRetentionMs = null;
        await storage.set("localRetentionMs", appliedRetentionMs);
        sendResponse({ ok: true, localRetentionMs: appliedRetentionMs });
      })
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "revokeDevice" && msg.id) {
    identitySvc
      .revoke(msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  if (msg.type === "renameDevice" && msg.id && typeof msg.name === "string") {
    identitySvc.setLocalDeviceAlias(msg.id, msg.name).then((device) => {
      sendResponse({ ok: true, device });
    });
    return true;
  }
  // Settings: auto-sync, expiry, type filters
  if (msg.type === "getSettings") {
    void historyPolicyReady.then(() => {
      // @ts-ignore
      chrome.storage.local.get(
        [
          "autoSync",
          "expiryDays",
          "typesEnabled",
          "logLevel",
          "localRetentionMs",
        ],
        (res) => {
          sendResponse({
            autoSync: res.autoSync !== false,
            expiryDays: res.expiryDays || 365,
            localRetentionMs,
            typesEnabled: res.typesEnabled || {
              text: true,
              image: true,
              file: true,
            },
            logLevel: res.logLevel || "info",
          });
        }
      );
    });
    return true;
  }
  if (msg.type === "setSettings" && msg.settings) {
    if (
      !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL) ||
      typeof msg.settings !== "object" ||
      Array.isArray(msg.settings)
    ) {
      sendResponse({ ok: false, error: "settings_unauthorized" });
      return false;
    }
    const candidate = msg.settings as Record<string, unknown>;
    const keys = Object.keys(candidate);
    const allowed = ["autoSync", "expiryDays", "typesEnabled", "logLevel"];
    const types = candidate.typesEnabled as Record<string, unknown> | undefined;
    if (
      keys.some((key) => !allowed.includes(key)) ||
      (candidate.autoSync !== undefined &&
        typeof candidate.autoSync !== "boolean") ||
      (candidate.expiryDays !== undefined &&
        (!Number.isInteger(candidate.expiryDays) ||
          (candidate.expiryDays as number) < 1 ||
          (candidate.expiryDays as number) > 3650)) ||
      (candidate.logLevel !== undefined &&
        !["debug", "info", "warn", "error"].includes(
          candidate.logLevel as string
        )) ||
      (types !== undefined &&
        (!types ||
          typeof types !== "object" ||
          Array.isArray(types) ||
          Object.keys(types).some(
            (key) => !["text", "image", "file"].includes(key)
          ) ||
          Object.values(types).some((value) => typeof value !== "boolean")))
    ) {
      sendResponse({ ok: false, error: "invalid_settings" });
      return false;
    }
    void new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(candidate, () =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve()
      );
    })
      .then(async () => {
        if (candidate.logLevel)
          log.setLogLevel(
            candidate.logLevel as Parameters<typeof log.setLogLevel>[0]
          );
        if (candidate.autoSync !== undefined) {
          autoSync = await autoSyncPreference.set(
            candidate.autoSync as boolean
          );
          clipboardSync.setAutoSync(autoSync);
          await runtimeAdapter.publicState
            .read()
            .then((state) => runtimeAdapter.publicState.publish(state));
        }
        sendResponse({ ok: true });
      })
      .catch((error) =>
        sendResponse({ ok: false, error: (error as Error).message })
      );
    return true;
  }
  // Add more message handlers as needed
});

// Listen for messages forwarded from offscreen (libp2p)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.source !== "offscreen") return;
  if (msg?.action === "managedRelayStates") {
    if (
      _sender.id !== chrome.runtime.id ||
      _sender.url !== OFFSCREEN_URL ||
      !Array.isArray(msg.states)
    )
      return;
    managedStates = msg.states;
    void runtimeAdapter.publicState
      .read()
      .then((state) => runtimeAdapter.publicState.publish(state));
    return;
  }
  if (isExtensionStreamMessage(msg)) {
    void extensionStreamReceiver.handle(msg).then(sendResponse);
    return true;
  }
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
    runtimeProtocolHandlers
      .get(msg.protocol)
      ?.forEach((handler) => handler(msg.from, data));
    return;
  }
  if (msg?.action === "peers" && Array.isArray(msg.peers)) {
    const nextPeers = new Set<string>(
      msg.peers.filter(
        (peer: unknown): peer is string => typeof peer === "string"
      )
    );
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
    runtimePeerConnections = Array.isArray(msg.peerConnections)
      ? msg.peerConnections
      : [];
    return;
  }
});

// Kick off offscreen + clipboard
void sharedRuntime
  .start()
  .then(() => {
    log.info("Background services started (offscreen networking)");
  })
  .catch((error) => {
    log.error("Extension Device Identity initialization failed", error);
  });
