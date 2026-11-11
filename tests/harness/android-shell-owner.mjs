import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import polyfills from "rollup-plugin-polyfill-node/dist/polyfills.js";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "android-shell-owner-"));
let browser;
try {
  // Real mounted AndroidApp + default production client/runtime. Only external
  // Capacitor, clipboard and network boundaries are inert, in a fresh context.
  await build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {AndroidApp} from '${repo}/apps/android/src/AndroidApp';
        import {createAndroidRuntime} from '${repo}/apps/android/src/client';
        const owner = createAndroidRuntime();
        const runtime = {client: owner.client, start: owner.start, stop: owner.stop};
        const root = createRoot(document.getElementById('root'));
        globalThis.shellHost = {start: owner.start, stop: owner.stop,
          publicState: owner.publicState, unmount: () => root.unmount()};
        root.render(<AndroidApp runtime={runtime}/>);`,
      loader: "tsx",
      resolveDir: repo,
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome110",
    loader: { ".css": "empty", ".png": "dataurl" },
    define: { "process.env.NODE_ENV": '"test"', global: "globalThis" },
    outfile: join(own, "shell.js"),
    plugins: [
      NodeGlobalsPolyfillPlugin({ process: true, buffer: true }),
      {
        name: "browser-node-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /^(dgram|os|events)$/ }, (args) => ({
            path: args.path,
            namespace: "node-system",
          }));
          builder.onLoad(
            { filter: /.*/, namespace: "node-system" },
            (args) => ({
              loader: "js",
              contents:
                args.path === "events"
                  ? polyfills["events.js"]
                  : args.path === "os"
                    ? "export const networkInterfaces=()=>({});export default {networkInterfaces};"
                    : 'export const createSocket=()=>{throw Error("fixture_datagram_forbidden")};export default {createSocket};',
            })
          );
        },
      },
      {
        name: "inert-capacitor-boundaries",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^@capacitor\/(core|preferences|clipboard|local-notifications)$/,
            },
            (args) => ({ path: args.path, namespace: "system" })
          );
          builder.onLoad({ filter: /.*/, namespace: "system" }, (args) => ({
            loader: "js",
            contents: args.path.endsWith("core")
              ? `export const Capacitor={getPlatform:()=>"android",isNativePlatform:()=>true};export const registerPlugin=name=>globalThis.shellPlatform.plugins[name];`
              : args.path.endsWith("preferences")
                ? `export const Preferences=globalThis.shellPlatform.preferences;`
                : args.path.endsWith("clipboard")
                  ? `export const Clipboard=globalThis.shellPlatform.clipboard;`
                  : `export const LocalNotifications=globalThis.shellPlatform.notifications;`,
          }));
        },
      },
    ],
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    route.request().url() === "https://android-shell.test/"
      ? route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><div id="root"></div>',
        })
      : route.abort()
  );
  await page.goto("https://android-shell.test/");
  await page.evaluate(() => {
    // Fresh browser storage at an intercepted synthetic HTTPS origin; no server.
    const values = new Map();
    const subscriptions = new Set();
    let release;
    const startupGate = new Promise((resolve) => {
      release = resolve;
    });
    const stats = { opens: 0, reads: 0, writes: 0, taskReady: false };
    const addListener = async (name, callback) => {
      const registration = { name, callback };
      subscriptions.add(registration);
      return { remove: async () => subscriptions.delete(registration) };
    };
    const preferences = {
      get: async ({ key }) => ({ value: values.get(key) ?? null }),
      set: async ({ key, value }) => {
        values.set(key, value);
      },
      remove: async ({ key }) => {
        values.delete(key);
      },
    };
    const continuity = {
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
      addListener,
      getExplicitTextActions: async () => ({ actions: "[]" }),
      getPendingClipboardApplication: async () => ({}),
      clearPendingClipboardApplication: async () => {},
      heartbeat: async () => {},
      stop: async () => {},
      setEnabled: async () => {},
      update: async () => {},
      showExplicitTextFeedback: async () => {},
    };
    const assertCallback = (callback) => {
      if (!callback) throw Error("notification_callback_not_registered");
    };
    globalThis.shellPlatform = {
      preferences,
      clipboard: {
        read: async () => {
          stats.reads++;
          return { value: "" };
        },
        write: async () => {
          stats.writes++;
        },
      },
      notifications: {
        addListener,
        schedule: async () => {},
        cancel: async () => {},
        checkPermissions: async () => ({ display: "denied" }),
      },
      plugins: {
        BackgroundContinuity: continuity,
        IdentityResetStorage: {
          ...preferences,
          openRuntime: async () => {
            stats.opens++;
            await startupGate;
          },
          acquireFence: async () => {},
          releaseFence: async () => {},
          clearNativeQueues: async () => {},
          verifyNativeQueues: async () => {},
          restartRuntime: async () => {
            throw Error("fixture_restart_forbidden");
          },
        },
        HostTaskInput: {
          addListener,
          setReady: async ({ ready }) => {
            stats.taskReady = ready;
          },
          completeBack: async () => {},
        },
        HostGeometry: {
          addListener,
          getSnapshot: async () => {
            throw Error("fixture_geometry_unavailable");
          },
        },
        ManagedRelay: { addListener },
      },
      selectNotification: (id, instance) => {
        const callback = [...subscriptions].find(
          (s) => s.name === "localNotificationActionPerformed"
        )?.callback;
        assertCallback(callback);
        callback({
          notification: {
            extra: {
              runtimeNotificationId: id,
              runtimeNotificationInstance: instance,
            },
          },
        });
      },
      releaseStartup: release,
      stats: () => ({
        ...stats,
        taskListeners: [...subscriptions].filter((s) => s.name === "back")
          .length,
        clientSubscriptions: [...subscriptions].filter(
          (s) => s.name === "runtimeLost"
        ).length,
      }),
    };
    const denyNetwork = () => {
      throw Error("fixture_network_unavailable");
    };
    globalThis.WebSocket = class {
      constructor() {
        denyNetwork();
      }
    };
    globalThis.RTCPeerConnection = class {
      constructor() {
        denyNetwork();
      }
    };
    globalThis.fetch = denyNetwork;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => {
          throw Error("fixture_camera_forbidden");
        },
      },
    });
  });
  await page.addScriptTag({ path: join(own, "shell.js") });
  await page.waitForFunction(() => shellPlatform.stats().opens === 1);
  await page.getByRole("textbox", { name: "Search history" }).waitFor();
  assert.equal(
    await page.evaluate(() => shellPlatform.stats().taskReady),
    true
  );
  await page.evaluate(async () => {
    globalThis.hostStartFinished = false;
    void shellHost.start().then(() => {
      globalThis.hostStartFinished = true;
    });
    await new Promise(requestAnimationFrame);
  });
  assert.equal(
    await page.evaluate(() => hostStartFinished),
    false,
    "the host awaits actual startup begun by the mounted shell"
  );
  await page
    .getByRole("textbox", { name: "Search history" })
    .fill("retained query");
  await page.evaluate(() => {
    shellPlatform.selectNotification("pairing-request-expired", "old-envelope");
    shellPlatform.selectNotification("pairing-request-expired", "old-envelope");
  });
  assert.equal(
    await page.getByRole("button", { name: "Back to previous task" }).count(),
    0,
    "selection before startup cannot navigate before current authority is ready"
  );
  await page.evaluate(() => shellPlatform.releaseStartup());
  await page.waitForFunction(() => hostStartFinished);
  await page.waitForFunction(
    async () => !!(await shellHost.publicState()).identity
  );
  await page.getByRole("button", { name: "Back to previous task" }).waitFor();
  await page.getByRole("heading", { name: "Devices", exact: true }).waitFor();
  await page.getByRole("button", { name: "Back to previous task" }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Search history" }).inputValue(),
    "retained query"
  );
  await page.evaluate(() =>
    shellPlatform.selectNotification("pairing-request-expired", "old-envelope")
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(
    await page.getByRole("button", { name: "Back to previous task" }).count(),
    0,
    "the delayed duplicate cannot resurrect the handled selection"
  );
  assert.equal(
    await page.evaluate(() => shellPlatform.stats().opens),
    1,
    "the mounted shell starts its supplied default runtime once"
  );
  assert.equal(
    await page.evaluate(() => shellPlatform.stats().clientSubscriptions),
    1,
    "one default client owns the native runtime-loss subscription"
  );
  assert.equal(
    await page.evaluate(() => shellPlatform.stats().writes),
    0,
    "ordinary startup does not write clipboard"
  );
  await page.evaluate(() => shellHost.unmount());
  await page.evaluate(() => shellHost.stop());
  await page.waitForFunction(
    () =>
      !shellPlatform.stats().taskReady &&
      shellPlatform.stats().taskListeners === 0
  );
  assert.equal(
    await page.evaluate(async () => {
      try {
        await shellHost.start();
        return "restarted";
      } catch (error) {
        return error.message;
      }
    }),
    "identity_runtime_suspended",
    "unmount leaves the supplied runtime terminally stopped"
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      actualNativeHost: false,
      seam: "mounted AndroidApp + createAndroidRuntime; inert external platform boundaries",
    })
  );
} finally {
  await browser?.close();
  await rm(own, { recursive: true, force: true });
}
