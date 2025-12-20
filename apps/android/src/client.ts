import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { createPollingClipboardService } from "@core/clipboard/service";
import { normalizeClipboardContent } from "@core/clipboard/normalize";
import { createLibp2pMessagingTransport } from "@core/network/engine";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "@core/network/constants";
import { MemoryHistoryStore } from "@core/history/store";
import { IndexedDBHistoryBackend } from "@core/history/indexeddb";
import { InMemoryHistoryBackend } from "@core/history/types";
import { createClipboardSyncManager } from "@core/sync/clipboardSync";
import {
  createTrustMessenger,
  createTrustProtocolBinder,
  createTrustedClipMessenger,
} from "@core/messaging";
import { createSignedTrustRequest } from "@core/protocols/clipTrust";
import { createTrustManager, type TrustedDevice } from "@core/trust";
import { decodePairing } from "@core/pairing/decode";
import type { Clip } from "@core/models/Clip";
import type { Device, Identity, PendingRequest } from "@clipp/ui";
import * as log from "@core/logger";
import { deviceIdToPeerId, deviceIdToPeerIdObject, peerIdFromPrivateKeyBase64 } from "@core/network/peerId";
import { LocalStorageBackend } from "./storage";
import { Clipboard as CapacitorClipboard } from "@capacitor/clipboard";

export type AndroidAppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  peers: string[];
  identity: Identity | null;
  pinnedIds: string[];
  diagnostics?: {
    lastClipboardCheck: number | null;
    lastClipboardPreview: string | null;
    lastClipboardError: string | null;
  };
};

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

export class AndroidClient {
  private readonly storage = new LocalStorageBackend();
  private readonly history = new MemoryHistoryStore(createHistoryBackend());
  private readonly trust = createTrustManager(this.storage);
  private readonly trustBinder = createTrustProtocolBinder({ trust: this.trust });
  private transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
  private clipMessaging: ReturnType<typeof createTrustedClipMessenger> | null = null;
  private trustMessaging: ReturnType<typeof createTrustMessenger> | null = null;

  constructor() {
    // messaging is initialised lazily in `start()`
  }

