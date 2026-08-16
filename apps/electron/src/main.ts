import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Notification, Tray } from "electron";
import path from "node:path";
import QRCode from "qrcode";
import { encodePairingTarget, decodePairingTarget } from "../../../packages/core/pairing/v2.js";
import { createPairingRuntimeSessions } from "../../../packages/core/pairing/runtimeCoordinator.js";
import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target.js";
import { PAIRING_PROTOCOL, verifyPairingTrustRequestSignature } from "../../../packages/core/pairing/protocol.js";
import { createMembershipPeerRecordBridge, createMembershipReconciler } from "../../../packages/core/membership/reconciliation.js";
import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending.js";
import "./libp2pGlobals.js";
import {
  openDatabase,
  SQLiteHistoryBackend,
  SQLiteKVStore,
} from "./storage.js";
// TODO: why normalizeClipboardContent is used in the app? it should be localized in clipboard service
// import { normalizeClipboardContent } from "../../../packages/core/clipboard/normalize.js";
import {
  createElectronRuntimeAdapter,
  createClosableRuntimeNotifications,
  createRuntimeIdentityManager,
  createRuntimeNetworkProxy,
  createRuntimeClipboardService,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  startIdentityBoundRuntimeServices,
  systemRuntimeClock,
} from "../../../packages/core/runtime/index.js";
import { MemoryHistoryStore } from "../../../packages/core/history/store.js";
import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine.js";
import { DEFAULT_CIRCUIT_RELAY_ADDRESSES } from "../../../packages/core/network/constants.js";
import { createPairedPeerConnectionManager } from "../../../packages/core/network/pairedConnections.js";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync.js";
// TODO: remove webrtc-star
// import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../../packages/core/network/constants.js";
import * as log from "../../../packages/core/logger.js";
import {
  createTrustedClipMessenger,
} from "../../../packages/core/messaging/index.js";
import {
  deviceIdToPeerId,
  deviceIdToPeerIdObject,
  peerIdFromPrivateKeyBase64,
} from "../../../packages/core/network/peerId.js";
import {
  createKVIdentityRepository,
  createKVTrustedDeviceRepository,
  toPublicDeviceIdentity,
  createTrustManager,
  IDENTITY_KEY,
  TRUST_KEY,
  type TrustedDevice
} from "../../../packages/core/trust/index.js";

const __dirnameFallback =
  typeof __dirname !== "undefined" ? (__dirname as string) : "";
const isDev = !app.isPackaged;
const preloadPath = path.join(__dirnameFallback, "preload.js");

