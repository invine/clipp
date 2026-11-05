import { prepareChromeIdentityRuntime } from "./identityRuntimeRecovery";
import {
  copyIdentityResetState,
  type IdentityResetState,
} from "../../../packages/core/trust/manualIdentityReset";
import { installChromeManagement } from "./chromeManagementRuntime";
import { MANAGEMENT_PORT } from "./chromeManagement";
import { observeExtensionClipboard } from "./clipboardObservation";
import { createExtensionClipboardService as composeExtensionClipboard } from "./clipboardFactory";
import { createLocalRetentionPreference } from "../../../packages/core/runtime/localRetentionPreference";
import { DEFAULT_CLIP_SHARING_LIFETIME_MS } from "../../../packages/core/models/Clip";
import { performRelayAction } from "../../../packages/core/network/relayActions";
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
  IDENTITY_KEY,
} from "../../../packages/core/trust";
import {
  ChromeStorageBackend,
  createChromeIdentityRotationCoordinator,
} from "./chromeStorage";
import { createChromeIdentityResetLifecycle } from "./identityResetRuntime";
import { createSettingsHandler } from "./settingsHandler";
import { handleOffscreenStorageRequest } from "./runtimeMessageStorage";
import {
  deriveExtensionIdentityKeyMaterial,
  generateExtensionIdentityKeyMaterial,
} from "./identityKeyMaterial";
import {
  createChromeExtensionRuntimeAdapter,
  createRuntimeIdentityManager,
  createIdentityBoundWorkFence,
  createRuntimeIdentityRotationLifecycle,
  createRuntimeNotificationSelection,
  createRuntimeNotificationStatus,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  startIdentityBoundRuntimeServices,
  stopIdentityBoundRuntimeServices,
  systemRuntimeClock,
  type RuntimeClipboardHistoryError,
} from "../../../packages/core/runtime";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createClipExchangeRuntime } from "../../../packages/core/sync/clipExchangeRuntime";
import { reuseRetainedClip } from "../../../packages/core/clipboard/explicitActions";
import { createExtensionClipboardBridge } from "./clipboardBridge";
import { isAuthorizedPopupShareNowSender } from "./popupClipboardActions";
import * as log from "../../../packages/core/logger";
import { deviceIdToPeerId } from "../../../packages/core/network/peerId";
import {
  loadManagedRelayConfigurations,
  type RelayConfiguration,
  type RelayState,
} from "../../../packages/core/network/managedRelays";
import {
  isConfiguredManagedEndpoint,
  createChromeRelayMutationOwner,
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
import { createPairingRejectionCleanup } from "../../../packages/core/pairing/rejectionCleanup";
import type { TransportOwner } from "../../../packages/core/messaging/transport";
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

const identityWork = createIdentityBoundWorkFence();
const historyBackend =
  typeof (globalThis as any).indexedDB !== "undefined"
    ? new IndexedDBHistoryBackend()
    : new InMemoryHistoryBackend();
const history = identityWork.protect(
  new MemoryHistoryStore(historyBackend, {
    pinPersistence: "session",
  })
);
let localRetentionMs = RETENTION_MS;
let clipboardHistoryError: RuntimeClipboardHistoryError | null = null;
let historyPolicyError: "history_cleanup_failed" | null = null;
let historyRetentionCleanup: HistoryRetentionCleanup | undefined;
let resetClipboardBaselineRequired = false;
let startupResetChecked = false;
let startupResetState: IdentityResetState | undefined;
const resetStorage = new ChromeStorageBackend();
const storage = identityWork.protect(resetStorage);
// This runs before eager preferences, History maintenance, UI requests or offscreen wake.
const startupResetReady = Promise.resolve().then(async () => {
  const state = await prepareChromeIdentityRuntime({
    reconcileIdentityReset: () => identityRotation.reconcileIdentityReset(),
    workFence: identityWork,
    retireOffscreen: () => stopOffscreenDocument(true),
  });
  startupResetState = copyIdentityResetState(state);
  if (state.phase === "idle" && state.completedOperation)
    resetClipboardBaselineRequired =
      (await identityRepo.get())?.deviceId ===
      state.completedOperation.generatedPeerId;
  startupResetChecked = true;
});
let historyPolicySettled = false;
const retentionPreference = createLocalRetentionPreference({
  storage,
  history,
  publish: async (state) => {
    localRetentionMs = state.value;
    historyPolicyError = state.cleanupError ? "history_cleanup_failed" : null;
    if (historyPolicySettled) await sharedRuntime.publishState();
  },
});
const managedCredentials = createChromeManagedRelayCredentials(
  import.meta.env.VITE_CLIPP_REGISTERED_EXTENSION_ID ?? "",
  identityWork
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
let sharingLifetimeMs = DEFAULT_CLIP_SHARING_LIFETIME_MS;
let autoSync = true;
let resolveHistoryPolicyReady: (() => void) | undefined;
const historyPolicyReady = new Promise<void>((resolve) => {
  resolveHistoryPolicyReady = resolve;
});
const identityRepo = createKVIdentityRepository({
  storage: resetStorage,
  key: IDENTITY_KEY,
});
const identitySvc = createRuntimeIdentityManager({
  repo: identityRepo,
  workFence: identityWork,
  capabilities: RUNTIME_CAPABILITIES.chromeExtension,
  generateKeyMaterial: generateExtensionIdentityKeyMaterial,
  deriveKeyMaterial: deriveExtensionIdentityKeyMaterial,
});

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const POPUP_URL = chrome.runtime.getURL("src/popup.html");
const OPTIONS_URL = chrome.runtime.getURL("src/options.html");
function publishIdentityResetState(state: IdentityResetState) {
  chrome.runtime.sendMessage(
    { type: "identityResetStateChanged", state: copyIdentityResetState(state) },
    () => void chrome.runtime.lastError
  );
}

const managementNavigation = installChromeManagement(chrome, {
  ready: startupResetReady,
  available: () => !identityWork.isFenced(),
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === MANAGEMENT_PORT) return;
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
    if (
      !request ||
      request.runtimeGeneration !== identityWork.generation() ||
      identityWork.isFenced()
    ) {
      port.postMessage({ error: "invalid_relay_access_request" });
      return;
    }
    void startupResetReady
      .then(() => managedConfigurationsReady)
      .then(() => {
        identityWork.assertOpen(request.runtimeGeneration);
        return isConfiguredManagedEndpoint(
          managedConfigurations,
          request.discoveryUrl
        )
          ? managedCredentials.accessToken(request.discoveryUrl)
          : null;
      })
      .then((accessToken) => {
        identityWork.assertOpen(request.runtimeGeneration);
        port.postMessage({
          accessToken,
          warning: managedCredentials.warning(request.discoveryUrl),
        });
      })
      .catch(() => port.postMessage({ accessToken: null }));
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.target !== "background" ||
    message?.action !== "offscreenStorage"
  )
    return;
  void (identityWork.isFenced() ? Promise.resolve() : startupResetReady)
    .then(() =>
      handleOffscreenStorageRequest(message, sender, {
        storage: resetStorage,
        workFence: identityWork,
        extensionId: chrome.runtime.id,
        offscreenUrl: OFFSCREEN_URL,
      })
    )
    .then(sendResponse)
    .catch(() =>
      sendResponse({ ok: false, error: "identity_runtime_suspended" })
    );
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

let offscreenOwned = false;
let offscreenCreateFlight: Promise<void> | null = null;
let offscreenInitialized = false;
let offscreenInitFlight: Promise<void> | null = null;
let offscreenTransportOwner: string | undefined;

async function ensureOffscreenDocument(): Promise<void> {
  await startupResetReady;
  identityWork.assertOpen();
  if (
    !chrome.offscreen ||
    typeof chrome.offscreen.createDocument !== "function"
  )
    return;
  if (!offscreenCreateFlight) {
    offscreenCreateFlight = (async () => {
      let has = (chrome.offscreen as any).hasDocument
        ? await (chrome.offscreen as any).hasDocument()
        : false;
      identityWork.assertOpen();
      if (has && !offscreenOwned) {
        await stopOffscreenDocument(true);
        identityWork.assertOpen();
        has = false;
      }
      if (!has) {
        offscreenInitialized = false;
        offscreenTransportOwner = undefined;
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
          offscreenOwned = true;
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
  identityWork.assertOpen();
}

async function initializeOffscreen(): Promise<void> {
  identityWork.assertOpen();
  if (offscreenInitialized) return;
  if (!offscreenInitFlight) {
    offscreenInitFlight = (async () => {
      await managedConfigurationsReady;
      const transportOwner = (offscreenTransportOwner ??= crypto.randomUUID());
      await sendOffscreen({
        action: "init",
        relays: [],
        managedConfigurations,
        transportOwner,
      });
      for (const protocol of runtimeProtocolHandlers.keys())
        await sendOffscreen({ action: "runtimeRegisterProtocol", protocol });
      for (const protocol of runtimeRegisteredStreamProtocols)
        await sendOffscreen({
          action: "runtimeRegisterStreamProtocol",
          protocol,
        });
    })().finally(() => {
      offscreenInitFlight = null;
    });
  }
  await offscreenInitFlight;
}

async function stopOffscreenDocument(retire = false): Promise<void> {
  offscreenTransportOwner = undefined;
  const offscreen = chrome.offscreen as typeof chrome.offscreen & {
    hasDocument?(): Promise<boolean>;
    closeDocument?(): Promise<void>;
  };
  if (!offscreen) return;
  const hasDocument = offscreen.hasDocument
    ? await offscreen.hasDocument()
    : true;
  if (!hasDocument) return;
  if (retire && !offscreen.closeDocument)
    throw new Error("offscreen_retirement_unavailable");
  if (!retire) {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage(
        { target: "offscreen", action: "shutdown" },
        () => resolve()
      );
    });
  }
  offscreenInitialized = false;
  offscreenOwned = false;
  await offscreen.closeDocument?.();
}

async function sendOffscreen<T = any>(
  message: any,
  attempt = 0,
  generation = identityWork.generation()
): Promise<T> {
  await startupResetReady;
  identityWork.assertOpen(generation);
  await ensureOffscreenDocument();
  if (
    message.action !== "init" &&
    message.action !== "ping" &&
    message.action !== "shutdown"
  ) {
    await initializeOffscreen();
  }
  return await new Promise((resolve, reject) => {
    identityWork.assertOpen(generation);
    chrome.runtime.sendMessage(
      { target: "offscreen", ...message, runtimeGeneration: generation },
      (resp) => {
        try {
          identityWork.assertOpen(generation);
        } catch (error) {
          reject(error);
          return;
        }
        // @ts-ignore
        const err = chrome.runtime.lastError;
        if (err) {
          if (attempt < 5) {
            setTimeout(
              () => {
                sendOffscreen<T>(message, attempt + 1, generation)
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
      }
    );
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
  return composeExtensionClipboard({
    history,
    appliedSharingLifetime: () => sharingLifetimeMs,
    baselineFirstObservation: () => resetClipboardBaselineRequired,
    getSenderId: async () => {
      const id = await identitySvc.get();
      return id.deviceId;
    },
    writeText: async (text: string) => {
      await extensionClipboard.writeText(text);
    },
    onHistoryErrorChanged: (error) => {
      clipboardHistoryError = error;
      void sharedRuntime.publishState();
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
});
const clipExchange = createClipExchangeRuntime({
  clipboardSync,
  history,
  getLocalDeviceId: async () => (await identitySvc.get()).deviceId,
  membershipStatus: (peerId) => identitySvc.membershipStatus(peerId),
  onMembershipChanged: (listener) => identitySvc.onMembershipChanged(listener),
});
const settingsHandler = createSettingsHandler({
  storage,
  retention: retentionPreference,
  applyAutoSync: (enabled) => {
    autoSync = enabled;
    clipExchange.setAutoSync(enabled);
  },
  applyLogLevel: (level) => log.setLogLevel(level),
  applySharingLifetime: (value) => {
    sharingLifetimeMs = value;
  },
  publish: async (snapshot) => {
    await chrome.runtime.sendMessage({ type: "settingsState", snapshot });
  },
});
const autoSyncReady = startupResetReady.then(async () => {
  if (identityWork.isFenced()) return;
  const snapshot = await settingsHandler.read();
  autoSync = snapshot.state.autoSync;
  log.info("Background script initialized");
});
void startupResetReady
  .then(() =>
    identityWork.isFenced() ? undefined : retentionPreference.load()
  )
  .catch((error) => {
    historyPolicyError = "history_cleanup_failed";
    log.warn("Initial history policy unavailable", error);
  })
  .finally(() => {
    historyPolicySettled = true;
    resolveHistoryPolicyReady?.();
    resolveHistoryPolicyReady = undefined;
  });
const historySessionId = crypto.randomUUID();
history.onChanged((revision) => {
  if (identityWork.isFenced()) return;
  chrome.runtime.sendMessage({
    type: "historyChanged",
    sessionId: historySessionId,
    revision,
  });
});
void historyPolicyReady
  .then(async () => {
    if (identityWork.isFenced()) return;
    const generation = identityWork.generation();
    const snapshot = await history.snapshot();
    identityWork.assertOpen(generation);
    await chrome.runtime.sendMessage({
      type: "historyChanged",
      sessionId: historySessionId,
      revision: snapshot.revision,
    });
  })
  .catch(() => undefined);
history.onNew((item) => {
  if (identityWork.isFenced()) return;
  // Notify all extension pages about the new clip
  // @ts-ignore
  chrome.runtime.sendMessage({ type: "newClip", clip: item.clip });
});
let pendingRequests: Array<{
  deviceId: string;
  deviceName: string;
  requestVersion: string;
}> = [];
const cleanupRejectedPeer = createPairingRejectionCleanup({
  membership: identitySvc,
  isCurrentTransport: (remotePeerId, owner) =>
    owner === offscreenTransportOwner &&
    extensionNetwork.getConnectedPeers().includes(remotePeerId),
  disconnect: (remotePeerId, owner) =>
    owner === offscreenTransportOwner
      ? sendOffscreen({
          action: "runtimeDisconnect",
          peerId: remotePeerId,
          transportOwner: owner,
        })
      : undefined,
});
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
  },
  onRejectedPeer: cleanupRejectedPeer,
  onChanged: () => sharedRuntime.publishState(),
});

const runtimeProtocolHandlers = new Map<
  string,
  Array<(from: string, data: Uint8Array, owner?: TransportOwner) => void>
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
const notificationSelection = createRuntimeNotificationSelection();
const notificationStatus = createRuntimeNotificationStatus({
  inspect: async () => ({
    app: !chrome.notifications?.getPermissionLevel
      ? "unknown"
      : (await new Promise<string>((resolve, reject) =>
            chrome.notifications.getPermissionLevel((level) => {
              const error = chrome.runtime.lastError;
              if (error) reject(new Error(error.message));
              else resolve(level);
            })
          )) === "granted"
        ? "available"
        : "blocked",
    channel: "not-applicable",
  }),
  openSettings: async () => {
    await chrome.tabs.create({
      url: "chrome://settings/content/notifications",
    });
  },
});
let membershipReconciler: ReturnType<typeof createMembershipReconciler>;
let identityRotationRecovery = false;
let identityRotationLifecycle: ReturnType<
  typeof createRuntimeIdentityRotationLifecycle
>;
const identityRotation = createChromeIdentityRotationCoordinator({
  repository: identityRepo,
  storage: resetStorage,
  history: historyBackend,
  ...(historyBackend instanceof IndexedDBHistoryBackend
    ? {
        lifecycle: createChromeIdentityResetLifecycle({
          workFence: identityWork,
          retireOffscreenOwnership: () => {
            offscreenOwned = false;
          },
          stopRuntime: () => identityRotationShutdown(),
          waitForOffscreenStartup: async () => {
            await Promise.allSettled(
              [offscreenCreateFlight, offscreenInitFlight].filter(Boolean)
            );
          },
          finalizeOffscreen: () => stopOffscreenDocument(),
          clearHostState: async () => {
            await clipboard.discardPending?.();
            notificationSelection.clear();
            const notifications = chrome.notifications?.getAll
              ? await new Promise<object>((resolve) =>
                  chrome.notifications.getAll(resolve)
                )
              : {};
            for (const id of Object.keys(notifications))
              await chrome.notifications?.clear?.(id);
          },
        }),
      }
    : {}),
  identityKey: IDENTITY_KEY,
  generateKeyMaterial: generateExtensionIdentityKeyMaterial,
  deriveKeyMaterial: deriveExtensionIdentityKeyMaterial,
  runtimeCleanup: {
    prepare: () => clipboardSync.prepareIdentityRotationCleanup(),
  },
  shutdown: () => identityRotationShutdown(),
});
identityRotation.onStatusChanged((status) => {
  if (status.kind === "manual-reset") {
    startupResetState = copyIdentityResetState(status.state);
    publishIdentityResetState(status.state);
  }
});
async function identityRotationShutdown() {
  await stopIdentityBoundRuntimeServices([
    () => managementNavigation.invalidate(),
    async () => {
      historyRetentionCleanup?.stop();
      historyRetentionCleanup = undefined;
      await historyPolicyReady;
      membershipReconciler?.stop();
      await stopIdentityBoundRuntimeServices([
        () => pairingSessions.stop(),
        () => pairingPending.stop(),
        () => clipExchange.stop(),
        () => extensionNetwork.stop(),
      ]);
    },
  ]);
}

membershipReconciler = createMembershipReconciler({
  transport: extensionNetwork,
  identity: identitySvc,
  ...createMembershipPeerRecordBridge({
    transport: extensionNetwork,
    identity: identitySvc,
  }),
  onLocalRevoked: () => identityRotationLifecycle.rotateRevoked(),
  onChanged: () => sharedRuntime.publishState(),
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
      return identityWork.run(async () => {
        identityWork.assertOpen();
        if (!chrome.notifications?.create) return;
        try {
          await chrome.notifications.create(
            message.instance ? `${message.id}:${message.instance}` : message.id,
            {
              type: "basic",
              iconUrl: chrome.runtime.getURL("icon-128.png"),
              title: message.title,
              message: message.body,
            }
          );
          notificationStatus.shown();
        } catch (error) {
          notificationStatus.failed(error);
          throw error;
        }
      });
    },
    async dismiss(id) {
      if (!chrome.notifications?.clear) return;
      await chrome.notifications.clear(id);
      if (chrome.notifications.getAll) {
        const all = await new Promise<object>((resolve) =>
          chrome.notifications.getAll(resolve)
        );
        await Promise.all(
          Object.keys(all)
            .filter((key) => key.startsWith(`${id}:`))
            .map((key) => chrome.notifications.clear(key))
        );
      }
    },
    onSelect: notificationSelection.onSelect,
    clearSelections: notificationSelection.clear,
  },
  lifecycle: {
    onShutdown(handler) {
      const listener = () => void handler();
      chrome.runtime.onSuspend?.addListener(listener);
      return () => chrome.runtime.onSuspend?.removeListener(listener);
    },
    async openApprovalView(selection) {
      // Canonical management IDs are bounded opaque identifiers. Hash the
      // notification instance so worker wake preserves duplicate identity.
      const id = selection
        ? [
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(selection.id)
              )
            ),
          ]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("")
        : crypto.randomUUID();
      const result = await managementNavigation.accept({
        id,
        destination: {
          kind: "requests",
          ...(selection?.requestId ? { entity: selection.requestId } : {}),
        },
      });
      if (!result.ok) throw new Error("notification_destination_unavailable");
      await managementNavigation.route(id);
    },
  },
  network: extensionNetwork,
  clock: systemRuntimeClock,
  publicState: {
    async read() {
      const pairingState = pairingSessions.snapshot();
      const suspended = identityWork.isFenced();
      const [clips, pinnedIds, devices, identity, peerState, rotationNotice] =
        await Promise.all([
          suspended
            ? Promise.resolve([])
            : historyPolicyReady.then(() => history.exportAll()),
          suspended
            ? Promise.resolve([])
            : historyPolicyReady.then(() => history.pinnedIds()),
          suspended ? Promise.resolve([]) : identitySvc.trustedDevices(),
          suspended || identityRotationRecovery
            ? Promise.resolve(null)
            : identitySvc.get(),
          suspended || identityRotationRecovery
            ? Promise.resolve({ peers: undefined, peerConnections: undefined })
            : offscreenReady
                .then(() =>
                  sendOffscreen<{
                    peers?: string[];
                    peerConnections?: PeerConnectionInfo[];
                  }>({ action: "getPeers" })
                )
                .catch(() => ({
                  peers: undefined,
                  peerConnections: undefined,
                })),
          identityRotation.notice(),
        ]);
      return {
        clips,
        devices,
        pending: suspended ? [] : pendingRequests,
        waiting: pairingState.waiting,
        pairingErrors: pairingState.errors,
        pairingState,
        connectionStateKnown: Array.isArray(peerState?.peers),
        peers: peerState?.peers ?? [],
        peerConnections: peerState?.peerConnections ?? [],
        identity: identity ? toPublicDeviceIdentity(identity) : null,
        pinnedIds,
        clipboardHistoryError,
        historyPolicyError,
        identityRotationRecovery: suspended || identityRotationRecovery,
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
    storage: identityWork.protectStorageWrites(resetStorage),
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
  },
  onRejectedPeer: cleanupRejectedPeer,
  onChanged: async (requests) => {
    pendingRequests = requests.map((request) => ({
      deviceId: request.initiatorPeerId,
      deviceName: request.deviceName,
      requestVersion: request.requestVersion,
    }));
    await sharedRuntime.publishState();
  },
});
identityRotationLifecycle = createRuntimeIdentityRotationLifecycle({
  rotation: identityRotation,
  workFence: identityWork,
  loadIdentity: () => identitySvc.get(),
  restart: () => chrome.runtime.reload(),
  startLocalRecovery: () => clipExchange.startLocalCapture(),
  publishState: () => sharedRuntime.publishState(),
  onRecoveryChanged: (recovering) => {
    identityRotationRecovery = recovering;
  },
});
extensionNetwork.onMessage(PAIRING_PROTOCOL, (from, frame, owner) => {
  void pairingPending
    .start()
    .then(() =>
      pairingSessions.receive(
        from,
        frame,
        (peerId, requestFrame, requestOwner) =>
          pairingPending.receive(peerId, requestFrame, requestOwner),
        owner
      )
    )
    .catch((error) => log.warn("Pairing message processing failed", error));
});
chrome.notifications?.onClicked?.addListener((id) => {
  if (identityWork.isFenced()) return;
  const separator = id.lastIndexOf(":");
  notificationSelection.emit(
    separator === -1 ? id : id.slice(0, separator),
    separator === -1 ? undefined : id.slice(separator + 1)
  );
});
const sharedRuntime = createRuntimeOrchestrator({
  adapter: runtimeAdapter,
  start: () =>
    startIdentityBoundRuntimeServices({
      workFence: identityWork,
      onServicesStarted: () => identityRotationLifecycle.servicesStarted(),
      initializeIdentity: async () => {
        await autoSyncReady;
        return identityRotationLifecycle.initialize();
      },
      startLocalServices: async () => {
        const generation = identityWork.generation();
        identityWork.assertOpen(generation);
        await autoSyncReady;
        identityWork.assertOpen(generation);
        clipExchange.setAutoSync(autoSync);
        await historyPolicyReady;
        identityWork.assertOpen(generation);
        historyRetentionCleanup ??= startHistoryRetentionCleanup(
          {
            pruneExpired: async () => {
              const maintenance = await retentionPreference.maintain();
              if (maintenance.recovered) {
                await settingsHandler.read().then((snapshot) =>
                  chrome.runtime.sendMessage({
                    type: "settingsState",
                    snapshot,
                  })
                );
              }
            },
          },
          undefined,
          (error) => {
            historyPolicyError = error ? "history_cleanup_failed" : null;
            void sharedRuntime.publishState();
          }
        );
        if (identityRotationLifecycle.startLocalOnlyIfRecovering()) return;
        pairingSessions.start();
        clipExchange.startLocalCapture();
      },
      startNetworkServices: async () => {
        const generation = identityWork.generation();
        identityWork.assertOpen(generation);
        offscreenInitializationGate.open();
        await offscreenReady;
        identityWork.assertOpen(generation);
        await extensionNetwork.start();
        identityWork.assertOpen(generation);
        await clipExchange.activateReadyTransport(extensionNetwork);
        membershipReconciler.start();
        await pairingPending.start();
        identityWork.assertOpen(generation);
      },
      onNetworkingFailure: async (error) => {
        log.warn(
          "Extension networking failed to start; local capture remains active",
          error
        );
        // Durable pending Requests and native selection remain local capabilities
        // when the offscreen network cannot start.
        if (!identityWork.isFenced()) await pairingPending.start();
      },
    }),
  stop: async () => {
    historyRetentionCleanup?.stop();
    historyRetentionCleanup = undefined;
    await pairingSessions.stop();
    await clipExchange.stop();
  },
});

// Listen for clipboard changes (MV3: use chrome.clipboard or content script)
// Listen for messages from popup/options
async function publishedRenameResult<Value>(
  action: () => Promise<Value | null>,
  key: "identity" | "device"
): Promise<
  { ok: true; identity?: Value; device?: Value } | { ok: false; error: string }
> {
  try {
    const value = await action();
    if (!value) return { ok: false, error: "device_unavailable" };
    try {
      await sharedRuntime.publishState();
    } catch {
      return { ok: false, error: "rename_state_unconfirmed" };
    }
    return { ok: true, [key]: value };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

const relayMutationOwner = createChromeRelayMutationOwner({
  read: () => managedConfigurations,
  load: () => managedConfigurationStore.readNewModel(),
  erase: (url) => managedCredentials.eraseCredentials(url),
  write: (next) => managedConfigurationStore.writeNewModel(next),
  accept: (next) => {
    managedConfigurations = next;
  },
  apply: async (next) => {
    await offscreenReady;
    await sendOffscreen({ action: "setManagedRelays", configurations: next });
  },
  reconcile: async () => {
    await sharedRuntime.publishState();
  },
});
chrome.runtime.onMessage.addListener(
  function handleRuntimeMessage(msg, sender, sendResponse) {
    // The management installer owns these callbacks, including reset-time status.
    if (
      [
        "managementNavigate",
        "managementStatus",
        "managementRetry",
        "managementDismiss",
        "identityResetStateChanged",
      ].includes(msg?.type)
    )
      return;
    if (!startupResetChecked) {
      void startupResetReady
        .then(() => handleRuntimeMessage(msg, sender, sendResponse))
        .catch(() =>
          sendResponse({ ok: false, error: "identity_runtime_suspended" })
        );
      return true;
    }
    if (typeof msg?.type === "string" && msg.type.startsWith("identityReset")) {
      if (sender?.id !== chrome.runtime.id || sender.url !== OPTIONS_URL) {
        sendResponse({ ok: false, error: "identity_reset_unauthorized" });
        return false;
      }
      void (async () => {
        if (msg.type === "identityResetRead")
          return {
            ok: true,
            state: copyIdentityResetState(
              startupResetState ?? { phase: "idle" }
            ),
          };
        if (msg.type === "identityResetReconcile") {
          const state = await chromeRuntime.identityReset.reconcile();
          startupResetState = copyIdentityResetState(state);
          return { ok: true, state };
        }
        if (msg.type === "identityResetBegin") {
          if (
            typeof msg.operationId !== "string" ||
            typeof msg.reviewedPeerId !== "string"
          )
            throw new Error("identity_reset_invalid_request");
          return {
            ok: true,
            result: await chromeRuntime.identityReset.begin({
              operationId: msg.operationId,
              reviewedPeerId: msg.reviewedPeerId,
            }),
          };
        }
        if (msg.type === "identityResetResume") {
          if (typeof msg.operationId !== "string")
            throw new Error("identity_reset_invalid_request");
          return {
            ok: true,
            result: await chromeRuntime.identityReset.resume({
              operationId: msg.operationId,
            }),
          };
        }
        if (msg.type === "identityResetDismiss") {
          if (typeof msg.receiptId !== "string")
            throw new Error("identity_reset_invalid_request");
          const state = await chromeRuntime.identityReset.dismiss({
            receiptId: msg.receiptId,
          });
          startupResetState = copyIdentityResetState(state);
          return { ok: true, state };
        }
        if (msg.type === "identityResetCopyFormerPeerId") {
          if (typeof msg.receiptId !== "string")
            throw new Error("identity_reset_invalid_request");
          const receipt =
            startupResetState?.phase === "idle"
              ? startupResetState.receipt
              : startupResetState?.phase === "completed"
                ? startupResetState.receipt
                : undefined;
          if (!receipt || receipt.receiptId !== msg.receiptId)
            throw new Error("identity_reset_receipt_unavailable");
          return { ok: true, text: receipt.formerPeerId };
        }
        throw new Error("identity_reset_unknown_action");
      })()
        .then(sendResponse)
        .catch((error) =>
          sendResponse({ ok: false, error: (error as Error).message })
        );
      return true;
    }
    const recoveryReadable = [
      "getRuntimeAuthority",
      "getRuntimeState",
      "getInitializationError",
    ].includes(msg?.type);
    const admittedGeneration = identityWork.generation();
    const reply = sendResponse;
    sendResponse = (value) => {
      if (
        !recoveryReadable &&
        (admittedGeneration !== identityWork.generation() ||
          identityWork.isFenced())
      )
        reply({ ok: false, error: "identity_runtime_retired" });
      else reply(value);
    };
    if (identityWork.isFenced() && !recoveryReadable) {
      sendResponse({ ok: false, error: "identity_runtime_suspended" });
      return false;
    }
    if (typeof msg?.type === "string" && msg.type.startsWith("managedRelay")) {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)
      ) {
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
        if (msg.type === "managedRelayRefresh")
          return {
            ok: true,
            configurations: await relayMutationOwner.refresh(),
          };
        if (msg.type === "managedRelayMutate") {
          const result = await relayMutationOwner.mutate(msg.mutation);
          return { ok: true, result };
        }
        if (typeof msg.key !== "string") throw new Error("invalid_relay_key");
        const config = managedConfigurations.find(
          (entry) => entry.key === msg.key
        );
        if (!config) throw new Error("relay_not_found");
        if (
          msg.type === "managedRelayLogin" ||
          msg.type === "managedRelayAccount" ||
          msg.type === "managedRelayRetry"
        ) {
          const result = await performRelayAction(
            msg.type === "managedRelayAccount"
              ? "portal-opened"
              : msg.type === "managedRelayLogin"
                ? "authenticated"
                : "retry-requested",
            async () => {
              if (msg.type === "managedRelayAccount") {
                if (config.kind !== "managed")
                  throw new Error("relay_account_not_supported");
                await managedCredentials.openAccount(config.discoveryUrl);
              } else {
                if (msg.type === "managedRelayLogin") {
                  if (config.kind !== "managed")
                    throw new Error("relay_login_not_supported");
                  await managedCredentials.interactiveLogin(
                    config.discoveryUrl
                  );
                }
                // The configuration may have been removed while the auth browser was open.
                if (
                  !managedConfigurations.some(
                    (current) =>
                      current.key === config.key &&
                      current.kind === config.kind &&
                      (current.kind !== "managed" ||
                        config.kind !== "managed" ||
                        current.discoveryUrl === config.discoveryUrl)
                  )
                )
                  throw new Error("relay_not_found");
                await offscreenReady;
                await sendOffscreen({
                  action: "retryManagedRelay",
                  key: config.key,
                });
              }
            },
            async () => {
              await sharedRuntime.publishState();
            }
          );
          return { ok: true, result };
        }
        throw new Error("unknown_relay_action");
      })()
        .then(sendResponse)
        .catch((error) =>
          sendResponse({ ok: false, error: (error as Error).message })
        );
      return true;
    }
    if (msg.type === "getRuntimeAuthority") {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)
      ) {
        sendResponse({ error: "runtime_authority_unauthorized" });
        return false;
      }
      sendResponse({ sessionId: pairingSessions.snapshot().sessionId });
      return true;
    }
    if (
      ["getNotificationAvailability", "openNotificationSettings"].includes(
        msg.type
      )
    ) {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)
      ) {
        sendResponse({ ok: false, error: "notification_ui_unauthorized" });
        return false;
      }
      const action =
        msg.type === "openNotificationSettings"
          ? notificationStatus.openSettings().then(() => ({ ok: true }))
          : notificationStatus.refresh().then((state) => ({ ok: true, state }));
      void action.then(sendResponse).catch(() =>
        sendResponse({
          ok: false,
          error: "notification_settings_unavailable",
        })
      );
      return true;
    }
    if (msg.type === "getRuntimeState") {
      runtimeAdapter.publicState
        .read()
        .then((state) =>
          sendResponse({
            state: {
              ...state,
              identityResetState: copyIdentityResetState(
                startupResetState ?? { phase: "idle" }
              ),
            },
          })
        )
        .catch((error) => sendResponse({ error: (error as Error).message }));
      return true;
    }
    if (msg.type === "getInitializationError") {
      identityRepo.loadInitializationError!().then((error) =>
        sendResponse({ error: error ?? null })
      );
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
      Promise.all([historyPolicyReady, autoSyncReady])
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
          sendResponse({
            peerCount: peers.length,
            connected: peers.length > 0,
          });
        })
        .catch(() => sendResponse({ peerCount: 0, connected: false }));
      return true;
    }
    // Handle clipboard history for options page
    if (msg.type === "getClipHistory") {
      historyPolicyReady
        .then(() => history.snapshot())
        .then((snapshot) =>
          sendResponse({
            ok: true,
            snapshot: { ...snapshot, sessionId: historySessionId },
            clips: snapshot.clips,
          })
        )
        .catch(() => sendResponse({ ok: false, error: "history_unavailable" }));
      return true;
    }
    if (msg.type === "clearHistory") {
      Promise.all([historyPolicyReady, autoSyncReady])
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
    if (msg.type === "dismissPairingOutcome") {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL) ||
        typeof msg.targetPeerId !== "string" ||
        typeof msg.expected?.sessionId !== "string" ||
        typeof msg.expected?.revision !== "number"
      ) {
        sendResponse({ error: "pairing_outcome_unauthorized" });
        return false;
      }
      sendResponse({
        dismissed: pairingSessions.dismissOutcome(
          msg.targetPeerId,
          msg.expected
        ),
      });
      return true;
    }
    if (msg.type === "respondTrust") {
      void pairingPending
        .decide(
          msg.id,
          msg.accept ? "accepted" : "rejected",
          msg.device?.requestVersion
        )
        .then((result) => sendResponse(result))
        .catch((error) => {
          log.warn("Pairing response failed", error);
          sendResponse({
            ok: false,
            error: "outcome_unconfirmed",
            admitted: null,
          });
        });
      return true;
    }
    if (msg.type === "clipboardUpdate") {
      void observeExtensionClipboard(
        msg.text,
        clipboard,
        Promise.all([historyPolicyReady, autoSyncReady])
      ).then(sendResponse);
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
      Promise.all([historyPolicyReady, autoSyncReady])
        .then(() => clipboard.processLocalText(msg.text, { shareNow: true }))
        .then(() => sendResponse({ ok: true }))
        .catch((error) =>
          sendResponse({ ok: false, error: (error as Error).message })
        );
      return true;
    }
    if (msg.type === "reuseClip" && msg.id) {
      Promise.all([historyPolicyReady, autoSyncReady])
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
    if (
      msg.type === "renameLocalIdentity" &&
      typeof msg.name === "string" &&
      typeof msg.expectedDeviceId === "string"
    ) {
      void publishedRenameResult(async () => {
        await identitySvc.rename(msg.name, msg.expectedDeviceId);
        return toPublicDeviceIdentity(await identitySvc.get());
      }, "identity").then(sendResponse);
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
            started?: boolean;
            acceptanceMemoryClipboard?: boolean;
            relayAcceptanceTransport?: "wss" | "webrtc-direct";
          }>({ action: "getStatus" })
        )
        .then((resp) => {
          const peers = Array.isArray(resp?.peers) ? resp!.peers : [];
          sendResponse({
            peerCount: peers.length,
            autoSync: clipboardSync.isAutoSync(),
            started: resp?.started === true,
            ...(resp?.acceptanceMemoryClipboard === true
              ? { acceptanceMemoryClipboard: true }
              : {}),
            ...(resp?.relayAcceptanceTransport === "wss" ||
            resp?.relayAcceptanceTransport === "webrtc-direct"
              ? { relayAcceptanceTransport: resp.relayAcceptanceTransport }
              : {}),
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
          await sharedRuntime.publishState();
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
    if (
      msg.type === "setLocalRetention" &&
      typeof msg.retentionMs === "number"
    ) {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)
      ) {
        sendResponse({ status: "rejected", error: "settings_unauthorized" });
        return false;
      }
      void settingsHandler
        .write({ localRetentionMs: msg.retentionMs })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            status: "unconfirmed",
            error: (error as Error).message,
          })
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
      void publishedRenameResult(
        () => identitySvc.setLocalDeviceAlias(msg.id, msg.name),
        "device"
      ).then(sendResponse);
      return true;
    }
    // Settings are owned by the serialized preference handler.
    if (msg.type === "getSettings") {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)
      ) {
        sendResponse({ ok: false, error: "settings_unauthorized" });
        return false;
      }
      void Promise.all([historyPolicyReady, settingsHandler.read()])
        .then(([, snapshot]) =>
          sendResponse({ ok: true, snapshot, localRetentionMs })
        )
        .catch((error) =>
          sendResponse({ ok: false, error: (error as Error).message })
        );
      return true;
    }
    if (msg.type === "setSettings") {
      if (
        !authorizedRelayUi(sender, chrome.runtime.id, POPUP_URL, OPTIONS_URL)
      ) {
        sendResponse({ ok: false, error: "settings_unauthorized" });
        return false;
      }
      void settingsHandler
        .write(msg.settings)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            status: "unconfirmed",
            error: (error as Error).message,
          })
        );
      return true;
    }
    // Add more message handlers as needed
  }
);

