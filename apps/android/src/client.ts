import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import QRCode from "qrcode";
import {
  createAndroidRuntimeAdapter,
  createAutoSyncPreference,
  createRuntimeIdentityManager,
  createRuntimeIdentityRotationCoordinator,
  createRuntimeClipboardService,
  createRuntimeNetworkProxy,
  createRuntimeNotificationSelection,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  startIdentityBoundRuntimeServices,
  systemRuntimeClock,
  type RuntimeClipboardHistoryError,
} from "@core/runtime";
import { createLibp2pMessagingTransport } from "@core/network/engine";
import { createPairedPeerConnectionManager } from "@core/network/pairedConnections";
import { createKVSignedPeerRecordPersistence } from "@core/network/peerRecords";
import { DEFAULT_CIRCUIT_RELAY_ADDRESSES } from "@core/network/constants";
import { deriveRelayPeerMultiaddrs } from "@core/network/relayAddresses";
import { getPeerIdFromMultiaddr } from "@core/network/multiaddrCompat";
import { MemoryHistoryStore, RETENTION_MS, startHistoryRetentionCleanup, type HistoryRetentionCleanup } from "@core/history/store";
import { IndexedDBHistoryBackend } from "@core/history/indexeddb";
import { InMemoryHistoryBackend } from "@core/history/types";
import { createClipboardSyncManager } from "@core/sync/clipboardSync";
import { createHistoryReconciliation } from "@core/sync/historyReconciliation";
import { createLiveClipGossip } from "@core/sync/liveClipGossip";
import { reuseRetainedClip } from "@core/clipboard/explicitActions";
import { PAIRING_PROTOCOL, verifyPairingTrustRequestSignature } from "@core/pairing/protocol";
import { createMembershipPeerRecordBridge, createMembershipReconciler } from "@core/membership/reconciliation";
import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "@core/pairing/pending";
import { createPairingRuntimeSessions } from "@core/pairing/runtimeCoordinator";
import { importPairingTargetAndRequest } from "@core/pairing/target";
import { decodePairingTarget, encodePairingTarget } from "@core/pairing/v2";
import {
  createKVIdentityRepository,
  createKVTrustedDeviceRepository,
  toPublicDeviceIdentity,
  createTrustManager,
  createIdentityScopedStateCleanup,
  IDENTITY_KEY,
  TRUST_KEY,
  type TrustedDevice,
} from "@core/trust";
import type { Clip } from "@core/models/Clip";
import type { Device, HistoryPolicyError, Identity, PairingCode, PairingError, PeerConnectionInfo, PendingRequest, RelayConnectionInfo } from "@clipp/ui";
import * as log from "@core/logger";
import { deviceIdToPeerId, deviceIdToPeerIdObject, peerIdFromPrivateKeyBase64 } from "@core/network/peerId";
import { LocalStorageBackend } from "./storage";
import { Clipboard as CapacitorClipboard } from "@capacitor/clipboard";
import { LocalNotifications } from "@capacitor/local-notifications";

export type AndroidAppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  waiting?: Array<{ targetPeerId: string; expiresAtUnixMs: number }>;
  pairingErrors?: PairingError[];
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  pinnedIds: string[];
  localRetentionMs?: number;
  autoSync?: boolean;
  clipboardHistoryError?: RuntimeClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
  relayAddresses: string[];
  diagnostics?: {
    lastClipboardCheck: number | null;
    lastClipboardPreview: string | null;
    lastClipboardError: string | null;
    lastPairingAttempt: PairingAttemptDiagnostics | null;
  };
};

type PairingFailureCode = "invalid" | "no_target" | "dial_failed";
type PairingAddressSource = "payload" | "derived";
type PairingConnectionPath = "direct" | "relay" | "unknown";

export type PairingCandidateDiagnostics = {
  source: PairingAddressSource;
  addr: string;
  valid: boolean;
  path: PairingConnectionPath;
  peerId: string | null;
  peerIdMatchesTarget: boolean;
  error?: string;
};

