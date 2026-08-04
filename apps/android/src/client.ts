import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import {
  createAndroidRuntimeAdapter,
  createRuntimeClipboardService,
  createRuntimeNetworkProxy,
  createRuntimeNotificationSelection,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  systemRuntimeClock,
} from "@core/runtime";
import { normalizeClipboardContent } from "@core/clipboard/normalize";
import { createLibp2pMessagingTransport } from "@core/network/engine";
import { createPairedPeerConnectionManager } from "@core/network/pairedConnections";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "@core/network/constants";
import { deriveRelayPeerMultiaddrs } from "@core/network/relayAddresses";
import { getPeerIdFromMultiaddr } from "@core/network/multiaddrCompat";
import { MemoryHistoryStore } from "@core/history/store";
import { IndexedDBHistoryBackend } from "@core/history/indexeddb";
import { InMemoryHistoryBackend } from "@core/history/types";
import { createClipboardSyncManager } from "@core/sync/clipboardSync";
import {
  createTrustMessenger,
  createTrustProtocolBinder,
  createTrustedClipMessenger,
} from "@core/messaging";
import { createClipMessage } from "@core/protocols/clip";
import { createSignedTrustRequest } from "@core/protocols/clipTrust";
import {
  createIdentityManager,
  createKVIdentityRepository,
  createKVTrustedDeviceRepository,
  createTrustManager,
  IDENTITY_KEY,
  TRUST_KEY,
  type TrustedDevice,
} from "@core/trust";
import { encode } from "@core/qr";
import { encodePairing } from "@core/pairing/encode";
import { decodePairing } from "@core/pairing/decode";
import type { Clip } from "@core/models/Clip";
import type { Device, Identity, PairingCode, PeerConnectionInfo, PendingRequest, RelayConnectionInfo } from "@clipp/ui";
import * as log from "@core/logger";
import { deviceIdToPeerId, deviceIdToPeerIdObject, peerIdFromPrivateKeyBase64 } from "@core/network/peerId";
import { LocalStorageBackend } from "./storage";
import { Clipboard as CapacitorClipboard } from "@capacitor/clipboard";
import { LocalNotifications } from "@capacitor/local-notifications";

export type AndroidAppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  pinnedIds: string[];
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

