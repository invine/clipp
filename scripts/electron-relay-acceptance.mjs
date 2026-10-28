/** Actual Electron acceptance runner. See docs/electron-relay-acceptance.md. */
import assert from "node:assert/strict";
import {
  mkdir,
  open,
  writeFile,
  unlink,
  readFile,
  readdir,
  realpath,
  rm,
  lstat,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { _electron } from "playwright";
import {
  beginNativeAttempt,
  nativeAcceptanceStateRoot,
} from "./native-acceptance-attempts.mjs";
import { sourceIdentity } from "./source-identity.mjs";

const { values } = parseArgs({
  options: {
    profile: { type: "string" },
    "history-root": { type: "string" },
    effort: { type: "string" },
    environment: { type: "string" },
    renewal: { type: "string" },
    "import-history": { type: "string", multiple: true },
    "command-timeout-ms": { type: "string", default: "30000" },
    "cleanup-timeout-ms": { type: "string", default: "10000" },
    "diagnostic-change": { type: "string" },
    "expected-observation": { type: "string" },
    "preflight-only": { type: "boolean", default: false },
    transport: { type: "string" },
    discovery: { type: "string" },
    "app-name": { type: "string", default: "Clipp Relay Test" },
    output: { type: "string" },
    "expect-clip": { type: "string" },
    "timeout-seconds": { type: "string", default: "600" },
  },
});
for (const field of ["profile", "output", "history-root"]) {
  assert(
    values[field] && path.isAbsolute(values[field]),
    `absolute_${field}_required`
  );
}
assert(
  ["tcp", "wss", "webrtc-direct"].includes(values.transport),
  "supported_transport_required"
);
assert(values.effort?.trim(), "stable_effort_required");
let expectedDiscovery;
if (!values["preflight-only"]) {
  assert(values["expect-clip"], "nonprivate_clip_marker_required");
  expectedDiscovery = new URL(values.discovery);
  assert(
    expectedDiscovery.protocol === "https:" &&
      !expectedDiscovery.username &&
      !expectedDiscovery.password &&
      !expectedDiscovery.search &&
      !expectedDiscovery.hash &&
      expectedDiscovery.pathname === "/v1/relay",
    "canonical_discovery_required"
  );
}
const commandTimeout = Number(values["command-timeout-ms"]);
const cleanupTimeout = Number(values["cleanup-timeout-ms"]);
assert(
  Number.isSafeInteger(commandTimeout) &&
    commandTimeout >= 50 &&
    commandTimeout <= 30000,
  "bounded_command_timeout_required"
);
assert(
  Number.isSafeInteger(cleanupTimeout) &&
    cleanupTimeout >= 50 &&
    cleanupTimeout <= 10000,
  "bounded_cleanup_timeout_required"
);
const timeout = Number(values["timeout-seconds"]) * 1_000;
assert(
  Number.isSafeInteger(timeout) && timeout >= 1_000 && timeout <= 600_000,
  "bounded_timeout_required"
);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps/electron/dist");
// Evidence must survive disposal of a linked checkout. Primary repositories
// may keep their established ignored local artifacts directory.
await mkdir(values.output, { recursive: true, mode: 0o700 });
await mkdir(values["history-root"], { recursive: true, mode: 0o700 });
const canonicalOutput = await realpath(values.output);
const canonicalHistory = await realpath(values["history-root"]);
if ((await lstat(path.join(root, ".git"))).isFile()) {
  assert(
    path
      .relative(await realpath(root), canonicalOutput)
      .startsWith(`..${path.sep}`),
    "durable_output_outside_checkout_required"
  );
  assert(
    path
      .relative(await realpath(root), canonicalHistory)
      .startsWith(`..${path.sep}`),
    "durable_history_outside_checkout_required"
  );
}
async function artifactIdentity() {
  const files = [];
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const file = path.join(directory, name);
      const stat = await lstat(file);
      assert(!stat.isSymbolicLink(), "candidate_artifact_alias");
      if (stat.isDirectory()) await walk(file);
      else if (stat.isFile())
        files.push({
          path: path.relative(dist, file),
          sha256: createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        });
    }
  }
  try {
    await walk(dist);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("candidate_artifact_missing");
    throw error;
  }
  for (const required of ["main.cjs", "preload.js", "renderer/index.html"])
    assert(
      files.some((file) => file.path === required),
      "candidate_artifact_missing"
    );
  return {
    sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}
