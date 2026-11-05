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
    ...(entryMode
      ? {
          stdin: {
            contents: `export {startElectronRuntime} from "./apps/electron/src/electronRuntime.ts"; export {startElectronResetOwningAcceptance} from "./apps/electron/src/resetOwningAcceptance.ts";`,
            resolveDir: repo,
            loader: "ts",
          },
        }
      : {
          entryPoints: [
            join(
              repo,
              resetMode
                ? "apps/electron/src/electronRuntime.ts"
                : "apps/electron/src/main.ts"
            ),
          ],
        }),
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
  let entry = await import(join(directory, "main.mjs"));
  if (entryMode === "invalid") {
    await assert.rejects(
      entry.startElectronResetOwningAcceptance('{"command":"reset"}', () => {}),
      /invalid_manifest/
    );
    assert.equal(windows.length, 0);
    assert.equal(handlers.size, 0);
    console.log("invalid owning entry input starts no production owner");
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  }
  const startupTransport = {
    nativeListenInterface: "127.0.0.1",
    enableWebSocketListener: transportMode !== "disabled",
    enableMdns: false,
    enableTcp: false,
    enableWebRTCDirect: false,
    enableDCUtR: false,
  };
  const starting = resetMode
    ? transportMode && transportMode !== "default"
      ? entry.startElectronRuntime(startupTransport)
      : entry.startElectronRuntime()
    : undefined;
  if (transportMode) {
    // Mutation before asynchronous identity loading settles must not change the
    // first owner's startup choice. Later callers cannot reconfigure that owner.
    startupTransport.nativeListenInterface = undefined;
    startupTransport.enableTcp = true;
    assert.equal(
      entry.startElectronRuntime({ enableWebSocketListener: false }),
      starting,
      "later startup options must retain the first owner"
    );
  }
  let owner = await starting;
  if (owner) await owner.ready;
  await waitFor(
    () => menu && windows[0]?.visible,
    "actual main did not install a ready window and tray"
  );
  if (owner) {
    assert.equal(
      await entry.startElectronRuntime(),
      owner,
      "one process must retain one production owner"
    );
    const initial = await owner.publicState();
    assert.ok(initial.identity?.deviceId);
    if (transportMode) {
      assert.deepEqual(
        initial.managedRelayConfigurations,
        [],
        "the isolated counterpart requires fresh empty managed relay settings"
      );
      const assertListeners = () => {
        if (transportMode === "disabled") {
          assert.deepEqual(
            deniedNetworkOperations,
            [],
            "explicitly disabled discovery/listeners must not try an OS socket"
          );
          assert.deepEqual(listenAttempts, []);
          return;
        }
        if (transportMode === "default") {
          assert.ok(deniedNetworkOperations.length > 0);
          assert.ok(
            deniedNetworkOperations.every(
              (operation) => operation === "datagram"
            ),
            "no-argument startup retains ordinary LAN discovery"
          );
          assert.equal(
            listenAttempts.length,
            0,
            "denied ordinary discovery stops startup before listening"
          );
          return;
        }
        assert.ok(
          listenAttempts.length > 0,
          `real transport must reach the denied listener boundary; observed ${JSON.stringify(deniedNetworkOperations)}`
        );
        assert.ok(
          listenAttempts.every(
            (options) =>
              options.host ===
              (transportMode === "loopback" ? "127.0.0.1" : "0.0.0.0")
          ),
          "the startup owner must retain its selected listener interface"
        );
      };
      assertListeners();
      if (transportMode === "default") {
        const beforeRetry = deniedNetworkOperations.length;
        await assert.rejects(
          handlers.get("clipp:open-qr-window")({}),
          /fixture_network_unavailable|no valid addresses/i
        );
        assert.ok(
          deniedNetworkOperations.length > beforeRetry,
          "public QR retry must retry actual transport startup"
        );
      }
      assertListeners();
      await owner.stop();
      console.log(
        `actual Electron ${transportMode} startup retains its first immutable transport choice; sockets denied`
      );
      rmSync(directory, { recursive: true, force: true });
      process.exit(0);
    }
    await handlers.get("clipp:set-settings")(
      {},
      {
        autoSync: false,
        theme: "dark",
        ...(entryMode
          ? { localRetentionMs: 604800000, sharingLifetimeMs: 3600000 }
          : {}),
      }
    );
    if (entryMode === "settings") {
      const saved = await handlers.get("clipp:get-settings")({});
      assert.equal(saved.snapshot.state.autoSync, false);
      assert.equal(
        (await owner.publicState()).autoSync,
        false,
        "generic settings must update the same live Auto Sync owner as public state"
      );
      assert.equal(saved.snapshot.state.sharingLifetimeMs, 3600000);
      assert.equal(
        (await owner.publicState()).sharingLifetimeMs,
        3600000,
        "public state must expose the same applied sharing policy used by the factory"
      );
      await owner.stop();
      rmSync(directory, { recursive: true, force: true });
      process.exit(0);
    }
    clipboardText = entryMode
      ? "clipp-reset-before"
      : "synthetic pre-reset capture";
    await waitFor(
      async () => (await owner.publicState()).clips.length === 1,
      "ordinary capture was not saved"
    );
    if (entryMode) {
      await handlers.get("clipp:rename-identity")(
        {},
        {
          name: "Saved Desktop First",
          expectedDeviceId: initial.identity.deviceId,
        }
      );
      const savedIdentity = await handlers.get("clipp:rename-identity")(
        {},
        {
          name: "Saved Desktop",
          expectedDeviceId: initial.identity.deviceId,
        }
      );
      assert.equal(savedIdentity.deviceName, "Saved Desktop");
      assert.equal(savedIdentity.nameRevision, 2);
      const state = await owner.publicState();
      assert.equal(state.identity.deviceName, savedIdentity.deviceName);
      assert.equal(state.identity.nameRevision, savedIdentity.nameRevision);
      await handlers.get("clipp:set-pin")(
        {},
        { id: state.clips[0].id, pinned: true }
      );
      if (
        [
          "saved-name",
          "name-mismatch",
          "revision-mismatch",
          "replay-persisted",
          "replay-policy-mismatch",
        ].includes(entryMode)
      ) {
        await owner.stop();
        entry = await import(
          join(directory, "main.mjs") + "?saved-name-reopen"
        );
        owner = await entry.startElectronRuntime();
        await owner.ready;
        const reopened = await owner.publicState();
        assert.equal(reopened.identity.deviceName, "Saved Desktop");
        assert.equal(reopened.identity.nameRevision, 2);
        assert.equal(reopened.identity.deviceId, initial.identity.deviceId);
        assert.equal(reopened.clips[0].id, state.clips[0].id);
        assert.deepEqual(reopened.pinnedIds, [state.clips[0].id]);
      }
      if (["replay-persisted", "replay-policy-mismatch"].includes(entryMode)) {
        assert.equal(
          (
            await owner.identityReset.begin({
              operationId: "electron-owning-reset",
              reviewedPeerId: initial.identity.deviceId,
            })
          ).outcome,
          "completed"
        );
        assert.equal(
          (await owner.identityReset.reconcile()).phase,
          "completed"
        );
        await owner.stop();
        entry = await import(
          join(directory, "main.mjs") + "?reset-replay-reopen"
        );
        owner = await entry.startElectronRuntime();
        await owner.ready;
        const replacement = await owner.publicState();
        assert.equal(replacement.identity.deviceName, "Desktop");
        assert.equal(replacement.identity.nameRevision, 0);
        assert.notEqual(
          replacement.identity.deviceId,
          initial.identity.deviceId
        );
        assert.deepEqual(replacement.clips, []);
        assert.equal(replacement.sharingLifetimeMs, 3600000);
        if (entryMode === "replay-policy-mismatch")
          await handlers.get("clipp:set-settings")(
            {},
            { sharingLifetimeMs: 86400000 }
          );
      }
      const common = {
        version: 1,
        caseId: "electron29-source",
        deadlineUnixMs: Date.now() + 10000,
      };
      const manifest = ["preflight", "preflight-policy"].includes(entryMode)
        ? {
            ...common,
            mode: "observe-preflight",
            markers: ["clipp-reset-before"],
          }
        : {
            ...common,
            mode: [
              "replay",
              "replay-persisted",
              "replay-policy-mismatch",
            ].includes(entryMode)
              ? "observe-replay"
              : "execute",
            operationId: "electron-owning-reset",
            reviewedPeerId:
              entryMode === "mismatch"
                ? "another-peer"
                : initial.identity.deviceId,
            expected: {
              deviceName:
                entryMode === "name-mismatch"
                  ? "Stale Desktop"
                  : savedIdentity.deviceName,
              nameRevision:
                entryMode === "revision-mismatch"
                  ? 1
                  : savedIdentity.nameRevision,
              autoSync: false,
              sharingLifetimeMs:
                entryMode === "policy-mismatch" ? 86400000 : 3600000,
              syntheticClips: [
                {
                  id:
                    entryMode === "metadata-mismatch"
                      ? "different-clip"
                      : state.clips[0].id,
                  originPeerId:
                    entryMode === "mismatch"
                      ? "another-peer"
                      : initial.identity.deviceId,
                  capturedAt: state.clips[0].capturedAt,
                  shareExpiresAt: state.clips[0].shareExpiresAt,
                  pinned: true,
                },
              ],
              localRetentionMs: 604800000,
              markers: ["clipp-reset-before"],
              nextMarker: "clipp-reset-after",
              pinnedCount: 1,
              configurationSha256: createHash("sha256")
                .update(JSON.stringify(state.managedRelayConfigurations))
                .digest("hex"),
            },
          };
      if (entryMode === "metadata-missing")
        delete manifest.expected.syntheticClips;
      const records = [];
      const starting = entry.startElectronResetOwningAcceptance(
        JSON.stringify(manifest),
        (row) => records.push(row)
      );
      if (
        [
          "mismatch",
          "replay",
          "metadata-mismatch",
          "metadata-missing",
          "policy-mismatch",
          "name-mismatch",
          "revision-mismatch",
          "replay-policy-mismatch",
        ].includes(entryMode)
      ) {
        await assert.rejects(
          starting,
          entryMode === "metadata-missing"
            ? /invalid_manifest/
            : entryMode === "replay"
              ? /replay_history_not_empty/
              : entryMode === "replay-policy-mismatch"
                ? /observation_unconfirmed/
                : /preflight_mismatch/
        );
        assert.equal(
          restartAttempts,
          entryMode === "replay-policy-mismatch" ? 1 : 0
        );
        assert.equal(
          records.some((row) => row.stage === "replay-observation"),
          false
        );
        assert.equal(
          records.some((row) => row.stage === "begin-requested"),
          false
        );
      } else {
        const observer = await starting;
        if (["preflight", "preflight-policy"].includes(entryMode)) {
          assert.ok(
            records.some(
              (row) =>
                row.stage === "preflight-observation" &&
                row.currentPeerId === initial.identity.deviceId &&
                row.clipCount === 1 &&
                row.pinnedCount === 1
            )
          );
          assert.equal(restartAttempts, 0);
          if (entryMode === "preflight-policy") {
            const clip = state.clips[0];
            const projected = records.filter(
              (row) => row.stage === "synthetic-clip"
            );
            assert.equal(projected.length, 1);
            assert.equal(projected[0].clipId, clip.id);
            assert.equal(projected[0].originPeerId, initial.identity.deviceId);
            assert.equal(projected[0].capturedAt, clip.capturedAt);
            assert.equal(
              projected[0].shareExpiresAt,
              clip.capturedAt + 3600000
            );
            assert.equal(projected[0].pinned, true);
            assert.ok(
              records.some(
                (row) =>
                  row.stage === "preflight-observation" &&
                  row.sharingLifetimeMs === 3600000 &&
                  row.syntheticClipCount === 1 &&
                  row.syntheticProjectionId === projected[0].projectionId
              )
            );
            assert.ok(
              records.every(
                (row) => !JSON.stringify(row).includes("clipp-reset-before")
              ),
              "evidence must not serialize raw clipboard content"
            );
            console.log(
              "SOURCE_PROJECTION_WIRE=" +
                JSON.stringify(
                  records.map((row) => ({
                    atUnixMs: Date.now(),
                    kind: "owning-progress",
                    clipboardReads: 0,
                    clipboardWrites: 0,
                    ...row,
                  }))
                )
            );
          }
        } else if (entryMode === "replay-persisted") {
          const replay = records.find(
            (row) => row.stage === "replay-observation"
          );
          assert.ok(replay);
          assert.equal(replay.deviceName, "Desktop");
          assert.equal(replay.nameRevision, 0);
          assert.equal(replay.sharingLifetimeMs, 3600000);
          assert.equal(replay.clipCount, 0);
          assert.equal(restartAttempts, 1);
          assert.ok(!records.some((row) => row.stage === "begin-requested"));
        } else {
          assert.ok(["execute", "saved-name"].includes(entryMode));
          assert.equal(restartAttempts, 1);
          const matched = records.findIndex(
            (row) => row.stage === "pre-reset-matched"
          );
          const begin = records.findIndex(
            (row) => row.stage === "begin-requested"
          );
          assert.ok(
            matched >= 0 && matched < begin,
            "persisted facts must match before any real reset begin"
          );
          assert.equal(records[matched].sharingLifetimeMs, 3600000);
          assert.equal(records[matched].deviceName, "Saved Desktop");
          assert.equal(records[matched].nameRevision, 2);
          assert.equal(
            records.find((row) => row.stage === "synthetic-clip").clipId,
            state.clips[0].id
          );
          assert.ok(
            records.some(
              (row) =>
                row.stage === "begin-returned" &&
                row.outcome === "completed" &&
                row.restartRequired === true
            )
          );
          // The entry already retired its former owner; the ordinary reset mode
          // below covers durable reconcile before its SQLite connection closes.
          assert.equal(clipboardText, "clipp-reset-before");
        }
        await observer.stop();
      }
      console.log(
        "owning entry source case " +
          entryMode +
          " (inert OS boundaries; no native qualification)"
      );
      rmSync(directory, { recursive: true, force: true });
      process.exit(0);
    }
    const result = await owner.identityReset.begin({
      operationId: "electron-owning-reset",
      reviewedPeerId: initial.identity.deviceId,
    });
    assert.equal(result.outcome, "completed");
    assert.equal(restartAttempts, 1);
    assert.equal((await owner.identityReset.reconcile()).phase, "completed");
    const sealed = await owner.publicState();
    assert.equal(sealed.identity, null);
    assert.deepEqual(sealed.clips, []);
    assert.throws(
      () => handlers.get("clipp:set-settings")({}, { theme: "light" }),
      /identity_runtime_suspended/
    );
    assert.equal(clipboardText, "synthetic pre-reset capture");
    await owner.stop();
    console.log(
      "actual Electron composition reset remains sealed after rejected OS relaunch (source adapters only)"
    );
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  }
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
  trayInstance.emit("click");
  await waitFor(
    () => window.visible && window.focused,
    "normal tray click did not restore and focus the existing window"
  );
  assert.equal(windows.length, 1, "normal tray click reuses the live window");
  window.close();
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
