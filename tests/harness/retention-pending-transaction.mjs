import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import playwrightRegistry from "playwright-core/lib/server/registry/index";

// Root runs this maintained real-platform fixture. It starts no Clipp runtime,
// native app, server or account, and can never qualify Android20 native replay.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const destination = process.argv[2] && resolve(process.argv[2]);
assert(destination, "Pass a fresh ignored evidence directory");
const allowed =
  "/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/";
assert(
  destination.startsWith(allowed) &&
    dirname(destination) === allowed.slice(0, -1)
);
const mode = process.argv[3] || "normal";
assert(
  process.argv.length <= 4 &&
    [
      "normal",
      "--setup-failure-after-profile",
      "--launch-timeout-1ms",
    ].includes(mode),
  "Only the two explicit root-owned lifecycle failure modes are accepted"
);
const assetPath = join(
  root,
  "apps/android/android/app/src/androidTest/assets/retention-pending-transaction-witness.js"
);
const javaPath = join(
  root,
  "apps/android/android/app/src/androidTest/java/com/clipp/app/ClipPolicyPendingInputTest.java"
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  classification: "CONTROLLED_REAL_CHROMIUM_INDEXEDDB_PLATFORM_FIXTURE_ONLY",
  nativeAndroidQualified: false,
  productRuntimeStarted: false,
  productHistorySeeded: false,
  fixtureDatabaseWrites: false,
  source: {
    asset: { path: assetPath, sha256: null },
    java: { path: javaPath, sha256: null },
    harness: {
      path: fileURLToPath(import.meta.url),
      sha256: null,
    },
    productionBuild: "none; actual test asset only, no application bundle",
  },
  stage: "setup",
  deadlineElapsed: false,
  profile: null,
  mode,
  launch: {
    started: false,
    settled: true,
    receivedContext: false,
    timeoutMs: null,
  },
  requests: { fulfilled: 0, aborted: 0 },
  cleanup: {
    contextClosed: false,
    socketClosed: false,
    ownedProcessesAbsent: false,
    profileRemoved: false,
  },
  browserOwnership: {
    registryExport: "playwright-core/lib/server/registry/index",
    selector:
      "unique same-UID direct Node child; exact official headless executable prefix and exact standalone owned profile flag",
  },
};
const started = performance.now();
const activeDeadline = started + 45_000;
let context, browser, page, primary, profile, headlessExecutable;
let destinationCreated = false,
  launchStarted = false,
  launchSettled = true;