await mkdir(values.output, { recursive: true, mode: 0o700 });
const stateRoot = nativeAcceptanceStateRoot();
await mkdir(stateRoot, { recursive: true, mode: 0o700 });
const canonicalState = await realpath(stateRoot);
assert(
  path
    .relative(await realpath(root), canonicalState)
    .startsWith(`..${path.sep}`),
  "acceptance_state_outside_checkout_required"
);
const registryRoot = path.join(canonicalState, "history-registry");
let attempt;
try {
  attempt = await beginNativeAttempt({
    output: values.output,
    historyRoot: canonicalHistory,
    registryRoot,
    identity: {
      effort: values.effort.trim(),
      scenario: `electron-${values["preflight-only"] ? "readiness" : values.transport + ":" + expectedDiscovery.href}`,
      environment: {
        host: os.hostname(),
        platform: process.platform,
        architecture: process.arch,
        runtime: "electron",
      },
    },
    renewal: values.renewal,
    importHistory: values["import-history"],
    scenario: `electron-${values["preflight-only"] ? "readiness" : values.transport}`,
    change: values["diagnostic-change"],
    expectation: values["expected-observation"],
    // The initial build and normal acceptance are outside diagnostic time. The
    // helper starts the clock when this first attempt records a failure.
    deferDiagnosticClockUntilFailure: true,
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const evidenceDirectory = attempt.directory;
let profileLock;
let log;
let logFailure;
const logWrites = [];
const runner = path.join(evidenceDirectory, "launch.cjs");
const receipt = {
  startedAt: new Date().toISOString(),
  runtime: "actual-electron",
  enforcedTransport: values.transport,
  clipboard: "isolated-memory-native-boundary",
  clipboardScope: {
    hostUsed: false,
    hostChanged: false,
    restoration: "not-requested",
  },
  stage: "build",
  classification: "prerequisite",
  mode: values["preflight-only"] ? "readiness-only" : "relay-transfer",
  result: "not-run",
  loginFlow: "not-observed-by-runner",
  environmentLabel: values.environment,
  attemptedObservation:
    values["expected-observation"] ??
    "owned Electron startup and native filter interaction",
  recoveryAction:
    "inspect classified failure and record a changed diagnosis before retry",
};
let electron;
let ownedProcess;
function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)
    return null;
  const observation = spawnSync(
    "ps",
    [
      "-p",
      String(pid),
      "-o",
      "ppid=",
      "-o",
      "pgid=",
      "-o",
      "lstart=",
      "-o",
      "command=",
    ],
    { encoding: "utf8", timeout: 1000 }
  );
  const value = observation.stdout?.trim();
  if (observation.status !== 0 || !value) return null;
  return value;
}
function stillOwned(child) {
  const current = processIdentity(child.pid);
  return (
    ownedProcess &&
    current === ownedProcess &&
    Number(current.split(/\s+/)[0]) === process.pid &&
    current.includes(runner) &&
    child.exitCode === null &&
    child.signalCode === null
  );
}

function boundMethods(target, methods) {
  for (const method of methods) {
    const invoke = target[method].bind(target);
    target[method] = async (...args) => {
      let timer;
      const deadline = attempt.remainingMs(commandTimeout);
      try {
        return await Promise.race([
          invoke(...args),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("owned_command_deadline_exhausted")),
              deadline
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
  }
  return target;
}
try {
  log = await open(path.join(evidenceDirectory, "runtime.log"), "a", 0o600);
  receipt.candidate = await sourceIdentity(root);
  await rm(dist, { recursive: true, force: true });
  attempt.assertBudget();
  const build = spawnSync(
    "npm",
    ["--workspace", "apps/electron", "run", "build"],
    {
      cwd: root,
      timeout: attempt.remainingMs(180_000),
      stdio: ["ignore", log.fd, log.fd],
    }
  );
  assert.equal(build.status, 0, "candidate_build_failed");
  receipt.build = {
    command: "npm --workspace apps/electron run build",
    artifacts: await artifactIdentity(),
  };
  assert.deepEqual(
    await sourceIdentity(root),
    receipt.candidate,
    "candidate_source_changed_during_build"
  );
  attempt.assertBudget();
  await mkdir(values.profile, { recursive: true, mode: 0o700 });
  const profileLockPath = path.join(
    values.profile,
    ".clipp-relay-acceptance.lock"
  );
  const profileAdmissionPath = `${profileLockPath}.admission`;
  const profileAdmission = await open(profileAdmissionPath, "wx", 0o600);
  try {
    try {
      const prior = JSON.parse(await readFile(profileLockPath, "utf8"));
      const absent = (pid) => {
        try {
          process.kill(pid, 0);
          return false;
        } catch (error) {
          return error.code === "ESRCH";
        }
      };
      assert(
        Number.isSafeInteger(prior.runnerPid) && absent(prior.runnerPid),
        "owned_profile_active_or_uncertain"
      );
      if (prior.childPid && !absent(prior.childPid)) {
        const current = processIdentity(prior.childPid);
        assert(
          current &&
            current !== prior.identity &&
            !current.includes(prior.marker),
          "owned_profile_active_or_uncertain"
        );
      }
      await unlink(profileLockPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    profileLock = await open(profileLockPath, "wx", 0o600);
    await profileLock.writeFile(JSON.stringify({ runnerPid: process.pid }));
  } finally {
    await profileAdmission.close();
    await unlink(profileAdmissionPath);
  }

  // Replace only the clipboard boundary: never read or write the host clipboard.
  await writeFile(
    runner,
    `const { app, clipboard } = require('electron');\napp.setName(${JSON.stringify(values["app-name"])});\nlet memoryClipboard = '';\nclipboard.readText = () => memoryClipboard;\nclipboard.writeText = (text) => { memoryClipboard = text; };\nrequire(${JSON.stringify(path.join(root, "apps/electron/dist/main.cjs"))});\n`,
    { mode: 0o600 }
  );
  receipt.stage = "launch";
  receipt.classification = "runner";
  electron = await _electron.launch({
    args: [runner],
    cwd: root,
    env: {
      ...process.env,
      CLIPP_LOG_LEVEL: "error",
      CLIPP_RELAY_ACCEPTANCE_TRANSPORT: values.transport,
      CLIPP_RELAY_ACCEPTANCE_PROFILE: await realpath(values.profile),
      VITE_DEV_SERVER_URL: "",
    },
    timeout: attempt.remainingMs(30_000),
  });
  ownedProcess = processIdentity(electron.process().pid);
  await profileLock.truncate(0);
  await profileLock.write(
    JSON.stringify({
      runnerPid: process.pid,
      childPid: electron.process().pid,
      identity: ownedProcess,
      marker: runner,
    }),
    0,
    "utf8"
  );
  receipt.processOwnership = {
    pid: electron.process().pid,
    identityObserved: Boolean(ownedProcess),
    groupId: ownedProcess ? Number(ownedProcess.split(/\s+/)[1]) : null,
    isolatedGroup: ownedProcess
      ? Number(ownedProcess.split(/\s+/)[1]) === electron.process().pid
      : null,
    scope: "direct-child-handle; detached descendants not proven absent",
  };
  boundMethods(electron, ["evaluate", "firstWindow", "browserWindow"]);
  electron.process().stdout?.on("data", (chunk) => {
    logWrites.push(
      log.write(chunk).catch((error) => {
        logFailure = error;
      })
    );
  });
  electron.process().stderr?.on("data", (chunk) => {
    logWrites.push(
      log.write(chunk).catch((error) => {
        logFailure = error;
      })
    );
  });
  receipt.stage = "target";
  const page = await electron.firstWindow({
    timeout: attempt.remainingMs(30_000),
  });
  page.setDefaultTimeout(attempt.remainingMs(10_000));
  boundMethods(page, ["evaluate", "waitForFunction"]);
  const window = await electron.browserWindow(page);
  boundMethods(window, ["evaluate"]);
  const target = await electron.evaluate(
    ({ app }, expected) => ({
      pid: process.pid,
      executable: process.execPath,
      profile: app.getPath("userData"),
      launchArgumentMatches: process.argv.includes(expected.runner),
    }),
    { runner }
  );
  const ownedWindow = await window.evaluate((win) => ({
    windowId: win.id,
    webContentsId: win.webContents.id,
    rendererPid: win.webContents.getOSProcessId(),
    url: win.webContents.getURL(),
  }));
  receipt.target = { ...target, ...ownedWindow };
  assert(
    target.pid === electron.process().pid &&
      target.launchArgumentMatches &&
      path.resolve(target.profile) === (await realpath(values.profile)) &&
      ownedWindow.url ===
        pathToFileURL(path.join(root, "apps/electron/dist/renderer/index.html"))
          .href,
    "owned_target_mismatch"
  );
  receipt.platform = await electron.evaluate(({ safeStorage }) => ({
    os: process.platform,
    osVersion: process.getSystemVersion(),
    architecture: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    osEncryptionAvailable: safeStorage.isEncryptionAvailable(),
    storageProvider:
      typeof safeStorage.getSelectedStorageBackend === "function"
        ? safeStorage.getSelectedStorageBackend()
        : "not-exposed",
  }));
  receipt.stage = "interaction";
  await page.waitForFunction(
    () => typeof window.clipp?.getState === "function",
    null,
    { timeout: attempt.remainingMs(10_000) }
  );
  await electron.evaluate(async ({ app }) => {
    if (process.platform === "darwin") await app.dock?.show();
    app.focus({ steal: true });
  });
  await window.evaluate((win) => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.focus();
  });
  const checkFocus = async () => {
    const focused = await window.evaluate(
      (win) =>
        !win.isDestroyed() &&
        win.isVisible() &&
        !win.isMinimized() &&
        win.isFocused()
    );
    const focusedId = await electron.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id
    );
    assert(
      focused &&
        focusedId === ownedWindow.windowId &&
        (await page.evaluate(() => document.hasFocus())),
      "owned_window_not_focused"
    );
  };
  // Activation is asynchronous on native desktops. Wait for its observable
  // result, then require ownership again before and after each input event.
  const focusDeadline = Date.now() + attempt.remainingMs(5_000);
  for (;;) {
    try {
      await checkFocus();
      break;
    } catch (error) {
      if (Date.now() >= focusDeadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  for (const label of ["Pinned", "All"]) {
    const box = await page
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    assert(box, "interaction_control_unavailable");
    await checkFocus();
    await window.evaluate(
      (win, point) => {
        win.webContents.sendInputEvent({ type: "mouseMove", ...point });
        win.webContents.sendInputEvent({
          type: "mouseDown",
          button: "left",
          clickCount: 1,
          ...point,
        });
        win.webContents.sendInputEvent({
          type: "mouseUp",
          button: "left",
          clickCount: 1,
          ...point,
        });
      },
      {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      }
    );
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent?.trim() === text &&
            button.classList.contains("active")
        ),
      label,
      { timeout: attempt.remainingMs(10_000) }
    );
    await checkFocus();
  }
  assert.equal(
    (await artifactIdentity()).sha256,
    receipt.build.artifacts.sha256,
    "candidate_build_changed_during_run"
  );
  assert.deepEqual(
    await sourceIdentity(root),
    receipt.candidate,
    "candidate_source_changed_during_run"
  );
  receipt.readiness = {
    ownedWindowFocused: true,
    interaction: "native-history-filter-pinned-and-all",
    passed: true,
  };
  attempt.assertBudget();
  if (values["preflight-only"]) {
    receipt.result = "passed";
    receipt.classification = "none";
  } else {
    receipt.stage = "relay-transfer";
    receipt.classification = "unknown";
    const initial = await page.evaluate(() => window.clipp.getState());
    const baseline = new Set(initial.clips.map((clip) => clip.id));
    const originalIdentity = initial.identity.deviceId;
    console.log(
      "Electron acceptance ready. Sign in through the visible UI if required, then send the specified marker from a paired peer."
    );
    const deadline = Date.now() + attempt.remainingMs(timeout);
    let previousStatuses;
    while (Date.now() < deadline) {
      attempt.assertBudget();
      const state = await page.evaluate(() => window.clipp.getState());
      assert.equal(
        state.identity.deviceId,
        originalIdentity,
        "identity_changed"
      );
      const states = state.managedRelayStates;
      const statuses = JSON.stringify(states.map((relay) => relay.status));
      if (statuses !== previousStatuses) {
        console.log(`Managed relay states: ${statuses}`);
        previousStatuses = statuses;
        receipt.lastRelayStatuses = states.map((relay) => relay.status);
      }
      const relayPeers = new Set(
        states.map((relay) => relay.peerId).filter(Boolean)
      );
      // The current public bridge includes managed server connections in its
      // peer summaries. Server connections are expected to be direct; only
      // device connections must all be circuits.
      assert(
        !state.peerConnections.some(
          (connection) =>
            !relayPeers.has(connection.peerId) && connection.hasDirect
        ),
        "direct_peer_connection_detected"
      );
      const received = state.clips.find(
        (clip) =>
          !baseline.has(clip.id) &&
          clip.content === values["expect-clip"] &&
          clip.originPeerId !== originalIdentity
      );
      const applied = await electron.evaluate(
        ({ clipboard }, marker) => clipboard.readText() === marker,
        values["expect-clip"]
      );
      if (received && applied) {
        const expectedKeys = new Set(
          state.managedRelayConfigurations
            .filter(
              (config) =>
                config.kind === "managed" &&
                config.discoveryUrl === expectedDiscovery.href
            )
            .map((config) => config.key)
        );
        const ready = states.filter(
          (relay) =>
            relay.kind === "managed" &&
            relay.status === "ready" &&
            expectedKeys.has(relay.key)
        );
        assert(ready.length > 0, "managed_relay_not_ready");
        const source = state.peerConnections.find(
          (connection) => connection.peerId === received.originPeerId
        );
        assert(
          source?.hasRelay && !source.hasDirect,
          "source_circuit_path_not_observed"
        );
        const carryingRelay = ready.find((relay) =>
          source.addrs.some((address) =>
            address.includes(`/p2p/${relay.peerId}/p2p-circuit/`)
          )
        );
        assert(carryingRelay, "managed_circuit_path_not_observed");
        const server = state.peerConnections.find(
          (connection) => connection.peerId === carryingRelay.peerId
        );
        assert(
          server?.addrs.some((address) => {
            if (values.transport === "wss")
              return /\/(?:wss|tls\/ws)\//.test(address);
            if (values.transport === "webrtc-direct")
              return address.includes("/webrtc-direct/");
            return /\/tcp\/\d+\/p2p\//.test(address);
          }),
          "selected_relay_server_transport_not_observed"
        );
        receipt.result = "passed";
        receipt.classification = "none";
        receipt.newRemoteClipReceived = true;
        receipt.liveClipboardApplied = true;
        receipt.circuitConnectionObserved = true;
        receipt.selectedRelayServerTransportObserved = true;
        receipt.authenticatedReservationAndRendezvousReady = true;
        receipt.directPeerConnections = 0;
        receipt.deviceIdentityPreserved = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    assert.equal(receipt.result, "passed", "relay_clip_receipt_timeout");
    console.log(
      "Clip checks passed; waiting for the owned Electron process to close."
    );
  }
} catch (error) {
  receipt.result = "failed";
  const safeReasons = [
    "owned_profile_active_or_uncertain",
    "owned_command_deadline_exhausted",
    "candidate_build_failed",
    "candidate_artifact_missing",
    "candidate_artifact_alias",
    "candidate_source_unavailable",
    "candidate_source_changed_during_build",
    "candidate_source_changed_during_run",
    "candidate_build_changed_during_run",
    "owned_target_mismatch",
    "owned_window_not_focused",
    "interaction_control_unavailable",
    "diagnostic_time_budget_exhausted",
    "identity_changed",
    "direct_peer_connection_detected",
    "managed_relay_not_ready",
    "source_circuit_path_not_observed",
    "managed_circuit_path_not_observed",
    "selected_relay_server_transport_not_observed",
    "relay_clip_receipt_timeout",
  ];
  receipt.reason =
    safeReasons.find(
      (reason) =>
        typeof error?.message === "string" && error.message.startsWith(reason)
    ) ??
    (receipt.stage === "interaction"
      ? "readiness_interaction_failed"
      : "runtime_or_receipt_gate_failed");
  if (
    [
      "identity_changed",
      "direct_peer_connection_detected",
      "managed_relay_not_ready",
      "source_circuit_path_not_observed",
      "managed_circuit_path_not_observed",
      "selected_relay_server_transport_not_observed",
    ].includes(receipt.reason)
  )
    receipt.classification = "product";
  if (receipt.reason === "diagnostic_time_budget_exhausted")
    receipt.classification = "runner";
  const safeClasses = [
    "Error",
    "AssertionError",
    "TypeError",
    "ReferenceError",
    "TimeoutError",
  ];
  receipt.errorClass = safeClasses.includes(error?.name)
    ? error.name
    : "UnknownError";
  // Exception detail is diagnostic evidence, never part of the public receipt.
  // It can contain native/runtime context; preserve it only in private artifacts.
  const failure = await open(
    path.join(evidenceDirectory, "failure.private.json"),
    "w",
    0o600
  );
  try {
    await failure.chmod(0o600);
    await failure.writeFile(
      JSON.stringify(
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : { name: "NonErrorThrown" },
        null,
        2
      ) + "\n"
    );
  } finally {
    await failure.close();
  }
  console.error(
    "Electron acceptance failed; inspect the private runtime log and receipt."
  );
  process.exitCode = 1;
} finally {
  if (electron) {
    const child = electron.process();
    const exited = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve(child.exitCode === 0 && child.signalCode === null);
      } else {
        child.once("exit", (code, signal) =>
          resolve(code === 0 && signal === null)
        );
      }
    });
    let timer;
    const close = electron.close().then(
      () => exited,
      () => exited
    );
    const closed = await Promise.race([
      close,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), cleanupTimeout);
      }),
    ]);
    clearTimeout(timer);
    const running = child.exitCode === null && child.signalCode === null;
    receipt.shutdown = closed
      ? "graceful"
      : running
        ? "forced-owned-process"
        : "failed-owned-process";
    if (!closed) {
      if (receipt.result === "passed") {
        receipt.stage = "cleanup";
        receipt.classification = "runner";
        receipt.reason = running
          ? "owned_test_shutdown_timeout"
          : "owned_test_shutdown_failed";
      }
      receipt.cleanup = {
        result: "failed",
        classification: "runner",
        reason: running
          ? "owned_test_shutdown_timeout"
          : "owned_test_shutdown_failed",
      };
      receipt.result = "failed";
      // Kill only the ChildProcess returned by this launch; never target a name,
      // process group or another app that happens to share the profile label.
      if (running) {
        if (stillOwned(child)) {
          child.kill("SIGKILL");
          receipt.cleanup.termination = "verified-owned-child-signalled";
        } else {
          receipt.shutdown = "uncertain-owned-process";
          receipt.cleanup.termination = "ownership_uncertain_no_signal";
        }
      }
      await Promise.race([
        exited,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 2_000);
        }),
      ]);
      clearTimeout(timer);
      process.exitCode = 1;
    }
  } else {
    receipt.shutdown = "not-launched";
  }
  receipt.finishedAt = new Date().toISOString();
  try {
    await Promise.all(logWrites);
    await log?.close();
    assert(!logFailure, "owned_test_log_write_failed");
    if (profileLock) {
      await profileLock.close();
      if (receipt.shutdown !== "uncertain-owned-process")
        await unlink(path.join(values.profile, ".clipp-relay-acceptance.lock"));
    }
  } catch {
    receipt.cleanup = {
      result: "failed",
      classification: "runner",
      reason: "owned_test_cleanup_failed",
    };
    if (receipt.result === "passed") {
      receipt.stage = "cleanup";
      receipt.reason = "owned_test_cleanup_failed";
      receipt.classification = "runner";
    }
    receipt.result = "failed";
    process.exitCode = 1;
  }
  await attempt.finish(receipt);
}

if (receipt.result === "passed") {
  console.log(
    values["preflight-only"]
      ? "Passed: owned Electron readiness, native interaction and shutdown; relay transfer not tested."
      : "Passed: selected relay transfer and owned Electron shutdown."
  );
}
