import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire, syncBuiltinESMExports } from "node:module";
const require = createRequire(import.meta.url);
const denyNetwork = () => {
  throw Error("SOURCE_network_forbidden");
};
require("node:net").Server.prototype.listen = denyNetwork;
require("node:net").Socket.prototype.connect = denyNetwork;
require("node:dgram").createSocket = denyNetwork;
syncBuiltinESMExports();
globalThis.fetch = async () => {
  throw Error("SOURCE_network_forbidden");
};
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { readText: denyNetwork, writeText: denyNetwork } },
  configurable: true,
});

// Real background composition, generated identities, Chrome storage adapter and
// IndexedDB history. Chrome's external host/worker/offscreen ports are fixtures;
// this is source coverage, never actual Chrome lifetime or clipboard proof.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "chrome-notification-"));
const event = () => {
  const listeners = new Set();
  return {
    listeners,
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
  };
};
const area = () => {
  const values = new Map();
  return {
    get(keys, callback) {
      const result = Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => values.has(key))
          .map((key) => [key, structuredClone(values.get(key))])
      );
      callback?.(result);
      return Promise.resolve(result);
    },
    set(items, callback) {
      for (const [key, value] of Object.entries(items))
        values.set(key, structuredClone(value));
      callback?.();
      return Promise.resolve();
    },
    remove(key, callback) {
      values.delete(key);
      callback?.();
      return Promise.resolve();
    },
    setAccessLevel(_options, callback) {
      callback?.();
      return Promise.resolve();
    },
  };
};
const onMessage = event();
let offscreen = false;
let reloads = 0;
let lastGeneration;
globalThis.indexedDB = new IDBFactory();
globalThis.chrome = {
  storage: { local: area(), session: area() },
  runtime: {
    id: "synthetic-extension",
    getURL: (path) => `chrome-extension://synthetic-extension/${path}`,
    onMessage,
    onConnect: event(),
    onSuspend: event(),
    sendMessage(message, callback) {
      if (message.target === "offscreen") {
        lastGeneration = message.runtimeGeneration ?? lastGeneration;
        callback?.({
          ok: true,
          peers: [],
          peerConnections: [],
          multiaddrs: [],
        });
      }
      return Promise.resolve();
    },
    reload() {
      reloads++;
      throw Error("fixture_reload_failed");
    },
  },
  identity: {
    getRedirectURL: () => "https://synthetic.chromiumapp.org/clipp-relay",
  },
  offscreen: {
    Reason: { WEB_RTC: "WEB_RTC", CLIPBOARD: "CLIPBOARD" },
    hasDocument: async () => offscreen,
    createDocument: async () => {
      if (process.argv[2] === "offline")
        throw Error("SOURCE_offscreen_unavailable");
      offscreen = true;
    },
    closeDocument: async () => {
      offscreen = false;
    },
  },
  notifications: {
    onClicked: event(),
    getPermissionLevel: (callback) => callback("granted"),
    getAll: (callback) => callback({}),
    clear: async () => true,
  },
};
const sender = {
  id: chrome.runtime.id,
  url: chrome.runtime.getURL("src/popup.html"),
};
const ask = (message, source = sender) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("background_reply_timeout")),
      3000
    );
    for (const listener of onMessage.listeners)
      listener(message, source, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
  });

const mode = process.argv[2] ?? "absent";
const tabs = new Map();
const pages = new Map();
let nextTab = 1,
  creates = 0,
  bindManagementPage,
  createUiSession;