const PINNED_KEY = "pinnedIds";

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
  try {
    return (await navigator.clipboard.readText()) ?? "";
  } catch {
    return "";
  }
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await CapacitorClipboard.write({ string: text });
    return;
  } catch (err) {
    log.warn("Capacitor clipboard write failed, falling back", err);
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore write failure
  }
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
  private readonly history = new MemoryHistoryStore(createHistoryBackend());
  private readonly identityRepo = createKVIdentityRepository({ storage: this.storage, key: IDENTITY_KEY });
  private readonly identitySvc = createIdentityManager({ repo: this.identityRepo });
  private readonly trustRepo = createKVTrustedDeviceRepository({ storage: this.storage, key: TRUST_KEY });
  private readonly trust = createTrustManager({ trustRepo: this.trustRepo, identitySvc: this.identitySvc });
  private readonly trustBinder = createTrustProtocolBinder({ trust: this.trust });
  private transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
  private pairedConnections: ReturnType<typeof createPairedPeerConnectionManager> | null = null;
  private clipMessaging: ReturnType<typeof createTrustedClipMessenger> | null = null;
  private trustMessaging: ReturnType<typeof createTrustMessenger> | null = null;

  constructor() {
    // messaging is initialised lazily in `start()`
    this.runtimeAdapter.notifications.onSelect(() => this.runtimeAdapter.lifecycle.openApprovalView());
    void LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const id = event.notification.extra?.runtimeNotificationId;
      if (typeof id === "string") {
        this.notificationSelection.emit(id);
      }
    });
  }

  private async ensureMessaging(): Promise<void> {
    if (this.transport && this.clipMessaging && this.trustMessaging) {
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
    });
    this.pairedConnections = createPairedPeerConnectionManager({
      transport: this.transport,
      getPairedPeers: () => this.trust.list(),
    });
    this.clipMessaging = createTrustedClipMessenger(this.transport, (id) => this.trust.isTrusted(id));
    this.trustMessaging = createTrustMessenger(this.transport);
    this.trustBinder.bind(this.trustMessaging);
    this.clipboardSync.bindMessaging(this.clipMessaging as any);

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
    });
  }

  private readonly clipboard = this.createAndroidClipboardService();
  private readonly clipboardSync = createClipboardSyncManager({
    clipboard: this.clipboard,
    history: this.history,
    getLocalDeviceId: async () => {
      const id = await this.identitySvc.get();
      return id.deviceId;
    },
  });

  private pendingRequests: TrustedDevice[] = [];
  private pinnedIds: string[] = [];
  private listeners: Array<(state: AndroidAppState) => void> = [];
  private started = false;
  private eventsBound = false;
  private lastClipboardCheck: number | null = null;
  private lastClipboardPreview: string | null = null;
  private lastClipboardError: string | null = null;
  private lastPairingAttempt: PairingAttemptDiagnostics | null = null;
  private pairingAttemptSeq = 0;
  private runtimeShutdownHandler: (() => void | Promise<void>) | null = null;
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
  private readonly runtime = createRuntimeOrchestrator({
    adapter: this.runtimeAdapter,
    start: () => this.startServices(),
    stop: () => this.stopServices(),
  });

  private async getRelayAddresses(): Promise<string[]> {
    return [...DEFAULT_WEBRTC_STAR_RELAYS];
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

    this.trust.on("request", (d) => {
      if (this.pendingRequests.some((p) => p.deviceId === d.deviceId)) return;
      this.pendingRequests.push(d);
      this.emitState();
      const deviceName = d.deviceName?.trim() || "Unknown device";
      void this.runtimeAdapter.notifications.show({
        id: `pairing-request-${d.deviceId}`,
        title: "New pairing request",
        body: `${deviceName} wants to pair with Clipp.`,
      });
      log.info("Trust request received", d.deviceId);
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
    this.started = true;
    this.bindEvents();
    this.pinnedIds = (await this.storage.get<string[]>(PINNED_KEY)) || [];
    await this.ensureMessaging();
    try {
      await this.transport!.start();
      this.pairedConnections?.start();
    } catch (err) {
      log.warn("Messaging transport failed to start", err);
    }
    this.clipboardSync.start();
  }

  private async stopServices() {
    if (!this.started) return;
    this.clipboardSync.stop();
    this.pairedConnections?.stop();
    await this.transport?.stop();
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
    const identity = await this.ensureIdentityAddrs(await this.identitySvc.get());
    const peers = this.transport?.getConnectedPeers?.() ?? [];
    const peerConnections = this.transport?.getPeerConnectionInfo?.() ?? [];
    const relayConnections = this.transport?.getRelayConnectionInfo?.() ?? [];
    const relayAddresses = await this.getRelayAddresses();

    return {
      clips,
      devices,
      pending: this.pendingRequests,
      peers,
      peerConnections,
      relayConnections,
      identity,
      pinnedIds: this.pinnedIds,
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

  async clearHistory() {
    const clips = await this.history.exportAll();
    await Promise.all(clips.map((c) => this.history.remove(c.id)));
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
    await this.trust.sendTrustAck(dev as any, true);
    this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== dev.deviceId);
    await this.emitState();
  }

  async rejectRequest(dev: PendingRequest) {
    this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== dev.deviceId);
    await this.trust.sendTrustAck(dev as any, false);
    await this.emitState();
  }

  async togglePin(id: string) {
    const set = new Set(this.pinnedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.pinnedIds = Array.from(set);
    await this.storage.set(PINNED_KEY, this.pinnedIds);
    await this.emitState();
    return this.pinnedIds;
  }

  async getIdentity(): Promise<Identity | null> {
    const id = await this.identitySvc.get();
    return this.ensureIdentityAddrs(id);
  }

  async getPairingCode(): Promise<PairingCode | null> {
    const id = await this.ensureIdentityAddrs(await this.identitySvc.get());
    const peerId = await deviceIdToPeerId(id.deviceId);
    const addrs =
      id.multiaddrs && id.multiaddrs.length
        ? id.multiaddrs
        : id.multiaddr
        ? [id.multiaddr]
        : [`/p2p/${peerId}`];
    const info = {
      deviceId: id.deviceId,
      deviceName: id.deviceName,
      multiaddrs: addrs,
      publicKey: id.publicKey,
    };
    return {
      image: await encode(info),
      text: encodePairing(info),
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
      const pairing = decodePairing(txt);
      if (!pairing) return fail("invalid");

      diagnostics.targetDeviceId = pairing.deviceId;
      diagnostics.providedAddrs =
        pairing.multiaddrs && pairing.multiaddrs.length
          ? pairing.multiaddrs
          : pairing.multiaddr
          ? [pairing.multiaddr]
          : [];

      await this.ensureMessaging();

      const transportStartAt = Date.now();
      diagnostics.transportStart = {
        attempted: true,
        ok: false,
        startedAt: transportStartAt,
        finishedAt: null,
        durationMs: null,
        error: null,
      };
      try {
        await this.transport!.start();
        const finishedAt = Date.now();
        diagnostics.transportStart = {
          ...diagnostics.transportStart,
          ok: true,
          finishedAt,
          durationMs: finishedAt - transportStartAt,
        };
      } catch (err) {
        const finishedAt = Date.now();
        diagnostics.transportStart = {
          ...diagnostics.transportStart,
          finishedAt,
          durationMs: finishedAt - transportStartAt,
          error: errorMessage(err),
        };
        logPairing("warn", "Messaging transport failed to start during pairing", {
          attemptId: diagnostics.attemptId,
          error: diagnostics.transportStart.error,
        });
      }

      const id = await this.identitySvc.get();
      diagnostics.localDeviceId = id.deviceId;
      const targetPeerId = await deviceIdToPeerId(pairing.deviceId);
      diagnostics.targetPeerId = targetPeerId;
      diagnostics.relayAddresses = await this.getRelayAddresses();

      const payloadCandidates = this.inspectMultiaddrs(
        diagnostics.providedAddrs,
        targetPeerId,
        "payload"
      );
      diagnostics.candidates.push(...payloadCandidates.diagnostics);
      let valid = payloadCandidates.valid;

      if (!valid.length) {
        diagnostics.derivedAddrs = deriveRelayPeerMultiaddrs(
          diagnostics.relayAddresses.filter(canDerivePairingAddress),
          targetPeerId
        );
        const derivedCandidates = this.inspectMultiaddrs(
          diagnostics.derivedAddrs,
          targetPeerId,
          "derived"
        );
        diagnostics.candidates.push(...derivedCandidates.diagnostics);
        valid = derivedCandidates.valid;
      }
      valid = orderPairingTargets(valid);

      logPairing("info", "Pairing candidates inspected", {
        attemptId: diagnostics.attemptId,
        targetDeviceId: diagnostics.targetDeviceId,
        targetPeerId,
        relayAddresses: diagnostics.relayAddresses,
        validTargetCount: valid.length,
        candidates: diagnostics.candidates,
      });

      if (!valid.length) return fail("no_target");

      const request = await createSignedTrustRequest(id, targetPeerId);
      for (const target of valid) {
        const targetText = target.toString();
        const startedAt = Date.now();
        const attempt: PairingTargetAttemptDiagnostics = {
          target: targetText,
          startedAt,
          finishedAt: null,
          durationMs: null,
          ok: false,
          error: null,
          before: this.transportSnapshot(),
          after: null,
        };
        diagnostics.targetAttempts.push(attempt);
        logPairing("info", "Sending trust request", {
          attemptId: diagnostics.attemptId,
          target: targetText,
          before: attempt.before,
        });

        try {
          await this.trustMessaging!.send(targetText, request as any);
          const finishedAt = Date.now();
          attempt.finishedAt = finishedAt;
          attempt.durationMs = finishedAt - startedAt;
          attempt.ok = true;
          attempt.after = this.transportSnapshot();
          const finished = this.finishPairingDiagnostics(diagnostics, "succeeded", null);
          logPairing("info", "Pairing trust request sent", {
            attemptId: finished.attemptId,
            target: targetText,
            durationMs: attempt.durationMs,
            after: attempt.after,
          });
          await this.emitState();
          return { ok: true, diagnostics: finished };
        } catch (err) {
          const finishedAt = Date.now();
          attempt.finishedAt = finishedAt;
          attempt.durationMs = finishedAt - startedAt;
          attempt.error = errorMessage(err);
          attempt.after = this.transportSnapshot();
          logPairing("warn", "Trust request target failed", {
            attemptId: diagnostics.attemptId,
            target: targetText,
            durationMs: attempt.durationMs,
            error: attempt.error,
            before: attempt.before,
            after: attempt.after,
          });
        }
      }

      return fail("dial_failed");
    } catch (err) {
      logPairing("warn", "Pairing attempt failed unexpectedly", {
        attemptId: diagnostics.attemptId,
        error: errorMessage(err),
      });
      return fail(diagnostics.error ?? "dial_failed");
    }
  }

  async shareCurrentClipboard() {
    try {
      await this.ensureMessaging();
      const text = await readClipboardText();
      const id = await this.identitySvc.get();
      const clip = normalizeClipboardContent(text, id.deviceId);
      if (clip) {
        await this.history.add(clip, id.deviceId, true);
        const message = createClipMessage({
          from: id.deviceId,
          clip,
          sentAt: Date.now(),
        });
        await this.clipMessaging!.broadcast(message as any);
        await this.emitState();
        return { ok: true };
      }
    } catch (err) {
      log.warn("Share clipboard failed", err);
    }
    return { ok: false };
  }
}

export function createAndroidClient() {
  return new AndroidClient();
}
