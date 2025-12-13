import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  Tray,
  Menu,
} from "electron";
import path from "node:path";
import wrtc from "@koush/wrtc";
// import WebSocket from "ws";
import { webcrypto } from "node:crypto";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import {
  openDatabase,
  SQLiteHistoryBackend,
  SQLiteKVStore,
} from "./storage.js";
import type { Clip } from "../../../packages/core/models/Clip.js";
import { encode } from "../../../packages/core/qr/index.js";
import { encodePairing } from "../../../packages/core/pairing/encode.js";
// import { E } from "vite/dist/node/moduleRunnerTransport.d-DJ_mE5sf.js";

const __dirnameFallback =
  typeof __dirname !== "undefined" ? (__dirname as string) : "";
const isDev = !app.isPackaged;
const preloadPath = path.join(__dirnameFallback, "preload.js");

// Ensure WebRTC globals exist before loading libp2p/webrtc-star.
const wrtcImpl: any = wrtc;
(globalThis as any).RTCPeerConnection =
  (globalThis as any).RTCPeerConnection || wrtcImpl?.RTCPeerConnection;
(globalThis as any).RTCSessionDescription =
  (globalThis as any).RTCSessionDescription || wrtcImpl?.RTCSessionDescription;
(globalThis as any).RTCIceCandidate =
  (globalThis as any).RTCIceCandidate || wrtcImpl?.RTCIceCandidate;
(globalThis as any).WebSocket = (globalThis as any).WebSocket || (WebSocket as any);
try {
  if (!(globalThis as any).navigator) {
    (globalThis as any).navigator = { userAgent: "Clipp Desktop" } as any;
  }
} catch { }
try {
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto;
  }
} catch { }

