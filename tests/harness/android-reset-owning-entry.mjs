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
const own = await mkdtemp(join(repo, ".local", "android-reset-entry-"));
let browser;
try {
  // Real mounted AndroidApp + default production client/runtime. Only external
  // Capacitor, clipboard and network boundaries are inert, in a fresh context.
  await build({
    stdin: {
      contents: `import '${repo}/apps/android/src/resetOwningAcceptance';`,
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
  await context.addInitScript((fixtureMode) => {
    // Fresh browser storage at an intercepted synthetic HTTPS origin; no server.
    const values = {
      get: (key) => localStorage.getItem("external-native:" + key),
      set: (key, value) =>
        localStorage.setItem("external-native:" + key, value),
      delete: (key) => localStorage.removeItem("external-native:" + key),
    };
    let actions = [];
    let nativeInfoAvailable = true;
    let nativeReadBlocked =
      fixtureMode === "checking-resume" &&
      !!localStorage.getItem("external-cleanup-failed-once") &&
      !localStorage.getItem("external-read-failed-once");
    if (nativeReadBlocked)
      localStorage.setItem("external-read-failed-once", "true");
    const subscriptions = new Set();
    let release;
    const startupGate = new Promise((resolve) => {
      release = resolve;
    });
    const stats = {
      opens: 0,
      reads: 0,
      writes: 0,
      taskReady: false,
      resets: 0,
      restarts: 0,
      cleanups: 0,
    };
    const addListener = async (name, callback) => {
      const registration = { name, callback };
      subscriptions.add(registration);
      return { remove: async () => subscriptions.delete(registration) };
    };
    const preferences = {
      get: async ({ key }) => {
        if (
          (fixtureMode.startsWith("unknown") || nativeReadBlocked) &&
          key.endsWith(":manualIdentityReset")
        )
          throw Error("external_native_read_unavailable");
        return { value: values.get(key) ?? null };
      },
      set: async ({ key, value }) => {
        values.set(key, value);
      },
      remove: async ({ key }) => {
        values.delete(key);
      },
    };
    const continuity = {
      getPlatformInfo: async () => {
        if (!nativeInfoAvailable)
          throw Error("external_native_info_unavailable");
        return {
          apiLevel: 34,
          enabled: false,
          enabledPersistenceKnown: true,
          serviceRunning: false,
          userStopped: false,
          notificationAvailability: "blocked",
          observedBackgroundFailureCount: 0,
          supportState: "unqualified",
          batteryOptimizationGuidance: false,
        };
      },
      addListener,
      getExplicitTextActions: async () => ({
        actions: JSON.stringify(actions),
      }),
      prepareExplicitTextAction: async ({
        actionId,
        clipId,
        capturedAt,
        sharingLifetimeMs,
      }) => {
        actions = actions.map((action) =>
          action.id === actionId
            ? { ...action, event: { clipId, capturedAt, sharingLifetimeMs } }
            : action
        );
      },
      completeExplicitTextAction: async ({ actionId }) => {
        actions = actions.filter((action) => action.id !== actionId);
      },
      getPendingClipboardApplication: async () => ({}),
      clearPendingClipboardApplication: async () => {},
      heartbeat: async () => {},
      stop: async () => {},
      setEnabled: async () => {},
      update: async () => {},
      showExplicitTextFeedback: async () => {},
    };
    globalThis.shellPlatform = {
      preferences,
      clipboard: {
        read: async () => {
          stats.reads++;
          throw Error("source_clipboard_forbidden");
        },
        write: async () => {
          stats.writes++;
          throw Error("source_clipboard_forbidden");
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
          acquireFence: async () => {
            stats.resets++;
          },
          releaseFence: async () => {},
          clearNativeQueues: async () => {
            stats.cleanups++;
            if (
              (fixtureMode === "resume" || fixtureMode === "checking-resume") &&
              !localStorage.getItem("external-cleanup-failed-once")
            ) {
              localStorage.setItem("external-cleanup-failed-once", "true");
              throw Error("external_native_cleanup_unavailable");
            }
            actions = [];
          },
          verifyNativeQueues: async () => {},
          restartRuntime: async () => {
            stats.restarts++;
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
      ingress: (text) => {
        actions.push({ id: crypto.randomUUID(), text, source: "send" });
        for (const listener of subscriptions)
          if (listener.name === "explicitText") listener.callback({});
      },
      changeNativeInfo: (available) => {
        nativeInfoAvailable = available;
        for (const listener of subscriptions)
          if (listener.name === "activityState")
            listener.callback({ resumed: true, windowFocused: true });
      },
      recoverNativeReads: () => {
        nativeReadBlocked = false;
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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => {
          throw Error("source_clipboard_forbidden");
        },
        writeText: async () => {
          throw Error("source_clipboard_forbidden");
        },
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => {
          throw Error("fixture_camera_forbidden");
        },
      },
    });
  }, process.argv[2] ?? "invalid");
  await page.goto("https://android-shell.test/");
  const mode = process.argv[2] ?? "invalid";
  const manifest =
    mode === "stale" || mode.startsWith("unknown")
      ? {
          version: 1,
          mode: "execute",
          caseId: "entry-source",
          deadlineMs: mode === "unknown-timeout" ? 1000 : 5000,
          operationId: "entry-source-operation",
          reviewedPeerId: "genuine-prior-preflight-id-does-not-match-current",
          expected: {
            theme: "system",
            autoSync: true,
            backgroundEnabled: false,
            localRetentionMs: 604800000,
            sharingLifetimeMs: 60000,
            markers: ["clipp-reset-source-marker"],
            pinnedCount: 0,
          },
        }
      : {
          version: 1,
          mode: "observe-preflight",
          caseId: "entry-source",
          deadlineMs: 5000,
          ...(mode === "invalid" ? { command: "begin" } : {}),
        };
  async function loadEntry(manifest) {
    await page.evaluate((manifest) => {
      const input = document.createElement("script");
      input.id = "clipp-reset-owning-manifest";
      input.type = "application/json";
      input.textContent = JSON.stringify(manifest);
      document.body.append(input);
      const output = document.createElement("output");
      output.id = "clipp-reset-owning-progress";
      output.hidden = true;
      document.body.append(output);
    }, manifest);
    await page.addScriptTag({ path: join(own, "shell.js") });
    await page.waitForFunction(
      () => document.querySelector("#clipp-reset-owning-progress").textContent
    );
  }
  await loadEntry(manifest);
  if (mode === "invalid") {
    const progress = await page
      .locator("#clipp-reset-owning-progress")
      .textContent();
    assert.equal(JSON.parse(progress).stage, "invalid-manifest");
    assert.equal(await page.evaluate(() => shellPlatform.stats().opens), 0);
    assert.equal(
      await page.evaluate(() => shellPlatform.stats().clientSubscriptions),
      0
    );
  } else if (mode.startsWith("unknown")) {
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector("#clipp-reset-owning-progress").textContent
        ).stage === "checking"
    );
    if (mode === "unknown-timeout") {
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).stage === "operation-unconfirmed"
      );
    }
    assert.equal(await page.evaluate(() => shellPlatform.stats().opens), 0);
    assert.equal(await page.evaluate(() => shellPlatform.stats().cleanups), 0);
    assert.equal(await page.evaluate(() => shellPlatform.stats().restarts), 0);
    await page.evaluate(() =>
      dispatchEvent(new PageTransitionEvent("pagehide"))
    );
  } else {
    await page.waitForFunction(() => shellPlatform.stats().opens === 1);
    assert.notEqual(
      JSON.parse(
        await page.locator("#clipp-reset-owning-progress").textContent()
      ).stage,
      "preflight-ready"
    );
    await page.evaluate(() => shellPlatform.releaseStartup());
    const expectedStage =
      mode === "stale" ? "reviewed-identity-mismatch" : "preflight-ready";
    await page.waitForFunction(
      (stage) =>
        JSON.parse(
          document.querySelector("#clipp-reset-owning-progress").textContent
        ).stage === stage,
      expectedStage
    );
    const progress = JSON.parse(
      await page.locator("#clipp-reset-owning-progress").textContent()
    );
    if (mode !== "stale") {
      assert.ok(progress.currentPeerId);
      assert.equal(progress.clipCount, 0);
      assert.equal(progress.pinnedCount, 0);
      assert.equal(progress.autoSync, true);
    }
    assert.equal(
      await page.evaluate(() => shellPlatform.stats().clientSubscriptions),
      1
    );
    assert.equal(await page.evaluate(() => shellPlatform.stats().writes), 0);
    if (mode === "background-unknown") {
      await page.evaluate(() => shellPlatform.changeNativeInfo(false));
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).stage === "preflight-unavailable"
      );
      const unknown = JSON.parse(
        await page.locator("#clipp-reset-owning-progress").textContent()
      );
      assert.equal(unknown.backgroundStateKnown, false);
      assert.equal(
        Object.hasOwn(unknown, "backgroundEnabled"),
        false,
        "unknown saved background state is not a false witness"
      );
      await page.evaluate(() => shellPlatform.changeNativeInfo(true));
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).stage === "preflight-ready"
      );
      assert.equal(
        JSON.parse(
          await page.locator("#clipp-reset-owning-progress").textContent()
        ).backgroundStateKnown,
        true
      );
    }
    if (mode === "immutable") {
      await page.evaluate((before) => {
        document.querySelector("#clipp-reset-owning-manifest").textContent =
          JSON.stringify({
            version: 1,
            mode: "execute",
            caseId: "entry-source",
            deadlineMs: 5000,
            operationId: "late-dom-operation",
            reviewedPeerId: before.currentPeerId,
            expected: {
              theme: before.theme,
              autoSync: before.autoSync,
              backgroundEnabled: before.backgroundEnabled,
              localRetentionMs: before.localRetentionMs,
              sharingLifetimeMs: before.sharingLifetimeMs,
              markers: ["clipp-reset-source-marker"],
              pinnedCount: 0,
            },
          });
        shellPlatform.ingress("clipp-reset-source-marker");
      }, progress);
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).clipCount === 1
      );
      assert.equal(
        JSON.parse(
          await page.locator("#clipp-reset-owning-progress").textContent()
        ).stage,
        "preflight-ready"
      );
      assert.equal(await page.evaluate(() => shellPlatform.stats().resets), 0);
    }
    if (["execute", "resume", "checking-resume"].includes(mode)) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("navigation", { name: "Clipp destinations" })
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Appearance", exact: true })
        .selectOption("dark");
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).theme === "dark"
      );
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("navigation", { name: "Clipp destinations" })
        .getByRole("button", { name: "History", exact: true })
        .click();
      await page.evaluate(() =>
        shellPlatform.ingress("clipp-reset-source-marker")
      );
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).clipCount === 1
      );
      await page
        .getByRole("button", { name: "View Clip details" })
        .click();
      await page
        .getByRole("dialog", { name: "Clip details" })
        .getByRole("button", { name: "Pin Clip", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).pinnedCount === 1
      );
      const before = JSON.parse(
        await page.locator("#clipp-reset-owning-progress").textContent()
      );
      const execute = {
        version: 1,
        mode: "execute",
        caseId: "entry-source",
        deadlineMs: 5000,
        operationId: "entry-source-operation",
        reviewedPeerId: before.currentPeerId,
        expected: {
          theme: before.theme,
          autoSync: before.autoSync,
          backgroundEnabled: before.backgroundEnabled,
          localRetentionMs: before.localRetentionMs,
          sharingLifetimeMs: before.sharingLifetimeMs,
          markers: ["clipp-reset-source-marker"],
          pinnedCount: before.pinnedCount,
        },
      };
      await page.reload();
      await loadEntry(execute);
      await page.waitForFunction(() => shellPlatform.stats().opens === 1);
      await page.evaluate(() => shellPlatform.releaseStartup());
      const initialResult =
        mode !== "execute" ? "incomplete" : "restart-required";
      await page.waitForFunction(
        (stage) =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).stage === stage,
        initialResult
      );
      assert.equal(await page.evaluate(() => shellPlatform.stats().resets), 1);
      assert.equal(
        await page.evaluate(() => shellPlatform.stats().restarts),
        mode !== "execute" ? 0 : 1
      );
      if (mode !== "execute") {
        await page.reload();
        await loadEntry(execute);
        if (mode === "checking-resume") {
          await page.waitForFunction(
            () =>
              JSON.parse(
                document.querySelector("#clipp-reset-owning-progress")
                  .textContent
              ).stage === "checking"
          );
          await page.evaluate(() => shellPlatform.recoverNativeReads());
        }
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector("#clipp-reset-owning-progress").textContent
            ).stage === "restart-required"
        );
        assert.equal(
          await page.evaluate(() => shellPlatform.stats().opens),
          0,
          "accepted cold recovery cannot start ordinary services"
        );
        assert.equal(
          await page.evaluate(() => shellPlatform.stats().restarts),
          1
        );
      }
      await page.reload();
      await loadEntry(execute);
      await page.waitForFunction(() => shellPlatform.stats().opens === 1);
      await page.evaluate(() => shellPlatform.releaseStartup());
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).stage === "replacement-ready"
      );
      const after = JSON.parse(
        await page.locator("#clipp-reset-owning-progress").textContent()
      );
      assert.notEqual(after.currentPeerId, before.currentPeerId);
      assert.equal(after.formerPeerId, before.currentPeerId);
      assert.equal(after.clipCount, 0);
      assert.equal(after.theme, before.theme);
      assert.equal(
        await page.evaluate(() => shellPlatform.stats().resets),
        0,
        "completed operation is never begun again"
      );
      await page.reload();
      await loadEntry({ ...execute, operationId: "unrelated-operation" });
      await page.waitForFunction(() => shellPlatform.stats().opens === 1);
      await page.evaluate(() => shellPlatform.releaseStartup());
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("#clipp-reset-owning-progress").textContent
          ).stage === "operation-mismatch"
      );
      assert.equal(await page.evaluate(() => shellPlatform.stats().resets), 0);
    }
    await page.getByRole("textbox", { name: "Search history" }).waitFor();
    await page.evaluate(() =>
      dispatchEvent(new PageTransitionEvent("pagehide"))
    );
    await page.waitForFunction(
      () =>
        !shellPlatform.stats().taskReady &&
        shellPlatform.stats().taskListeners === 0
    );
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector("#clipp-reset-owning-progress").textContent
        ).stage === "stopped"
    );
  }
  assert.equal(
    await page.locator("#clipp-reset-owning-progress").isHidden(),
    true
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      actualNativeHost: false,
      seam: "maintained immutable entry input and bounded public output",
    })
  );
} finally {
  await browser?.close();
  await rm(own, { recursive: true, force: true });
}
