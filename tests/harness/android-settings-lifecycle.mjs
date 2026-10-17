import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
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
globalThis.cycleNative = {
  get: async ({ key }) => ({ value: values.get(key) ?? null }),
  set: async ({ key, value }) => {
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
  acquireFence: async () => {},
  releaseFence: async () => {},
  clearNativeQueues: async () => {},
  verifyNativeQueues: async () => {},
  restartRuntime: async () => {},
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
const mode = process.argv[2] ?? "overlap";
try {
  await build({
    stdin: {
      contents: `export {AndroidClient} from '${repo}/apps/android/src/client';export {LocalStorageBackend} from '${repo}/apps/android/src/storage';`,
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
            { filter: /^@capacitor\/(core|clipboard|local-notifications)$/ },
            (args) => ({ path: args.path, namespace: "system" })
          );
          builder.onLoad({ filter: /.*/, namespace: "system" }, (args) => ({
            loader: "js",
            contents: args.path.endsWith("core")
              ? `export const Capacitor={getPlatform:()=>"android",isNativePlatform:()=>true};export const registerPlugin=name=>name==="BackgroundContinuity"?globalThis.cycleContinuity:name==="IdentityResetStorage"?globalThis.cycleNative:{addListener:async()=>({remove:async()=>{}})};`
              : args.path.endsWith("clipboard")
                ? `export const Clipboard={read:async()=>({value:""}),write:async()=>{}};`
                : `export const LocalNotifications={addListener:async()=>({remove:async()=>{}}),schedule:async()=>{},cancel:async()=>{},checkPermissions:async()=>({display:"denied"})};`,
          }));
        },
      },
    ],
  });
  const { AndroidClient, LocalStorageBackend } = await import(
    join(own, "client.mjs")
  );
  client = new AndroidClient(
    new LocalStorageBackend("clipp-android:", globalThis.cycleNative, {
      native: globalThis.cycleNative,
      isNative: () => true,
    })
  );
  const settingsUpdates = [];
  client.onSettingsUpdate((snapshot) => settingsUpdates.push(snapshot));
  if (mode !== "cold") await client.getSettings();
  let startupTimeout;
  try {
    await Promise.race([
      client.start(),
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
  if (mode === "cold") {
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
  await rm(own, { recursive: true, force: true });
  // A regression failure can leave the real owner's queues blocked. Do not wait
  // for blocked teardown; only this isolated child's inert OS state is retired.
  process.exit(failed ? 1 : 0);
}