export type PairingTransportSnapshot = {
  connectedPeers: string[];
  peerConnections: PeerConnectionInfo[];
  selfMultiaddrs: string[];
};

export type PairingTargetAttemptDiagnostics = {
  target: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  ok: boolean;
  error: string | null;
  before: PairingTransportSnapshot;
  after: PairingTransportSnapshot | null;
};

export type PairingAttemptDiagnostics = {
  attemptId: string;
  status: "running" | "succeeded" | "failed";
  error: PairingFailureCode | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  inputLength: number;
  localDeviceId: string | null;
  targetDeviceId: string | null;
  targetPeerId: string | null;
  relayAddresses: string[];
  providedAddrs: string[];
  derivedAddrs: string[];
  candidates: PairingCandidateDiagnostics[];
  transportStart: {
    attempted: boolean;
    ok: boolean;
    startedAt: number | null;
    finishedAt: number | null;
    durationMs: number | null;
    error: string | null;
  };
  targetAttempts: PairingTargetAttemptDiagnostics[];
};

export type PairingResult =
  | { ok: true; diagnostics: PairingAttemptDiagnostics }
  | { ok: false; error: PairingFailureCode; diagnostics: PairingAttemptDiagnostics };

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "unknown_error");
}

function nativeNotificationId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash || 1);
}

function connectionPathForAddr(addr: unknown): PairingConnectionPath {
  const value = typeof (addr as any)?.toString === "function" ? (addr as any).toString() : String(addr || "");
  if (!value) return "unknown";
  if (value.includes("/webrtc") && !value.includes("/p2p-webrtc-star")) return "direct";
  if (value.includes("/p2p-circuit")) return "relay";
  if (value.startsWith("/")) return "direct";
  return "unknown";
}

function isLoopbackMultiaddr(addr: string): boolean {
  return addr.includes("/ip4/127.") || addr.includes("/ip6/::1") || addr.includes("/dns4/localhost") || addr.includes("/dns6/localhost");
}

function pairingTargetPriority(addr: string): number {
  if (addr.includes("/webrtc") && !addr.includes("/p2p-webrtc-star")) return 0;
  if (addr.includes("/webrtc-direct")) return 0;
  if (addr.includes("/p2p-circuit") || addr.includes("/p2p-webrtc-star")) return 1;
  if (addr.includes("/wss")) return 2;
  if (isLoopbackMultiaddr(addr)) return 4;
  return 3;
}

function canDerivePairingAddress(addr: string): boolean {
  return addr.includes("/p2p-webrtc-star");
}

function orderPairingTargets(addrs: Multiaddr[]): Multiaddr[] {
  return [...addrs].sort((a, b) => {
    const aText = a.toString();
    const bText = b.toString();
    return pairingTargetPriority(aText) - pairingTargetPriority(bText);
  });
}

function logPairing(level: "debug" | "info" | "warn", message: string, data: unknown): void {
  const prefixed = `[clipp:android:pairing] ${message}`;
  const payload = serializeLogPayload(data);
  if (level === "warn") log.warn(prefixed, payload);
  else if (level === "info") log.info(prefixed, payload);
  else log.debug(prefixed, payload);
}

function serializeLogPayload(data: unknown): string {
  try {
    return JSON.stringify(data, (_key, value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    });
  } catch {
    return String(data);
  }
}

