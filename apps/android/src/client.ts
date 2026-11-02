import { v4 as uuidv4 } from "uuid";
import { createAndroidClipboardService as composeAndroidClipboard } from "./clipboardFactory";
import { createLocalRetentionPreference } from "../../../packages/core/runtime/localRetentionPreference";
import {
  createSettingsHandler,
  normalizeSharingLifetime,
  type SettingsSnapshot,
} from "../../../packages/core/runtime/settingsAuthority";
import { performAutoSyncAction } from "../../../packages/core/runtime/autoSyncAction";
import {
  createRelayMutationOwner,
  type RelayMutation,
} from "../../../packages/core/network/relayMutations";
import { performRelayAction } from "../../../packages/core/network/relayActions";
import { copyPayloadText } from "../../../packages/core/clipboard/payloadCopy";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import {
  createAndroidRuntimeAdapter,
  createRuntimeIdentityManager,
  createRuntimeIdentityRotationLifecycle,
  createRuntimeNetworkProxy,
  createRuntimeNotificationSelection,
  createRuntimeApprovalEntries,
  createRuntimeNotificationStatus,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  startIdentityBoundRuntimeServices,
  stopIdentityBoundRuntimeServices,
  systemRuntimeClock,
  type RuntimeClipboardHistoryError,
} from "@core/runtime";
import { createLibp2pMessagingTransport } from "@core/network/engine";
import {
  androidCircuitRelayAddresses,
  filterAndroidDialAddresses,
} from "./networkAddressing";
import {
  activeMemberReconnectPeers,
  createPairedPeerConnectionManager,
} from "@core/network/pairedConnections";
import { createKVSignedPeerRecordPersistence } from "@core/network/peerRecords";
import {
  ManagedRelayController,
  loadManagedRelayConfigurations,
  saveManagedRelayConfigurations,
  type RelayConfiguration,
  type RelayState,
  type ManagedRelayConnection,
} from "@core/network/managedRelays";
import {
  MemoryHistoryStore,
  RETENTION_MS,
  startHistoryRetentionCleanup,
  type HistoryRetentionCleanup,
} from "@core/history/store";
import { createHistoryStateReader } from "@core/history/state";
import { IndexedDBHistoryBackend } from "@core/history/indexeddb";
import { InMemoryHistoryBackend } from "@core/history/types";
import { createClipboardSyncManager } from "@core/sync/clipboardSync";
import { createHistoryReconciliation } from "@core/sync/historyReconciliation";
import { createLiveClipGossip } from "@core/sync/liveClipGossip";
import { reuseRetainedClip } from "@core/clipboard/explicitActions";
import {
  PAIRING_PROTOCOL,
  verifyPairingTrustRequestSignature,
} from "@core/pairing/protocol";
import {
  createMembershipPeerRecordBridge,
  createMembershipReconciler,
} from "@core/membership/reconciliation";
import { createPendingTrustRequestCoordinator } from "@core/pairing/pending";
import { createPairingRuntimeSessions } from "@core/pairing/runtimeCoordinator";
import { importPairingTargetAndRequest } from "@core/pairing/target";
import { decodePairingTarget, encodePairingTarget } from "@core/pairing/v2";
import {
  createKVIdentityRepository,
  toPublicDeviceIdentity,
  IDENTITY_KEY,
  type KVStorageBackend,
} from "@core/trust";
import type { IdentityResetState } from "../../../packages/core/trust/manualIdentityReset";
import { DEFAULT_CLIP_SHARING_LIFETIME_MS, type Clip } from "@core/models/Clip";
import type {
  Device,
  HistoryPolicyError,
  Identity,
  IdentityRotationNoticeReason,
  PairingCode,
  PairingError,
  PairingOutcomeSnapshot,
  PeerConnectionInfo,
  PendingRequest,
  RelayConnectionInfo,
} from "@clipp/ui";
import * as log from "@core/logger";
import {
  deviceIdToPeerId,
  deviceIdToPeerIdObject,
  peerIdFromPrivateKeyBase64,
} from "@core/network/peerId";
import { LocalStorageBackend } from "./storage";
import { createAndroidIdentityRotationOwner } from "./identityResetStorage";
import {
  createAndroidIdentityResetRuntime,
  createAndroidPendingTrustRequestStore,
} from "./identityResetRuntime";
import { Capacitor } from "@capacitor/core";
import { Clipboard as CapacitorClipboard } from "@capacitor/clipboard";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  createAndroidBackgroundContinuityCoordinator,
  type AndroidBackgroundContinuitySnapshot,
  type AndroidBackgroundNotificationAction,
} from "./backgroundContinuity";
import { createAndroidBackgroundNative } from "./backgroundContinuityNative";
import { AndroidManagedRelayAuth } from "./managedRelayAuth";
import { createAndroidRelaySecretBridge } from "./managedRelayNative";
import {
  androidRelayAddressOrder,
  createAndroidManagedRelayAdapter,
  type AndroidManagedRelayHost,
} from "./managedRelayRuntime";

export type AndroidAppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  waiting?: Array<{ targetPeerId: string; expiresAtUnixMs: number }>;
  pairingErrors?: PairingError[];
  pairingState?: PairingOutcomeSnapshot;
  peers: string[];
  connectionStateKnown?: boolean;
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  pinnedIds: string[];
  historyUnavailable?: boolean;
  historyRefreshError?: boolean;
  localRetentionMs?: number;
  autoSync?: boolean;
  clipboardHistoryError?: RuntimeClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
  identityRotationRecovery?: boolean;
  identityRotationNotice?: IdentityRotationNoticeReason | null;
  identityResetState?: IdentityResetState;
  relayAddresses: string[];
  managedRelayConfigurations?: RelayConfiguration[];
  managedRelayStates?: RelayState[];
  diagnostics?: {
    lastPairingAttempt: PairingAttemptDiagnostics | null;
  };
  backgroundContinuity?: AndroidBackgroundContinuitySnapshot;
};

type PairingFailureCode = "invalid" | "no_target" | "dial_failed";

export type PairingAttemptDiagnostics = {
  attemptId: string;
  status: "running" | "succeeded" | "failed";
  error: PairingFailureCode | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  inputLength: number;
};

export type PairingResult =
  | { ok: true; diagnostics: PairingAttemptDiagnostics }
  | {
      ok: false;
      error: PairingFailureCode;
      diagnostics: PairingAttemptDiagnostics;
    };

function createHistoryBackend() {
  try {
    if (typeof indexedDB === "undefined") {
      throw new Error("indexedDB not available");
    }
    return new IndexedDBHistoryBackend();
  } catch (err) {
    log.warn("IndexedDB unavailable, using in-memory history", err);
    return new InMemoryHistoryBackend();
  }
}

async function readClipboardText(): Promise<string> {
  try {
    const res = await CapacitorClipboard.read();
    if (typeof res?.value === "string") return res.value;
  } catch (err) {
    log.warn("Capacitor clipboard read failed, falling back", err);
  }
  return (await navigator.clipboard.readText()) ?? "";
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await CapacitorClipboard.write({ string: text });
    return;
  } catch (err) {
    log.warn("Capacitor clipboard write failed, falling back", err);
  }
  await navigator.clipboard.writeText(text);
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(b64, "base64"));
    }
  } catch {
    // ignore
  }
  if (typeof atob !== "function") {
    throw new Error("base64_unavailable");
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function nativeNotificationId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash || 1);
}

