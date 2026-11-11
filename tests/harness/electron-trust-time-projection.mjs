import { build } from "esbuild";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire, syncBuiltinESMExports } from "node:module";

// Load the production main entry and its actual window/tray installation. Only
// Electron, WebRTC and network OS boundaries are inert; SQLite/identity/runtime
// composition remain real. Never launch Electron or access a host profile,
// clipboard, window, Dock, socket, native GUI or external network.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const directory = await mkdtemp(join(repo, ".local", "main-window-"));
const require = createRequire(import.meta.url);
const entryMode = process.argv[2]?.startsWith("reset-entry-")
  ? process.argv[2].slice("reset-entry-".length)
  : undefined;
const transportMode = process.argv[2]?.startsWith("transport-")
  ? process.argv[2].slice("transport-".length)
  : undefined;
const resetMode = process.argv[2] === "reset" || !!entryMode || !!transportMode;
let restartAttempts = 0;
let clipboardText = "";
let networkDenied = false;
let startupPublished = false;
const deniedNetworkOperations = [];
const denyNetwork = (operation = "external") => {
  networkDenied = true;
  deniedNetworkOperations.push(operation);
  throw Error("fixture_network_unavailable");
};
const listenAttempts = [];
require("node:net").Server.prototype.listen = function (...args) {
  listenAttempts.push(args[0]);
  return denyNetwork("listen");
};
require("node:net").Socket.prototype.connect = () => denyNetwork("connect");
require("node:dgram").createSocket = () => denyNetwork("datagram");
syncBuiltinESMExports();
const app = new EventEmitter();
let dockVisible = true;
let dockShows = 0;
let requireDockBeforeShow = false;
let onProcessQuit = () => {
  throw Error("unexpected_quit");
};
Object.assign(app, {
  isPackaged: false,
  getPath: () => directory,
  setPath() {},
  whenReady: async () => {},
  dock: {
    hide() {
      dockVisible = false;
    },
    async show() {
      await Promise.resolve();
      dockShows++;
      dockVisible = true;
    },
  },
  quit() {
    let prevented = false;
    app.emit("before-quit", {
      preventDefault() {
        prevented = true;
      },
    });
    if (!prevented) onProcessQuit();
  },
  relaunch() {
    restartAttempts++;
    throw Error(resetMode ? "fixture_relaunch_failed" : "unexpected_relaunch");
  },
  exit() {
    throw Error("unexpected_exit");
  },
});
const windows = [];
class Window extends EventEmitter {
  constructor() {
    super();
    this.visible = false;
    this.minimized = false;
    this.focused = false;
    this.webContents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: () => false,
      send(channel) {
        if (channel === "clipp:update" && networkDenied)
          startupPublished = true;
      },
    });
    windows.push(this);
  }
  static getAllWindows() {
    return windows;
  }
  async loadFile() {
    queueMicrotask(() => this.emit("ready-to-show"));
  }
  show() {
    if (requireDockBeforeShow)
      assert.equal(
        dockVisible,
        true,
        "Dock restoration must settle before showing the retained window"
      );
    this.visible = true;
    this.minimized = false;
    this.emit("show");
  }
  hide() {
    this.visible = false;
    this.focused = false;
    this.emit("hide");
  }
  focus() {
    this.focused = true;
  }
  minimize() {
    this.minimized = true;
    this.emit("minimize");
  }
  close() {
    let prevented = false;
    this.emit("close", {
      preventDefault() {
        prevented = true;
      },
    });
    if (!prevented) {
      this.visible = false;
      this.emit("closed");
    }
    return prevented;
  }
  setBackgroundColor() {}
}
let menu;
let trayInstance;
class Tray extends EventEmitter {
  constructor(image) {
    super();
    this.image = image;
    trayInstance = this;
  }
  setToolTip() {}
  setContextMenu(value) {
    menu = value;
  }
  popUpContextMenu() {}
}
const image = { isEmpty: () => false, setTemplateImage() {} };
const handlers = new Map();
globalThis.windowBoundary = {
  app,
  BrowserWindow: Window,
  Tray,
  Menu: { buildFromTemplate: (value) => value },
  nativeImage: { createFromPath: () => image, createEmpty: () => image },
  nativeTheme: Object.assign(new EventEmitter(), {
    shouldUseDarkColors: false,
  }),
  ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
  clipboard: {
    readText: () => clipboardText,
    writeText: (value) => {
      clipboardText = value;
    },
  },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openExternal: denyNetwork },
  Notification: class {
    static isSupported() {
      return false;
    }
  },
};
const waitFor = async (condition, description) => {
  const end = Date.now() + 5000;
  while (!(await condition())) {
    assert.ok(Date.now() < end, description);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
let failed = false;
try {
  await build({
    entryPoints: [join(repo, "apps/electron/src/electronRuntime.ts")],
    bundle: true,
    platform: "node",
    packages: "external",
    format: "esm",
    outfile: join(directory, "main.mjs"),
    define: { "process.platform": '"darwin"' },
    plugins: [
      {
        name: "fixture-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /pairing\/pending\.js$/ }, (args) =>
            args.importer.endsWith("/apps/electron/src/electronRuntime.ts")
              ? { path: "pending", namespace: "projection-fixture" }
              : undefined
          );
          builder.onLoad(
            { filter: /.*/, namespace: "projection-fixture" },
            () => ({
              contents: `export * from '${repo}/packages/core/pairing/pending.ts'; import { createPendingTrustRequestCoordinator as real } from '${repo}/packages/core/pairing/pending.ts'; export function createPendingTrustRequestCoordinator(options) { globalThis.projectPending = options.onChanged; return real(options); }`,
              loader: "ts",
              resolveDir: repo,
            })
          );
          builder.onResolve({ filter: /nativeWebrtcCleanup\.js$/ }, () => ({
            path: "native-cleanup",
            namespace: "os",
          }));
          builder.onResolve(
            { filter: /^(electron|@koush\/wrtc)$/ },
            (args) => ({ path: args.path, namespace: "os" })
          );
          builder.onLoad({ filter: /.*/, namespace: "os" }, (args) => ({
            contents:
              args.path === "native-cleanup"
                ? "export function cleanupNativeWebRtc() {}"
                : args.path === "electron"
                  ? "export const {app,BrowserWindow,Tray,Menu,nativeImage,nativeTheme,ipcMain,clipboard,safeStorage,shell,Notification}=globalThis.windowBoundary;"
                  : "export default {};",
            loader: "js",
          }));
        },
      },
    ],
  });
  const entry = await import(join(directory, "main.mjs"));
  const owner = await entry.startElectronRuntime({
    nativeListenInterface: "127.0.0.1",
    enableWebSocketListener: false,
    enableMdns: false,
    enableTcp: false,
    enableWebRTCDirect: false,
    enableDCUtR: false,
  });
  await owner.ready;
  await globalThis.projectPending([
    {
      initiatorPeerId: "peer-one",
      deviceName: "Laptop",
      requestVersion: "version-one",
      issuedAtUnixMs: "1760000000123",
    },
  ]);
  assert.equal(
    (await owner.publicState()).pending[0].issuedAtUnixMs,
    "1760000000123"
  );
  await owner.stop();
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
} finally {
  await rm(directory, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