export class AndroidClient {
  private readonly storage = new LocalStorageBackend();
  private readonly autoSyncPreference = createAutoSyncPreference({ storage: this.storage });
  private readonly historyBackend = createHistoryBackend();
  private readonly history = new MemoryHistoryStore(this.historyBackend);
  private readonly identityRepo = createKVIdentityRepository({ storage: this.storage, key: IDENTITY_KEY });
  private readonly identityRotation = createRuntimeIdentityRotationCoordinator({
    repository: this.identityRepo,
    storage: this.storage,
    capabilities: RUNTIME_CAPABILITIES.android,
    shutdown: () => this.stopServices(),
    clearIdentityScopedState: createIdentityScopedStateCleanup({
      storage: this.storage,
      history: this.historyBackend,
    }),
  });
  private readonly identitySvc = createRuntimeIdentityManager({
    repo: this.identityRepo,
    capabilities: RUNTIME_CAPABILITIES.android,
  });
  private readonly trustRepo = createKVTrustedDeviceRepository({ storage: this.storage, key: TRUST_KEY });
  private readonly trust = createTrustManager({ trustRepo: this.trustRepo, identitySvc: this.identitySvc });
  private transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
  private pairedConnections: ReturnType<typeof createPairedPeerConnectionManager> | null = null;
  private liveClipGossip: ReturnType<typeof createLiveClipGossip> | null = null;
  private historyReconciliation: ReturnType<typeof createHistoryReconciliation> | null = null;
  private membershipReconciler: ReturnType<typeof createMembershipReconciler> | null = null;

