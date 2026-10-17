import { build } from "esbuild";
import assert from "node:assert/strict";
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
let networkDenied = false;
let startupPublished = false;
const denyNetwork = () => {
  networkDenied = true;
  throw Error("fixture_network_unavailable");
};
require("node:net").Server.prototype.listen = denyNetwork;
require("node:net").Socket.prototype.connect = denyNetwork;
require("node:dgram").createSocket = denyNetwork;
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
    throw Error("unexpected_relaunch");
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
class Tray extends EventEmitter {
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
  clipboard: { readText: () => "", writeText() {} },
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
  while (!condition()) {
    assert.ok(Date.now() < end, description);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
let failed = false;
try {
  await build({
    entryPoints: [join(repo, "apps/electron/src/main.ts")],
    bundle: true,
    platform: "node",
    packages: "external",
    format: "esm",
    outfile: join(directory, "main.mjs"),
    define: { "process.platform": '"darwin"' },
    plugins: [
      {
        name: "inert-desktop-os",
        setup(builder) {
          builder.onResolve(
            { filter: /^(electron|@koush\/wrtc)$/ },
            (args) => ({ path: args.path, namespace: "os" })
          );
          builder.onLoad({ filter: /.*/, namespace: "os" }, (args) => ({
            contents:
              args.path === "electron"
                ? "export const {app,BrowserWindow,Tray,Menu,nativeImage,nativeTheme,ipcMain,clipboard,safeStorage,shell,Notification}=globalThis.windowBoundary;"
                : "export default {};",
            loader: "js",
          }));
        },
      },
    ],
  });
  await import(join(directory, "main.mjs"));
  await waitFor(
    () => menu && windows[0]?.visible,
    "actual main did not install a ready window and tray"
  );
  await waitFor(
    () => startupPublished,
    "actual startup did not publish after the unavailable network boundary"
  );
  const window = windows[0];
  const document = window.webContents;
  assert.equal(window.close(), true);
  assert.equal(window.visible, false);
  assert.equal(dockVisible, false);
  const open = menu.find((entry) => entry.label === "Open Clipp");
  assert.ok(open, "actual production tray must expose Open Clipp");
  requireDockBeforeShow = true;
  await open.click();
  await Promise.resolve();
  assert.equal(window.visible, true);
  assert.equal(window.focused, true);
  assert.equal(
    dockVisible,
    true,
    "Open Clipp restored the window but left its Dock icon hidden"
  );
  assert.equal(windows.length, 1, "reopening must retain the live renderer");
  assert.equal(window.webContents, document);
  window.minimize();
  await open.click();
  assert.equal(window.minimized, false);
  assert.equal(window.focused, true);
  assert.equal(dockVisible, true);
  window.close();
  await open.click();
  await Promise.resolve();
  assert.equal(dockVisible, true);
  assert.ok(dockShows >= 2);
  onProcessQuit = () => {
    assert.equal(
      window.close(),
      false,
      "Quit must not turn into close-to-tray"
    );
    console.log(
      "actual production main/tray window lifecycle PASS (source OS boundary only)"
    );
    // Electron's final quit terminates the process. Retire this isolated child at
    // that same external boundary, after production shutdown and the assertion.
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  };
  menu.find((entry) => entry.label === "Quit").click();
  await waitFor(
    () => false,
    "normal Quit did not finish through production shutdown"
  );
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
} finally {
  await rm(directory, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
