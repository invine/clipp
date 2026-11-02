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
const own = await mkdtemp(join(repo, ".local", "android-notification-"));
const values = new Map();
const events = new Map();
const notificationEvents = new Map();
let appAvailability = "blocked",
  channelAvailability = "blocked",
  permissionPrompts = 0,
  settingsOpened = 0;
globalThis.notificationBoundary = {
  addListener: async (name, handler) => {
    notificationEvents.set(name, handler);
    return { remove: async () => notificationEvents.delete(name) };
  },
  checkPermissions: async () => ({
    display: appAvailability === "available" ? "granted" : "denied",
  }),
  requestPermissions: async () => {
    permissionPrompts++;
    appAvailability = "available";
    return { display: "granted" };
  },
  schedule: async () => {
    throw Error("unexpected_notification_schedule_without_request");
  },
  cancel: async () => {},
};
const require = createRequire(import.meta.url);
const denyNetwork = () => {
  throw Error("fixture_network_unavailable");
};
require("node:net").Server.prototype.listen = denyNetwork;
require("node:net").Socket.prototype.connect = denyNetwork;
require("node:dgram").createSocket = denyNetwork;
syncBuiltinESMExports();
globalThis.fetch = async () => {
  throw Error("SOURCE_network_forbidden");
};
globalThis.cycleNative = {
  get: async ({ key }) => ({ value: values.get(key) ?? null }),
  set: async ({ key, value }) => {
    values.set(key, value);
  },
  remove: async ({ key }) => {
    values.delete(key);
  },
  openRuntime: async () => {},
  acquireFence: async () => {},
  releaseFence: async () => {},
  clearNativeQueues: async () => {},
  verifyNativeQueues: async () => {},
};
globalThis.cycleContinuity = {
  getPairingNotificationAvailability: async () => ({
    app: appAvailability,
    channel: channelAvailability,
  }),
  openPairingNotificationSettings: async () => {
    settingsOpened++;
  },
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
  focus() {},
});
globalThis.document = Object.assign(new EventTarget(), {
  visibilityState: "visible",
  hasFocus: () => true,
});
let client;
let bound;
try {
  await build({
    stdin: {
      contents: `export {AndroidClient} from '${repo}/apps/android/src/client';export {LocalStorageBackend} from '${repo}/apps/android/src/storage';export {createUiSession} from '${repo}/packages/ui/src/uiSession';export {bindNotificationRequests} from '${repo}/packages/ui/src/notificationRequests';`,
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
                  ? `export const Clipboard={read:async()=>{throw Error("SOURCE_clipboard_forbidden")},write:async()=>{throw Error("SOURCE_clipboard_forbidden")}};`
                  : `export const LocalNotifications=globalThis.notificationBoundary;`,
          }));
        },
      },
    ],
  });
  const {
    AndroidClient,
    LocalStorageBackend,
    createUiSession,
    bindNotificationRequests,
  } = await import(join(own, "client.mjs"));
  client = new AndroidClient(
    new LocalStorageBackend("clipp-android:", globalThis.cycleNative, {
      native: globalThis.cycleNative,
      isNative: () => true,
    })
  );
  // App blocking, Pairing-channel blocking, explicit recovery and callback-before-start.
  assert.deepEqual(await client.getNotificationAvailability(), {
    app: "blocked",
    channel: "blocked",
    displayError: null,
  });
  assert.equal(permissionPrompts, 0);
  await client.openNotificationSettings();
  assert.equal(settingsOpened, 1);
  await client.requestNotificationPermission();
  assert.deepEqual(await client.getNotificationAvailability(), {
    app: "available",
    channel: "blocked",
    displayError: null,
  });
  channelAvailability = "available";
  assert.deepEqual(await client.getNotificationAvailability(), {
    app: "available",
    channel: "available",
    displayError: null,
  });
  const callback = notificationEvents.get("localNotificationActionPerformed");
  assert.equal(typeof callback, "function");
  callback({
    notification: {
      extra: {
        runtimeNotificationId: "pairing-request-expired",
        runtimeNotificationInstance: "old-envelope",
      },
    },
  });
  callback({
    notification: {
      extra: {
        runtimeNotificationId: "pairing-request-expired",
        runtimeNotificationInstance: "old-envelope",
      },
    },
  });
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.open({ kind: "paste", origin: "paste-choice" });
  session.pairing.change("retained raw input");
  const authority = { ready: false, clipIds: [], requestIds: [] };
  bound = bindNotificationRequests(client, session, () => authority);
  await bound.refresh();
  assert.equal(session.getSnapshot().destination, "history");
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
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await client.getApprovalEntries()).length, 1);
  authority.ready = true;
  await bound.refresh();
  assert.equal(session.getSnapshot().destination, "requests");
  assert.deepEqual(session.getSnapshot().tasks, []);
  assert.equal(session.pairing.getSnapshot().raw, "retained raw input");
  session.back();
  assert.deepEqual(
    session.getSnapshot().tasks.map((task) => task.kind),
    ["pairing", "paste"]
  );
  callback({
    notification: {
      extra: {
        runtimeNotificationId: "pairing-request-expired",
        runtimeNotificationInstance: "old-envelope",
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await client.getApprovalEntries(), []);
  // Continuity's unrelated reconnect event has no runtime notification ID.
  callback({ notification: { extra: { purpose: "reconnect" } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().destination, "history");
  console.log(
    "SOURCE actual AndroidClient callback, Pairing app/channel recovery, Requests readiness, duplicate and retained task PASS; native host not run"
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack ?? error);
} finally {
  for (const cleanup of [
    () => bound?.dispose(),
    () => client?.stop(),
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