async function bootstrap() {
  // Dynamically import libp2p deps after globals are set.
  // TODO: redo the imports
  const [
    { createMessagingLayer },
    { MemoryHistoryStore },
    trustMod,
    clipboardMod,
    syncMod,
    normalizeMod,
    decodeMod,
    log,
    { deviceIdToPeerId, deviceIdToPeerIdObject, peerIdFromPrivateKeyBase64 },
    { privateKeyFromProtobuf },
  ] = await Promise.all([
    import("../../../packages/core/network/engine.js"),
    import("../../../packages/core/history/store.js"),
    import("../../../packages/core/trust/trusted-devices.js"),
    import("../../../packages/core/clipboard/service.js"),
    import("../../../packages/core/sync/clipboardSync.js"),
    import("../../../packages/core/clipboard/normalize.js"),
    import("../../../packages/core/pairing/decode.js"),
    import("../../../packages/core/logger.js"),
    import("../../../packages/core/network/peerId.js"),
    import("@libp2p/crypto/keys"),
  ]);

  const { createTrustManager, TrustedDevice } = trustMod as any;
  const { createPollingClipboardService } = clipboardMod as any;
  const { createClipboardSyncController } = syncMod as any;
  const { normalizeClipboardContent } = normalizeMod as any;
  const { decodePairing } = decodeMod as any;
  const logLevel = process.env.CLIPP_LOG_LEVEL || "debug";
  // const logLevel = process.env.CLIPP_LOG_LEVEL || "info";
  (log as any).setLogLevel?.(logLevel);
  (log as any).info?.("Clipp Electron bootstrap", { logLevel });

  const dbPath = path.join(app.getPath("userData"), "clipp.sqlite");
  const db = openDatabase(dbPath);
  const kvStore = new SQLiteKVStore(db);
  const history = new MemoryHistoryStore(new SQLiteHistoryBackend(db));
  const trust = createTrustManager(kvStore);
  // TODO: remove relayAddrEnv
  const relayAddrEnv =
    process.env.CLIPP_RELAY_ADDR ||
    process.env.CLIPP_RELAY_MULTIADDR ||
    "/ip4/127.0.0.1/tcp/47891/ws/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
  let relayAddresses = normalizeRelayAddrs(
    (await kvStore.get<string[]>("relayAddresses"))?.filter(Boolean) ||
    (relayAddrEnv ? [relayAddrEnv] : [])
  );
  const localIdentity = await ensureIdentityAddrs(await trust.getLocalIdentity());
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

  // TODO: decide if trust manager should be injected into messaging engine
  let messaging = createMessagingLayer({ trustStore: trust, peerId, privateKey, relayAddresses });
  let messagingStarted = false;

  async function ensureMessagingStarted() {
    if (messagingStarted) return;
    try {
      await messaging.start();
      messagingStarted = true;
    } catch (err) {
      messagingStarted = false;
      throw err;
    }
  }
  // TODO: why this is here and not in clipboard service?
  let lastClipboardCheck: number | null = null;
  let lastClipboardPreview: string | null = null;
  let lastClipboardError: string | null = null;
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
  async function ensureIdentityAddrs(id: any) {
    const { DEFAULT_WEBRTC_STAR_RELAYS } = await import(
      "../../../packages/core/network/constants.js"
    );
    const peerId = await deviceIdToPeerId(id.deviceId);

    // Start from existing multiaddrs (if any) and ensure relay + webrtc addrs are present.
    // TODO: remove webrtc star. Not read from here
    const existing = Array.isArray(id?.multiaddrs) ? [...id.multiaddrs] : [];
    const derived: string[] = [];
    const relaySet = normalizeRelayAddrs(relayAddresses || []);
    if (relaySet.length) {
      relaySet.forEach((addr) => derived.push(`${addr}/p2p-circuit/p2p/${peerId}`));
    } else if (relayAddrEnv) {
      derived.push(`${relayAddrEnv}/p2p-circuit/p2p/${peerId}`);
    }
    derived.push(...DEFAULT_WEBRTC_STAR_RELAYS.map((addr: string) => `${addr}/p2p/${peerId}`));

    const merged = dedupeMultiaddrs([...derived, ...existing]);
    const changed =
      merged.length !== existing.length || merged.some((v, idx) => v !== existing[idx]) || !id.multiaddr;
    id.multiaddrs = merged;
    if (!id.multiaddr && merged[0]) {
      id.multiaddr = merged[0];
    }
    if (changed) {
      // Persist updated identity so QR pairing uses latest addresses.
      await kvStore.set("localDeviceIdentity", id);
    }
    return id;
  }

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
    return createPollingClipboardService({
      pollIntervalMs: 1200,
      getSenderId: async () => {
        const id = await trust.getLocalIdentity();
        return id.deviceId;
      },
      readText: async () => {
        try {
          const txt = clipboard.readText() ?? "";
          lastClipboardCheck = Date.now();
          lastClipboardPreview = txt ? txt.slice(0, 140) : "";
          lastClipboardError = null;
          return txt;
        } catch (err: any) {
          lastClipboardError = err?.message || "Failed to read clipboard";
          lastClipboardCheck = Date.now();
          return "";
        }
      },
      writeText: async (text: string) => {
        clipboard.writeText(text);
      },
    });
  }

  // TODO: think about moving definition for readText and WriteText to separate interface
  // and implement it as electronClipboard/chromeClipboard/capacitorClipboard depending on the platrofrm
  const clipboardSvc = createElectronClipboardService();
  const clipboardSync = createClipboardSyncController({
    clipboard: clipboardSvc,
    history,
    getLocalDeviceId: async () => {
      const id = await trust.getLocalIdentity();
      return id.deviceId;
    },
  });
  clipboardSync.bindMessaging(messaging as any);

  let pendingRequests: (typeof TrustedDevice)[] = [];
  let mainWindow: BrowserWindow | null = null;
  let relayWindow: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let quitting = false;

  async function getState() {
    const clips = await history.exportAll();
    const devices = await trust.list();
    const peers = messaging.getConnectedPeers();
    const identity = await ensureIdentityAddrs(await trust.getLocalIdentity());
    return {
      clips,
      devices,
      // TODO: why pendingRequests is part of the application and not part of trust storage?
      pending: pendingRequests,
      peers,
      identity,
      pinnedIds,
      relayAddresses,
      // TODO: remove diagnostics
      diagnostics: {
        lastClipboardCheck,
        lastClipboardPreview,
        lastClipboardError,
      },
    };
  }

  async function emitState() {
    const state = await getState();
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("clipp:update", state);
    });
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

  // TODO: Move this to core package to avoid exposing low level send message API from MessagingLayer
  async function sendTrustAck(device: any, accepted: boolean) {
    await ensureMessagingStarted();
    const id = await trust.getLocalIdentity();
    const target =
      device.multiaddrs?.[0] || device.multiaddr || device.deviceId;
    const ack = {
      type: "trust-ack" as const,
      from: id.deviceId,
      payload: { id: device.deviceId, accepted },
      sentAt: Date.now(),
    };
    await messaging.sendMessage(target, ack as any).catch(() => { });
  }

  // TODO: main should not know about message types
  function bindMessagingHandlers(target: any) {
    if (!target || (target as any).__clippBound) return;
    (target as any).__clippBound = true;
    target.onMessage(async (msg: any) => {
      if (msg.type === "trust-request") {
        const dev = msg.payload as any;
        await trust.handleTrustRequest(dev);
      }
    });
    target.onPeerConnected(() => void emitState());
    target.onPeerDisconnected(() => void emitState());
  }

  async function startServices() {
    history.onNew(async () => {
      await emitState();
    });

    bindMessagingHandlers(messaging);

    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("request", (d: any) => {
      pendingRequests.push(d);
      emitState();
      (log as any).info("Trust request received", d.deviceId);
    });
    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("approved", async (d: any) => {
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== d.deviceId
      );
      await sendTrustAck(d, true);
      emitState();
      (log as any).info("Device approved", d.deviceId);
    });
    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("rejected", async (d: any) => {
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== d.deviceId
      );
      await sendTrustAck(d, false);
      emitState();
      (log as any).info("Device rejected", d.deviceId);
    });
    // TODO: Need to think how to move reusable part of this logic to core package instead of repeating it for different types of UI
    trust.on("removed", () => emitState());

    try {
      await ensureMessagingStarted();
    } catch (err) {
      (log as any).warn("Messaging start failed", err);
    }
    clipboardSync.start();
  }

  async function restartMessaging() {
    try {
      await messaging.stop();
    } catch {
      // ignore stop failures
    }
    messagingStarted = false;
    messaging = createMessagingLayer({ trustStore: trust, peerId, relayAddresses });
    bindMessagingHandlers(messaging);
    clipboardSync.bindMessaging(messaging as any);
    await ensureMessagingStarted();
    await emitState();
  }

  async function updateRelayAddresses(addrs: string[]) {
    relayAddresses = normalizeRelayAddrs(addrs.filter(Boolean));
    await kvStore.set("relayAddresses", relayAddresses);
    await ensureIdentityAddrs(await trust.getLocalIdentity());
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

  app.whenReady().then(async () => {
    createWindow();
    createTray();
    await startServices();
  });

  app.on("before-quit", () => {
    quitting = true;
    clipboardSync.stop();
    messaging.stop();
    db.close();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    showWindow();
  });

  ipcMain.handle("clipp:get-state", async () => {
    return await getState();
  });

  ipcMain.handle("clipp:get-identity", async () => {
    const id = await ensureIdentityAddrs(await trust.getLocalIdentity());
    return id;
  });

  ipcMain.handle("clipp:rename-identity", async (_evt, name: string) => {
    const id = await trust.renameLocalIdentity(name);
    await emitState();
    return await ensureIdentityAddrs(id);
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
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== device.deviceId
      );
      if (accept) {
        await trust.add(device);
      } else {
        await sendTrustAck(device, false);
      }
      await emitState();
    }
  );

  ipcMain.handle("clipp:pair-text", async (_evt, txt: string) => {
    await ensureMessagingStarted();
    const pairing = decodePairing(txt);
    if (!pairing) return { ok: false, error: "invalid" as const };
    const id = await trust.getLocalIdentity();
    const peerId = await deviceIdToPeerId(pairing.deviceId);
    let targetAddrs =
      pairing.multiaddrs || (pairing.multiaddr ? [pairing.multiaddr] : []);
    let parseErrors: Array<{ addr: string; error: string }> = [];
    let valid = validMultiaddrs(targetAddrs, parseErrors);
    // if (!valid.length) {
    //   const { DEFAULT_WEBRTC_STAR_RELAYS } = await import(
    //     "../../../packages/core/network/constants.js"
    //   );
    //   const derived = DEFAULT_WEBRTC_STAR_RELAYS.map(
    //     (addr: string) => `${addr}/p2p/${peerId}`
    //   );
    //   targetAddrs = derived;
    //   parseErrors = [];
    //   valid = validMultiaddrs(targetAddrs, parseErrors);
    //   broadcastLog({
    //     level: "info",
    //     message: "No valid addrs in pairing, using defaults",
    //     data: {
    //       derived: targetAddrs,
    //       parseErrors,
    //     },
    //   });
    // }
    const targets: Multiaddr[] = valid;
    if (!targets.length) {
      broadcastLog({
        level: "warn",
        message: "Pairing failed: no target multiaddr",
        data: {
          pairingDeviceId: pairing.deviceId,
          provided: pairing.multiaddrs || pairing.multiaddr,
          parseErrors,
          derived: targetAddrs,
        },
      });
      return { ok: false, error: "no_target" as const };
    }
    broadcastLog({
      level: "info",
      message: "Sending trust request",
      data: {
        local: id.deviceId,
        targets: targets.map((t) => t.toString()),
        candidates: targetAddrs,
      },
    });
    const request = {
      type: "trust-request" as const,
      from: id.deviceId,
      payload: id,
      sentAt: Date.now(),
    };
    for (const target of targets) {
      try {
        await messaging.sendMessage(target as any, request as any);
        return { ok: true };
      } catch (err) {
        broadcastLog({
          level: "warn",
          message: "Failed to send trust request to target",
          data: {
            target: target?.toString?.(),
            candidates: targetAddrs,
            error: (err as any)?.message || String(err),
          },
        });
      }
    }
    broadcastLog({
      level: "warn",
      message: "Failed to send trust request to all targets",
      data: { targets: targetAddrs },
    });
    return { ok: false, error: "dial_failed" as const };
  });

  ipcMain.handle("clipp:share-now", async () => {
    await ensureMessagingStarted();
    const text = clipboard.readText();
    const id = await trust.getLocalIdentity();
    const clip = normalizeClipboardContent(text, id.deviceId);
    if (clip) {
      await history.add(clip, id.deviceId, true);
      const message = {
        type: "CLIP" as const,
        from: id.deviceId,
        clip,
        sentAt: Date.now(),
      };
      await messaging.broadcast(message as any);
      await emitState();
      return { ok: true };
    }
    return { ok: false };
  });

  // TODO: make reusable component
  ipcMain.handle("clipp:open-qr-window", async () => {
    // Ensure we have an active relay reservation before showing the QR so peers can dial us immediately.
    await ensureMessagingStarted();
    const id = await ensureIdentityAddrs(await trust.getLocalIdentity());
    const addrs = id.multiaddrs && id.multiaddrs.length ? id.multiaddrs : [];
    if (!addrs.length) {
      throw new Error("No multiaddrs available");
    }
    const info = {
      deviceId: id.deviceId,
      deviceName: id.deviceName,
      multiaddrs: addrs,
      publicKey: id.publicKey,
    };
    const img = await encode(info);
    const txt = encodePairing(info);
    const qrWin = new BrowserWindow({
      width: 420,
      height: 520,
      resizable: false,
      autoHideMenuBar: true,
      title: "Pair this device",
      backgroundColor: "#0f0f13",
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    const html = `
      <html>
        <head>
          <style>
            body { margin:0; padding:20px; background:#0f0f13; color:#e5e7eb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .card { background:#14151c; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px; text-align:center; }
            button { margin-top:14px; padding:10px 12px; border-radius:12px; border: none; background: linear-gradient(135deg, #7c3aed, #a855f7); color:#fff; font-weight:600; cursor:pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>Pair this device</h3>
            <img src="${img}" style="width:220px;height:220px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);" />
            <div style="margin-top:8px;font-size:12px;color:#9ca3af;word-break:break-all;">${info.deviceId
      }</div>
            <button onclick="require('electron').clipboard.writeText('${txt.replace(
        /'/g,
        "\\'"
      )}')">Copy QR text</button>
          </div>
        </body>
      </html>
    `;
    qrWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  });
}

void bootstrap();
