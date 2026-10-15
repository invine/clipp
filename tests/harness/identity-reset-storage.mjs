// Manual native-storage profile; kept out of routine Jest (requires an installed extension-capable browser).
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const artifact = process.argv[2];
assert(artifact, "supply an output receipt path");
const owned = await mkdtemp(path.join(tmpdir(), "clipp-storage-browser-"));
const extension = path.join(owned, "extension");
const manifest = {
  manifest_version: 3,
  name: "Clipp storage qualification only",
  version: "0.0.1",
  permissions: ["storage"],
  background: { service_worker: "qualification.js" },
};
const executable =
  process.env.CLIPP_STORAGE_BROWSER || chromium.executablePath();
const receipt = {
  executable,
  owned,
  manifest,
  source: process.cwd(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirtyState: execFileSync("git", ["status", "--short"], {
    encoding: "utf8",
  }).trim(),
  startedAt: new Date().toISOString(),
  runs: [],
  launches: [],
  limitation:
    "Storage-only synthetic extension; no product toolbar/UI, clipboard, peers or hardware power-loss claim.",
};
let active;
async function launch(profile) {
  const args = [
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--remote-debugging-port=0",
    "--remote-allow-origins=http://localhost",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--no-first-run",
    "--disable-breakpad",
    "--disable-crash-reporter",
    `--crash-dumps-dir=${owned}/crash-dumps`,
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-default-apps",
    "--no-proxy-server",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
    "about:blank",
  ];
  const child = spawn(executable, args, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  active = child;
  let errors = "";
  child.stderr.on("data", (data) => {
    errors = (errors + data).slice(-4000);
  });
  const launchRecord = {
    pid: child.pid,
    args,
    startedAt: new Date().toISOString(),
  };
  receipt.launches.push(launchRecord);
  const portFile = path.join(profile, "DevToolsActivePort");
  let port;
  let webSocketPath;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`owned browser exited ${child.exitCode}: ${errors}`);
    try {
      [port, webSocketPath] = (await readFile(portFile, "utf8")).split("\n");
      break;
    } catch {
      await delay(100);
    }
  }
  assert(port, `owned browser did not expose CDP: ${errors}`);
  let browser;
  for (let i = 0; i < 5; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch (error) {
      if (i === 4) throw error;
      await delay(200);
    }
  }
  const context = browser.contexts()[0];
  let worker;
  for (let i = 0; i < 100; i++) {
    worker = context
      .serviceWorkers()
      .find((candidate) => candidate.url().endsWith("/qualification.js"));
    if (worker) break;
    await delay(100);
  }
  launchRecord.workerURLs = context
    .serviceWorkers()
    .map((candidate) => candidate.url());
  assert(
    worker,
    `storage fixture service worker missing: ${JSON.stringify(launchRecord.workerURLs)}`
  );
  receipt.version = browser.version();
  launchRecord.extensionOrigin = worker.url().split("/").slice(0, 3).join("/");
  assert(worker.url().endsWith("/qualification.js"));
  return {
    child,
    browser,
    context,
    worker,
    launchRecord,
    endpoint: `ws://127.0.0.1:${port}${webSocketPath}`,
  };
}
// A page-only CDP connection observes native worker status without keeping that worker debugged.
async function connectCDP(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const client = {
    onEvent: () => undefined,
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP timeout: ${method}`));
        }, 10000);
        pending.set(requestId, { resolve, reject, timeout });
        socket.send(
          JSON.stringify({
            id: requestId,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          })
        );
      });
    },
    close() {
      socket.close();
    },
  };
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) {
      client.onEvent(message);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return client;
}
async function killOwned(instance) {
  const exit = new Promise((resolve) =>
    instance.child.once("exit", (code, signal) => resolve({ code, signal }))
  );
  process.kill(-instance.child.pid, "SIGKILL");
  instance.launchRecord.exit = await exit;
  instance.launchRecord.closedAt = new Date().toISOString();
  assert.deepEqual(instance.launchRecord.exit, {
    code: null,
    signal: "SIGKILL",
  });
  active = undefined;
}
try {
  await build({
    entryPoints: ["tests/fixtures/identityResetBrowser.ts"],
    outfile: path.join(extension, "qualification.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome130",
    define: { "process.env.NODE_ENV": '"test"' },
  });
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest)
  );
  receipt.bundleSha256 = createHash("sha256")
    .update(await readFile(path.join(extension, "qualification.js")))
    .digest("hex");
  await writeFile(
    path.join(extension, "wake.html"),
    "<!doctype html><title>Storage fixture wake</title>"
  );
  for (const interruption of process.env.CLIPP_STORAGE_INTERRUPTION
    ? [process.env.CLIPP_STORAGE_INTERRUPTION]
    : ["browser", "worker"]) {
    assert(
      ["browser", "worker"].includes(interruption),
      "unknown interruption kind"
    );
    const supportedPhases = [
      "intent",
      "quiescence",
      "partial-deletion",
      "cleanup",
      "candidate",
      "receipt",
      "guard",
      "sanitization",
    ];
    const phases =
      process.env.CLIPP_STORAGE_PHASES?.split(",") || supportedPhases;
    assert(
      phases.every((phase) => supportedPhases.includes(phase)),
      "unknown storage phase"
    );
    for (const phase of phases) {
      const profile = path.join(owned, `profile-${interruption}-${phase}`);
      let instance = await launch(profile);
      const identity = await instance.worker.evaluate(
        () => globalThis.fixtureIdentity
      );
      await instance.worker.evaluate((phase) => {
        globalThis.qualify({ action: "begin", phase }).catch((error) => {
          globalThis.fixtureFailure = error.message;
        });
      }, phase);
      let checkpoint;
      for (let i = 0; i < 100; i++) {
        const state = await instance.worker.evaluate(() => ({
          checkpoint: globalThis.checkpoint,
          failure: globalThis.fixtureFailure,
        }));
        assert(!state.failure, state.failure);
        if (state.checkpoint) {
          checkpoint = state.checkpoint;
          break;
        }
        await delay(100);
      }
      assert(checkpoint, `phase ${phase} was not reached`);
      if (!["intent", "quiescence"].includes(phase))
        assert(
          checkpoint.strictAcknowledgements.includes("strict"),
          "native strict transaction was not acknowledged"
        );
      let workerTermination;
      if (interruption === "browser") {
        await killOwned(instance);
        // Remove stale remote-debugging metadata, never database/profile data.
        await rm(path.join(profile, "DevToolsActivePort"), { force: true });
        instance = await launch(profile);
      } else {
        const page = await instance.context.newPage();
        await page.goto(`${instance.launchRecord.extensionOrigin}/wake.html`);
        const cdp = await connectCDP(instance.endpoint);
        const versions = new Map();
        cdp.onEvent = (message) => {
          if (message.method === "ServiceWorker.workerVersionUpdated")
            for (const version of message.params.versions)
              versions.set(version.versionId, version);
        };
        const { targetInfos } = await cdp.send("Target.getTargets");
        const pageTarget = targetInfos.find((target) =>
          target.url.endsWith("/wake.html")
        );
        const { sessionId } = await cdp.send("Target.attachToTarget", {
          targetId: pageTarget.targetId,
          flatten: true,
        });
        await cdp.send("ServiceWorker.enable", {}, sessionId);
        let version;
        for (let i = 0; i < 50; i++) {
          version = [...versions.values()].find(
            (entry) =>
              entry.scriptURL === instance.worker.url() &&
              entry.runningStatus === "running"
          );
          if (version) break;
          await delay(100);
        }
        assert(version, "running fixture service worker version missing");
        // connectOverCDP's public close disconnects the client. The owned browser stays alive.
        // Detach Playwright's worker debugger so native worker termination can proceed.
        await instance.browser.close();
        assert.equal(instance.child.exitCode, null);
        assert.equal(instance.child.signalCode, null);
        await cdp.send(
          "ServiceWorker.stopWorker",
          { versionId: version.versionId },
          sessionId
        );
        let stopped;
        for (let i = 0; i < 100; i++) {
          stopped = versions.get(version.versionId);
          if (stopped?.runningStatus === "stopped") break;
          await delay(100);
        }
        assert.equal(
          stopped?.runningStatus,
          "stopped",
          "native worker did not terminate"
        );
        workerTermination = {
          mechanism: "CDP ServiceWorker.stopWorker after debugger detach",
          versionId: version.versionId,
          runningStatus: stopped.runningStatus,
          terminatedAt: new Date().toISOString(),
        };
        await cdp.send(
          "Runtime.evaluate",
          {
            expression:
              "chrome.runtime.sendMessage({storageFixtureWake:true}).catch(()=>undefined)",
          },
          sessionId
        );
        cdp.close();
        instance.browser = await chromium.connectOverCDP(instance.endpoint);
        instance.context = instance.browser.contexts()[0];
        instance.worker =
          instance.context
            .serviceWorkers()
            .find((worker) => worker.url().endsWith("/qualification.js")) ||
          (await instance.context.waitForEvent("serviceworker", {
            predicate: (worker) => worker.url().endsWith("/qualification.js"),
            timeout: 10000,
          }));
        assert.equal(
          await instance.worker.evaluate(() => globalThis.checkpoint),
          undefined,
          "retired worker heap survived termination"
        );
      }
      await instance.worker.evaluate(
        (request) => {
          globalThis
            .qualify(request)
            .then((result) => {
              globalThis.fixtureResult = result;
            })
            .catch((error) => {
              globalThis.fixtureFailure = error.message;
            });
        },
        { action: "recover", ...checkpoint }
      );
      let result;
      let state;
      for (let i = 0; i < 100; i++) {
        state = await instance.worker.evaluate(() => ({
          result: globalThis.fixtureResult,
          failure: globalThis.fixtureFailure,
          stage: globalThis.stage,
        }));
        assert(!state.failure, state.failure);
        if (state.result) {
          result = state.result;
          break;
        }
        await delay(100);
      }
      receipt.lastRecoveryState = state;
      assert(result, `recovery stalled: ${JSON.stringify(state)}`);
      assert.equal(result.outcome, "completed");
      assert.equal(result.candidatePeerId, checkpoint.candidatePeerId);
      assert(result.strictAcknowledgements.includes("strict"));
      receipt.runs.push({
        interruption,
        phase,
        identity,
        checkpoint,
        workerTermination,
        result,
      });
      console.log(
        JSON.stringify({
          interruption,
          phase,
          result: "PASS",
          browser: receipt.version,
        })
      );
      await killOwned(instance);
    }
  }
  receipt.outcome = "PASS";
} catch (error) {
  receipt.outcome = "FAIL";
  receipt.error = error.stack;
  throw error;
} finally {
  if (active) {
    try {
      process.kill(-active.pid, "SIGKILL");
    } catch {}
    receipt.emergencyClosedPid = active.pid;
    if (active.exitCode === null && active.signalCode === null)
      await new Promise((resolve) => active.once("exit", resolve));
    receipt.emergencyExit = {
      code: active.exitCode,
      signal: active.signalCode,
    };
  }
  receipt.finishedAt = new Date().toISOString();
  await writeFile(artifact, JSON.stringify(receipt, null, 2));
  await rm(owned, { recursive: true, force: true });
}