async function bootstrap() {
  const logLevel = process.env.CLIPP_LOG_LEVEL || "debug";
  // const logLevel = process.env.CLIPP_LOG_LEVEL || "info";
  (log as any).setLogLevel?.(logLevel);
  (log as any).info?.("Clipp Electron bootstrap", { logLevel });

  const dbPath = path.join(app.getPath("userData"), "clipp.sqlite");
  const db = openDatabase(dbPath);
  const kvStore = new SQLiteKVStore(db);
  const peerRecordStore = {
    load: async () => (await kvStore.get<Record<string, number[]>>("signedPeerRecords")) ?? {},
    save: async (peerId: string, record: Uint8Array) => {
      const records = (await kvStore.get<Record<string, number[]>>("signedPeerRecords")) ?? {};
      await kvStore.set("signedPeerRecords", { ...records, [peerId]: Array.from(record) });
    },
  };
  const history = new MemoryHistoryStore(new SQLiteHistoryBackend(db));
  const identityRepo = createKVIdentityRepository({ storage: kvStore, key: IDENTITY_KEY })
  const identitySvc = createRuntimeIdentityManager({
    repo: identityRepo,
    capabilities: RUNTIME_CAPABILITIES.electron,
  })
  const trustRepo = createKVTrustedDeviceRepository({ storage: kvStore, key: TRUST_KEY })
  const trust = createTrustManager({ trustRepo: trustRepo, identitySvc: identitySvc });
  // TODO: remove relayAddrEnv
  // const relayAddrEnv =
  //   process.env.CLIPP_RELAY_ADDR ||
  //   process.env.CLIPP_RELAY_MULTIADDR ||
  //   "/ip4/127.0.0.1/tcp/47891/ws/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
  // TODO: create Relay Service
  let relayAddresses = normalizeRelayAddrs(
    ((await kvStore.get<string[]>("relayAddresses")) ?? DEFAULT_CIRCUIT_RELAY_ADDRESSES).filter(Boolean)
    // (relayAddrEnv ? [relayAddrEnv] : [])
  );
  let localIdentity;
  try {
    localIdentity = await identitySvc.get();
  } catch (error) {
    (log as any).error?.("Device identity initialization failed", { error: (error as Error).message });
    await app.whenReady();
    ipcMain.handle("clipp:get-state", async () => { throw error; });
    ipcMain.handle("clipp:get-initialization-error", async () => ({ code: "identity_initialization_failed" }));
    ipcMain.handle("clipp:retry-identity-initialization", async () => {
      await identitySvc.retryInitialization();
      app.relaunch();
      app.exit(0);
    });
    const window = new BrowserWindow({
      width: 1080,
      height: 760,
      webPreferences: { preload: preloadPath, contextIsolation: true },
    });
    await window.loadFile(path.join(__dirnameFallback, "renderer", "index.html"));
    return;
  }
  // const localIdentity = await ensureIdentityAddrs(await trust.getLocalIdentity());
  (log as any).info?.("Loaded identity", {
    deviceId: localIdentity.deviceId,
    hasPrivateKey: !!localIdentity.privateKey && localIdentity.privateKey.length > 20,
    hasPublicKey: !!localIdentity.publicKey && localIdentity.publicKey.length > 20,
    multiaddrs: localIdentity.multiaddrs,
  });
  const peerId =
    localIdentity.privateKey && typeof localIdentity.privateKey === "string"
      // TODO: why it's using asnc funct?
      ? await peerIdFromPrivateKeyBase64(localIdentity.privateKey)
      // TODO: why it's using asnc funct?
      : await deviceIdToPeerIdObject(localIdentity.deviceId);
  const privateKey =
    localIdentity.privateKey && typeof localIdentity.privateKey === "string"
      // TODO: why it's using asnc funct?
      ? await privateKeyFromProtobuf(Buffer.from(localIdentity.privateKey, "base64"))
      : undefined;

  let transport = createLibp2pMessagingTransport({
    peerId,
    privateKey,
    relayAddresses,
    enableWebRTCDirect: true,
    enableDCUtR: true,
    enableTcp: true,
    peerRecordStore,
    isPeerKnown: (remotePeerId) => trust.isTrusted(remotePeerId),
  });
  let pairedConnections = createPairedPeerConnectionManager({
    transport,
    getPairedPeers: () => trust.list(),
  });
  let clipMessaging = createTrustedClipMessenger(transport, (id: string) => trust.isTrusted(id));
  let messagingStarted = false;

  async function ensureMessagingStarted() {
    if (messagingStarted) return;
    try {
      await transport.start();
      messagingStarted = true;
    } catch (err) {
      messagingStarted = false;
      throw err;
    }
  }
  // TODO: why this is here and not in clipboard service?
  // let lastClipboardCheck: number | null = null;
  // let lastClipboardPreview: string | null = null;
  // let lastClipboardError: string | null = null;
  let pinnedIds: string[] = (await kvStore.get("pinnedIds")) || [];
  // TODO: improve icon import
  const iconRoot = app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : path.resolve(__dirnameFallback || process.cwd(), "..", "..", "..");
  const iconBase = path.join(iconRoot, "clipp-electron-icons-bundle");
  const appIconPath = path.join(iconBase, "clipp-purple-256.png");
  const trayIconCandidates = [
    "clipp-tray-16.png",
    "clipp-tray-32.png",
    "clipp-tray-64.png",
    "clipp-purple-32.png",
    "clipp-purple-16.png",
    "clipp-purple-256.png",
  ].map((f) => path.join(iconBase, f));

  // TODO: remove webrtc star
  // async function ensureIdentityAddrs(id: any) {
  //   // const peerId = await deviceIdToPeerId(id.deviceId);
  //   const peerId = id.deviceId;
  //
  //   // Start from existing multiaddrs (if any) and ensure relay + webrtc addrs are present.
  //   // TODO: remove webrtc star. Not read from here
  //   const existing = Array.isArray(id?.multiaddrs) ? [...id.multiaddrs] : [];
  //   const derived: string[] = [];
  //   const relaySet = normalizeRelayAddrs(relayAddresses || []);
  //   if (relaySet.length) {
  //     relaySet.forEach((addr) => derived.push(`${addr}/p2p-circuit/p2p/${peerId}`));
  //     // } else if (relayAddrEnv) {
  //     // derived.push(`${relayAddrEnv}/p2p-circuit/p2p/${peerId}`);
  //   }
  //   // derived.push(...DEFAULT_WEBRTC_STAR_RELAYS.map((addr: string) => `${addr}/p2p/${peerId}`));
  //
  //   const merged = dedupeMultiaddrs([...derived, ...existing]);
  //   const changed =
  //     merged.length !== existing.length || merged.some((v, idx) => v !== existing[idx]) || !id.multiaddr;
  //   id.multiaddrs = merged;
  //   if (!id.multiaddr && merged[0]) {
  //     id.multiaddr = merged[0];
  //   }
  //   if (changed) {
  //     // Persist updated identity so QR pairing uses latest addresses.
  //     await kvStore.set("localDeviceIdentity", id);
  //   }
  //   return id;
  // }

  function dedupeMultiaddrs(values: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  function isLoopbackMultiaddr(addr: string): boolean {
    return addr.includes("/ip4/127.") || addr.includes("/ip6/::1") || addr.includes("/dns4/localhost") || addr.includes("/dns6/localhost");
  }

  function isWebRTCDirectMultiaddr(addr: string): boolean {
    return addr.includes("/webrtc") && !addr.includes("/p2p-webrtc-star");
  }

  function isRelayLikeMultiaddr(addr: string): boolean {
    return addr.includes("/p2p-circuit") || addr.includes("/p2p-webrtc-star");
  }

  function isSecureWebSocketMultiaddr(addr: string): boolean {
    return addr.includes("/wss");
  }

  function pairingAdvertiseAddrs(addrs: string[]): string[] {
    const unique = dedupeMultiaddrs(addrs);
    const nonLoopback = unique.filter((addr) => !isLoopbackMultiaddr(addr));
    const source = nonLoopback.length ? nonLoopback : unique;
    const directWebRTC = source.filter(isWebRTCDirectMultiaddr);
    const relayLike = source.filter((addr) => !isWebRTCDirectMultiaddr(addr) && isRelayLikeMultiaddr(addr));
    const secureWebSocket = source.filter((addr) => !isWebRTCDirectMultiaddr(addr) && isSecureWebSocketMultiaddr(addr));
    const rest = source.filter(
      (addr) =>
        !isWebRTCDirectMultiaddr(addr) &&
        !isRelayLikeMultiaddr(addr) &&
        !isSecureWebSocketMultiaddr(addr)
    );
    return dedupeMultiaddrs([...directWebRTC, ...relayLike, ...secureWebSocket, ...rest]);
  }

  function pairingDialPriority(addr: string): number {
    if (isWebRTCDirectMultiaddr(addr)) return 0;
    if (isRelayLikeMultiaddr(addr)) return 1;
    if (isSecureWebSocketMultiaddr(addr)) return 2;
    if (isLoopbackMultiaddr(addr)) return 4;
    return 3;
  }

  function orderPairingTargets(addrs: Multiaddr[]): Multiaddr[] {
    return [...addrs].sort((a, b) => {
      const aText = a.toString();
      const bText = b.toString();
      return pairingDialPriority(aText) - pairingDialPriority(bText);
    });
  }

  function normalizeRelayAddrs(values: string[]) {
    const cleaned = values
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    const unique = dedupeMultiaddrs(cleaned);
    const valid: string[] = [];
    const invalid: Array<{ addr: string; error: string }> = [];
    for (const addr of unique) {
      const repaired = repairRelayAddr(addr);
      if (!repaired) {
        invalid.push({ addr, error: "unparseable" });
        continue;
      }
      try {
        // parse to ensure it is well-formed; discard if invalid
        multiaddr(repaired);
        valid.push(repaired);
      } catch (err: any) {
        invalid.push({ addr: repaired, error: err?.message || String(err) });
      }
    }
    if (invalid.length) {
      (log as any).warn?.("Invalid relay addrs filtered out", invalid);
    }
    return valid;
  }

  function repairRelayAddr(addr: string): string | null {
    const trimmed = (addr || "").trim();
    if (!trimmed) return null;
    // If there's accidental duplication after the peer id (e.g. ".../p2p/<id>141.147.116.147"),
    // keep only up to the peer-id segment.
    const p2pIdx = trimmed.indexOf("/p2p/");
    if (p2pIdx >= 0) {
      const candidate = trimmed.slice(0, p2pIdx) + trimmed.slice(p2pIdx);
      // strip any junk after peer id (non-base58 or trailing numbers)
      const match = candidate.match(/^(.*\/p2p\/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+)(?:[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz].*)?$/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return trimmed;
  }

  function validMultiaddrs(
    addrs: string[],
    errors?: Array<{ addr: string; error: string }>
  ): Multiaddr[] {
    const out: Multiaddr[] = [];
    for (const a of addrs) {
      try {
        const ma = multiaddr(a);
        // accept any parseable addr; some peer ids are UUIDs, not CIDv1
        out.push(ma);
      } catch (err) {
        const msg = (err as any)?.message || "parse_error";
        (log as any).debug?.("Invalid multiaddr parse error", {
          addr: a,
          error: msg,
        });
        errors?.push({ addr: a, error: msg });
      }
    }
    return out;
  }
  // TODO: till here

  function createElectronClipboardService() {
    return createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.electron,
      pollIntervalMs: 1200,
      getSenderId: async () => {
        const id = await identitySvc.get();
        return id.deviceId;
      },
      readText: async () => {
        try {
          const txt = clipboard.readText() ?? "";
          // lastClipboardCheck = Date.now();
          // lastClipboardPreview = txt ? txt.slice(0, 140) : "";
          // lastClipboardError = null;
          return txt;
        } catch (err: any) {
          // lastClipboardError = err?.message || "Failed to read clipboard";
          // lastClipboardCheck = Date.now();
          return "";
        }
      },
      writeText: async (text: string) => {
        clipboard.writeText(text);
      },
    });
  }

  const clipboardSvc = createElectronClipboardService();
  const clipboardSync = createClipboardSyncManager({
    clipboard: clipboardSvc,
    history,
    getLocalDeviceId: async () => {
      const id = await identitySvc.get();
      return id.deviceId;
    },
  });
  clipboardSync.bindMessaging(clipMessaging as any);

  // TODO: why pendingRequests is part of the application and not part of trust manager?
  let pendingRequests: TrustedDevice[] = [];
  let pairingPending: ReturnType<typeof createPendingTrustRequestCoordinator> | undefined;
  const pairingSessions = createPairingRuntimeSessions({
    identity: async () => { const current = await identitySvc.get(); return { peerId: peerId.toString(), deviceName: current.deviceName, nameRevision: current.nameRevision ?? 0 }; },
    send: (targetPeerId, frame) => runtimeNetwork.send(PAIRING_PROTOCOL, targetPeerId, frame),
    sign: async (bytes) => {
      if (!privateKey) throw new Error("identity_unavailable");
      return privateKey.sign(bytes);
    },
    verify: verifyPairingTrustRequestSignature,
    membership: trust,
    clock: systemRuntimeClock,
    connectionPath: (remotePeerId) => {
      const path = runtimeNetwork.getPeerConnectionInfo?.().find((entry) => entry.peerId === remotePeerId)?.path;
      return path === "relay" ? "relayed" : path ?? "unknown";
    },
    onRejected: (diagnostic) => {
      log.warn(diagnostic.event, diagnostic);
      if (diagnostic.authenticatedPeerId) void trust.isTrusted(diagnostic.authenticatedPeerId).then((trusted) => { if (!trusted) return runtimeNetwork.disconnect?.(diagnostic.authenticatedPeerId!); });
    },
    onChanged: () => emitState(),
  });
  let mainWindow: BrowserWindow | null = null;
  let relayWindow: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let quitting = false;
  let shutdownStarted = false;
  let shutdownComplete = false;
  let runtimeShutdownHandler: (() => void | Promise<void>) | null = null;
  const pendingSelfPeerUpdates = new Set<Promise<void>>();

  async function getState() {
    const clips = await history.exportAll();
    const devices = await trust.list();
    const peers = transport.getConnectedPeers();
    const peerConnections = transport.getPeerConnectionInfo?.() ?? [];
    const relayConnections = transport.getRelayConnectionInfo?.() ?? [];
    // const identity = await ensureIdentityAddrs(await identitySvc.get());
    const identity = toPublicDeviceIdentity(await identitySvc.get());
    return {
      clips,
      devices,
      // TODO: why pendingRequests is part of the application and not part of trust manager?
      pending: pendingRequests,
      waiting: pairingSessions.waiting(),
      pairingErrors: pairingSessions.errors(),
      peers,
      peerConnections,
      relayConnections,
      identity,
      pinnedIds,
      relayAddresses,
      // TODO: remove diagnostics
      // diagnostics: {
      //   lastClipboardCheck,
      //   lastClipboardPreview,
      //   lastClipboardError,
      // },
    };
  }

  async function emitState() {
    const state = await getState();
    await runtimeAdapter.publicState.publish(state);
  }

  // TODO: streamline logging
  type LogPayload = {
    level: "info" | "warn" | "error" | "debug";
    message: string;
    data?: any;
  };
  function broadcastLog({ level, message, data }: LogPayload) {
    const logger = (log as any)[level] || console.log;
    logger(message, data || "");
    BrowserWindow.getAllWindows().forEach((win) =>
      win.webContents.send("clipp:log", { level, message, data })
    );
  }

  function scheduleSelfPeerUpdate(multiaddrs: string[]) {
    const cleaned = dedupeMultiaddrs(
      multiaddrs.filter((addr) => typeof addr === "string" && addr.length > 0)
    );
    if (quitting) return;

    const task = (async () => {
      try {
        if (quitting) return;
        await identitySvc.updateMultiaddrs(cleaned);
      } catch (err) {
        if (!quitting) {
          (log as any).warn("Failed to persist updated multiaddrs", err);
        }
        return;
      }
      if (!quitting) {
        await emitState();
      }
    })();

    pendingSelfPeerUpdates.add(task);
    task.finally(() => pendingSelfPeerUpdates.delete(task));
  }

  function currentTransportMultiaddrs() {
    try {
      return transport.getSelfMultiaddrs?.() ?? [];
    } catch {
      return [];
    }
  }

  async function waitForCurrentTransportMultiaddrs(timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const addrs = currentTransportMultiaddrs();
      if (addrs.length > 0) return addrs;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return currentTransportMultiaddrs();
  }

  function bindTransportHandlers(target: any) {
    if (!target || (target as any).__clippBound) return;
    (target as any).__clippBound = true;
    target.onPeerConnected(() => void emitState());
    target.onPeerDisconnected(() => void emitState());
    target.onRelayConnectionChanged?.(() => void emitState());
    if (typeof target.onSelfPeerUpdate === "function") {
      target.onSelfPeerUpdate((multiaddrs: string[]) => {
        scheduleSelfPeerUpdate(multiaddrs);
      });
    }
  }

  async function startLocalServices() {
    pairingSessions.start();
    history.onNew(async () => {
      await emitState();
    });

    bindTransportHandlers(transport);
    await pairingPending?.start();

    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("approved", async (d: any) => {
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== d.deviceId
      );
      emitState();
      void pairedConnections.reconnectNow();
      (log as any).info("Device approved", d.deviceId);
    });
    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("rejected", async (d: any) => {
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== d.deviceId
      );
      emitState();
      (log as any).info("Device rejected", d.deviceId);
    });
    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("removed", () => emitState());

    clipboardSync.start();
  }

  async function startNetworkServices() {
    await ensureMessagingStarted();
    pairedConnections.start();
  }

  async function restartMessaging() {
    try {
      pairedConnections.stop();
      await transport.stop();
    } catch {
      // ignore stop failures
    }
    messagingStarted = false;
    transport = createLibp2pMessagingTransport({
      peerId,
      privateKey,
      relayAddresses,
      enableWebRTCDirect: true,
      enableDCUtR: true,
      enableTcp: true,
      peerRecordStore,
      isPeerKnown: (remotePeerId) => trust.isTrusted(remotePeerId),
    });
    pairedConnections = createPairedPeerConnectionManager({
      transport,
      getPairedPeers: () => trust.list(),
    });
    clipMessaging = createTrustedClipMessenger(transport, (id: string) => trust.isTrusted(id));
    bindTransportHandlers(transport);
    runtimeNetwork.bindCurrent();
    clipboardSync.bindMessaging(clipMessaging as any);
    await ensureMessagingStarted();
    pairedConnections.start();
    await emitState();
  }

  async function updateRelayAddresses(addrs: string[]) {
    relayAddresses = normalizeRelayAddrs(addrs.filter(Boolean));
    await kvStore.set("relayAddresses", relayAddresses);
    // await ensureIdentityAddrs(await trust.getLocalIdentity());
    await restartMessaging();
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 520,
      height: 760,
      minWidth: 480,
      minHeight: 640,
      show: false,
      backgroundColor: "#0b0f1b",
      autoHideMenuBar: true,
      icon: appIconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const html = path.join(__dirnameFallback, "renderer/index.html");
    if (devUrl) {
      mainWindow.loadURL(devUrl).catch(() => {
        mainWindow?.loadFile(html);
      });
    } else {
      mainWindow.loadFile(html);
    }

    mainWindow.on("close", (event) => {
      if (quitting) return;
      event.preventDefault();
      mainWindow?.hide();
      if (process.platform === "darwin") app.dock?.hide();
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
    });

    return mainWindow;
  }

  function showWindow() {
    if (!mainWindow) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  }

  // TODO: make reusable component
  function buildRelayWindowHtml() {
    const placeholder = "/dns4/relay.example.com/tcp/443/wss/p2p/<relay-id>";
    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Relay addresses</title>
          <style>
            * { box-sizing: border-box; }
            body { margin:0; padding:16px; background:#0d1018; color:#e5e7eb; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .card { background:#131623; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px; box-shadow:0 12px 36px rgba(0,0,0,0.35); }
            h1 { margin:0 0 6px; font-size:18px; }
            p { margin:0 0 12px; color:#9ca3af; }
            textarea { width:100%; min-height:160px; resize:vertical; background:#0f1119; color:#f3f4f6; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:10px; font: 13px/1.4 "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
            textarea:focus { outline:1px solid #7c3aed; }
            .actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
            button { border:none; border-radius:10px; padding:10px 14px; background:#7c3aed; color:#fff; font-weight:600; cursor:pointer; }
            button.secondary { background:rgba(255,255,255,0.08); color:#e5e7eb; }
            button:disabled { opacity:0.6; cursor:default; }
            .status { margin-top:8px; min-height:18px; font-size:12px; color:#9ca3af; }
            .status[data-tone="ok"] { color:#22c55e; }
            .status[data-tone="error"] { color:#f87171; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Relay addresses</h1>
            <p>One address per line. Changes take effect immediately.</p>
            <textarea id="relayInput" placeholder="${placeholder}"></textarea>
            <div class="actions">
              <button id="saveBtn">Save</button>
              <button class="secondary" id="closeBtn">Close</button>
            </div>
            <div class="status" id="status"></div>
          </div>
          <script>
            (function() {
              const textarea = document.getElementById("relayInput");
              const saveBtn = document.getElementById("saveBtn");
              const closeBtn = document.getElementById("closeBtn");
              const status = document.getElementById("status");

              function setStatus(msg, tone) {
                status.textContent = msg || "";
                if (tone) status.dataset.tone = tone;
                else status.removeAttribute("data-tone");
              }

              async function loadState() {
                try {
                  const state = await window.clipp.getState();
                  textarea.value = (state?.relayAddresses || []).join("\\n");
                  setStatus("");
                } catch (err) {
                  console.error(err);
                  setStatus("Failed to load current relays", "error");
                }
              }

              saveBtn.addEventListener("click", async () => {
                const addrs = textarea.value.split(/\\n+/).map((s) => s.trim()).filter(Boolean);
                saveBtn.disabled = true;
                setStatus("Saving…");
                try {
                  await window.clipp.setRelayAddresses(addrs);
                  setStatus("Saved", "ok");
                } catch (err) {
                  console.error(err);
                  setStatus("Failed to save relay addresses", "error");
                } finally {
                  saveBtn.disabled = false;
                }
              });

              closeBtn.addEventListener("click", () => window.close());

              const unsubscribe = window.clipp.onUpdate?.((state) => {
                textarea.value = (state?.relayAddresses || []).join("\\n");
              });
              window.addEventListener("beforeunload", () => {
                if (unsubscribe) unsubscribe();
              });
              loadState();
            })();
          </script>
        </body>
      </html>
    `;
  }

  // TODO: make reusable component
  function openRelayWindow() {
    if (relayWindow && !relayWindow.isDestroyed()) {
      relayWindow.show();
      relayWindow.focus();
      return relayWindow;
    }
    relayWindow = new BrowserWindow({
      width: 480,
      height: 420,
      minWidth: 420,
      minHeight: 360,
      show: false,
      backgroundColor: "#0f1119",
      autoHideMenuBar: true,
      title: "Relay addresses",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    relayWindow.once("closed", () => {
      relayWindow = null;
    });
    const html = buildRelayWindowHtml();
    relayWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    relayWindow.once("ready-to-show", () => {
      relayWindow?.show();
    });
    return relayWindow;
  }

  function pickTrayIcon(): Electron.NativeImage {
    for (const candidate of trayIconCandidates) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        if (
          candidate.includes("trayTemplate") &&
          process.platform === "darwin"
        ) {
          img.setTemplateImage?.(true);
        } else {
          img.setTemplateImage?.(false);
        }
        return img;
      }
    }
    return nativeImage.createEmpty();
  }

  function createTray() {
    let icon = pickTrayIcon();
    if (icon.isEmpty()) {
      // Last resort: create a simple 1x1 icon to avoid crash/blank
      icon = nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
      );
    }
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: "Open Clipp", click: () => showWindow() },
      { label: "Configure Relays", click: () => openRelayWindow() },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip("Clipp – clipboard sync");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => tray?.popUpContextMenu());
  }

  async function shutdownServices() {
    quitting = true;
    await pairingSessions.stop();
    clipboardSync.stop();
    pairedConnections.stop();
    try {
      await transport.stop();
    } catch (err) {
      (log as any).warn("Messaging transport stop failed", err);
    }
    if (pendingSelfPeerUpdates.size > 0) {
      await Promise.allSettled(Array.from(pendingSelfPeerUpdates));
    }
    try {
      db.close();
    } catch (err) {
      (log as any).warn("Database close failed", err);
    }
  }

  const runtimeNotifications = createClosableRuntimeNotifications({
    create(message, events) {
      if (!Notification.isSupported()) return undefined;
      const notification = new Notification({
        title: message.title,
        body: message.body,
        silent: false,
      });
      notification.on("click", events.select);
      notification.on("close", events.closed);
      notification.show();
      return { close: () => notification.close() };
    },
  });
  const runtimeNetwork = createRuntimeNetworkProxy(() => transport);
  const membershipReconciler = createMembershipReconciler({
    transport: runtimeNetwork,
    identity: identitySvc,
    ...createMembershipPeerRecordBridge({ transport: runtimeNetwork, identity: identitySvc }),
    onChanged: emitState,
  });
  const runtimeAdapter = createElectronRuntimeAdapter({
    storage: kvStore,
    identityKey: IDENTITY_KEY,
    applicationStateKey: "runtimeApplicationState",
    initialApplicationState: () => ({} as Record<string, unknown>),
    clipboard: {
      readText: async () => clipboard.readText() ?? "",
      writeText: async (text) => clipboard.writeText(text),
    },
    notifications: runtimeNotifications,
    lifecycle: {
      onShutdown(handler) {
        runtimeShutdownHandler = handler;
        return () => {
          if (runtimeShutdownHandler === handler) runtimeShutdownHandler = null;
        };
      },
      openApprovalView: () => showWindow(),
    },
    network: runtimeNetwork,
    clock: systemRuntimeClock,
    publicState: {
      read: getState,
      async publish(state) {
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("clipp:update", state);
        });
      },
    },
    relays: {
      readAddresses: async () => [...relayAddresses],
      async updateAddresses(addresses) {
        await updateRelayAddresses(addresses);
        return [...relayAddresses];
      },
    },
  });
  pairingPending = createPendingTrustRequestCoordinator({
    localPeerId: async () => peerId.toString(),
    store: createKVPendingTrustRequestStore({ storage: kvStore, key: "pairingPendingRequests" }),
    notifications: runtimeAdapter.notifications,
    lifecycle: runtimeAdapter.lifecycle,
    clock: systemRuntimeClock,
    verify: verifyPairingTrustRequestSignature,
    membership: trust,
    sendResponse: (peerId, frame) => runtimeNetwork.send(PAIRING_PROTOCOL, peerId, frame),
    responseIdentity: async () => { const identity = await identitySvc.get(); return { deviceName: identity.deviceName, nameRevision: BigInt(identity.nameRevision ?? 0) }; },
    connectionPath: (remotePeerId) => {
      const path = runtimeNetwork.getPeerConnectionInfo?.().find((entry) => entry.peerId === remotePeerId)?.path;
      return path === "relay" ? "relayed" : path ?? "unknown";
    },
    onRejected: (diagnostic) => {
      log.warn(diagnostic.event, diagnostic);
      if (diagnostic.authenticatedPeerId) void trust.isTrusted(diagnostic.authenticatedPeerId).then((trusted) => { if (!trusted) return runtimeNetwork.disconnect?.(diagnostic.authenticatedPeerId!); });
    },
    onChanged: async (requests) => {
      pendingRequests = requests.map((request) => ({ deviceId: request.initiatorPeerId, deviceName: request.deviceName, publicKey: "", multiaddrs: [], createdAt: Number(request.expiresAtUnixMs) }));
      await emitState();
    },
  });
  function bindPairingHandler(target: typeof transport) {
    target.onMessage(PAIRING_PROTOCOL, (from, frame) => {
      void pairingSessions.receive(
        from,
        frame,
        (peerId, requestFrame) => pairingPending?.receive(peerId, requestFrame) ?? Promise.resolve(false),
      ).catch((error) => log.warn("Pairing message processing failed", error));
    });
  }
  bindPairingHandler(runtimeNetwork);
  membershipReconciler.start();
  const sharedRuntime = createRuntimeOrchestrator({
    adapter: runtimeAdapter,
    start: () => startIdentityBoundRuntimeServices({
      initializeIdentity: async () => {
        await identitySvc.get();
      },
      startLocalServices,
      startNetworkServices,
      onNetworkingFailure: (error) => {
        (log as any).warn("Messaging start failed", error);
      },
    }),
    stop: shutdownServices,
  });

  app.whenReady().then(async () => {
    createWindow();
    createTray();
    await sharedRuntime.start();
  });

  app.on("before-quit", (event) => {
    quitting = true;
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    void (async () => {
      try {
        if (runtimeShutdownHandler) await runtimeShutdownHandler();
        else await shutdownServices();
      } finally {
        shutdownComplete = true;
        app.quit();
      }
    })();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    showWindow();
  });

  ipcMain.handle("clipp:get-state", async () => {
    return await getState();
  });

  ipcMain.handle("clipp:get-identity", async () => {
    const id = await identitySvc.get();
    // const id = await ensureIdentityAddrs(await trust.getLocalIdentity());
    return toPublicDeviceIdentity(id);
  });

  ipcMain.handle("clipp:get-initialization-error", async () => {
    return (await identitySvc.getInitializationError()) ?? null;
  });

  ipcMain.handle("clipp:retry-identity-initialization", async () => {
    await identitySvc.retryInitialization();
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("clipp:rename-identity", async (_evt, name: string) => {
    await identitySvc.rename(name);
    await emitState();
    // return await ensureIdentityAddrs(id);
    return toPublicDeviceIdentity(await identitySvc.get());
  });

  ipcMain.handle("clipp:set-relay-addresses", async (_evt, addrs: string[]) => {
    await updateRelayAddresses(Array.isArray(addrs) ? addrs : []);
    return { ok: true, relayAddresses };
  });

  ipcMain.handle("clipp:delete-clip", async (_evt, id: string) => {
    await history.remove(id);
    await emitState();
  });

  ipcMain.handle("clipp:clear-history", async () => {
    try {
      db.prepare("DELETE FROM history").run();
      await emitState();
    } catch (err) {
      (log as any).error?.("Failed to clear history", err);
      throw err;
    }
  });

  ipcMain.handle("clipp:unpair-device", async (_evt, id: string) => {
    await trust.remove(id);
    await emitState();
  });

  ipcMain.handle("clipp:rename-device", async (_evt, payload: { id: string; name: string }) => {
    const device = await trust.rename(payload.id, payload.name);
    await emitState();
    return device;
  });

  ipcMain.handle("clipp:toggle-pin", async (_evt, id: string) => {
    const set = new Set(pinnedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    pinnedIds = Array.from(set);
    await kvStore.set("pinnedIds", pinnedIds);
    await emitState();
    return { pinnedIds };
  });

  ipcMain.handle(
    "clipp:respond-trust",
    async (_evt, payload: { accept: boolean; device: any }) => {
      const { accept, device } = payload;
      await pairingPending?.decide(device.deviceId, accept ? "accepted" : "rejected");
      // if (accept) {
      //   await trust.add(device);
      // } else {
      //   await trust.reject(device.deviceId);
      // }
      await emitState();
    }
  );

  ipcMain.handle("clipp:pair-text", async (_evt, txt: string) => {
    await ensureMessagingStarted();
    const target = decodePairingTarget(txt);
    if (!target) return { ok: false, error: "invalid" as const };
    if (!privateKey) return { ok: false, error: "identity_unavailable" as const };
    try {
      await importPairingTargetAndRequest({ text: txt, network: runtimeNetwork, request: pairingSessions.request });
      return { ok: true };
    } catch {
      return { ok: false, error: "dial_failed" as const };
    }
  });

  // TODO: confirm that share-now is not used
  // ipcMain.handle("clipp:share-now", async () => {
  //   await ensureMessagingStarted();
  //   const text = clipboard.readText();
  //   const id = await trust.getLocalIdentity();
  //   const clip = normalizeClipboardContent(text, id.deviceId);
  //   if (clip) {
  //     await history.add(clip, id.deviceId, true);
  //     const message = {
  //       type: "CLIP" as const,
  //       from: id.deviceId,
  //       clip,
  //       sentAt: Date.now(),
  //     };
  //     await clipMessaging.broadcast(message as any);
  //     await emitState();
  //     return { ok: true };
  //   }
  //   return { ok: false };
  // });

  ipcMain.handle("clipp:open-qr-window", async () => {
    await ensureMessagingStarted();
    const id = await identitySvc.get();
    const currentAddrs = dedupeMultiaddrs(await waitForCurrentTransportMultiaddrs());
    const persistedAddrs = id.multiaddrs && id.multiaddrs.length ? id.multiaddrs : [];
    const persistedFallback = relayAddresses.length
      ? persistedAddrs
      : persistedAddrs.filter((addr) => !addr.includes("/p2p-circuit"));
    const addrs = pairingAdvertiseAddrs(currentAddrs.length ? currentAddrs : persistedFallback);
    if (!addrs.length) {
      throw new Error("No multiaddrs available");
    }
    if (currentAddrs.length) {
      scheduleSelfPeerUpdate(currentAddrs);
    }
    if (!transport.getSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
    const signedPeerRecord = await transport.getSignedPeerRecord();
    const txt = encodePairingTarget({ targetPeerId: peerId.toString(), signedPeerRecord, deviceNameHint: id.deviceName });
    const img = await QRCode.toDataURL(txt, { errorCorrectionLevel: "L", margin: 0, scale: 2 });
    return {
      image: img,
      text: txt,
    };
  });
}

void bootstrap().catch((error) => {
  (log as any).error?.("Clipp bootstrap failed", { error: (error as Error).message });
});