// Listen for messages forwarded from offscreen (libp2p)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.source !== "offscreen") return;
  try {
    if (
      _sender.id !== chrome.runtime.id ||
      _sender.url !== OFFSCREEN_URL ||
      typeof msg.runtimeGeneration !== "string"
    )
      throw new Error("identity_runtime_retired");
    identityWork.assertOpen(msg.runtimeGeneration);
  } catch {
    sendResponse({ ok: false, error: "identity_runtime_retired" });
    return false;
  }
  if (msg?.action === "managedRelayStates") {
    if (
      _sender.id !== chrome.runtime.id ||
      _sender.url !== OFFSCREEN_URL ||
      !Array.isArray(msg.states)
    )
      return;
    managedStates = msg.states;
    void sharedRuntime.publishState();
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
    typeof msg.transportOwner === "string" &&
    msg.transportOwner === offscreenTransportOwner &&
    typeof msg.protocol === "string" &&
    typeof msg.from === "string" &&
    Array.isArray(msg.data)
  ) {
    const data = Uint8Array.from(msg.data);
    runtimeProtocolHandlers
      .get(msg.protocol)
      ?.forEach((handler) => handler(msg.from, data, msg.transportOwner));
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

// One owning composition per worker incarnation. Product pages retain only their
// existing authenticated message interface; these controls never cross it.
const ready = sharedRuntime.start();
let stopped: Promise<void> | undefined;
export const chromeRuntime = {
  ready,
  publicState: () => runtimeAdapter.publicState.read(),
  // Privileged composition witness only; never added to product page messages.
  owningObservation: async () => {
    if (stopped) throw new Error("identity_runtime_stopped");
    await ready;
    if (stopped) throw new Error("identity_runtime_stopped");
    const resetState = startupResetState;
    if (!resetState) throw new Error("identity_reset_observation_unavailable");
    const state = await runtimeAdapter.publicState.read();
    if (stopped) throw new Error("identity_runtime_stopped");
    if (startupResetState !== resetState)
      throw new Error("identity_reset_observation_changed");
    return {
      ...state,
      localRetentionMs,
      identityResetState: copyIdentityResetState(resetState),
    };
  },
  identityReset: {
    begin: async (
      request: Parameters<typeof identityRotation.beginIdentityReset>[0]
    ) => {
      if (stopped) throw new Error("identity_runtime_stopped");
      return identityRotation.beginIdentityReset(request);
    },
    reconcile: identityRotation.reconcileIdentityReset,
    resume: async (
      request: Parameters<typeof identityRotation.resumeIdentityReset>[0]
    ) => {
      if (stopped) throw new Error("identity_runtime_stopped");
      return identityRotation.resumeIdentityReset(request);
    },
    dismiss: async (request: { receiptId: string }) => {
      if (stopped) throw new Error("identity_runtime_stopped");
      return identityRotation.dismissIdentityResetReminder(request);
    },
  },
  stop: () =>
    (stopped ??= (async () => {
      await identityWork.acquireFence();
      try {
        await identityRotation.reconcileIdentityReset();
      } finally {
        await identityWork.acquireFence();
        await identityRotationShutdown();
        await identityWork.quiesce();
        await identityRotationShutdown();
        await Promise.allSettled(
          [offscreenCreateFlight, offscreenInitFlight].filter(Boolean)
        );
        await stopOffscreenDocument(true);
        await sharedRuntime.stop();
      }
    })()),
};

// Observe errors without converting failed readiness into success for callers.
void ready
  .then(() => {
    log.info("Background services started (offscreen networking)");
  })
  .catch((error) => {
    log.error("Extension Device Identity initialization failed", error);
  });
