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
          builder.onResolve({ filter: /^@core\/pairing\/pending$/ }, (args) =>
            args.importer.endsWith("/apps/android/src/client.ts")
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
  await client.start();
  await globalThis.projectPending([
    {
      initiatorPeerId: "peer-one",
      deviceName: "Laptop",
      requestVersion: "version-one",
      issuedAtUnixMs: "1760000000123",
    },
  ]);
  const state = await client.getState();
  assert.equal(state.pending[0].issuedAtUnixMs, "1760000000123");
} finally {
  await client?.stop();
  await rm(own, { recursive: true, force: true });
}