const owned = new Map();
let browserRoot;
const execute = promisify(execFile);
const bounded = async (label, operation, limit = 5_000, cleanup = false) => {
  const duration = cleanup
    ? limit
    : Math.min(limit, activeDeadline - performance.now());
  assert(duration > 0, `${label}: fixture deadline elapsed`);
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: deadline exceeded`)),
          duration
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const inventory = async () => {
  const { stdout } = await execute(
    "/bin/ps",
    ["-ax", "-o", "pid=,ppid=,uid=,command="],
    {
      timeout: 2_000,
      maxBuffer: 512 * 1024,
      encoding: "utf8",
    }
  );
  return stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match
      ? [
          {
            pid: +match[1],
            parent: +match[2],
            uid: +match[3],
            command: match[4],
          },
        ]
      : [];
  });
};
const rememberChildren = async () => {
  const rows = await inventory();
  if (!profile || !launchStarted) return rows;
  if (!browserRoot) {
    const candidates = rows.filter(
      (row) =>
        row.parent === process.pid &&
        row.command.startsWith(headlessExecutable + " ") &&
        row.command.split(/\s+/).includes("--user-data-dir=" + profile)
    );
    if (candidates.length === 0) {
      assert(
        launchSettled,
        "Never declare browser absence before launch settles"
      );
      assert(
        !context || !browser?.isConnected(),
        "A connected browser requires its actual owned profile root"
      );
      return rows;
    }
    assert.equal(
      candidates.length,
      1,
      "Require exactly one actual owned-profile official Chromium root"
    );
    assert.equal(
      candidates[0].uid,
      process.getuid(),
      "Foreign UID cannot own the actual browser root"
    );
    browserRoot = candidates[0];
    owned.set(browserRoot.pid, browserRoot);
    report.browserOwnership.actualRoot = { ...browserRoot };
  }
  // Node's unrelated children include macOS's setuid ps and a caffeinate helper.
  // Only already verified live browser descendants can admit another child.
  const parents = new Set();
  for (const original of owned.values()) {
    const current = rows.find((row) => row.pid === original.pid);
    if (!current) continue;
    assert(
      current.uid === original.uid && current.command === original.command,
      "A replaced browser PID cannot admit descendants"
    );
    parents.add(current.pid);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        row.pid === process.pid ||
        !parents.has(row.parent) ||
        parents.has(row.pid)
      )
        continue;
      assert.equal(
        row.uid,
        process.getuid(),
        "Foreign UID cannot become an owned browser descendant"
      );
      assert(owned.size < 64, "Bound owned browser process inventory");
      owned.set(row.pid, row);
      parents.add(row.pid);
      changed = true;
    }
  }
  return rows;
};
const signalRemaining = async (signal) => {
  const rows = await inventory();
  for (const original of owned.values()) {
    const actual = rows.find((row) => row.pid === original.pid);
    if (!actual) continue;
    assert(
      actual.uid === original.uid &&
        actual.command === original.command &&
        actual.pid !== process.pid,
      "Never signal a replaced or foreign process"
    );
    try {
      process.kill(actual.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
};
try {
  await mkdir(destination, { mode: 0o700 });
  destinationCreated = true;
  profile = await mkdtemp(join(destination, "chromium-profile-"));
  report.profile = profile;
  assert(
    !/\s/.test(profile),
    "Exact process argument ownership requires a whitespace-free owned profile"
  );
  if (mode === "--setup-failure-after-profile") {
    report.stage = "setup-failure-after-profile";
    // An actual failed filesystem read under this fresh owned profile, not a fake browser.
    await readFile(
      join(profile, "required-setup-file-not-created.json"),
      "utf8"
    );
    throw new Error("Expected fresh-profile ENOENT was not observed");
  }
  headlessExecutable = playwrightRegistry.registry
    .findExecutable("chromium-headless-shell")
    ?.executablePath();
  assert(
    typeof headlessExecutable === "string" &&
      headlessExecutable.startsWith("/"),
    "Installed Playwright must provide its exact headless-shell executable; no fallback or install"
  );
  const playwrightPackagePath = createRequire(import.meta.url).resolve(
    "playwright-core/package.json"
  );
  const playwrightPackage = JSON.parse(
    await readFile(playwrightPackagePath, "utf8")
  );
  Object.assign(report.browserOwnership, {
    headlessExecutable,
    playwrightVersion: playwrightPackage.version,
    playwrightPackagePath,
  });
  const asset = await readFile(assetPath, "utf8");
  const java = await readFile(javaPath, "utf8");
  report.source.asset.sha256 = sha(asset);
  report.source.java.sha256 = sha(java);
  report.source.harness.sha256 = sha(
    await readFile(fileURLToPath(import.meta.url))
  );
  assert(asset.length <= 32_768 && java.length <= 65_536);
  // Bind the real consumer's assembly, without treating this check as the test.
  // The next page.evaluate parses and executes the full actual assembled payload.
  assert(
    java.includes('web.evaluate("(" + source + ")(" + config + ")")'),
    "The native consumer changed its script assembly; update this owning harness with it"
  );
  // Check the budget before invoking a resource creator. Await Playwright's
  // actual finite launch settlement; an outer race must not orphan a late browser.
  const launchRemaining = Math.floor(activeDeadline - performance.now());
  assert(launchRemaining > 0, "No remaining budget to start a browser");
  const launchTimeout =
    mode === "--launch-timeout-1ms" ? 1 : Math.min(10_000, launchRemaining);
  report.stage = "launch-browser";
  report.launch.timeoutMs = launchTimeout;
  launchStarted = true;
  launchSettled = false;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: 800, height: 600 },
      serviceWorkers: "block",
      args: [
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pings",
      ],
      timeout: launchTimeout,
    });
  } finally {
    launchSettled = true;
  }
  browser = context.browser();
  if (mode === "--launch-timeout-1ms")
    throw new Error(
      "Requested actual launch timeout was not observed; real launch fulfilled"
    );
  report.browser = {
    version: browser?.version(),
    executable: chromium.executablePath(),
  };
  await rememberChildren();
  await bounded(
    "install closed request routing",
    context.route("**/*", async (route) => {
      if (
        route.request().url() === "https://localhost/" &&
        route.request().resourceType() === "document"
      ) {
        report.requests.fulfilled += 1;
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><body><p>Isolated public IndexedDB fixture</p></body></html>",
        });
      } else {
        report.requests.aborted += 1;
        await route.abort("blockedbyclient");
      }
    })
  );
  await bounded(
    "install memory clipboard boundary",
    context.addInitScript(() => {
      let text = "isolated-platform-fixture";
      const counts = { reads: 0, writes: 0 };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          readText: async () => {
            counts.reads += 1;
            return text;
          },
          writeText: async (value) => {
            counts.writes += 1;
            text = String(value);
          },
        },
      });
      Object.defineProperty(globalThis, "__fixtureClipboardCounts20", {
        configurable: true,
        value: counts,
      });
    })
  );
  page =
    context.pages()[0] ||
    (await bounded("create owned page", context.newPage()));
  page.setDefaultTimeout(4_000);
  await bounded(
    "route-fulfilled secure origin",
    page.goto("https://localhost/", { waitUntil: "load", timeout: 5_000 })
  );
  await rememberChildren();
  const nonce = "platform-fixture-20";
  const config = { nonce, marker: `clip-policy-pending-${nonce}` };
  await bounded(
    "prepare genuine fixture IndexedDB",
    page.evaluate(async () => {
      const original = Object.getOwnPropertyDescriptor(
        IDBObjectStore.prototype,
        "put"
      );
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("clipp-history", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("history");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      Object.defineProperty(globalThis, "__platformProbe20", {
        configurable: true,
        value: { original, db },
      });
    })
  );
  report.fixtureDatabaseWrites = true;
  // This is exactly Java's three-part assembly, including every asset byte.
  // An arrow expression formatted as a statement with a final semicolon goes
  // RED here, even though checking the standalone file's syntax succeeds.
  const installedExpression = "(" + asset + ")(" + JSON.stringify(config) + ")";
  report.source.installedExpressionSha256 = sha(installedExpression);
  report.stage = "install-exact-java-expression";
  const installed = await bounded(
    report.stage,
    page.evaluate(installedExpression)
  );
  assert.equal(installed.nonce, nonce);
  assert.equal(installed.descriptorOwned, true);
  assert.equal(installed.armed, true);
  report.stage = "real-transaction-behavior";
  const behavior = await bounded(
    report.stage,
    page.evaluate(async ({ nonce, marker }) => {
      const { db } = globalThis.__platformProbe20;
      const id = "00000000-0000-4000-8000-000000000920";
      const controlId = "00000000-0000-4000-8000-000000000921";
      const row = (clipId, content) => ({
        clip: {
          id: clipId,
          type: "text",
          content,
          originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
          capturedAt: 1_000,
          shareExpiresAt: 3_601_000,
        },
        firstStoredAt: 2_000,
        liveHandled: true,
        shareNowPending: true,
        pinned: false,
      });
      const put = (key, value) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction("history", "readwrite");
          const request = transaction.objectStore("history").put(value, key);
          const observation = {
            realRequest: request instanceof IDBRequest,
            realTransaction: transaction instanceof IDBTransaction,
            requestSuccess: false,
          };
          request.addEventListener("success", () => {
            observation.requestSuccess = true;
          });
          transaction.addEventListener("complete", () =>
            resolve({ ...observation, result: "complete" })
          );
          transaction.addEventListener("abort", () =>
            resolve({ ...observation, result: "abort" })
          );
          transaction.addEventListener("error", () =>
            reject(
              transaction.error ||
                new Error("Unexpected fixture transaction error")
            )
          );
        });
      const get = (key) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction("history", "readonly");
          const request = transaction.objectStore("history").get(key);
          transaction.oncomplete = () => resolve(request.result ?? null);
          transaction.onabort = () =>
            reject(transaction.error || new Error("Readonly fixture aborted"));
          transaction.onerror = () =>
            reject(transaction.error || new Error("Readonly fixture failed"));
        });
      const target = await put(id, row(id, marker));
      const absent = (await get(id)) === null;
      const control = await put(
        controlId,
        row(controlId, "non-target-" + nonce)
      );
      const retained = await get(controlId);
      return {
        target,
        absent,
        control,
        retained,
        witness: globalThis.__clippPolicyPendingWitness20.read(),
      };
    }, config)
  );
  assert.deepEqual(behavior.target, {
    realRequest: true,
    realTransaction: true,
    requestSuccess: true,
    result: "abort",
  });
  assert.equal(behavior.absent, true);
  assert.deepEqual(behavior.control, {
    realRequest: true,
    realTransaction: true,
    requestSuccess: true,
    result: "complete",
  });
  assert.equal(behavior.retained.clip.content, "non-target-" + nonce);
  assert.equal(behavior.witness.aborts, 1);
  assert.equal(behavior.witness.completes, 0);
  assert.equal(behavior.witness.failure, null);
  report.behavior = behavior;
  report.stage = "collision-refusal";
  let collisionRejected = false;
  try {
    await bounded(report.stage, page.evaluate(installedExpression));
  } catch (error) {
    if (
      !String(error.message).includes(
        "Invalid isolated pending-event witness assignment"
      )
    )
      throw error;
    collisionRejected = true;
  }
  assert.equal(collisionRejected, true);
  assert.equal(
    await bounded(
      "collision retains descriptor owner",
      page.evaluate(
        () => globalThis.__clippPolicyPendingWitness20.read().descriptorOwned
      )
    ),
    true
  );
  report.collisionRejectedWithoutReplacement = true;
  report.stage = "exact-descriptor-cleanup";
  const cleanup = await bounded(
    report.stage,
    page.evaluate(() => {
      const result = globalThis.__clippPolicyPendingWitness20.dispose();
      const before = globalThis.__platformProbe20.original;
      const after = Object.getOwnPropertyDescriptor(
        IDBObjectStore.prototype,
        "put"
      );
      const descriptorEqual =
        before.value === after.value &&
        before.configurable === after.configurable &&
        before.enumerable === after.enumerable &&
        before.writable === after.writable;
      globalThis.__platformProbe20.db.close();
      delete globalThis.__platformProbe20;
      return {
        result,
        descriptorEqual,
        globalRemoved: !Object.prototype.hasOwnProperty.call(
          globalThis,
          "__clippPolicyPendingWitness20"
        ),
        clipboard: { ...globalThis.__fixtureClipboardCounts20 },
      };
    })
  );
  assert.equal(cleanup.result.restored, true);
  assert.equal(cleanup.descriptorEqual, true);
  assert.equal(cleanup.globalRemoved, true);
  assert.deepEqual(cleanup.clipboard, { reads: 0, writes: 0 });
  report.platformCleanup = cleanup;
  report.deadline =
    "120-second fault deadline not elapsed or simulated; no deadline-branch pass claimed";
  report.stage = "selected-platform-case-passed";
} catch (error) {
  primary = error;
  report.failure = {
    name: error.name,
    code: typeof error.code === "string" ? error.code.slice(0, 64) : null,
    message: String(error.message).slice(0, 2_000),
    stack: String(error.stack).slice(0, 4_000),
  };
} finally {
  const cleanupErrors = [];
  report.deadlineElapsed = performance.now() >= activeDeadline;
  Object.assign(report.launch, {
    started: launchStarted,
    settled: launchSettled,
    receivedContext: Boolean(context),
  });
  if (!launchSettled) {
    cleanupErrors.push(
      "Launch is unsettled; retain profile and make no absence claim"
    );
    report.cleanup.profileDisposition = "retained_launch_unsettled";
  } else if (profile) {
    try {
      await rememberChildren();
    } catch (error) {
      cleanupErrors.push(String(error.message).slice(0, 500));
    }
    if (context) {
      try {
        if (page && !page.isClosed())
          await bounded(
            "fault fixture cleanup",
            page.evaluate(() => {
              globalThis.__clippPolicyPendingWitness20?.dispose();
              globalThis.__platformProbe20?.db.close();
              delete globalThis.__platformProbe20;
            }),
            2_000,
            true
          );
      } catch (error) {
        cleanupErrors.push(String(error.message).slice(0, 500));
      }
      try {
        await bounded(
          "close persistent browser context",
          context.close(),
          5_000,
          true
        );
        report.cleanup.contextClosed = true;
      } catch (error) {
        cleanupErrors.push(String(error.message).slice(0, 500));
      }
    }
    try {
      assert(
        launchSettled,
        "Cannot check absence or remove profile while launch is pending"
      );
      let rows = await inventory();
      if (rows.some((row) => owned.has(row.pid))) {
        await signalRemaining("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 500));
        rows = await inventory();
        if (rows.some((row) => owned.has(row.pid)))
          await signalRemaining("SIGKILL");
        await new Promise((resolve) => setTimeout(resolve, 300));
        rows = await inventory();
      }
      assert(
        !rows.some((row) => owned.has(row.pid)),
        "Owned browser descendant remains"
      );
      assert(
        !rows.some((row) => row.command.includes(profile)),
        "Owned profile still belongs to a live process"
      );
      report.cleanup.ownedProcessesAbsent = true;
      await rm(profile, { recursive: true });
      report.cleanup.profileRemoved = true;
      report.cleanup.profileDisposition =
        "removed_after_settled_launch_and_actual_absence";
    } catch (error) {
      cleanupErrors.push(String(error.message).slice(0, 500));
    }
    report.cleanup.socketClosed = browser
      ? !browser.isConnected()
      : launchSettled && report.cleanup.ownedProcessesAbsent;
  } else report.cleanup.profileDisposition = "not_allocated";
  report.cleanup.contextDisposition = context
    ? report.cleanup.contextClosed
      ? "closed"
      : "close_not_confirmed"
    : launchStarted
      ? launchSettled
        ? "no_context_returned_from_settled_launch"
        : "launch_unsettled_no_context"
      : "not_started";
  report.cleanup.errors = cleanupErrors;
  report.ownedProcesses = [...owned.values()];
  report.elapsedMs = performance.now() - started;
  report.status =
    !primary &&
    cleanupErrors.length === 0 &&
    report.cleanup.contextClosed &&
    report.cleanup.socketClosed &&
    report.cleanup.ownedProcessesAbsent &&
    report.cleanup.profileRemoved
      ? "PASS_SELECTED_REAL_CHROMIUM_PLATFORM_CASE_ONLY"
      : "FAILED_OR_UNQUALIFIED";
  const bytes = JSON.stringify(report, null, 2) + "\n";
  assert(Buffer.byteLength(bytes) <= 65_536, "Bound fixture receipt bytes");
  if (destinationCreated)
    await writeFile(join(destination, "receipt.json"), bytes, {
      flag: "wx",
      mode: 0o600,
    });
  process.stdout.write(
    JSON.stringify({
      status: report.status,
      stage: report.stage,
      receipt: destinationCreated ? join(destination, "receipt.json") : null,
      assetSha256: report.source.asset.sha256,
    }) + "\n"
  );
  if (report.status !== "PASS_SELECTED_REAL_CHROMIUM_PLATFORM_CASE_ONLY")
    process.exitCode = 1;
}