  constructor() {
    // messaging is initialised lazily in `start()`
    void LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const id = event.notification.extra?.runtimeNotificationId;
      if (typeof id === "string") {
        this.notificationSelection.emit(id);
      }
    });
  }

  private async ensureMessaging(): Promise<void> {
    if (this.transport && this.liveClipGossip) {
      if (!this.pairedConnections) {
        this.pairedConnections = createPairedPeerConnectionManager({
          transport: this.transport,
          getPairedPeers: () => this.trust.list(),
        });
      }
      return;
    }
    const identity = await this.identitySvc.get();
    const peerId =
      identity.privateKey && typeof identity.privateKey === "string"
        ? await peerIdFromPrivateKeyBase64(identity.privateKey)
        : await deviceIdToPeerIdObject(identity.deviceId);
    const privateKey =
      identity.privateKey && typeof identity.privateKey === "string"
        ? await privateKeyFromProtobuf(base64ToBytes(identity.privateKey))
        : undefined;

    const relayAddresses = await this.getRelayAddresses();
    log.info("[clipp:android:network] Creating messaging transport", {
      peerId: peerId?.toString?.() ?? String(peerId),
      relayAddresses,
      circuitRelays: relayAddresses.filter((addr) => !addr.includes("/p2p-webrtc-star")),
    });
    this.transport = createLibp2pMessagingTransport({
      peerId,
      privateKey,
      relayAddresses,
      enableWebRTCDirect: true,
      enableDCUtR: true,
      enableRelayReservations: true,
      allowInsecureBrowserDials: true,
      signedPeerRecordPersistence: createKVSignedPeerRecordPersistence({ storage: this.storage }),
      isPeerKnown: (remotePeerId) => this.trust.isTrusted(remotePeerId),
      isPeerRevoked: async (remotePeerId) => await this.identitySvc.membershipStatus(remotePeerId) === "revoked",
    });
    this.pairedConnections = createPairedPeerConnectionManager({
      transport: this.transport,
      getPairedPeers: () => this.trust.list(),
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
      onMembershipChanged: (listener) => this.identitySvc.onMembershipChanged(listener),
      autoSync: this.autoSync,
    });
    this.clipboardSync.bindLiveGossip(this.liveClipGossip);
    this.membershipReconciler = createMembershipReconciler({
      transport: this.transport,
      identity: this.identitySvc,
      ...createMembershipPeerRecordBridge({ transport: this.transport, identity: this.identitySvc }),
      onLocalRevoked: async () => {
        await this.identityRotation.rotate("revoked");
        window.location.reload();
      },
      onChanged: () => this.emitState(),
    });
    this.membershipReconciler.start();

    this.transport.onPeerConnected(() => void this.emitState());
    this.transport.onPeerDisconnected(() => void this.emitState());
    this.transport.onRelayConnectionChanged?.(() => void this.emitState());
    this.transport.onSelfPeerUpdate((multiaddrs) => {
      void this.identitySvc.updateMultiaddrs(multiaddrs).then(() => this.emitState());
    });
  }
  private createAndroidClipboardService() {
    return createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.android,
      history: this.history,
      pollIntervalMs: 1500,
      getSenderId: async () => {
        const id = await this.identitySvc.get();
        return id.deviceId;
      },
      readText: async () => {
        try {
          const txt = (await readClipboardText()) ?? "";
          this.lastClipboardCheck = Date.now();
          this.lastClipboardPreview = txt ? txt.slice(0, 140) : "";
          this.lastClipboardError = null;
          return txt;
        } catch (err: any) {
          this.lastClipboardCheck = Date.now();
          this.lastClipboardError = err?.message || "Clipboard unavailable";
          return "";
        }
      },
      writeText: async (text: string) => {
        await writeClipboardText(text);
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
    isActiveMember: async (peerId) => await this.identitySvc.membershipStatus(peerId) === "active",
    getLocalDeviceId: async () => {
      const id = await this.identitySvc.get();
      return id.deviceId;
    },
    onAutoSyncChanged: (enabled) => this.historyReconciliation?.setAutoSync(enabled),
  });

  private pendingRequests: TrustedDevice[] = [];
  private localRetentionMs = RETENTION_MS;
  private autoSync = true;
  private clipboardHistoryError: RuntimeClipboardHistoryError | null = null;
  private historyPolicyError: HistoryPolicyError | null = null;
  private listeners: Array<(state: AndroidAppState) => void> = [];
  private started = false;
  private eventsBound = false;
  private lastClipboardCheck: number | null = null;
  private lastClipboardPreview: string | null = null;
  private lastClipboardError: string | null = null;
  private lastPairingAttempt: PairingAttemptDiagnostics | null = null;
  private pairingAttemptSeq = 0;
  private runtimeShutdownHandler: (() => void | Promise<void>) | null = null;
  private historyRetentionCleanup: HistoryRetentionCleanup | null = null;
  private pendingRetentionMs: number | null = null;
  private readonly notificationSelection = createRuntimeNotificationSelection();
  private readonly runtimeAdapter = createAndroidRuntimeAdapter({
    storage: this.storage,
    identityKey: IDENTITY_KEY,
    applicationStateKey: "runtimeApplicationState",
    initialApplicationState: () => ({} as Record<string, unknown>),
    clipboard: {
      readText: readClipboardText,
      writeText: writeClipboardText,
    },
    notifications: {
      show: async (message) => {
        try {
          let permission = await LocalNotifications.checkPermissions();
          if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
            permission = await LocalNotifications.requestPermissions();
          }
          if (permission.display !== "granted") return;
          await LocalNotifications.schedule({
            notifications: [
              {
                id: nativeNotificationId(message.id),
                title: message.title,
                body: message.body,
                extra: { runtimeNotificationId: message.id },
              },
            ],
          });
        } catch (err) {
          if (typeof Notification === "undefined") {
            log.warn("Failed to show pairing request notification", err);
            return;
          }
          const notification = new Notification(message.title, { body: message.body, tag: message.id });
          notification.onclick = () => this.notificationSelection.emit(message.id);
        }
      },
      async dismiss(id) {
        await LocalNotifications.cancel({ notifications: [{ id: nativeNotificationId(id) }] }).catch(() => {});
      },
      onSelect: this.notificationSelection.onSelect,
    },
    lifecycle: {
      onShutdown: (handler) => {
        this.runtimeShutdownHandler = handler;
        return () => {
          if (this.runtimeShutdownHandler === handler) this.runtimeShutdownHandler = null;
        };
      },
      openApprovalView: () => window.focus(),
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
    localPeerId: async () => deviceIdToPeerId((await this.identitySvc.get()).deviceId),
    store: createKVPendingTrustRequestStore({ storage: this.storage, key: "pairingPendingRequests" }),
    notifications: this.runtimeAdapter.notifications,
    lifecycle: this.runtimeAdapter.lifecycle,
    clock: systemRuntimeClock,
    verify: verifyPairingTrustRequestSignature,
    membership: this.trust,
    sendResponse: async (peerId, frame) => this.transport!.send(PAIRING_PROTOCOL, peerId, frame),
    responseIdentity: async () => { const identity = await this.identitySvc.get(); return { deviceName: identity.deviceName, nameRevision: BigInt(identity.nameRevision ?? 0) }; },
    connectionPath: (remotePeerId) => {
      const path = this.transport?.getPeerConnectionInfo?.().find((entry) => entry.peerId === remotePeerId)?.path;
      return path === "relay" ? "relayed" : path ?? "unknown";
    },
    onRejected: (diagnostic) => {
      log.warn(diagnostic.event, diagnostic);
      if (diagnostic.authenticatedPeerId) void this.trust.isTrusted(diagnostic.authenticatedPeerId).then((trusted) => { if (!trusted) return this.transport?.disconnect?.(diagnostic.authenticatedPeerId!); });
    },
    onChanged: async (requests) => {
      this.pendingRequests = requests.map((request) => ({ deviceId: request.initiatorPeerId, deviceName: request.deviceName, publicKey: "", multiaddrs: [], createdAt: Number(request.expiresAtUnixMs) }));
      await this.emitState();
    },
  });
  private pairingInboundBound = false;
  private readonly pairingSessions = createPairingRuntimeSessions({
    identity: async () => { const current = await this.identitySvc.get(); return { peerId: await deviceIdToPeerId(current.deviceId), deviceName: current.deviceName, nameRevision: current.nameRevision ?? 0 }; },
    send: (targetPeerId, frame) => this.transport!.send(PAIRING_PROTOCOL, targetPeerId, frame),
    sign: async (bytes) => {
      const identity = await this.identitySvc.get();
      if (!identity.privateKey) throw new Error("identity_unavailable");
      return privateKeyFromProtobuf(Uint8Array.from(Buffer.from(identity.privateKey, "base64"))).sign(bytes);
    },
    verify: verifyPairingTrustRequestSignature,
    membership: this.trust,
    clock: systemRuntimeClock,
    connectionPath: (remotePeerId) => {
      const path = this.transport?.getPeerConnectionInfo?.().find((entry) => entry.peerId === remotePeerId)?.path;
      return path === "relay" ? "relayed" : path ?? "unknown";
    },
    onRejected: (diagnostic) => {
      log.warn(diagnostic.event, diagnostic);
      if (diagnostic.authenticatedPeerId) void this.trust.isTrusted(diagnostic.authenticatedPeerId).then((trusted) => { if (!trusted) return this.transport?.disconnect?.(diagnostic.authenticatedPeerId!); });
    },
    onChanged: () => this.emitState(),
  });
  private readonly runtime = createRuntimeOrchestrator({
    adapter: this.runtimeAdapter,
    start: () => this.startServices(),
    stop: () => this.stopServices(),
  });

  private async getRelayAddresses(): Promise<string[]> {
    return [...DEFAULT_CIRCUIT_RELAY_ADDRESSES];
  }

  private async ensureIdentityAddrs(id: any): Promise<any> {
    if (!id) return id;
    const peerId = await deviceIdToPeerId(id.deviceId);
    const current = this.transport?.getSelfMultiaddrs?.() ?? [];
    const existing: string[] = Array.isArray(id.multiaddrs)
      ? id.multiaddrs
      : id.multiaddr
      ? [id.multiaddr]
      : [];
    const fallback = existing.filter((addr) => !addr.includes("/p2p-circuit"));
    const addrs = current.length ? current : fallback;
    id.multiaddrs = addrs;
    id.multiaddr =
      addrs[0] ||
      (typeof id.multiaddr === "string" && !id.multiaddr.includes("/p2p-circuit")
        ? id.multiaddr
        : `/p2p/${peerId}`);
    return id;
  }

  private bindEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    this.history.onNew(async () => {
      await this.emitState();
    });

    this.trust.on("approved", async (d) => {
      this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== d.deviceId);
      await this.emitState();
      void this.pairedConnections?.reconnectNow();
      log.info("Device approved", d.deviceId);
    });
    this.trust.on("rejected", async (d) => {
      this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== d.deviceId);
      await this.emitState();
      log.info("Device rejected", d.deviceId);
    });
    this.trust.on("removed", () => this.emitState());
  }

  private inspectMultiaddrs(
    addrs: string[],
    targetPeerId: string,
    source: PairingAddressSource
  ): { valid: Multiaddr[]; diagnostics: PairingCandidateDiagnostics[] } {
    const valid: Multiaddr[] = [];
    const diagnostics: PairingCandidateDiagnostics[] = [];
    for (const a of addrs) {
      try {
        const ma = multiaddr(a);
        const addrPeerId = getPeerIdFromMultiaddr(ma) ?? null;
        const validCandidate = Boolean(addrPeerId);
        diagnostics.push({
          source,
          addr: ma.toString(),
          valid: validCandidate,
          path: connectionPathForAddr(ma),
          peerId: addrPeerId,
          peerIdMatchesTarget: addrPeerId === targetPeerId,
          ...(validCandidate ? {} : { error: "missing_peer_id" }),
        });
        if (validCandidate) valid.push(ma);
      } catch (err) {
        diagnostics.push({
          source,
          addr: String(a),
          valid: false,
          path: connectionPathForAddr(a),
          peerId: null,
          peerIdMatchesTarget: false,
          error: errorMessage(err),
        });
      }
    }
    return { valid, diagnostics };
  }

  private createPairingDiagnostics(inputLength: number): PairingAttemptDiagnostics {
    this.pairingAttemptSeq += 1;
    return {
      attemptId: `${Date.now().toString(36)}-${this.pairingAttemptSeq}`,
      status: "running",
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      inputLength,
      localDeviceId: null,
      targetDeviceId: null,
      targetPeerId: null,
      relayAddresses: [],
      providedAddrs: [],
      derivedAddrs: [],
      candidates: [],
      transportStart: {
        attempted: false,
        ok: false,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        error: null,
      },
      targetAttempts: [],
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

  private transportSnapshot(): PairingTransportSnapshot {
    return {
      connectedPeers: this.transport?.getConnectedPeers?.() ?? [],
      peerConnections: this.transport?.getPeerConnectionInfo?.() ?? [],
      selfMultiaddrs: this.transport?.getSelfMultiaddrs?.() ?? [],
    };
  }

  private async emitState() {
    const state = await this.getState();
    await this.runtimeAdapter.publicState.publish(state);
  }

  private async startServices() {
    if (this.started) return;
    await startIdentityBoundRuntimeServices({
      initializeIdentity: async () => {
        const rotation = await this.identityRotation.recoverOrRotate();
        if (rotation.rotated) {
          window.location.reload();
          throw new Error("identity_rotated_restart_required");
        }
        await this.identitySvc.get();
      },
      startLocalServices: async () => {
        this.pairingSessions.start();
        this.bindEvents();
        this.autoSync = await this.autoSyncPreference.load();
        this.clipboardSync.setAutoSync(this.autoSync);
        const storedRetentionMs = (await this.storage.get<number>("localRetentionMs")) ?? RETENTION_MS;
        const applyStoredRetention = async (): Promise<void> => {
          this.localRetentionMs = await this.history.setRetention(storedRetentionMs);
          this.pendingRetentionMs = null;
          if (this.localRetentionMs !== storedRetentionMs) {
            await this.storage.set("localRetentionMs", this.localRetentionMs);
          }
        };
        try {
          await applyStoredRetention();
        } catch (error) {
          this.pendingRetentionMs = storedRetentionMs;
          this.historyPolicyError = "history_cleanup_failed";
          log.warn("Initial local history cleanup failed; runtime will retry", error);
        }
        this.historyRetentionCleanup ??= startHistoryRetentionCleanup(
          {
            pruneExpired: async () => {
              if (this.pendingRetentionMs !== null) await applyStoredRetention();
              else await this.history.pruneExpired();
            },
          },
          undefined,
          (error) => {
            this.historyPolicyError = error ? "history_cleanup_failed" : null;
            void this.emitState();
          },
        );
        await this.pairingPending.start();
        this.started = true;
        this.clipboardSync.start();
      },
      startNetworkServices: async () => {
        await this.ensureMessaging();
        if (!this.pairingInboundBound) {
          this.pairingInboundBound = true;
          this.transport!.onMessage(PAIRING_PROTOCOL, (from, frame) => {
            void this.pairingSessions.receive(from, frame, (peerId, requestFrame) => this.pairingPending.receive(peerId, requestFrame))
              .catch((error) => log.warn("Pairing message processing failed", error));
          });
        }
        await this.transport!.start();
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
    this.historyRetentionCleanup?.stop();
    this.historyRetentionCleanup = null;
    await this.pairingSessions.stop();
    await this.pairingPending.stop();
    this.clipboardSync.stop();
    this.historyReconciliation?.stop();
    this.historyReconciliation = null;
    this.pairedConnections?.stop();
    await this.transport?.stop();
    this.membershipReconciler?.stop();
    this.membershipReconciler = null;
    this.started = false;
    this.listeners = [];
  }

  start() {
    return this.runtime.start();
  }

  stop() {
    return this.runtimeShutdownHandler
      ? Promise.resolve(this.runtimeShutdownHandler())
      : this.runtime.stop();
  }

  onUpdate(cb: (state: AndroidAppState) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async getState(): Promise<AndroidAppState> {
    const clips = await this.history.exportAll();
    const devices = await this.trust.list();
    const identity = toPublicDeviceIdentity(await this.ensureIdentityAddrs(await this.identitySvc.get()));
    const peers = this.transport?.getConnectedPeers?.() ?? [];
    const peerConnections = this.transport?.getPeerConnectionInfo?.() ?? [];
    const relayConnections = this.transport?.getRelayConnectionInfo?.() ?? [];
    const relayAddresses = await this.getRelayAddresses();

    return {
      clips,
      devices,
      pending: this.pendingRequests,
      waiting: this.pairingSessions.waiting(),
      pairingErrors: this.pairingSessions.errors(),
      peers,
      peerConnections,
      relayConnections,
      identity,
      pinnedIds: await this.history.pinnedIds(),
      localRetentionMs: this.localRetentionMs,
      autoSync: this.clipboardSync.isAutoSync(),
      clipboardHistoryError: this.clipboardHistoryError,
      historyPolicyError: this.historyPolicyError,
      relayAddresses,
      diagnostics: {
        lastClipboardCheck: this.lastClipboardCheck,
        lastClipboardPreview: this.lastClipboardPreview,
        lastClipboardError: this.lastClipboardError,
        lastPairingAttempt: this.lastPairingAttempt,
      },
    };
  }

  async deleteClip(id: string) {
    await this.history.remove(id);
    await this.emitState();
  }

  async reuseClip(id: string) {
    await reuseRetainedClip(id, { history: this.history, clipboard: this.clipboard });
    await this.emitState();
  }

  async clearHistory() {
    await this.clipboard.clearHistory(() => this.history.clearAll());
    await this.emitState();
  }

  async unpairDevice(id: string) {
    await this.trust.remove(id);
    await this.emitState();
  }

  async renameDevice(id: string, name: string): Promise<Device | null> {
    const device = await this.trust.rename(id, name);
    await this.emitState();
    return device;
  }

  async renameIdentity(name: string): Promise<Identity | null> {
    const trimmed = name.trim();
    if (!trimmed) return this.getIdentity();

    await this.identitySvc.rename(trimmed);
    const identity = await this.getIdentity();
    await this.emitState();
    return identity;
  }

  async acceptRequest(dev: PendingRequest) {
    await this.pairingPending.decide(dev.deviceId, "accepted");
    await this.emitState();
  }

  async rejectRequest(dev: PendingRequest) {
    await this.pairingPending.decide(dev.deviceId, "rejected");
    await this.emitState();
  }

  async setPinned(id: string, pinned: boolean) {
    const pinnedIds = await this.history.setPinned(id, pinned);
    await this.emitState();
    return pinnedIds;
  }

  dismissClipboardHistoryError() {
    this.clipboard.dismissHistoryError?.();
  }

  async retryHistoryCleanup() {
    await this.historyRetentionCleanup?.retry();
  }

  async setLocalRetention(retentionMs: number) {
    this.localRetentionMs = await this.history.setRetention(retentionMs);
    this.pendingRetentionMs = null;
    await this.storage.set("localRetentionMs", this.localRetentionMs);
    await this.emitState();
    return this.localRetentionMs;
  }

  async setAutoSync(enabled: boolean) {
    this.autoSync = await this.autoSyncPreference.set(enabled);
    this.clipboardSync.setAutoSync(this.autoSync);
    await this.emitState();
    return this.autoSync;
  }

  async getIdentity(): Promise<Identity | null> {
    const id = await this.identitySvc.get();
    return toPublicDeviceIdentity(await this.ensureIdentityAddrs(id));
  }

  async getInitializationError() {
    return this.identitySvc.getInitializationError();
  }

  async retryIdentityInitialization(): Promise<AndroidAppState> {
    await this.identitySvc.retryInitialization();
    await this.runtime.start();
    return this.getState();
  }

  async getPairingCode(): Promise<PairingCode | null> {
    const id = await this.ensureIdentityAddrs(await this.identitySvc.get());
    await this.ensureMessaging();
    await this.transport!.start();
    if (!this.transport!.getSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
    const signedPeerRecord = await this.transport!.getSignedPeerRecord();
    const text = encodePairingTarget({ targetPeerId: await deviceIdToPeerId(id.deviceId), signedPeerRecord, deviceNameHint: id.deviceName });
    return {
      image: await QRCode.toDataURL(text, { errorCorrectionLevel: "L", margin: 0, scale: 2 }),
      text,
    };
  }

  async pairFromText(txt: string): Promise<PairingResult> {
    const diagnostics = this.createPairingDiagnostics(typeof txt === "string" ? txt.length : 0);
    this.lastPairingAttempt = diagnostics;
    logPairing("info", "Pairing attempt started", {
      attemptId: diagnostics.attemptId,
      inputLength: diagnostics.inputLength,
    });

    const fail = async (error: PairingFailureCode): Promise<PairingResult> => {
      const finished = this.finishPairingDiagnostics(diagnostics, "failed", error);
      logPairing("warn", "Pairing attempt failed", {
        attemptId: finished.attemptId,
        error,
        durationMs: finished.durationMs,
        targetDeviceId: finished.targetDeviceId,
        targetPeerId: finished.targetPeerId,
        providedAddrs: finished.providedAddrs,
        derivedAddrs: finished.derivedAddrs,
        candidates: finished.candidates,
        targetAttempts: finished.targetAttempts,
      });
      await this.emitState();
      return { ok: false, error, diagnostics: finished };
    };

    try {
      const target = decodePairingTarget(txt);
      if (!target) return fail("invalid");
      await this.ensureMessaging();
      await this.transport!.start();
      const localIdentity = await this.identitySvc.get();
      if (!localIdentity.privateKey) return fail("invalid");
      await importPairingTargetAndRequest({ text: txt, network: this.transport!, request: this.pairingSessions.request });
      return { ok: true, diagnostics: this.finishPairingDiagnostics(diagnostics, "succeeded", null) };

    } catch (err) {
      logPairing("warn", "Pairing attempt failed unexpectedly", {
        attemptId: diagnostics.attemptId,
        error: errorMessage(err),
      });
      return fail(diagnostics.error ?? "dial_failed");
    }
  }

  async shareCurrentClipboard() {
    const text = await readClipboardText();
    await this.clipboard.processLocalText(text, { shareNow: true });
    await this.emitState();
  }
}

export function createAndroidClient() {
  return new AndroidClient();
}
