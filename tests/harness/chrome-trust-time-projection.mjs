import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Real background composition, generated identities, Chrome storage adapter and
// IndexedDB history. Chrome's external host/worker/offscreen ports are fixtures;
// this is source coverage, never actual Chrome lifetime or clipboard proof.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "chrome-composition-"));
const event = () => {
  const listeners = new Set();
  return {
    listeners,
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
  };
};
let storageMutations = 0;
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
      storageMutations++;
      for (const [key, value] of Object.entries(items))
        values.set(key, structuredClone(value));
      callback?.();
      return Promise.resolve();
    },
    remove(key, callback) {
      storageMutations++;
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
let failPeerRead = false;
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
        if (message.action === "getPeers" && failPeerRead) {
          callback?.({ ok: false, error: "fixture_peer_read_failed" });
          return Promise.resolve();
        }
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
      offscreen = true;
    },
    closeDocument: async () => {
      offscreen = false;
    },
  },
  notifications: {
    onClicked: event(),
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
let failed = false;
try {
  await build({
    entryPoints: [join(repo, "apps/extension/src/background.ts")],
    bundle: true,
    platform: "node",
    packages: "external",
    format: "esm",
    outfile: join(own, "background.mjs"),
    define: { "import.meta.env.VITE_CLIPP_REGISTERED_EXTENSION_ID": '""' },
    plugins: [
      {
        name: "observe-pending-projection",
        setup(builder) {
          builder.onResolve({ filter: /pairing\/pending$/ }, (args) =>
            args.importer.endsWith("/apps/extension/src/background.ts")
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
        },
      },
    ],
  });
  const { chromeRuntime: owner } = await import(join(own, "background.mjs"));
  assert.ok(
    owner,
    "production worker must deliberately return its owning composition"
  );
  await owner.ready;
  assert.equal(
    typeof owner.owningObservation,
    "function",
    "the privileged owner must expose a readonly public reset witness"
  );
  await globalThis.projectPending([
    {
      initiatorPeerId: "peer-one",
      deviceName: "Laptop",
      requestVersion: "version-one",
      issuedAtUnixMs: "1760000000123",
    },
  ]);
  const state = await owner.publicState();
  assert.equal(state.pending[0].issuedAtUnixMs, "1760000000123");
  const reply = await ask({ type: "getPendingRequests" });
  const serialized = JSON.parse(JSON.stringify(reply));
  assert.equal(serialized[0].issuedAtUnixMs, "1760000000123");
  await owner.stop();
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
} finally {
  await rm(own, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
