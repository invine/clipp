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
  const beforeInitialRead = storageMutations;
  const initialObservation = await owner.owningObservation();
  assert.equal(initialObservation.identityResetState.phase, "idle");
  initialObservation.identityResetState.phase = "caller-mutated";
  assert.equal(
    (await owner.owningObservation()).identityResetState.phase,
    "idle"
  );
  assert.equal(
    storageMutations,
    beforeInitialRead,
    "owner observation must not write storage"
  );
  const initial = await owner.publicState();
  assert.ok(initial.identity?.deviceId);
  await ask({
    type: "setSettings",
    settings: { autoSync: false, theme: "dark", localRetentionMs: 3_600_000 },
  });
  await ask({
    type: "shareClip",
    clip: { content: "synthetic pre-reset Clip" },
  });
  assert.equal((await owner.publicState()).clips.length, 1);
  const beforeAppliedRead = storageMutations;
  const applied = await owner.owningObservation();
  assert.equal(applied.identity.deviceId, initial.identity.deviceId);
  assert.equal(applied.autoSync, false);
  assert.equal(
    applied.localRetentionMs,
    3_600_000,
    "witness reports applied retention"
  );
  assert.equal(applied.clips.length, 1, "witness reuses actual public History");
  assert.equal(storageMutations, beforeAppliedRead);
  const generation = lastGeneration;
  const result = await owner.identityReset.begin({
    operationId: "chrome-owning-reset",
    reviewedPeerId: initial.identity.deviceId,
  });
  assert.equal(result.outcome, "completed");
  assert.equal(reloads, 1);
  assert.equal(offscreen, false);
  const beforeCompletedRead = storageMutations;
  const completed = await owner.owningObservation();
  assert.equal(completed.identityResetState.phase, "completed");
  assert.equal(
    completed.identityResetState.receipt.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    completed.identityResetState.receipt.formerPeerId,
    initial.identity.deviceId
  );
  assert.notEqual(
    completed.identityResetState.receipt.generatedPeerId,
    initial.identity.deviceId
  );
  assert.equal(
    completed.identityResetState.completedOperation.operationId,
    "chrome-owning-reset"
  );
  assert.equal(completed.localRetentionMs, 3_600_000);
  assert.equal(
    completed.identity,
    null,
    "retired owner remains publicly sealed"
  );
  assert.deepEqual(completed.clips, []);
  completed.identityResetState.receipt.operationId = "caller-mutated";
  completed.identityResetState.completedOperation.operationId =
    "caller-mutated";
  const retained = await owner.owningObservation();
  assert.equal(
    retained.identityResetState.receipt.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    retained.identityResetState.completedOperation.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    storageMutations,
    beforeCompletedRead,
    "completed witness must not reconcile or rewrite reset state"
  );
  assert.equal(
    reloads,
    1,
    "reading the witness cannot request another restart"
  );
  assert.equal((await owner.identityReset.reconcile()).phase, "completed");
  assert.equal((await owner.publicState()).identity, null);
  assert.deepEqual((await owner.publicState()).clips, []);
  assert.equal(
    (await ask({ type: "setSettings", settings: { theme: "light" } })).ok,
    false
  );
  const stale = await ask(
    {
      source: "offscreen",
      action: "selfPeerUpdate",
      runtimeGeneration: generation,
      multiaddrs: [],
    },
    { id: chrome.runtime.id, url: chrome.runtime.getURL("offscreen.html") }
  );
  assert.deepEqual(stale, { ok: false, error: "identity_runtime_retired" });
  await owner.stop();
  const afterStop = storageMutations;
  await assert.rejects(owner.owningObservation(), /identity_runtime_stopped/);
  assert.equal(storageMutations, afterStop);
  // Fresh production owner over the durable state created by the actual first
  // owner reset; no private seed or synthetic receipt installs this state.
  const { chromeRuntime: reopened } = await import(
    join(own, "background.mjs") + "?actual-owning-incarnation=2"
  );
  await reopened.ready;
  const beforeStartupRead = storageMutations;
  const startup = await reopened.owningObservation();
  assert.equal(startup.identityResetState.phase, "idle");
  assert.equal(
    startup.identityResetState.receipt.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    startup.identityResetState.receipt.formerPeerId,
    initial.identity.deviceId
  );
  assert.equal(
    startup.identityResetState.receipt.generatedPeerId,
    startup.identity.deviceId
  );
  assert.equal(
    startup.identityResetState.completedOperation.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    startup.identityResetState.completedOperation.generatedPeerId,
    startup.identity.deviceId
  );
  assert.equal(startup.localRetentionMs, 3_600_000);
  assert.equal(startup.autoSync, false);
  assert.deepEqual(startup.clips, []);
  startup.identityResetState.receipt.operationId = "caller-mutated-startup";
  startup.identityResetState.completedOperation.operationId =
    "caller-mutated-startup";
  const startupAgain = await reopened.owningObservation();
  assert.equal(
    startupAgain.identityResetState.receipt.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    startupAgain.identityResetState.completedOperation.operationId,
    "chrome-owning-reset"
  );
  assert.equal(
    storageMutations,
    beforeStartupRead,
    "fresh-owner reads cannot reconcile or write startup state"
  );
  assert.equal(
    reloads,
    1,
    "fresh-owner observation must not restart the completed identity again"
  );
  await reopened.stop();
  console.log(
    "actual Chrome composition reset remains sealed after rejected OS reload (source adapters only)"
  );
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
} finally {
  await rm(own, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