  private async ensureMessaging(): Promise<void> {
    if (this.transport && this.clipMessaging && this.trustMessaging) return;
    const identity = await this.trust.getLocalIdentity();
    const peerId =
      identity.privateKey && typeof identity.privateKey === "string"
        ? await peerIdFromPrivateKeyBase64(identity.privateKey)
        : await deviceIdToPeerIdObject(identity.deviceId);
    const privateKey =
      identity.privateKey && typeof identity.privateKey === "string"
        ? await privateKeyFromProtobuf(base64ToBytes(identity.privateKey))
        : undefined;

    this.transport = createLibp2pMessagingTransport({
      peerId,
      privateKey,
      relayAddresses: DEFAULT_WEBRTC_STAR_RELAYS,
    });
    this.clipMessaging = createTrustedClipMessenger(this.transport, (id) => this.trust.isTrusted(id));
    this.trustMessaging = createTrustMessenger(this.transport);
    this.trustBinder.bind(this.trustMessaging);
    this.clipboardSync.bindMessaging(this.clipMessaging as any);

    this.transport.onPeerConnected(() => void this.emitState());
    this.transport.onPeerDisconnected(() => void this.emitState());
  }
  private createAndroidClipboardService() {
    return createPollingClipboardService({
      pollIntervalMs: 1500,
      getSenderId: async () => {
        const id = await this.trust.getLocalIdentity();
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
      const id = await this.trust.getLocalIdentity();
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

  private async ensureIdentityAddrs(id: any): Promise<any> {
    if (!id) return id;
    if (Array.isArray(id.multiaddrs) && id.multiaddrs.length > 0) return id;
    const derived = DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${id.deviceId}`);
    id.multiaddrs = derived;
    id.multiaddr = id.multiaddr || derived[0] || `/p2p/${id.deviceId}`;
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
      log.info("Trust request received", d.deviceId);
    });
    this.trust.on("approved", async (d) => {
      this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== d.deviceId);
      await this.emitState();
      log.info("Device approved", d.deviceId);
    });
    this.trust.on("rejected", async (d) => {
      this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== d.deviceId);
      await this.emitState();
      log.info("Device rejected", d.deviceId);
    });
    this.trust.on("removed", () => this.emitState());
  }

  private validMultiaddrs(addrs: string[], peerId: string): Multiaddr[] {
    const out: Multiaddr[] = [];
    for (const a of addrs) {
      try {
        const ma = multiaddr(a);
        if (ma.getPeerId() === peerId || ma.getPeerId()) {
          out.push(ma);
        }
      } catch {
        // ignore invalid addr
      }
    }
    return out;
  }

  private async emitState() {
    const state = await this.getState();
    this.listeners.forEach((l) => l(state));
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.bindEvents();
    this.pinnedIds = (await this.storage.get<string[]>(PINNED_KEY)) || [];
    await this.ensureMessaging();
    try {
      await this.transport!.start();
    } catch (err) {
      log.warn("Messaging transport failed to start", err);
    }
    this.clipboardSync.start();
    await this.emitState();
  }

  stop() {
    if (!this.started) return;
    this.clipboardSync.stop();
    this.transport?.stop();
    this.started = false;
    this.listeners = [];
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
    const identity = await this.ensureIdentityAddrs(await this.trust.getLocalIdentity());
    const peers = this.transport?.getConnectedPeers?.() ?? [];

    return {
      clips,
      devices,
      pending: this.pendingRequests,
      peers,
      identity,
      pinnedIds: this.pinnedIds,
      diagnostics: {
        lastClipboardCheck: this.lastClipboardCheck,
        lastClipboardPreview: this.lastClipboardPreview,
        lastClipboardError: this.lastClipboardError,
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

  async acceptRequest(dev: PendingRequest) {
    await this.trust.add(dev as any);
    this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== dev.deviceId);
    await this.emitState();
  }

  async rejectRequest(dev: PendingRequest) {
    this.pendingRequests = this.pendingRequests.filter((p) => p.deviceId !== dev.deviceId);
    await this.trust.reject(dev.deviceId);
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
    const id = await this.trust.getLocalIdentity();
    return this.ensureIdentityAddrs(id);
  }

  async pairFromText(txt: string) {
    const pairing = decodePairing(txt);
    if (!pairing) return { ok: false, error: "invalid" as const };
    await this.ensureMessaging();
    try {
      await this.transport!.start();
    } catch (err) {
      log.warn("Messaging transport failed to start", err);
    }
    const id = await this.trust.getLocalIdentity();
    const targetPeerId = await deviceIdToPeerId(pairing.deviceId);
    let targetAddrs =
      pairing.multiaddrs && pairing.multiaddrs.length
        ? pairing.multiaddrs
        : pairing.multiaddr
        ? [pairing.multiaddr]
        : [];
    let valid = this.validMultiaddrs(targetAddrs, targetPeerId);
    if (!valid.length) {
      const derived = DEFAULT_WEBRTC_STAR_RELAYS.map(
        (addr: string) => `${addr}/p2p/${targetPeerId}`
      );
      targetAddrs = derived;
      valid = this.validMultiaddrs(targetAddrs, targetPeerId);
    }
    const target: Multiaddr | undefined = valid[0];
    if (!target) return { ok: false, error: "no_target" as const };
    const request = await createSignedTrustRequest(id, targetPeerId);
    try {
      await this.trustMessaging!.send(target.toString(), request as any);
      return { ok: true };
    } catch (err) {
      log.warn("Failed to send trust request", err);
      return { ok: false, error: "dial_failed" as const };
    }
  }

  async shareCurrentClipboard() {
    try {
      await this.ensureMessaging();
      const text = await readClipboardText();
      const id = await this.trust.getLocalIdentity();
      const clip = normalizeClipboardContent(text, id.deviceId);
      if (clip) {
        await this.history.add(clip, id.deviceId, true);
        const message = {
          type: "CLIP" as const,
          from: id.deviceId,
          clip,
          sentAt: Date.now(),
        };
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
