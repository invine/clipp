import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Real background composition, generated identities, Chrome storage adapter and
// IndexedDB history. Chrome's external host/worker/offscreen ports are fixtures;
// this is source coverage, never actual Chrome lifetime or clipboard proof.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "chrome-reset-owning-entry-"));
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
    getContexts: async () =>
      offscreen
        ? [
            {
              contextId: "source-offscreen-context",
              documentUrl: chrome.runtime.getURL("offscreen.html"),
            },
          ]
        : [],
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
let owner;
let entry;
try {
  for (const [name, path] of [
    ["background", "background.ts"],
    ["entry", "resetOwningAcceptance.ts"],
  ]) {
    await build({
      entryPoints: [join(repo, "apps/extension/src", path)],
      bundle: true,
      platform: "node",
      packages: "external",
      format: "esm",
      outfile: join(own, name + ".mjs"),
      define: { "import.meta.env.VITE_CLIPP_REGISTERED_EXTENSION_ID": '""' },
    });
  }
  owner = (await import(join(own, "background.mjs"))).chromeRuntime;
  await owner.ready;
  const { startChromeResetOwningAcceptance } = await import(
    join(own, "entry.mjs")
  );
  const marker = "clipp-reset-source-former";
  await ask({ type: "shareClip", clip: { content: marker } });
  const identity = (await owner.publicState()).identity.deviceId;
  const rootCase = {
    version: 1,
    mode: "observe-preflight",
    caseId: "chrome29-source-case",
    extensionId: chrome.runtime.id,
    deadlineUnixMs: Date.now() + 60_000,
    markers: [marker],
    nextMarker: "clipp-reset-source-next",
    expectedDeviceName: "clipp-reset-source-name",
  };
  if (process.argv[2] === "deadline") {
    let releaseOwner;
    const held = new Promise((resolve) => {
      releaseOwner = resolve;
    });
    const pending = startChromeResetOwningAcceptance(
      JSON.stringify({ ...rootCase, deadlineUnixMs: Date.now() + 30 }),
      () => held
    );
    const result = await Promise.race([
      pending.then(
        () => "unexpected-ready",
        (error) => error.message
      ),
      new Promise((resolve) => setTimeout(() => resolve("still-waiting"), 150)),
    ]);
    releaseOwner(owner);
    assert.equal(
      result,
      "owning_entry_expired_or_stopped",
      "original deadline rejects even while owner import is unresolved"
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await assert.rejects(
      owner.owningObservation(),
      /identity_runtime_stopped/,
      "late real owner is retired"
    );
  } else if (["execute", "precondition-change"].includes(process.argv[2])) {
    await ask({
      type: "setSettings",
      settings: { autoSync: false, localRetentionMs: 3_600_000 },
    });
    await ask({
      type: "renameLocalIdentity",
      expectedDeviceId: identity,
      name: rootCase.expectedDeviceName,
    });
    const initial = await owner.owningObservation();
    await ask({ type: "setPin", id: initial.clips[0].id, pinned: true });
    const executeCase = {
      ...rootCase,
      mode: "execute",
      operationId: "chrome29-source-operation",
      reviewedPeerId: identity,
      executeAfterUnixMs: Date.now() + 500,
      expected: {
        autoSync: false,
        localRetentionMs: 3_600_000,
        pinnedCount: 1,
        configurationSha256: createHash("sha256")
          .update(JSON.stringify(initial.managedRelayConfigurations))
          .digest("hex"),
      },
    };
    entry = await startChromeResetOwningAcceptance(
      JSON.stringify(executeCase),
      async () => owner
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(reloads, 0, "fixed root time cannot execute early");
    assert.equal((await owner.owningObservation()).identity.deviceId, identity);
    if (process.argv[2] === "precondition-change") {
      await ask({ type: "setSettings", settings: { autoSync: true } });
      await assert.rejects(entry.completion, /preflight_mismatch/);
      assert.equal(
        reloads,
        0,
        "changed actual preconditions cannot begin the reset"
      );
      assert.equal((await owner.publicState()).identity.deviceId, identity);
    } else {
      await entry.completion;
      assert.equal(
        reloads,
        1,
        "scheduled entry invokes actual owning begin once"
      );
      const final = entry.read(0).rows.at(-1);
      assert.equal(final.stage, "begin-returned");
      assert.equal(final.restartRequired, true);
      assert.equal(final.outcome, "completed");
      await entry.stop();
      entry = undefined;
      onMessage.listeners.clear(); // The old fixture worker context has retired.
      owner = (
        await import(
          join(own, "background.mjs") + "?actual-owning-incarnation=2"
        )
      ).chromeRuntime;
      await owner.ready;
      entry = await startChromeResetOwningAcceptance(
        JSON.stringify(executeCase),
        async () => owner
      );
      const replay = await entry.observeOnce();
      assert.equal(replay.stage, "replay-observation");
      assert.equal(replay.clipCount, 0);
      assert.equal(replay.operationId, executeCase.operationId);
      assert.notEqual(replay.currentPeerId, identity);
      await entry.completion;
      assert.equal(
        reloads,
        1,
        "matching real startup receipt/guard cannot begin the reset twice"
      );
      // Legitimate new History survives a later source incarnation; no blanket empty-on-replay rule.
      await ask({ type: "shareClip", clip: { content: marker } });
      await ask({ type: "shareClip", clip: { content: marker } });
      assert.equal(
        (await entry.observeOnce()).clipCount,
        0,
        "real reset baseline does not recapture former marker in this source fixture"
      );
      await ask({ type: "shareClip", clip: { content: rootCase.nextMarker } });
      assert.equal((await entry.observeOnce()).nextMarkerOriginMatches, 1);
      const nextClipId = (await owner.publicState()).clips[0].id;
      await entry.stop();
      entry = undefined;
      onMessage.listeners.clear();
      owner = (
        await import(
          join(own, "background.mjs") + "?actual-owning-incarnation=3"
        )
      ).chromeRuntime;
      await owner.ready;
      entry = await startChromeResetOwningAcceptance(
        JSON.stringify({ ...executeCase, mode: "observe-replay" }),
        async () => owner
      );
      const retained = await entry.observeOnce();
      assert.equal(retained.clipCount, 1);
      assert.equal(retained.clip0Id, nextClipId);
      assert.equal(retained.nextMarkerOriginMatches, 1);
      assert.equal(reloads, 1);
      console.log(
        "actual owning begin obeys root time and retained startup guard replays without another reset (source fixtures only)"
      );
    }
  } else {
    entry = await startChromeResetOwningAcceptance(
      JSON.stringify(rootCase),
      async () => owner
    );
    const row = await entry.observeOnce();
    assert.equal(row.currentPeerId, identity);
    assert.equal(row.clipCount, 1);
    assert.equal(row.formerMarkerMatches, 1);
    assert.equal(row.resetPhase, "idle");
    assert.equal(
      JSON.stringify(row).includes(marker),
      false,
      "raw Clip contents never enter witness rows"
    );
    const first = entry.read(0);
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0].sequence, 0);
    first.rows[0].clipCount = 999;
    assert.equal(
      entry.read(0).rows[0].clipCount,
      1,
      "external readers receive copies"
    );
    const witnessSender = {
      id: chrome.runtime.id,
      url: chrome.runtime.getURL("reset-owning-witness.html"),
    };
    const readMessage = {
      type: "clipp-reset-owning-read",
      caseId: rootCase.caseId,
      command: "read",
      cursor: 0,
    };
    const reply = await ask(readMessage, witnessSender);
    assert.equal(
      reply.ok,
      true,
      "fixed witness page can export copied readonly ledger"
    );
    assert.equal(reply.value.rows[0].currentPeerId, identity);
    for (const [message, source] of [
      [{ ...readMessage, command: "begin" }, witnessSender],
      [{ ...readMessage, caseId: "wrong-case" }, witnessSender],
      [readMessage, { ...witnessSender, url: witnessSender.url + "?wrong=1" }],
      [readMessage, sender],
    ])
      assert.deepEqual(await ask(message, source), {
        ok: false,
        error: "owning_read_refused",
      });
    assert.equal(reloads, 0);
    let imports = 0;
    await assert.rejects(
      startChromeResetOwningAcceptance("{}", async () => {
        imports++;
        return owner;
      }),
      /invalid_root_case/
    );
    assert.equal(imports, 0, "invalid root case cannot import the real owner");
    const retainedLength = entry.read(0).totalRows;
    await ask({
      type: "shareClip",
      clip: { content: "unknown source clipboard must never serialize" },
    });
    await assert.rejects(entry.observeOnce(), /unknown_clip_content/);
    assert.equal(entry.read(0).totalRows, retainedLength);
    assert.equal(
      JSON.stringify(entry.read(0)).includes("unknown source clipboard"),
      false
    );
    console.log(
      "owning preflight observes actual production owner and exports only known public evidence (source fixtures only)"
    );
  }
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
} finally {
  await entry?.stop();
  await owner?.stop();
  await rm(own, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