const authority = { ready: false, clipIds: [], requestIds: [] };
const authorityListeners = new Set();
function page(tab, dirty = false) {
  const session = createUiSession();
  if (dirty) {
    session.open({ kind: "pairing", origin: "add-device" });
    session.pairing.change("dirty occupied page");
  }
  const toWorker = event(),
    toPage = event(),
    disconnected = event();
  const workerPort = {
    name: "clipp-management-page-v1",
    sender: {
      id: chrome.runtime.id,
      url: chrome.runtime.getURL("src/options.html"),
      frameId: 0,
      tab,
    },
    onMessage: toWorker,
    onDisconnect: disconnected,
    postMessage: (value) =>
      toPage.listeners.forEach((handler) => handler(value)),
    disconnect: () => disconnected.listeners.forEach((handler) => handler()),
  };
  const pagePort = {
    name: workerPort.name,
    onMessage: toPage,
    onDisconnect: disconnected,
    postMessage: (value) =>
      toWorker.listeners.forEach((handler) => handler(value)),
    disconnect: () => disconnected.listeners.forEach((handler) => handler()),
  };
  const dispose = bindManagementPage({
    session,
    authority: () => authority,
    subscribeAuthority(listener) {
      authorityListeners.add(listener);
      return () => authorityListeners.delete(listener);
    },
    connect() {
      chrome.runtime.onConnect.listeners.forEach((handler) =>
        handler(workerPort)
      );
      return pagePort;
    },
  });
  const result = { session, dispose };
  pages.set(tab.id, result);
  return result;
}
chrome.tabs = {
  create(options, done) {
    creates++;
    const tab = { id: nextTab++, windowId: 1, url: options.url };
    tabs.set(tab.id, tab);
    if (options.url === chrome.runtime.getURL("src/options.html")) page(tab);
    done?.(tab);
    return Promise.resolve(tab);
  },
  get(id, done) {
    done(tabs.get(id));
  },
  query(_options, done) {
    done([...tabs.values()]);
  },
  update(id, _options, done) {
    done(tabs.get(id));
  },
};
chrome.windows = {
  getLastFocused: (_options, done) => done({ id: 1 }),
  update: (id, _options, done) => done({ id }),
};
const waitFor = async (condition, description) => {
  const deadline = Date.now() + 5000;
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, description);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
let owner;
try {
  await build({
    stdin: {
      contents: `export {chromeRuntime} from '${repo}/apps/extension/src/background';export {bindManagementPage} from '${repo}/apps/extension/src/managementPage';export {createUiSession} from '${repo}/packages/ui/src/uiSession';`,
      loader: "ts",
      resolveDir: repo,
    },
    bundle: true,
    platform: "node",
    packages: "external",
    format: "esm",
    outfile: join(own, "worker.mjs"),
    define: { "import.meta.env.VITE_CLIPP_REGISTERED_EXTENSION_ID": '""' },
  });
  const entry = await import(join(own, "worker.mjs"));
  owner = entry.chromeRuntime;
  bindManagementPage = entry.bindManagementPage;
  createUiSession = entry.createUiSession;
  let original;
  if (mode === "idle" || mode === "occupied") {
    const tab = {
      id: nextTab++,
      windowId: 1,
      url: chrome.runtime.getURL("src/options.html"),
    };
    tabs.set(tab.id, tab);
    original = page(tab, mode === "occupied");
  }
  const click = () =>
    chrome.notifications.onClicked.listeners.forEach((handler) =>
      handler("pairing-request-expired:old-envelope")
    );
  click();
  click(); // Wake/cold-start native callback, prior to readiness.
  await owner.ready;
  const state = await owner.publicState();
  assert.ok(state.identity?.deviceId);
  assert.deepEqual(state.pending, []);
  assert.ok(
    [...pages.values()].every(
      (p) => p.session.getSnapshot().destination === "history"
    )
  );
  authority.ready = true;
  authorityListeners.forEach((listener) => listener());
  await waitFor(
    () =>
      [...pages.values()].some(
        (p) => p.session.getSnapshot().destination === "devices"
      ),
    "actual callback never reached the canonical Requests consumer"
  );
  assert.equal(creates, mode === "idle" ? 0 : 1);
  click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    creates,
    mode === "idle" ? 0 : 1,
    "duplicate callback created a second management page"
  );
  if (mode === "occupied") {
    assert.equal(original.session.getSnapshot().destination, "history");
    assert.equal(
      original.session.pairing.getSnapshot().raw,
      "dirty occupied page"
    );
  }
  const available = await ask({ type: "getNotificationAvailability" });
  assert.equal(available.ok, true);
  assert.equal(available.state.app, "available");
  assert.equal(
    (
      await ask(
        { type: "getNotificationAvailability" },
        { id: chrome.runtime.id, url: "https://untrusted.example/" }
      )
    ).ok,
    false
  );
  console.log(
    `SOURCE actual worker native callback → Pairing owner → canonical management Port → UiSession Requests PASS (${mode}); native Chrome not run`
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack ?? error);
} finally {
  for (const cleanup of [
    ...[...pages.values()].map((page) => () => page.dispose()),
    () => owner?.stop(),
    () => rm(own, { recursive: true, force: true }),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      process.exitCode = 1;
      console.error(
        "notification fixture cleanup failed",
        error.stack ?? error
      );
    }
  }
}
