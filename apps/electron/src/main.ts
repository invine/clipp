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
import { webcrypto } from "node:crypto";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import {
  openDatabase,
  FileHistoryBackend,
  FileKVStore,
} from "./storage.js";
import type { Clip } from "../../../packages/core/models/Clip.js";
import { encode } from "../../../packages/core/qr/index.js";
import { encodePairing } from "../../../packages/core/pairing/encode.js";
import { E } from "vite/dist/node/moduleRunnerTransport.d-DJ_mE5sf.js";

const __dirnameFallback =
  typeof __dirname !== "undefined" ? (__dirname as string) : "";
const isDev = !app.isPackaged;

function ensureNavigatorAndCrypto() {
  try {
    const g = globalThis as any;
    if (!g.navigator) {
      g.navigator = { userAgent: "Clipp Desktop" } as any;
    }
  } catch {}
  try {
    const g = globalThis as any;
    if (!g.crypto) {
      g.crypto = webcrypto;
    }
  } catch {}
}

function hasWebRTCSupport() {
  const g = globalThis as any;
  return (
    typeof g.RTCPeerConnection !== "undefined" ||
    typeof g.webkitRTCPeerConnection !== "undefined"
  );
}

async function ensureWebRTCGlobals() {
  if (hasWebRTCSupport()) return;
  const wrtc = await loadNodeWebRTC();
  if (!wrtc) {
    console.warn(
      "[electron] No Node WebRTC implementation available; WebRTC transports will be disabled."
    );
    return;
  }
  const g = globalThis as any;
  g.RTCPeerConnection = g.RTCPeerConnection || (wrtc as any).RTCPeerConnection;
  g.RTCSessionDescription =
    g.RTCSessionDescription || (wrtc as any).RTCSessionDescription;
  g.RTCIceCandidate = g.RTCIceCandidate || (wrtc as any).RTCIceCandidate;
}

async function loadNodeWebRTC() {
  const candidates = ["wrtc", "@koush/wrtc"];
  for (const name of candidates) {
    try {
      const mod = await import(name);
      return (mod as any).default ?? mod;
    } catch (err: any) {
      const code = err?.code || "";
      if (
        code !== "ERR_MODULE_NOT_FOUND" &&
        code !== "MODULE_NOT_FOUND" &&
        !`${err?.message || ""}`.includes("Cannot find module")
      ) {
        console.warn(`[electron] Failed to load ${name}`, err?.message || err);
      }
    }
  }
  return null;
}

