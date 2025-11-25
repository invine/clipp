import { app, BrowserWindow, clipboard, ipcMain, nativeImage, Tray, Menu } from "electron";
import path from "node:path";
import wrtc from "@koush/wrtc";
import { webcrypto } from "node:crypto";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { openDatabase, SQLiteHistoryBackend, SQLiteKVStore } from "./storage.js";
import type { Clip } from "../../../packages/core/models/Clip.js";
import { encode } from "../../../packages/core/qr/index.js";
import { encodePairing } from "../../../packages/core/pairing/encode.js";

const __dirnameFallback = typeof __dirname !== "undefined" ? (__dirname as string) : "";
const isDev = !app.isPackaged;

// Ensure WebRTC globals exist before loading libp2p/webrtc-star.
const wrtcImpl: any = wrtc;
(globalThis as any).RTCPeerConnection =
  (globalThis as any).RTCPeerConnection || wrtcImpl?.RTCPeerConnection;
(globalThis as any).RTCSessionDescription =
  (globalThis as any).RTCSessionDescription || wrtcImpl?.RTCSessionDescription;
(globalThis as any).RTCIceCandidate =
  (globalThis as any).RTCIceCandidate || wrtcImpl?.RTCIceCandidate;
try {
  if (!(globalThis as any).navigator) {
    (globalThis as any).navigator = { userAgent: "Clipp Desktop" } as any;
  }
} catch {}
try {
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto;
  }
} catch {}

async function bootstrap() {
  // Dynamically import libp2p deps after globals are set.
  const [{ createMessagingLayer }, { MemoryHistoryStore }, trustMod, clipboardMod, normalizeMod, decodeMod, log] =
    await Promise.all([
      import("../../../packages/core/network/engine.js"),
      import("../../../packages/core/history/store.js"),
      import("../../../packages/core/trust/trusted-devices.js"),
      import("../../../packages/core/clipboard/service.js"),
      import("../../../packages/core/clipboard/normalize.js"),
      import("../../../packages/core/pairing/decode.js"),
      import("../../../packages/core/logger.js"),
    ]);

  const { createTrustManager, TrustedDevice } = trustMod as any;
  const { createClipboardService } = clipboardMod as any;
  const { normalizeClipboardContent } = normalizeMod as any;
  const { decodePairing } = decodeMod as any;

  const dbPath = path.join(app.getPath("userData"), "clipp.sqlite");
  const db = openDatabase(dbPath);
  const kvStore = new SQLiteKVStore(db);
  const history = new MemoryHistoryStore(new SQLiteHistoryBackend(db));
  const trust = createTrustManager(kvStore);
  const messaging = createMessagingLayer({ trustStore: trust });
  let lastClipboardCheck: number | null = null;
  let lastClipboardPreview: string | null = null;
  let lastClipboardError: string | null = null;
  const iconBase = path.resolve(process.cwd(), "apps/electron/assets/icons");
  const trayIconPath = path.join(iconBase, "clipp-trayTemplate-32.png");
  const appIconPath = path.join(iconBase, "clipp-appicon-256.png");

  async function ensureIdentityAddrs(id: any) {
    if (Array.isArray(id?.multiaddrs) && id.multiaddrs.length > 0) return id;
    const { DEFAULT_WEBRTC_STAR_RELAYS } = await import(
      "../../../packages/core/network/constants.js"
    );
    const derived = DEFAULT_WEBRTC_STAR_RELAYS.map((addr: string) => `${addr}/p2p/${id.deviceId}`);
    id.multiaddrs = derived;
    if (!id.multiaddr && derived[0]) {
      id.multiaddr = derived[0];
    }
    return id;
  }

  function validMultiaddrs(addrs: string[]): Multiaddr[] {
    const out: Multiaddr[] = [];
    for (const a of addrs) {
      try {
        const ma = multiaddr(a);
        // ensure it has a peer component we can dial
        if (ma.getPeerId()) {
          out.push(ma);
        }
      } catch {
        // ignore invalid addr
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

  let pendingRequests: typeof TrustedDevice[] = [];
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

  async function sendTrustAck(device: any, accepted: boolean) {
    const id = await trust.getLocalIdentity();
    const target = device.multiaddrs?.[0] || device.multiaddr || device.deviceId;
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
      pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
      await sendTrustAck(d, true);
      emitState();
      (log as any).info("Device approved", d.deviceId);
    });
    trust.on("rejected", async (d: any) => {
      pendingRequests = pendingRequests.filter((p) => p.deviceId !== d.deviceId);
      await sendTrustAck(d, false);
      emitState();
      (log as any).info("Device rejected", d.deviceId);
    });
    trust.on("removed", () => emitState());

    try {
      await messaging.start();
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
    if (devUrl) {
      mainWindow.loadURL(devUrl);
    } else {
      const html = path.join(__dirnameFallback, "renderer/index.html");
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

  function createTray() {
    let icon = nativeImage.createFromPath(trayIconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createFromPath(appIconPath);
    }
    // Improve visibility on macOS menu bar
    icon.setTemplateImage?.(true);
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: "Open Clipp", click: () => showWindow() },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
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

  ipcMain.handle("clipp:delete-clip", async (_evt, id: string) => {
    await history.remove(id);
    await emitState();
  });

  ipcMain.handle("clipp:unpair-device", async (_evt, id: string) => {
    await trust.remove(id);
    await emitState();
  });

  ipcMain.handle(
    "clipp:respond-trust",
    async (_evt, payload: { accept: boolean; device: any }) => {
      const { accept, device } = payload;
      pendingRequests = pendingRequests.filter((p) => p.deviceId !== device.deviceId);
      if (accept) {
        await trust.add(device);
      } else {
        await sendTrustAck(device, false);
      }
      await emitState();
    }
  );

  ipcMain.handle("clipp:pair-text", async (_evt, txt: string) => {
    const pairing = decodePairing(txt);
    if (!pairing) return { ok: false, error: "invalid" as const };
    const id = await trust.getLocalIdentity();
    let targetAddrs = pairing.multiaddrs || (pairing.multiaddr ? [pairing.multiaddr] : []);
    let valid = validMultiaddrs(targetAddrs);
    if (!valid.length) {
      const { DEFAULT_WEBRTC_STAR_RELAYS } = await import(
        "../../../packages/core/network/constants.js"
      );
      const derived = DEFAULT_WEBRTC_STAR_RELAYS.map((addr: string) => `${addr}/p2p/${pairing.deviceId}`);
      targetAddrs = derived;
      valid = validMultiaddrs(targetAddrs);
    }
    const target: Multiaddr | undefined = valid[0];
    if (!target) return { ok: false, error: "no_target" as const };
    const request = {
      type: "trust-request" as const,
      from: id.deviceId,
      payload: id,
      sentAt: Date.now(),
    };
    try {
      await messaging.sendMessage(target as any, request as any);
      return { ok: true };
    } catch (err) {
      (log as any).warn("Failed to send trust request", err);
      return { ok: false, error: "dial_failed" as const };
    }
  });

  ipcMain.handle("clipp:share-now", async () => {
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
            <div style="margin-top:8px;font-size:12px;color:#9ca3af;word-break:break-all;">${info.deviceId}</div>
            <button onclick="require('electron').clipboard.writeText('${txt.replace(/'/g, "\\'")}')">Copy QR text</button>
          </div>
        </body>
      </html>
    `;
    qrWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  });
}

void bootstrap();
