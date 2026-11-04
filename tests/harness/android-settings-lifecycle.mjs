import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
// Actual AndroidClient/settings/retention/History/continuity owners. Only native
// Capacitor/Preferences/clipboard/DOM storage OS boundaries are inert. No native
// profile, SDK, host clipboard or private application fields are accessed.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "settings-cycle-"));
const values = new Map();
let blockRetention = false,
  releaseRetention,
  announceRetention;
const retentionGate = new Promise((resolve) => {
  releaseRetention = resolve;
});
const retentionPersisted = new Promise((resolve) => {
  announceRetention = resolve;
});
const events = new Map();
const mode = process.argv[2] ?? "overlap";
const startupMode = ["start-overlap", "start-failure", "stop-startup"].includes(
  mode
);
let startupFailure = mode === "start-failure";
let releaseStartup, announceStartup;
const startupGate = new Promise((resolve) => {
  releaseStartup = resolve;
});
const startupEntered = new Promise((resolve) => {
  announceStartup = resolve;
});
const rejectionMode = mode === "stop-rejection";
const resetMode = process.argv[2] === "reset" || rejectionMode;
let releaseResetWrite, announceResetWrite;
const resetWriteGate = new Promise((resolve) => {
  releaseResetWrite = resolve;
});
const resetWriteStarted = new Promise((resolve) => {
  announceResetWrite = resolve;
});
let nativeFenced = false;
let restartAttempts = 0;
const require = createRequire(import.meta.url);
const denyNetwork = () => {
  throw Error("fixture_network_unavailable");
};
require("node:net").Server.prototype.listen = denyNetwork;
require("node:net").Socket.prototype.connect = denyNetwork;
require("node:dgram").createSocket = denyNetwork;
syncBuiltinESMExports();
globalThis.cycleNative = {
  get: async ({ key }) => {
    if (startupMode && key === "clipp-android:sharingLifetimeMs") {
      announceStartup();
      await startupGate;
      if (startupFailure) throw Error("fixture_startup_read_failed");
    }
    return { value: values.get(key) ?? null };
  },
  set: async ({ key, value }) => {
    if (rejectionMode && key === "clipp-android:manualIdentityReset") {
      announceResetWrite();
      await resetWriteGate;
      throw Error("fixture_intent_write_rejected");
    }
    values.set(key, value);
    if (blockRetention && key === "clipp-android:localRetentionMs") {
      announceRetention();
      await retentionGate;
    }
  },
  remove: async ({ key }) => {
    values.delete(key);
  },
  openRuntime: async () => {},
  acquireFence: async () => {
    nativeFenced = true;
  },
  releaseFence: async () => {
    nativeFenced = false;
  },
  clearNativeQueues: async () => {},
  verifyNativeQueues: async () => {},
  restartRuntime: async () => {
    restartAttempts++;
    throw Error("fixture_recreate_failed");
  },
};
globalThis.cycleContinuity = {
  getPlatformInfo: async () => ({
    apiLevel: 34,
    enabled: false,
    enabledPersistenceKnown: true,
    serviceRunning: false,
    userStopped: false,
    notificationAvailability: "blocked",
    observedBackgroundFailureCount: 0,
    supportState: "unqualified",
    batteryOptimizationGuidance: false,
  }),
  addListener: async (name, callback) => {
    events.set(name, callback);
    return { remove: async () => events.delete(name) };
  },
  getExplicitTextActions: async () => ({ actions: "[]" }),
  getPendingClipboardApplication: async () => ({}),
  clearPendingClipboardApplication: async () => {},
  heartbeat: async () => {},
  stop: async () => {},
  setEnabled: async () => {},
  update: async () => {},
  showExplicitTextFeedback: async () => {},
};
globalThis.indexedDB = new IDBFactory();
globalThis.window = Object.assign(new EventTarget(), {
  location: { reload() {} },
});
globalThis.document = Object.assign(new EventTarget(), {
  visibilityState: "visible",
  hasFocus: () => true,
});
let client;
let failed = false;
try {
  await build({
    stdin: {
      contents: `export {AndroidClient, createAndroidRuntime} from '${repo}/apps/android/src/client';export {LocalStorageBackend} from '${repo}/apps/android/src/storage';`,
      loader: "ts",
      resolveDir: repo,
    },
    bundle: true,
    platform: "node",
    packages: "external",
    format: "esm",
    outfile: join(own, "client.mjs"),
    plugins: [
      {
        name: "inert-os-boundaries",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^@capacitor\/(core|clipboard|local-notifications|preferences)$/,
            },
            (args) => ({ path: args.path, namespace: "system" })
          );
          builder.onLoad({ filter: /.*/, namespace: "system" }, (args) => ({
            loader: "js",
            contents: args.path.endsWith("core")
              ? `export const Capacitor={getPlatform:()=>"android",isNativePlatform:()=>true};export const registerPlugin=name=>name==="BackgroundContinuity"?globalThis.cycleContinuity:name==="IdentityResetStorage"?globalThis.cycleNative:{addListener:async()=>({remove:async()=>{}})};`
              : args.path.endsWith("preferences")
                ? `export const Preferences=globalThis.cycleNative;`
                : args.path.endsWith("clipboard")
                  ? `export const Clipboard={read:async()=>({value:""}),write:async()=>{}};`
                  : `export const LocalNotifications={addListener:async()=>({remove:async()=>{}}),schedule:async()=>{},cancel:async()=>{},checkPermissions:async()=>({display:"denied"})};`,
          }));
        },
      },
    ],
  });
  const { AndroidClient, LocalStorageBackend, createAndroidRuntime } =
    await import(join(own, "client.mjs"));
  const owner = resetMode || startupMode ? createAndroidRuntime() : undefined;
  client =
    owner?.client ??
    new AndroidClient(
      new LocalStorageBackend("clipp-android:", globalThis.cycleNative, {
        native: globalThis.cycleNative,
        isNative: () => true,
      })
    );
  const settingsUpdates = [];
  client.onSettingsUpdate((snapshot) => settingsUpdates.push(snapshot));
  if (startupMode) {
    const publications = [];
    const unsubscribe = client.onUpdate((state) => publications.push(state));
    const first = owner.start();
    if (mode === "stop-startup") {
      const result = Promise.allSettled([first]);
      await startupEntered;
      const stop = owner.stop();
      assert.throws(() => owner.start(), /identity_runtime_suspended/);
      releaseStartup();
      await stop;
      assert.equal((await result)[0].status, "rejected");
      assert.equal((await owner.publicState()).identity, null);
      assert.throws(() => owner.start(), /identity_runtime_suspended/);
      console.log(
        JSON.stringify({ pass: true, mode, actualNativeHost: false })
      );
      await rm(own, { recursive: true, force: true });
      process.exit(0);
    }
    // Observe rejection immediately so the host keeps both public starts owned.
    const outcomes = [first];
    await startupEntered;
    let secondSettled = false;
    const second = owner.start().finally(() => {
      secondSettled = true;
    });
    outcomes.push(second);
    const settled = Promise.allSettled(outcomes);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      secondSettled,
      false,
      "an overlapping owning start must await real startup readiness"
    );
    releaseStartup();
    const results = await settled;
    if (startupFailure) {
      assert.deepEqual(
        results.map((result) => result.status),
        ["rejected", "rejected"],
        "a failed real startup cannot satisfy either awaiting host"
      );
      assert.equal((await owner.publicState()).identity, null);
      startupFailure = false;
      await owner.start();
    } else {
      assert.deepEqual(
        results.map((result) => result.status),
        ["fulfilled", "fulfilled"]
      );
    }
    assert.ok((await owner.publicState()).identity);
    assert.ok(
      publications.some((state) => state.identity),
      "the subscribed public feed observes real startup publication"
    );
    unsubscribe();
    await owner.stop();
    assert.throws(() => owner.start(), /identity_runtime_suspended/);
    console.log(JSON.stringify({ pass: true, mode, actualNativeHost: false }));
    await rm(own, { recursive: true, force: true });
    process.exit(0);
  }
  if (mode !== "cold") await client.getSettings();
  let startupTimeout;
  try {
    await Promise.race([
      owner ? owner.start() : client.start(),
      new Promise((_, reject) => {
        startupTimeout = setTimeout(
          () =>
            reject(
              Error(
                "cold actual AndroidClient startup deadlocked during default settings initialization"
              )
            ),
          5000
        );
      }),
    ]);
  } finally {
    clearTimeout(startupTimeout);
  }
  const ready = await client.getState();
  assert.ok(ready.identity);
  assert.equal(ready.identityRotationRecovery, false);
  console.log("healthy actual AndroidClient startup completed");
  if (owner) {
    await client.setSettings({ autoSync: false, theme: "dark" });
    const identity = (await owner.publicState()).identity;
    assert.ok(identity?.deviceId);
    if (rejectionMode) {
      const request = {
        operationId: "android-owning-rejected-reset",
        reviewedPeerId: identity.deviceId,
      };
      const begin = owner.identityReset.begin(request);
      await resetWriteStarted;
      const stop = owner.stop();
      releaseResetWrite();
      assert.equal((await begin).outcome, "rejected");
      await stop;
      assert.throws(() => owner.start(), /identity_runtime_suspended/);
      await assert.rejects(
        owner.identityReset.begin(request),
        /identity_runtime_stopped/
      );
      await assert.rejects(
        owner.identityReset.resume({ operationId: request.operationId }),
        /identity_runtime_stopped/
      );
      assert.equal((await owner.identityReset.reconcile()).phase, "idle");
      assert.equal(restartAttempts, 0);
      console.log(
        "terminal owning stop survives in-flight reset rejection (source adapters only)"
      );
      await rm(own, { recursive: true, force: true });
      process.exit(0);
    }
    const result = await owner.identityReset.begin({
      operationId: "android-owning-reset",
      reviewedPeerId: identity.deviceId,
    });
    assert.equal(result.outcome, "completed");
    assert.equal(nativeFenced, true);
    assert.equal(restartAttempts, 1);
    assert.equal((await owner.identityReset.reconcile()).phase, "completed");
    const sealed = await owner.publicState();
    assert.equal(sealed.identity, null);
    assert.deepEqual(sealed.clips, []);
    await assert.rejects(
      client.setSettings({ theme: "light" }),
      /identity_runtime_suspended/
    );
    assert.equal(
      JSON.parse((await cycleNative.get({ key: "clipp-android:theme" })).value),
      "dark"
    );
    await owner.stop();
    console.log(
      "actual Android composition reset remains sealed after rejected native recreate (source adapters only)"
    );
  } else if (mode === "cold") {
    await client.stop();
    client = null;
    console.log(JSON.stringify({ pass: true, mode, actualNativeHost: false }));
  } else {
    blockRetention = true;
    const save = client.setSettings({ localRetentionMs: 604800000 });
    await retentionPersisted;
    const refresh = client.refreshBackgroundContinuity();
    await new Promise((resolve) => setImmediate(resolve));
    releaseRetention();
    let timeout;
    try {
      const result = await Promise.race([
        Promise.all([save, refresh]),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                Error(
                  "retention save and native activity refresh deadlocked after native persistence"
                )
              ),
            1000
          );
        }),
      ]);
      assert.equal(result[0].status, "applied");
      assert.equal(
        (await client.getSettings()).snapshot.state.localRetentionMs,
        604800000
      );
      assert.equal(
        settingsUpdates[settingsUpdates.length - 1].state.localRetentionMs,
        604800000
      );
      const applied = await client.getState();
      assert.equal(applied.localRetentionMs, 604800000);
      assert.equal(applied.backgroundContinuity.controlPending, false);
      assert.equal(applied.backgroundContinuity.controlStateKnown, true);
      console.log(
        "public overlapping retention save + native refresh completed"
      );
    } finally {
      clearTimeout(timeout);
    }
    await client.stop();
    client = null;
    console.log(JSON.stringify({ pass: true, mode, actualNativeHost: false }));
  }
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
} finally {
  releaseRetention();
  releaseResetWrite();
  releaseStartup();
  await rm(own, { recursive: true, force: true });
  // A regression failure can leave the real owner's queues blocked. Do not wait
  // for blocked teardown; only this isolated child's inert OS state is retired.
  process.exit(failed ? 1 : 0);
}