function logPairing(
  level: "debug" | "info" | "warn",
  message: string,
  data: unknown
): void {
  const prefixed = `[clipp:android:pairing] ${message}`;
  if (level === "warn") log.warn(prefixed, data);
  else if (level === "info") log.info(prefixed, data);
  else log.debug(prefixed, data);
}

export class AndroidClient {
  /** The constructing host owns reset controls; App receives only the client. */
  static createRuntime() {
    const client = new AndroidClient();
    let stopped: Promise<void> | undefined;
    let starting: Promise<void> | undefined;
    return {
      client,
      start: () => {
        if (stopped) throw new Error("identity_runtime_suspended");
        client.workFence.assertOpen();
        return (starting ??= client.start().finally(() => {
          starting = undefined;
        }));
      },
      publicState: () => client.getState(),
      identityReset: {
        begin: async (
          request: Parameters<
            typeof client.identityRotation.beginIdentityReset
          >[0]
        ) => {
          if (stopped) throw new Error("identity_runtime_stopped");
          const result =
            await client.identityRotation.beginIdentityReset(request);
          if (result.outcome !== "rejected")
            await client.publishIdentityResetState(result.state);
          return result;
        },
        reconcile: async () => {
          await client.publishIdentityResetState(
            await client.identityRotation.reconcileIdentityReset()
          );
          return client.identityResetState;
        },
        resume: async (
          request: Parameters<
            typeof client.identityRotation.resumeIdentityReset
          >[0]
        ) => {
          if (stopped) throw new Error("identity_runtime_stopped");
          const result =
            await client.identityRotation.resumeIdentityReset(request);
          if (result.outcome !== "rejected")
            await client.publishIdentityResetState(result.state);
          return result;
        },
        dismiss: async (receiptId: string) => {
          if (stopped) throw new Error("identity_runtime_stopped");
          await client.publishIdentityResetState(
            await client.identityRotation.dismissIdentityResetReminder({
              receiptId,
            })
          );
          return client.identityResetState;
        },
      },
      stop: () =>
        (stopped ??= (async () => {
          await client.workFence.acquireFence();
          try {
            await client.identityRotation.reconcileIdentityReset();
          } finally {
            await client.workFence.acquireFence();
            await client.stopIdentityBoundServices();
            await client.workFence.quiesce();
            await client.stop();
          }
        })()),
    };
  }

  private readonly identityResetRuntime = createAndroidIdentityResetRuntime({
    suspend: async () => {
      await this.stopIdentityBoundServices(true);
      if (Capacitor.getPlatform() === "android")
        await this.backgroundContinuity.suspendForIdentityReset();
    },
  });
  private readonly workFence = this.identityResetRuntime.workFence;
  private readonly storage = this.workFence.protect(this.rawStorage);
  private identityStartupInspected = false;
  private assertIdentityWorkReady(): void {
    this.workFence.assertOpen();
    if (!this.identityStartupInspected)
      throw new Error("identity_runtime_not_initialized");
  }
  private sharingLifetimeMs = DEFAULT_CLIP_SHARING_LIFETIME_MS;
  private readonly settingsListeners = new Set<
    (snapshot: SettingsSnapshot) => void
  >();
  private readonly settingsHandler = createSettingsHandler({
    storage: this.storage,
    retention: {
      read: () => this.retentionPreference.read(),
      set: (value) => this.retentionPreference.set(value),
    },
    applyAutoSync: (enabled) => {
      this.autoSync = enabled;
      this.clipboardSync.setAutoSync(enabled);
    },
    applyLogLevel: () => {},
    applySharingLifetime: (value) => {
      this.sharingLifetimeMs = value;
    },
    publish: async (snapshot) => {
      for (const listener of this.settingsListeners) listener(snapshot);
    },
  });
  async getSettings() {
    return { ok: true as const, snapshot: await this.settingsHandler.read() };
  }
  setSharingLifetime(value: unknown) {
    this.workFence.assertOpen();
    return this.settingsHandler.write({ sharingLifetimeMs: value });
  }
  async setSettings(patch: unknown) {
    this.workFence.assertOpen();
    const result = await this.settingsHandler.write(patch);
    try {
      await this.backgroundContinuity.reflectAutoSync(this.autoSync);
    } catch {
      this.backgroundContinuity.markControlStateUnknown();
    }
    await this.emitState();
    return result;
  }
  setTheme(theme: unknown) {
    this.workFence.assertOpen();
    return this.settingsHandler.write({ theme });
  }
  onSettingsUpdate(listener: (snapshot: SettingsSnapshot) => void) {
    this.settingsListeners.add(listener);
    return () => {
      this.settingsListeners.delete(listener);
    };
  }
  private readonly relaySecrets = this.workFence.protect(
    createAndroidRelaySecretBridge()
  );
  private readonly relayAuth = new AndroidManagedRelayAuth(
    this.relaySecrets,
    fetch,
    Date.now,
    this.workFence
  );
  private managedRelays: ManagedRelayController | null = null;
  private managedRelayConfigurations: RelayConfiguration[] = [];
  private removeRelayCallback: (() => void) | null = null;
  private readonly rawHistoryBackend = createHistoryBackend();
  private readonly historyBackend = this.workFence.protect(
    this.rawHistoryBackend
  );
  private readonly history = this.workFence.protect(
    new MemoryHistoryStore(this.historyBackend)
  );
  private readonly retentionPreference = createLocalRetentionPreference({
    storage: this.storage,
    history: this.history,
    publish: async (state) => {
      this.localRetentionMs = state.value;
      this.historyPolicyError = state.cleanupError
        ? "history_cleanup_failed"
        : null;
      // A background control may be reading authoritative settings while this
      // retention operation owns their write queue. Its state projection waits
      // for that control, so retain the notification without awaiting it here.
      // The ordered settings reply/feed still acknowledge the applied policy.
      void this.emitState().catch((error) => {
        log.warn("Retention state could not be published", error);
      });
    },
  });
  private readonly historyState = createHistoryStateReader(this.history);
  private readonly identityRepo = createKVIdentityRepository({
    storage: this.storage,
    key: IDENTITY_KEY,
  });
  private readonly identityRotation = createAndroidIdentityRotationOwner({
    repository: createKVIdentityRepository({
      storage: this.rawStorage,
      key: IDENTITY_KEY,
    }),
    storage: this.rawStorage,
    history: this.rawHistoryBackend,
    ...(this.rawStorage instanceof LocalStorageBackend &&
    this.rawHistoryBackend instanceof IndexedDBHistoryBackend &&
    Capacitor.getPlatform() === "android"
      ? {
          reset: {
            storage: this.rawStorage,
            persistentHistory: this.rawHistoryBackend,
            lifecycle: this.identityResetRuntime.lifecycle,
            verifyNativeCleanup: this.identityResetRuntime.verifyNativeCleanup,
          },
        }
      : {}),
    shutdown: () => this.stopIdentityBoundServices(),
    runtimeCleanup: {
      prepare: async () => {
        const applicationCleanup =
          await this.backgroundContinuity.prepareIdentityRotationCleanup();
        try {
          const captureCleanup =
            await this.clipboardSync.prepareIdentityRotationCleanup();
          return {
            rollback: async () => {
              await captureCleanup.rollback();
              await applicationCleanup.rollback();
            },
          };
        } catch (error) {
          await applicationCleanup.rollback();
          throw error;
        }
      },
    },
  });
  identityResetState: IdentityResetState = { phase: "idle" };
  private async publishIdentityResetState(state: IdentityResetState) {
    this.identityResetState = state;
    await this.emitState();
  }
  private readonly identityRotationLifecycle =
    createRuntimeIdentityRotationLifecycle({
      rotation: this.identityRotation,
      workFence: this.workFence,
      loadIdentity: () => this.identitySvc.get(),
      restart: () => {
        if (Capacitor.getPlatform() === "android") {
          void this.identityResetRuntime
            .restartRuntime()
            .catch(() =>
              log.warn("Android runtime restart could not be completed")
            );
        } else window.location.reload();
      },
      startLocalRecovery: () => {
        this.clipboardSync.startLocalOnly();
        this.started = true;
      },
      publishState: () => this.emitState(),
      onRecoveryChanged: (recovering) => {
        this.identityRotationRecovery = recovering;
      },
    });
  private readonly identitySvc = createRuntimeIdentityManager({
    repo: this.identityRepo,
    workFence: this.workFence,
    capabilities: RUNTIME_CAPABILITIES.android,
  });
  private transport: ReturnType<typeof createLibp2pMessagingTransport> | null =
    null;
  private pairedConnections: ReturnType<
    typeof createPairedPeerConnectionManager
  > | null = null;
  private liveClipGossip: ReturnType<typeof createLiveClipGossip> | null = null;
  private historyReconciliation: ReturnType<
    typeof createHistoryReconciliation
  > | null = null;
  private membershipReconciler: ReturnType<
    typeof createMembershipReconciler
  > | null = null;

