import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "android-continuity-controls-"));
// The real AndroidClient, coordinator, settings owner and native adapter. Only
// Capacitor/clipboard/storage OS boundaries are inert; no runtime is started.
let enabled = false,
  running = false,
  denied = true,
  nativeSync = null,
  rejectWrite = false,
  rejectInfo = false;
let rejectUpdate = false;
let rejectPreferences = false;
let rejectPreferencesRead = false;
let rejectStop = false;
const nativeEvents = new Map();
globalThis.continuityFixture = {
  getPlatformInfo: async () => {
    if (rejectInfo) throw new Error("native_info_unavailable");
    return {
      apiLevel: 36,
      enabled,
      serviceRunning: running,
      userStopped: !enabled,
      notificationAvailability: denied ? "blocked" : "available",
      observedBackgroundFailureCount: 0,
      supportState: "unqualified",
      batteryOptimizationGuidance: false,
    };
  },
  setEnabled: async ({ enabled: value }) => {
    if (rejectWrite) throw new Error("native_persistence_rejected");
    enabled = value;
  },
  start: async ({ autoSync }) => {
    running = enabled;
    nativeSync = autoSync;
  },
  stop: async () => {
    if (rejectStop) throw new Error("native_stop_unconfirmed");
    running = false;
  },
  update: async ({ autoSync }) => {
    if (rejectUpdate || !running)
      throw new Error("background_continuity_not_running");
    nativeSync = autoSync;
  },
  addListener: async (event, handler) => {
    nativeEvents.set(event, handler);
    return { remove: async () => nativeEvents.delete(event) };
  },
  showReconnectNotification: async () => {},
  clearPendingClipboardApplication: async () => {},
  getPendingClipboardApplication: async () => ({}),
};
try {
  await build({
    stdin: {
      contents: `export {AndroidClient} from '${repo}/apps/android/src/client'; export {LocalStorageBackend} from '${repo}/apps/android/src/storage';`,
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
            (args) => ({ path: args.path, namespace: "fixture-system" })
          );
          builder.onLoad(
            { filter: /.*/, namespace: "fixture-system" },
            (args) => ({
              loader: "js",
              contents: args.path.endsWith("core")
                ? 'export const Capacitor={getPlatform:()=>"android",isNativePlatform:()=>true}; export const registerPlugin=(name)=>name==="BackgroundContinuity"?globalThis.continuityFixture:{};'
                : args.path.endsWith("clipboard")
                  ? 'export const Clipboard={read:async()=>({value:""}),write:async()=>{},addListener:async()=>({remove:async()=>{}})};'
                  : 'export const LocalNotifications={addListener:async()=>({remove:async()=>{}}),schedule:async()=>{},cancel:async()=>{},checkPermissions:async()=>({display:"granted"})};',
            })
          );
        },
      },
    ],
  });
  const { AndroidClient, LocalStorageBackend } = await import(
    join(own, "client.mjs")
  );
  const values = new Map([["fixture:autoSync", "false"]]);
  const preferences = {
    get: async ({ key }) => {
      if (rejectPreferencesRead)
        throw new Error("native_preferences_read_unavailable");
      return { value: values.get(key) ?? null };
    },
    set: async ({ key, value }) => {
      if (rejectPreferences) throw new Error("native_preferences_rejected");
      values.set(key, value);
    },
    remove: async ({ key }) => {
      values.delete(key);
    },
  };
  const storage = new LocalStorageBackend("fixture:", preferences, {
    native: {
      get: async ({ key }) => ({ value: values.get(key) ?? null }),
      set: preferences.set,
      remove: preferences.remove,
    },
    isNative: () => true,
  });
  const client = new AndroidClient(storage);
  await client.refreshBackgroundContinuity();
  await client.setBackgroundContinuity(true);
  // The native watchdog sets isRunning=false before delivering runtimeLost.
  const runtimeLost = nativeEvents.get("runtimeLost");
  assert.equal(
    typeof runtimeLost,
    "function",
    "the actual AndroidClient owns the native loss callback"
  );
  running = false;
  await runtimeLost({});
  let lostState = await client.getState();
  assert.equal(lostState.backgroundContinuity.service, "stopped");
  assert.equal(lostState.backgroundContinuity.runtimeHealthy, false);
  assert.equal(lostState.backgroundContinuity.connection, "disconnected");
  await client.setBackgroundContinuity(true);
  rejectStop = true;
  rejectInfo = true;
  await runtimeLost({});
  lostState = await client.getState();
  assert.equal(lostState.backgroundContinuity.controlStateKnown, false);
  assert.equal(lostState.backgroundContinuity.runtimeHealthy, false);
  assert.ok(lostState.backgroundContinuity.controlError);
  const removeFailedConsumer = client.onUpdate(() => {
    throw new Error("fixture_publication_unavailable");
  });
  await runtimeLost({});
  removeFailedConsumer();
  rejectStop = rejectInfo = false;
  await client.refreshBackgroundContinuity();
  await client.setBackgroundContinuity(true);
  let state = await client.getState();
  assert.equal(state.backgroundContinuity.autoSync, false);
  assert.equal(state.backgroundContinuity.service, "running");
  assert.equal(
    nativeSync,
    false,
    "native notification receives applied false at startup"
  );
  assert.equal(
    state.backgroundContinuity.notificationAvailability,
    "blocked",
    "denial is not an enable gate"
  );
  await client.setBackgroundContinuity(false);
  assert.equal(
    (await client.getSettings()).snapshot.state.autoSync,
    false,
    "Stop preserves saved false"
  );
  const reopened = new AndroidClient(storage);
  await reopened.refreshBackgroundContinuity();
  assert.equal(
    (await reopened.getState()).backgroundContinuity.backgroundEnabled,
    false
  );
  await reopened.setAutoSync(true);
  await reopened.setBackgroundContinuity(true);
  await reopened.setSettings({ autoSync: false });
  assert.equal(
    (await reopened.getState()).backgroundContinuity.autoSync,
    false,
    "the settings bridge reconciles continuity's applied preference"
  );
  assert.equal(nativeSync, false);
  await reopened.setSettings({ autoSync: true });
  rejectUpdate = true;
  const incomplete = await reopened.setAutoSync(false);
  assert.notEqual(incomplete.status, "applied");
  assert.equal(
    (await reopened.getState()).backgroundContinuity.controlStateKnown,
    false,
    "a rejected native update leaves the app usable with unknown controls"
  );
  rejectUpdate = false;
  await reopened.refreshBackgroundContinuity();
  await reopened.setAutoSync(true);
  rejectPreferences = true;
  const rejectedPreference = await reopened.setAutoSync(false);
  assert.notEqual(
    rejectedPreference.status,
    "applied",
    "failed native Auto Sync persistence cannot become a fallback success"
  );
  assert.equal((await reopened.getState()).autoSync, true);
  rejectPreferencesRead = true;
  const unknownPreference = await reopened.setAutoSync(false);
  assert.notEqual(unknownPreference.status, "applied");
  assert.equal(
    (await reopened.getState()).autoSync,
    true,
    "unavailable native preference read cannot apply rejected fallback state"
  );
  assert.equal(
    (await reopened.getState()).backgroundContinuity.controlStateKnown,
    false
  );
  rejectPreferences = rejectPreferencesRead = false;
  await reopened.refreshBackgroundContinuity();

  await reopened.setBackgroundContinuity(false);
  assert.equal(
    (await reopened.getSettings()).snapshot.state.autoSync,
    true,
    "Stop preserves saved true"
  );
  rejectWrite = true;
  await assert.rejects(reopened.setBackgroundContinuity(true));
  state = await reopened.getState();
  assert.equal(
    state.backgroundContinuity.backgroundEnabled,
    false,
    "native persistence failure cannot look enabled"
  );
  assert.equal(state.backgroundContinuity.controlStateKnown, true);
  assert.ok(state.backgroundContinuity.controlError);
  rejectInfo = true;
  await assert.rejects(reopened.setBackgroundContinuity(true));
  assert.equal(
    (await reopened.getState()).backgroundContinuity.controlStateKnown,
    false
  );
  rejectWrite = rejectInfo = false;
  denied = false;
  await reopened.refreshBackgroundContinuity();
  state = await reopened.getState();
  assert.equal(
    state.backgroundContinuity.notificationAvailability,
    "available",
    "return from settings refreshes denial"
  );
  assert.equal(state.backgroundContinuity.controlStateKnown, true);
  console.log(
    JSON.stringify({
      pass: true,
      actualNativeHost: false,
      seam: "AndroidClient + coordinator + native adapter + settings owner + LocalStorageBackend; inert OS boundaries",
    })
  );
} finally {
  delete globalThis.continuityFixture;
  await rm(own, { recursive: true, force: true });
}