async function bootstrap() {
  ensureNavigatorAndCrypto();
  await ensureWebRTCGlobals();
  // Dynamically import libp2p deps after globals are set.
  const [
    { createMessagingLayer },
    { MemoryHistoryStore },
    trustMod,
    clipboardMod,
    normalizeMod,
    decodeMod,
    log,
    { deviceIdToPeerId, deviceIdToPeerIdObject },
  ] = await Promise.all([
    import("../../../packages/core/network/engine.js"),
    import("../../../packages/core/history/store.js"),
    import("../../../packages/core/trust/trusted-devices.js"),
    import("../../../packages/core/clipboard/service.js"),
    import("../../../packages/core/clipboard/normalize.js"),
    import("../../../packages/core/pairing/decode.js"),
    import("../../../packages/core/logger.js"),
    import("../../../packages/core/network/peerId.js"),
  ]);

  const { createTrustManager, TrustedDevice } = trustMod as any;
  const { createClipboardService } = clipboardMod as any;
  const { normalizeClipboardContent } = normalizeMod as any;
  const { decodePairing } = decodeMod as any;
  const logLevel = process.env.CLIPP_LOG_LEVEL || "debug";
  // const logLevel = process.env.CLIPP_LOG_LEVEL || "info";
  (log as any).setLogLevel?.(logLevel);
  (log as any).info?.("Clipp Electron bootstrap", { logLevel });

  const relayAddrEnv =
    process.env.CLIPP_RELAY_ADDR ||
    process.env.CLIPP_RELAY_MULTIADDR ||
    "/ip4/127.0.0.1/tcp/47891/ws/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex";
  const relayAddresses = relayAddrEnv ? [relayAddrEnv] : undefined;

  const dbPath = path.join(app.getPath("userData"), "clipp-db.json");
  const db = openDatabase(dbPath);
  const kvStore = new FileKVStore(db);
  const history = new MemoryHistoryStore(new FileHistoryBackend(db));
  const trust = createTrustManager(kvStore);
  const localIdentity = await ensureIdentityAddrs(await trust.getLocalIdentity());
  const peerId = await deviceIdToPeerIdObject(localIdentity.deviceId);

  const messaging = createMessagingLayer({ trustStore: trust, peerId, relayAddresses });
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
  let lastClipboardCheck: number | null = null;
  let lastClipboardPreview: string | null = null;
  let lastClipboardError: string | null = null;
  let pinnedIds: string[] = (await kvStore.get("pinnedIds")) || [];
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

  async function ensureIdentityAddrs(id: any) {
    const { DEFAULT_WEBRTC_STAR_RELAYS } = await import(
      "../../../packages/core/network/constants.js"
    );
    const peerId = await deviceIdToPeerId(id.deviceId);

    // Start from existing multiaddrs (if any) and ensure relay + webrtc addrs are present.
    const existing = Array.isArray(id?.multiaddrs) ? [...id.multiaddrs] : [];
    const derived: string[] = [];
    if (relayAddrEnv) {
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
  const clipboardSvc = createClipboardService("custom", {
    pollIntervalMs: 1200,
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
    async sendClip(clip: Clip) {
      const id = await trust.getLocalIdentity();
      const message = {
        type: "CLIP" as const,
        from: id.deviceId,
        clip,
        sentAt: Date.now(),
      };
      await messaging.broadcast(message as any);
    },
  });

  let pendingRequests: (typeof TrustedDevice)[] = [];
  let mainWindow: BrowserWindow | null = null;
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
      pending: pendingRequests,
      peers,
      identity,
      pinnedIds,
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
    await messaging.sendMessage(target, ack as any).catch(() => {});
  }

  async function startServices() {
    clipboardSvc.onLocalClip(async (clip: Clip) => {
      const id = await trust.getLocalIdentity();
      await history.add(clip, id.deviceId, true);
      await emitState();
    });
    clipboardSvc.onRemoteClipWritten(async (_clip: Clip) => {
      await emitState();
    });
    history.onNew(async () => {
      await emitState();
    });

    messaging.onMessage(async (msg: any) => {
      if (msg.type === "CLIP" && msg.clip) {
        await clipboardSvc.writeRemoteClip(msg.clip);
      } else if (msg.type === "trust-request") {
        const dev = msg.payload as any;
        await trust.handleTrustRequest(dev);
      }
    });
    messaging.onPeerConnected(() => void emitState());
    messaging.onPeerDisconnected(() => void emitState());

    trust.on("request", (d: any) => {
      pendingRequests.push(d);
      emitState();
      (log as any).info("Trust request received", d.deviceId);
    });
    trust.on("approved", async (d: any) => {
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== d.deviceId
      );
      await sendTrustAck(d, true);
      emitState();
      (log as any).info("Device approved", d.deviceId);
    });
    trust.on("rejected", async (d: any) => {
      pendingRequests = pendingRequests.filter(
        (p) => p.deviceId !== d.deviceId
      );
      await sendTrustAck(d, false);
      emitState();
      (log as any).info("Device rejected", d.deviceId);
    });
    trust.on("removed", () => emitState());

    try {
      await ensureMessagingStarted();
    } catch (err) {
      (log as any).warn("Messaging start failed", err);
    }
    clipboardSvc.start();
  }

  function createWindow() {
    const preload = path.join(__dirnameFallback, "preload.js");
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
        preload,
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
    tray.on("click", () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        showWindow();
      }
    });
  }

  app.whenReady().then(async () => {
    createWindow();
    createTray();
    await startServices();
  });

  app.on("before-quit", () => {
    quitting = true;
    clipboardSvc.stop();
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
    if (!valid.length) {
      const { DEFAULT_WEBRTC_STAR_RELAYS } = await import(
        "../../../packages/core/network/constants.js"
      );
      const derived = DEFAULT_WEBRTC_STAR_RELAYS.map(
        (addr: string) => `${addr}/p2p/${peerId}`
      );
      targetAddrs = derived;
      parseErrors = [];
      valid = validMultiaddrs(targetAddrs, parseErrors);
      broadcastLog({
        level: "info",
        message: "No valid addrs in pairing, using defaults",
        data: {
          derived: targetAddrs,
          parseErrors,
        },
      });
    }
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

  ipcMain.handle("clipp:open-qr-window", async () => {
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
            <div style="margin-top:8px;font-size:12px;color:#9ca3af;word-break:break-all;">${
              info.deviceId
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