  constructor(
    private readonly rawStorage: KVStorageBackend = new LocalStorageBackend()
  ) {
    this.identityRotation.onStatusChanged((status) => {
      if (status.kind === "manual-reset") {
        this.identityResetState = status.state;
        void this.emitState();
      }
    });
    // The companion can report loss before networking or the focused Activity starts.
    void this.backgroundNative.on("runtimeLost", () =>
      this.settleBackgroundLifecycleEvent(() =>
        this.backgroundContinuity.reportRuntimeLost()
      )
    );
    void this.backgroundNative.on("taskRemoved", () =>
      this.settleBackgroundLifecycleEvent(() =>
        this.backgroundContinuity.handleTaskRemoved()
      )
    );
    // messaging is initialised lazily in `start()`
    void LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        const id = event.notification.extra?.runtimeNotificationId;
        if (typeof id === "string" && !this.workFence.isFenced()) {
          this.notificationSelection.emit(
            id,
            typeof event.notification.extra?.runtimeNotificationInstance ===
              "string"
              ? event.notification.extra.runtimeNotificationInstance
              : undefined
          );
        }
      }
    );
  }

  private async ensureMessaging(): Promise<void> {
    this.workFence.assertOpen();
    if (this.transport && this.liveClipGossip) {
      if (!this.pairedConnections) {
        this.pairedConnections = createPairedPeerConnectionManager({
          transport: this.transport,
          getPairedPeers: activeMemberReconnectPeers(this.identitySvc),
        });
      }
      return;
    }
    const identity = await this.identitySvc.get();
    this.workFence.assertOpen();
    const peerId =
      identity.privateKey && typeof identity.privateKey === "string"
        ? await peerIdFromPrivateKeyBase64(identity.privateKey)
        : await deviceIdToPeerIdObject(identity.deviceId);
    const privateKey =
      identity.privateKey && typeof identity.privateKey === "string"
        ? await privateKeyFromProtobuf(base64ToBytes(identity.privateKey))
        : undefined;

    const relayAddresses = androidCircuitRelayAddresses();
    log.info("[clipp:android:network] Creating messaging transport", {
      peerId: peerId?.toString?.() ?? String(peerId),
      relayAddresses,
      circuitRelays: relayAddresses,
    });
    this.workFence.assertOpen();
    this.transport = createLibp2pMessagingTransport({
      peerId,
      privateKey,
      relayAddresses,
      enableWebRTCDirect: true,
      enableDCUtR: true,
      enableRelayReservations: true,
      allowInsecureBrowserDials: true,
      signedPeerRecordPersistence: createKVSignedPeerRecordPersistence({
        storage: this.storage,
      }),
      isPeerKnown: async (remotePeerId) =>
        (await this.identitySvc.membershipStatus(remotePeerId)) === "active",
      isPeerRevoked: async (remotePeerId) =>
        (await this.identitySvc.membershipStatus(remotePeerId)) === "revoked",
    });
    this.transport.setEligibleDialAddresses((addresses) =>
      filterAndroidDialAddresses(
        addresses,
        this.managedRelays?.eligibleDialAddresses(addresses)
      )
    );
    this.pairedConnections = createPairedPeerConnectionManager({
      transport: this.transport,
      getPairedPeers: activeMemberReconnectPeers(this.identitySvc),
    });
    this.liveClipGossip = createLiveClipGossip({
      transport: this.transport,
      membershipStatus: (peerId) => this.identitySvc.membershipStatus(peerId),
    });
    this.historyReconciliation = createHistoryReconciliation({
      transport: this.transport,
      history: this.history,
      getLocalDeviceId: async () => (await this.identitySvc.get()).deviceId,
      membershipStatus: (peerId) => this.identitySvc.membershipStatus(peerId),
      onMembershipChanged: (listener) =>
        this.identitySvc.onMembershipChanged(listener),
      autoSync: this.autoSync,
    });
    this.clipboardSync.bindLiveGossip(this.liveClipGossip);
    this.membershipReconciler = createMembershipReconciler({
      transport: this.transport,
      identity: this.identitySvc,
      ...createMembershipPeerRecordBridge({
        transport: this.transport,
        identity: this.identitySvc,
      }),
      onLocalRevoked: () => this.identityRotationLifecycle.rotateRevoked(),
      onChanged: () => this.emitState(),
    });
    this.membershipReconciler.start();

    this.transport.onPeerConnected(() => void this.emitState());
    this.transport.onPeerDisconnected(() => void this.emitState());
    this.transport.onRelayConnectionChanged?.(() => void this.emitState());
    this.transport.onSelfPeerUpdate((multiaddrs) => {
      if (this.workFence.isFenced()) return;
      void this.identitySvc
        .updateMultiaddrs(multiaddrs)
        .then(() => this.emitState());
    });
  }
  private createAndroidClipboardService() {
    return composeAndroidClipboard({
      history: this.history,
      appliedSharingLifetime: () => this.sharingLifetimeMs,
      getSenderId: async () => {
        const id = await this.identitySvc.get();
        return id.deviceId;
      },
      readText: async () => {
        try {
          return (await readClipboardText()) ?? "";
        } catch {
          return "";
        }
      },
      writeText: async (text: string) => {
        await this.workFence.run(() => writeClipboardText(text));
      },
      onHistoryErrorChanged: (error) => {
        this.clipboardHistoryError = error;
        void this.emitState();
      },
    });
  }

  private readonly clipboard = this.createAndroidClipboardService();
  private readonly clipboardSync = createClipboardSyncManager({
    clipboard: this.clipboard,
    history: this.history,
    isActiveMember: async (peerId) =>
      (await this.identitySvc.membershipStatus(peerId)) === "active",
    getLocalDeviceId: async () => {
      const id = await this.identitySvc.get();
      return id.deviceId;
    },
    onAutoSyncChanged: (enabled) =>
      this.historyReconciliation?.setAutoSync(enabled),
    onLiveClipboardApplication: (clip, result) =>
      this.backgroundContinuity.recordLiveClipboardApplication(clip, result),
  });

  private pendingRequests: PendingRequest[] = [];
  private localRetentionMs = RETENTION_MS;
  private autoSync = true;
  private clipboardHistoryError: RuntimeClipboardHistoryError | null = null;
  private historyPolicyError: HistoryPolicyError | null = null;
  private identityRotationRecovery = false;
  private listeners: Array<(state: AndroidAppState) => void> = [];
  private started = false;
  private eventsBound = false;
  private lastPairingAttempt: PairingAttemptDiagnostics | null = null;
  private pairingAttemptSeq = 0;
  private runtimeShutdownHandler: (() => void | Promise<void>) | null = null;
  private historyRetentionCleanup: HistoryRetentionCleanup | null = null;
  private readonly notificationSelection = createRuntimeNotificationSelection();
  private readonly approvalEntries = createRuntimeApprovalEntries();
  async getApprovalEntries() {
    return this.workFence.isFenced() ? [] : this.approvalEntries.read();
  }
  async acknowledgeApprovalEntry(id: string) {
    this.approvalEntries.acknowledge(id);
  }
  onApprovalEntriesChanged(listener: () => void) {
    return this.approvalEntries.onChanged(listener);
  }
  private readonly backgroundNative = createAndroidBackgroundNative();
  private readonly notificationStatus = createRuntimeNotificationStatus({
    inspect: async () => {
      if (Capacitor.getPlatform() !== "android")
        return {
          app:
            typeof Notification === "undefined"
              ? "unsupported"
              : Notification.permission === "granted"
                ? "available"
                : Notification.permission === "denied"
                  ? "blocked"
                  : "unknown",
          channel: "not-applicable",
        };
      // Loads the plugin's existing default channel before inspecting it. Never prompts.
      await LocalNotifications.checkPermissions();
      return (
        (await this.backgroundNative.pairingNotificationAvailability?.()) ?? {
          app: "unknown",
          channel: "unknown",
        }
      );
    },
    openSettings: async () => {
      if (!this.backgroundNative.openPairingNotificationSettings)
        throw new Error("notification_settings_unavailable");
      await this.backgroundNative.openPairingNotificationSettings();
    },
    requestPermission: async () => {
      await LocalNotifications.requestPermissions();
    },
  });
  getNotificationAvailability() {
    return this.notificationStatus.refresh();
  }
  openNotificationSettings() {
    return this.notificationStatus.openSettings();
  }
  requestNotificationPermission() {
    return this.notificationStatus.requestPermission();
  }
  onNotificationAvailabilityChanged(listener: () => void) {
    return this.notificationStatus.onChanged(listener);
  }
  private androidApiLevel: number | undefined;
  private backgroundEventsBound = false;
  private readonly backgroundContinuity =
    createAndroidBackgroundContinuityCoordinator(
      {
        androidApiLevel: () => this.androidApiLevel,
        notificationAvailability: () =>
          this.backgroundNative.notificationAvailability(),
        readEnabled: () => this.backgroundNative.enabled(),
        readServiceState: () => this.backgroundNative.serviceState(),
        readAutoSync: async () => {
          await this.settingsHandler.read();
          return this.autoSync;
        },
        writeEnabled: (enabled) => this.backgroundNative.setEnabled(enabled),
        setClipboardCaptureEligible: async (eligible) => {
          this.clipboard.setPollingEnabled?.(eligible);
        },
        resetClipboardBaseline: async () => {
          await this.clipboard.resetObservationBaseline?.();
        },
        setAutoSync: async (enabled) => {
          return await this.setAutoSyncPreference(enabled);
        },
        startService: (autoSync) => this.backgroundNative.start(autoSync),
        stopService: () => this.backgroundNative.stop(),
        sendHeartbeat: () => this.backgroundNative.heartbeat(),
        updateService: (state, connectedTrustedDeviceCount, autoSync) =>
          this.backgroundNative.update(
            state,
            connectedTrustedDeviceCount,
            autoSync
          ),
        showReconnectNotification: () =>
          this.backgroundNative.showReconnectNotification(),
        readDiagnosticStatus: () => this.backgroundNative.diagnosticStatus(),
        listExplicitTextActions: () =>
          this.backgroundNative.explicitTextActions(),
        prepareExplicitTextAction: (actionId, event) =>
          this.backgroundNative.prepareExplicitTextAction(actionId, event),
        completeExplicitTextAction: (actionId) =>
          this.backgroundNative.completeExplicitTextAction(actionId),
        readAcceptedExplicitTextAction: async (action) => {
          const [item, identity] = await Promise.all([
            this.history.getById(action.event.clipId),
            this.identitySvc.get(),
          ]);
          const clip = item?.clip;
          return clip &&
            clip.originPeerId === identity.deviceId &&
            clip.content === action.text &&
            clip.capturedAt === action.event.capturedAt &&
            (action.event.sharingLifetimeMs === undefined ||
              clip.shareExpiresAt - clip.capturedAt ===
                action.event.sharingLifetimeMs)
            ? clip
            : null;
        },
        captureExplicitText: (action) =>
          this.clipboard.processLocalText(action.text, {
            shareNow: true,
            event: action.event,
          }),
        showExplicitTextFeedback: (state) =>
          this.backgroundNative.showExplicitTextFeedback(state),
        readPendingClipboardApplication: () =>
          this.backgroundNative.pendingClipboardApplication(),
        writePendingClipboardApplication: (clipId) =>
          this.backgroundNative.setPendingClipboardApplication(clipId),
        clearPendingClipboardApplication: () =>
          this.backgroundNative.clearPendingClipboardApplication(),
        removeClip: (clipId) => this.history.remove(clipId),
        clearHistory: () =>
          this.clipboard.clearHistory(() => this.history.clearAll()),
        readRetainedLiveClip: async (clipId) => {
          const item = await this.history.getById(clipId);
          return item
            ? { clip: item.clip, liveHandled: item.liveHandled }
            : null;
        },
        retryRemoteClipboardApplication: async (clip, isEligible) =>
          await this.clipboard.writeRemoteClip(clip, isEligible),
      },
      {
        sharingLifetimeMs: () => this.sharingLifetimeMs,
        workFence: this.workFence,
      }
    );
  private readonly runtimeAdapter = createAndroidRuntimeAdapter({
    storage: this.storage,
    identityKey: IDENTITY_KEY,
    applicationStateKey: "runtimeApplicationState",
    initialApplicationState: () => ({}) as Record<string, unknown>,
    clipboard: {
      readText: () => this.workFence.run(readClipboardText),
      writeText: (text) => this.workFence.run(() => writeClipboardText(text)),
    },
    notifications: {
      show: async (message) => {
        try {
          const permission = await LocalNotifications.checkPermissions();
          await this.notificationStatus.refresh();
          if (permission.display !== "granted") return;
          this.workFence.assertOpen();
          await this.workFence.run(() =>
            LocalNotifications.schedule({
              notifications: [
                {
                  id: nativeNotificationId(message.id),
                  title: message.title,
                  body: message.body,
                  channelId: "default",
                  extra: {
                    runtimeNotificationId: message.id,
                    runtimeNotificationInstance: message.instance,
                  },
                },
              ],
            })
          );
          this.notificationStatus.shown();
        } catch (err) {
          this.notificationStatus.failed(err);
          if (
            Capacitor.getPlatform() === "android" ||
            typeof Notification === "undefined"
          ) {
            log.warn("Failed to show pairing request notification", err);
            return;
          }
          this.workFence.assertOpen();
          const notification = new Notification(message.title, {
            body: message.body,
            tag: message.id,
          });
          notification.onclick = () => {
            if (!this.workFence.isFenced())
              this.notificationSelection.emit(message.id, message.instance);
          };
        }
      },
      async dismiss(id) {
        await LocalNotifications.cancel({
          notifications: [{ id: nativeNotificationId(id) }],
        });
      },
      onSelect: this.notificationSelection.onSelect,
      clearSelections: this.notificationSelection.clear,
    },
    lifecycle: {
      onShutdown: (handler) => {
        this.runtimeShutdownHandler = handler;
        return () => {
          if (this.runtimeShutdownHandler === handler)
            this.runtimeShutdownHandler = null;
        };
      },
      openApprovalView: (selection) => {
        if (this.workFence.isFenced()) return;
        this.approvalEntries.select(selection ?? { id: uuidv4() });
        window.focus();
      },
    },
    network: createRuntimeNetworkProxy(() => this.transport),
    clock: systemRuntimeClock,
    publicState: {
      read: () => this.getState(),
      publish: (state) => {
        this.listeners.forEach((listener) => listener(state));
      },
    },
    relays: {
      readAddresses: () => this.getRelayAddresses(),
    },
  });
  private readonly pairingPending = createPendingTrustRequestCoordinator({
    localPeerId: async () =>
      deviceIdToPeerId((await this.identitySvc.get()).deviceId),
    store: createAndroidPendingTrustRequestStore(
      this.rawStorage,
      this.workFence
    ),
    notifications: this.runtimeAdapter.notifications,
    lifecycle: this.runtimeAdapter.lifecycle,
    clock: systemRuntimeClock,
    verify: verifyPairingTrustRequestSignature,
    membership: this.identitySvc,
    sendResponse: async (peerId, frame) =>
      this.workFence.run(() =>
        this.transport!.send(PAIRING_PROTOCOL, peerId, frame)
      ),
    responseIdentity: async () => {
      const identity = await this.identitySvc.get();
      return {
        deviceName: identity.deviceName,
        nameRevision: BigInt(identity.nameRevision ?? 0),
      };
    },
    connectionPath: (remotePeerId) => {
      const path = this.transport
        ?.getPeerConnectionInfo?.()
        .find((entry) => entry.peerId === remotePeerId)?.path;
      return path === "relay" ? "relayed" : (path ?? "unknown");
    },
    onRejected: (diagnostic) => {
      log.warn(diagnostic.event, diagnostic);
      if (diagnostic.authenticatedPeerId)
        void this.identitySvc
          .membershipStatus(diagnostic.authenticatedPeerId)
          .then((status) => {
            if (status !== "active")
              return this.transport?.disconnect?.(
                diagnostic.authenticatedPeerId!
              );
          });
    },
    onChanged: async (requests) => {
      this.pendingRequests = requests.map((request) => ({
        deviceId: request.initiatorPeerId,
        deviceName: request.deviceName,
        requestVersion: request.requestVersion,
      }));
      await this.emitState();
    },
  });
  private pairingInboundBound = false;
  private readonly pairingSessions = createPairingRuntimeSessions({
    identity: async () => {
      const current = await this.identitySvc.get();
      return {
        peerId: await deviceIdToPeerId(current.deviceId),
        deviceName: current.deviceName,
        nameRevision: current.nameRevision ?? 0,
      };
    },
    send: (targetPeerId, frame) =>
      this.workFence.run(() =>
        this.transport!.send(PAIRING_PROTOCOL, targetPeerId, frame)
      ),
    sign: async (bytes) => {
      const identity = await this.identitySvc.get();
      if (!identity.privateKey) throw new Error("identity_unavailable");
      return privateKeyFromProtobuf(
        Uint8Array.from(Buffer.from(identity.privateKey, "base64"))
      ).sign(bytes);
    },
    verify: verifyPairingTrustRequestSignature,
    membership: this.identitySvc,
    clock: systemRuntimeClock,
    connectionPath: (remotePeerId) => {
      const path = this.transport
        ?.getPeerConnectionInfo?.()
        .find((entry) => entry.peerId === remotePeerId)?.path;
      return path === "relay" ? "relayed" : (path ?? "unknown");
    },
    onRejected: (diagnostic) => {
      log.warn(diagnostic.event, diagnostic);
      if (diagnostic.authenticatedPeerId)
        void this.identitySvc
          .membershipStatus(diagnostic.authenticatedPeerId)
          .then((status) => {
            if (status !== "active")
              return this.transport?.disconnect?.(
                diagnostic.authenticatedPeerId!
              );
          });
    },
    onChanged: () => this.emitState(),
  });
  private readonly runtime = createRuntimeOrchestrator({
    adapter: this.runtimeAdapter,
    start: () => this.startServices(),
    stop: () => this.stopServices(),
  });

  private async getRelayAddresses(): Promise<string[]> {
    return [];
  }

  private relayConfigurationStore() {
    return {
      readNewModel: () =>
        this.storage
          .get<RelayConfiguration[]>("managedRelayConfigurations")
          .then((value) => value ?? null),
      writeNewModel: (values: RelayConfiguration[]) =>
        this.storage.set("managedRelayConfigurations", values),
    };
  }

  private async startManagedRelays(): Promise<void> {
    const transport = this.transport as typeof this.transport & {
      managedRelayHost(
        onClosed?: (connection: ManagedRelayConnection) => void
      ): AndroidManagedRelayHost;
    };
    if (!transport) return;
    const host = transport.managedRelayHost((connection) => {
      const controller = this.managedRelays;
      for (const state of controller?.states() ?? []) {
        if (state.peerId === connection.verifiedPeerId)
          void controller?.connectionLost(state.key, connection);
      }
    });
    const controller = new ManagedRelayController(
      createAndroidManagedRelayAdapter(
        host,
        this.relayAuth,
        this.relaySecrets,
        () => void this.emitState()
      )
    );
    this.managedRelays = controller;
    await controller.setConfigurations(this.managedRelayConfigurations);
  }

  private bindEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    this.history.onChanged(() => {
      void this.emitState();
    });
  }

  private async setBackgroundActivityState(): Promise<void> {
    await this.backgroundContinuity.setActivityState({
      resumed: document.visibilityState === "visible",
      windowFocused: document.hasFocus(),
    });
  }

  private async settleBackgroundLifecycleEvent(
    operation: () => Promise<unknown>
  ): Promise<void> {
    if (this.workFence.isFenced()) return;
    try {
      await this.workFence.run(operation);
    } catch {
      this.backgroundContinuity.markControlStateUnknown();
    }
    try {
      await this.emitState();
    } catch (error) {
      log.warn("Background lifecycle state could not be published", error);
    }
  }

  private bindBackgroundContinuityEvents(): void {
    if (this.backgroundEventsBound) return;
    this.backgroundEventsBound = true;

    const updateActivity = () => {
      if (this.workFence.isFenced()) return;
      void this.workFence.run(() =>
        this.setBackgroundActivityState()
          .then(() => this.emitState())
          .catch(() => this.emitState())
      );
    };
    window.addEventListener("focus", updateActivity);
    window.addEventListener("blur", updateActivity);
    document.addEventListener("visibilitychange", updateActivity);

    void this.backgroundNative.on("activityState", (event) => {
      if (this.workFence.isFenced()) return;
      const resumed = event.resumed === true;
      const windowFocused = event.windowFocused === true;
      void this.workFence.run(() =>
        this.backgroundContinuity
          .setActivityState({ resumed, windowFocused })
          .then(async () => {
            if (resumed) await this.refreshBackgroundContinuity();
            else await this.emitState();
          })
          .catch(() => this.emitState())
      );
    });
    void this.backgroundNative.on("action", (event) => {
      if (this.workFence.isFenced()) return;
      const action = event.action;
      if (action !== "pause" && action !== "resume" && action !== "stop")
        return;
      void this.workFence.run(() =>
        this.backgroundContinuity
          .handleNotificationAction(
            action as AndroidBackgroundNotificationAction,
            () =>
              this.backgroundNative.isActionCurrent(event.actionToken, action)
          )
          .then(
            () => this.emitState(),
            async () => {
              await this.emitState();
              if (this.workFence.isFenced()) return;
              await this.backgroundNative.showControlFeedback(
                this.backgroundContinuity.snapshot().controlError ??
                  "The action could not be confirmed."
              );
            }
          )
      );
    });
    void this.backgroundNative.on("explicitText", () => {
      if (this.workFence.isFenced()) return;
      void this.backgroundContinuity.handleExplicitTextActionsAvailable();
    });
  }

  private createPairingDiagnostics(
    inputLength: number
  ): PairingAttemptDiagnostics {
    this.pairingAttemptSeq += 1;
    return {
      attemptId: `${Date.now().toString(36)}-${this.pairingAttemptSeq}`,
      status: "running",
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      inputLength,
    };
  }

  private finishPairingDiagnostics(
    diagnostics: PairingAttemptDiagnostics,
    status: "succeeded" | "failed",
    error: PairingFailureCode | null
  ): PairingAttemptDiagnostics {
    diagnostics.status = status;
    diagnostics.error = error;
    diagnostics.finishedAt = Date.now();
    diagnostics.durationMs = diagnostics.finishedAt - diagnostics.startedAt;
    this.lastPairingAttempt = diagnostics;
    return diagnostics;
  }

  private async emitState() {
    await this.runtime.publishState();
  }

  private async startServices() {
    if (this.started) return;
    this.sharingLifetimeMs = normalizeSharingLifetime(
      await this.storage.get<unknown>("sharingLifetimeMs")
    );
    await startIdentityBoundRuntimeServices({
      workFence: this.workFence,
      onServicesStarted: () => this.identityRotationLifecycle.servicesStarted(),
      initializeIdentity: async () => {
        const initialized = await this.identityRotationLifecycle.initialize();
        if (initialized.localServicesEnabled !== false)
          this.identityStartupInspected = true;
        return initialized;
      },
      startLocalServices: async () => {
        await this.identityResetRuntime.openRuntime();
        this.bindEvents();
        this.bindBackgroundContinuityEvents();
        this.androidApiLevel = await this.backgroundNative.apiLevel();
        const backgroundState = await this.backgroundContinuity.initialize();
        if (await this.backgroundNative.userStopped()) {
          await this.backgroundContinuity.setEnabledFromUser(false);
        } else if (backgroundState.backgroundEnabled) {
          await this.backgroundContinuity.setEnabledFromUser(true);
        }
        await this.settingsHandler.read();
        this.managedRelayConfigurations = await loadManagedRelayConfigurations(
          this.relayConfigurationStore()
        );
        if (!this.removeRelayCallback) {
          this.removeRelayCallback = await this.relaySecrets.onCallback(
            (url) => {
              if (this.workFence.isFenced()) return;
              void this.relayAuth
                .acceptCallback(url)
                .then((accepted) => {
                  if (accepted) void this.emitState();
                })
                .catch(() => undefined);
            }
          );
        }
        this.clipboardSync.setAutoSync(this.autoSync);
        await this.backgroundContinuity.reflectAutoSync(this.autoSync);
        this.historyRetentionCleanup ??= startHistoryRetentionCleanup(
          {
            pruneExpired: async () => {
              const maintenance = await this.retentionPreference.maintain();
              if (maintenance.recovered) {
                const snapshot = await this.settingsHandler.read();
                for (const listener of this.settingsListeners)
                  listener(snapshot);
              }
            },
          },
          undefined,
          (error) => {
            this.historyPolicyError = error ? "history_cleanup_failed" : null;
            void this.emitState();
          }
        );
        this.started = true;
        if (this.identityRotationLifecycle.startLocalOnlyIfRecovering()) return;
        this.pairingSessions.start();
        await this.pairingPending.start();
        this.clipboardSync.start();
        await this.setBackgroundActivityState();
        // A retained resume can drain before capture starts and consume the
        // resume transition. Retry durable ingress now that capture is ready.
        await this.backgroundContinuity.handleExplicitTextActionsAvailable();
        this.backgroundContinuity.startRuntimeHeartbeat();
      },
      startNetworkServices: async () => {
        await this.ensureMessaging();
        if (!this.pairingInboundBound) {
          this.pairingInboundBound = true;
          this.transport!.onMessage(PAIRING_PROTOCOL, (from, frame) => {
            if (this.workFence.isFenced()) return;
            void this.pairingSessions
              .receive(from, frame, (peerId, requestFrame) =>
                this.pairingPending.receive(peerId, requestFrame)
              )
              .catch((error) =>
                log.warn("Pairing message processing failed", error)
              );
          });
        }
        await this.workFence.run(() => this.transport!.start());
        this.workFence.assertOpen();
        await this.startManagedRelays();
        this.workFence.assertOpen();
        this.pairedConnections?.start();
        this.historyReconciliation?.start();
      },
      onNetworkingFailure: (error) => {
        log.warn("Messaging transport failed to start", error);
      },
    });
  }

  private async stopServices() {
    if (!this.started) return;
    await this.stopIdentityBoundServices();
  }

  private async stopIdentityBoundServices(strict = false) {
    this.approvalEntries.clear();
    this.notificationSelection.clear();
    this.removeRelayCallback?.();
    this.removeRelayCallback = null;
    const relayStop = this.managedRelays?.stop();
    if (strict) await relayStop;
    else
      await relayStop?.catch((error) =>
        log.warn("Managed relay cleanup timed out", error)
      );
    this.backgroundContinuity.stopRuntimeHeartbeat();
    this.historyRetentionCleanup?.stop();
    this.historyRetentionCleanup = null;
    this.membershipReconciler?.stop();
    try {
      await stopIdentityBoundRuntimeServices([
        () => this.pairingSessions.stop(),
        () => this.pairingPending.stop(),
        () => this.clipboardSync.stop(),
        () => this.historyReconciliation?.stop(),
        () => this.pairedConnections?.stop(),
        () => this.transport?.stop(),
      ]);
    } finally {
      this.historyReconciliation = null;
      this.managedRelays = null;
      this.membershipReconciler = null;
      this.started = false;
    }
  }

  start() {
    this.workFence.assertOpen();
    return this.runtime.start();
  }

  async stop() {
    await (this.runtimeShutdownHandler
      ? Promise.resolve(this.runtimeShutdownHandler())
      : this.runtime.stop());
    await this.backgroundContinuity.handleTaskRemoved();
  }

  onUpdate(cb: (state: AndroidAppState) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async getRuntimeAuthority(): Promise<string> {
    return this.pairingSessions.snapshot().sessionId;
  }

  async dismissPairingOutcome(
    targetPeerId: string,
    expected: { sessionId: string; revision: number }
  ): Promise<boolean> {
    return this.pairingSessions.dismissOutcome(targetPeerId, expected);
  }

  async getState(): Promise<AndroidAppState> {
    if (!this.identityStartupInspected || this.workFence.isFenced())
      return {
        clips: [],
        devices: [],
        pending: [],
        peers: [],
        identity: null,
        pinnedIds: [],
        identityRotationRecovery:
          this.identityRotationRecovery || this.workFence.isFenced(),
        identityResetState: this.identityResetState,
        relayAddresses: [],
        localRetentionMs: this.localRetentionMs,
        autoSync: this.autoSync,
        backgroundContinuity: this.backgroundContinuity.snapshot(),
      };
    const generation = this.workFence.generation();
    const pairingState = this.pairingSessions.snapshot();
    const historyProjection = await this.historyState.read();
    const devices = await this.identitySvc.trustedDevices();
    const identity = this.identityRotationRecovery
      ? null
      : toPublicDeviceIdentity(await this.identitySvc.get());
    const peers = this.transport?.getConnectedPeers?.() ?? [];
    const connectedTrustedDeviceCount = (
      await Promise.all(
        peers.map(
          async (peerId) =>
            (await this.identitySvc.membershipStatus(peerId)) === "active"
        )
      )
    ).filter(Boolean).length;
    await this.backgroundContinuity.setConnection(connectedTrustedDeviceCount);
    const peerConnections = this.transport?.getPeerConnectionInfo?.() ?? [];
    const relayConnections = this.transport?.getRelayConnectionInfo?.() ?? [];
    const relayAddresses = await this.getRelayAddresses();
    const managedRelayStates = (this.managedRelays?.states() ?? []).map(
      (state) => {
        const config = this.managedRelayConfigurations.find(
          (item) => item.key === state.key
        );
        const warning =
          config?.kind === "managed"
            ? this.relayAuth.warning(config.discoveryUrl)
            : undefined;
        return warning ? { ...state, warning } : state;
      }
    );

    const state: AndroidAppState = {
      clips: historyProjection.clips,
      devices,
      pending: this.pendingRequests,
      waiting: pairingState.waiting,
      pairingErrors: pairingState.errors,
      pairingState,
      peers,
      connectionStateKnown:
        Boolean(this.transport) &&
        !this.identityRotationRecovery &&
        !this.workFence.isFenced(),
      peerConnections,
      relayConnections,
      identity,
      pinnedIds: historyProjection.pinnedIds,
      historyUnavailable: historyProjection.historyUnavailable,
      historyRefreshError: historyProjection.historyRefreshError,
      localRetentionMs: this.localRetentionMs,
      autoSync: this.clipboardSync.isAutoSync(),
      clipboardHistoryError: this.clipboardHistoryError,
      historyPolicyError: this.historyPolicyError,
      identityRotationRecovery: this.identityRotationRecovery,
      identityResetState: this.identityResetState,
      identityRotationNotice:
        (await this.identityRotation.notice())?.reason ?? null,
      relayAddresses,
      managedRelayConfigurations: this.managedRelayConfigurations,
      managedRelayStates,
      diagnostics: {
        lastPairingAttempt: this.lastPairingAttempt,
      },
      backgroundContinuity: this.backgroundContinuity.snapshot(),
    };
    this.workFence.assertOpen(generation);
    return state;
  }

  async deleteClip(id: string) {
    this.assertIdentityWorkReady();
    await this.backgroundContinuity.removeClip(id);
    await this.emitState();
  }

  async reuseClip(id: string) {
    this.assertIdentityWorkReady();
    const outcome = await reuseRetainedClip(id, {
      history: this.history,
      clipboard: this.clipboard,
    });
    await this.emitState();
    return outcome.status;
  }

  async clearHistory() {
    this.assertIdentityWorkReady();
    try {
      await this.backgroundContinuity.clearHistory();
    } finally {
      await this.emitState();
    }
  }

  async unpairDevice(id: string) {
    this.assertIdentityWorkReady();
    await this.identitySvc.revoke(id);
    await this.emitState();
  }

  async renameDevice(id: string, name: string): Promise<Device | null> {
    this.assertIdentityWorkReady();
    const device = await this.identitySvc.setLocalDeviceAlias(id, name);
    await this.emitState();
    return device;
  }

  async renameIdentity(
    name: string,
    expectedDeviceId: string
  ): Promise<Identity | null> {
    this.assertIdentityWorkReady();
    await this.identitySvc.rename(name, expectedDeviceId);
    const identity = await this.getIdentity();
    await this.emitState();
    return identity;
  }

  async acceptRequest(dev: PendingRequest) {
    this.assertIdentityWorkReady();
    const result = await this.pairingPending.decide(
      dev.deviceId,
      "accepted",
      dev.requestVersion
    );
    try {
      await this.emitState();
    } catch {
      if (result.ok)
        return {
          ok: false as const,
          error: "cleanup_failed" as const,
          admitted: result.admitted,
        };
    }
    return result;
  }

  async rejectRequest(dev: PendingRequest) {
    this.assertIdentityWorkReady();
    const result = await this.pairingPending.decide(
      dev.deviceId,
      "rejected",
      dev.requestVersion
    );
    try {
      await this.emitState();
    } catch {
      if (result.ok)
        return {
          ok: false as const,
          error: "cleanup_failed" as const,
          admitted: result.admitted,
        };
    }
    return result;
  }

  async setPinned(id: string, pinned: boolean) {
    this.assertIdentityWorkReady();
    const pinnedIds = await this.history.setPinned(id, pinned);
    await this.emitState();
    return pinnedIds;
  }

  dismissClipboardHistoryError() {
    this.clipboard.dismissHistoryError?.();
  }

  async retryHistoryCleanup() {
    this.assertIdentityWorkReady();
    await this.historyRetentionCleanup?.retry();
  }

  async acknowledgeIdentityRotationNotice() {
    this.assertIdentityWorkReady();
    await this.identityRotation.acknowledgeNotice();
    await this.emitState();
  }

  async setLocalRetention(retentionMs: number) {
    this.workFence.assertOpen();
    return this.settingsHandler.write({ localRetentionMs: retentionMs });
  }

  private relayMutationOwner = createRelayMutationOwner({
    read: () => this.managedRelayConfigurations,
    load: async () =>
      (await this.relayConfigurationStore().readNewModel()) ?? [],
    erase: (url) => this.relayAuth.erase(url),
    write: async (next) => {
      await saveManagedRelayConfigurations(
        this.relayConfigurationStore(),
        next
      );
    },
    accept: (next) => {
      this.managedRelayConfigurations = next;
    },
    apply: async (next) => {
      const ordered = next.map((config) =>
        config.kind === "explicit"
          ? { ...config, addresses: androidRelayAddressOrder(config.addresses) }
          : config
      );
      if (!this.managedRelays)
        throw new Error("managed_relay_host_unavailable");
      await this.managedRelays.setConfigurations(ordered);
    },
    reconcile: () => this.emitState(),
  });
  async refreshManagedRelays() {
    return this.relayMutationOwner.refresh();
  }
  async mutateManagedRelay(mutation: RelayMutation) {
    this.workFence.assertOpen();
    return this.relayMutationOwner.mutate(mutation);
  }
  async loginManagedRelay(key: string) {
    this.workFence.assertOpen();
    return performRelayAction(
      "authenticated",
      async () => {
        if (!this.managedRelays)
          throw new Error("managed_relay_host_unavailable");
        return this.managedRelays.requestLogin(key);
      },
      () => this.emitState()
    );
  }
  async openManagedRelayAccount(key: string) {
    this.workFence.assertOpen();
    return performRelayAction(
      "portal-opened",
      async () => {
        if (!this.managedRelays)
          throw new Error("managed_relay_host_unavailable");
        await this.managedRelays.manageAccount(key);
      },
      () => this.emitState()
    );
  }
  async retryManagedRelay(key: string) {
    this.workFence.assertOpen();
    return performRelayAction(
      "retry-requested",
      async () => {
        if (!this.managedRelays)
          throw new Error("managed_relay_host_unavailable");
        await this.managedRelays.retry(key);
      },
      () => this.emitState()
    );
  }

  private async setAutoSyncPreference(enabled: boolean): Promise<boolean> {
    const result = await this.settingsHandler.write({ autoSync: enabled });
    if (result.status !== "applied") throw new Error(result.error);
    return result.snapshot.state.autoSync;
  }

  async setAutoSync(enabled: boolean) {
    return this.workFence.run(() =>
      performAutoSyncAction(enabled, {
        set: async (value) => {
          await this.backgroundContinuity.setAutoSync(value);
          return this.autoSync;
        },
        recover: async () => {
          const settings = await this.settingsHandler.read();
          await this.backgroundContinuity.reflectAutoSync(
            settings.state.autoSync
          );
        },
        current: () => this.autoSync,
        reconcile: () => this.emitState(),
      })
    );
  }
  async refreshAutoSync() {
    return this.workFence.run(async () => {
      const settings = await this.settingsHandler.read();
      await this.backgroundContinuity.reflectAutoSync(settings.state.autoSync);
      await this.emitState();
      return true;
    });
  }

  async setBackgroundContinuity(enabled: boolean) {
    return this.workFence.run(async () => {
      const results = await Promise.allSettled([
        this.backgroundContinuity.setEnabledFromUser(enabled),
        this.emitState(),
      ]);
      await this.emitState();
      for (const result of results)
        if (result.status === "rejected") throw result.reason;
      return this.backgroundContinuity.snapshot();
    });
  }

  async refreshBackgroundContinuity() {
    return this.workFence.run(async () => {
      try {
        this.androidApiLevel = await this.backgroundNative.apiLevel();
        await this.backgroundContinuity.initialize();
        return true;
      } catch (error) {
        this.backgroundContinuity.markControlStateUnknown();
        throw error;
      } finally {
        await this.emitState();
      }
    });
  }

  async openBackgroundNotificationSettings() {
    await this.backgroundNative.openNotificationSettings();
  }

  async exportBackgroundContinuityDiagnostics(): Promise<void> {
    await this.backgroundNative.exportDiagnostics();
  }

  async getIdentity(): Promise<Identity | null> {
    if (!this.identityStartupInspected) return null;
    const id = await this.identitySvc.get();
    return toPublicDeviceIdentity(id);
  }

  reconcileIdentityReset() {
    return this.identityRotation.reconcileIdentityReset().then((state) => {
      this.identityResetState = state;
      return state;
    });
  }

  async getInitializationError() {
    return this.identitySvc.getInitializationError();
  }

  async retryIdentityInitialization(): Promise<AndroidAppState> {
    this.workFence.assertOpen();
    const reset = await this.identityRotation.reconcileIdentityReset();
    if (reset.phase !== "idle") return this.getState();
    await this.identitySvc.retryInitialization();
    await this.runtime.start();
    return this.getState();
  }

  copyPairingText(text: string) {
    this.workFence.assertOpen();
    return copyPayloadText(text, (value) =>
      CapacitorClipboard.write({ string: value })
    );
  }

  async copyFormerIdentityPeerId(receiptId: string) {
    await this.publishIdentityResetState(
      await this.identityRotation.reconcileIdentityReset()
    );
    const receipt =
      this.identityResetState.phase === "idle"
        ? this.identityResetState.receipt
        : this.identityResetState.phase === "completed"
          ? this.identityResetState.receipt
          : undefined;
    if (!receipt || receipt.receiptId !== receiptId)
      return { status: "rejected" as const };
    return copyPayloadText(receipt.formerPeerId, (value) =>
      CapacitorClipboard.write({ string: value })
    );
  }

  async getPairingCode(): Promise<PairingCode | null> {
    this.assertIdentityWorkReady();
    const generation = this.workFence.generation();
    const id = await this.identitySvc.get();
    await this.ensureMessaging();
    await this.workFence.run(() => this.transport!.start());
    if (!this.transport!.getSignedPeerRecord)
      throw new Error("signed_peer_record_unavailable");
    const signedPeerRecord = await this.transport!.getSignedPeerRecord();
    const text = encodePairingTarget({
      targetPeerId: await deviceIdToPeerId(id.deviceId),
      signedPeerRecord,
      deviceNameHint: id.deviceName,
    });
    const code = await createPairingCode(text);
    this.workFence.assertOpen(generation);
    return code;
  }

  async pairFromText(txt: string): Promise<PairingResult> {
    this.assertIdentityWorkReady();
    const diagnostics = this.createPairingDiagnostics(
      typeof txt === "string" ? txt.length : 0
    );
    this.lastPairingAttempt = diagnostics;
    logPairing("info", "Pairing attempt started", {
      attemptId: diagnostics.attemptId,
      inputLength: diagnostics.inputLength,
    });

    const fail = async (error: PairingFailureCode): Promise<PairingResult> => {
      const finished = this.finishPairingDiagnostics(
        diagnostics,
        "failed",
        error
      );
      logPairing("warn", "Pairing attempt failed", {
        attemptId: finished.attemptId,
        error,
        durationMs: finished.durationMs,
      });
      await this.emitState();
      return { ok: false, error, diagnostics: finished };
    };

    try {
      const target = decodePairingTarget(txt);
      if (!target) return fail("invalid");
      await this.ensureMessaging();
      await this.workFence.run(() => this.transport!.start());
      const localIdentity = await this.identitySvc.get();
      if (!localIdentity.privateKey) return fail("invalid");
      await importPairingTargetAndRequest({
        text: txt,
        network: this.workFence.protect(this.transport!),
        request: (...args) =>
          this.workFence.run(() => this.pairingSessions.request(...args)),
      });
      return {
        ok: true,
        diagnostics: this.finishPairingDiagnostics(
          diagnostics,
          "succeeded",
          null
        ),
      };
    } catch {
      logPairing("warn", "Pairing attempt failed unexpectedly", {
        attemptId: diagnostics.attemptId,
        error: "unexpected",
      });
      return fail(diagnostics.error ?? "dial_failed");
    }
  }

  async shareCurrentClipboard() {
    this.assertIdentityWorkReady();
    const text = await this.workFence.run(readClipboardText);
    await this.clipboard.processLocalText(text, { shareNow: true });
    await this.emitState();
  }
}

export function createAndroidRuntime() {
  return AndroidClient.createRuntime();
}

export function createAndroidClient() {
  return createAndroidRuntime().client;
}
