// No execution without the coordinator's fresh ACTIVE exclusive assignment.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, open, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [assignmentPath] = process.argv.slice(2);
if (!assignmentPath || process.argv.length !== 3)
  throw new Error("one_assignment_path_required");
const assignment = JSON.parse(await readFile(assignmentPath, "utf8"));
const allowedTrials = [
  "scanner-before-media",
  "feature",
  "probe",
  "construct",
  "detect",
  "software",
];
const trials = assignment.trials;
assert.ok(
  Array.isArray(trials) &&
    trials.length > 0 &&
    trials.length <= allowedTrials.length
);
assert.equal(new Set(trials).size, trials.length, "no diagnostic action retry");
assert.ok(
  trials.every((trial) => allowedTrials.includes(trial)),
  "only known explicitly assigned trials"
);
const packageId = "com.clipp.app.acceptance";
const avd = "dev35_default_arm64-v8a_Pixel_2";
const avdHome = "/Users/invine/.android/avd/gradle-managed";
const domain = "com.android.Emulator",
  key = "set/clipboardSharing";
function guard() {
  assert.deepEqual(
    JSON.parse(readFileSync(assignmentPath, "utf8")),
    assignment,
    "assignment changed or revoked"
  );
  assert.equal(assignment.status, "ACTIVE");
  assert.equal(assignment.assignedBy, "root");
  assert.equal(assignment.ticket, 14);
  assert.equal(assignment.exclusive, true);
  assert.equal(assignment.camera, false);
  assert.equal(assignment.avd, avd);
  assert.equal(assignment.avdHome, avdHome);
  assert.equal(assignment.serial, "emulator-5554");
  assert.equal(assignment.packageId, packageId);
  assert.equal(assignment.api, "35");
  assert.equal(
    assignment.expectedProvider,
    "com.android.webview, 124.0.6367.219"
  );
  assert.deepEqual(assignment.trials, trials);
  assert.ok(
    Date.now() < Date.parse(assignment.expiresAt),
    "assignment expired"
  );
  assert.ok(
    Date.now() >= Date.parse(assignment.validFrom),
    "assignment not yet current"
  );
  assert.ok(
    Date.parse(assignment.expiresAt) - Date.parse(assignment.validFrom) <=
      30 * 60 * 1000,
    "bounded interval required"
  );
}
guard();
const sdk = assignment.sdk;
assert.equal(assignment.adb, join(sdk, "platform-tools/adb"));
const out = resolve(assignment.outputDirectory);
await mkdir(out, { recursive: true });
const hash = (data) => createHash("sha256").update(data).digest("hex");
assert.equal(hash(await readFile(assignment.apk)), assignment.apkSha256);
assert.equal(
  assignment.apkSha256,
  "5d12c061b91f8d0de4a4af5eb24cd182ddfaeb33a97f6eb518eb00a4a4202c97"
);
assert.equal(
  assignment.apkSourceRevision,
  "343f1f6312c6371c2cfa865efdbdebcfde2ad00a",
  "retained unchanged comparison APK source"
);
assert.equal(hash(await readFile(assignment.bundle)), assignment.bundleSha256);
const driver = fileURLToPath(
  new URL("./android-scanner-native.mjs", import.meta.url)
);
assert.equal(hash(await readFile(driver)), assignment.driverSha256);
assert.equal(
  hash(await readFile(fileURLToPath(import.meta.url))),
  assignment.wrapperSha256
);
const badging = execFileSync(
  join(sdk, "build-tools/35.0.0/aapt"),
  ["dump", "badging", assignment.apk],
  { encoding: "utf8" }
).split("\n")[0];
assert.match(badging, /name='com.clipp.app.acceptance'/);
const adb = (...args) =>
  execFileSync(assignment.adb, ["-s", assignment.serial, ...args], {
    encoding: "utf8",
    timeout: 10000,
  });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const shell = (...args) => adb("shell", ...args);
function sharing() {
  try {
    return {
      present: true,
      value: execFileSync("/usr/bin/defaults", ["read", domain, key], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
      type: execFileSync("/usr/bin/defaults", ["read-type", domain, key], {
        encoding: "utf8",
      }).trim(),
    };
  } catch (error) {
    if (String(error.stderr).includes("does not exist"))
      return { present: false };
    throw error;
  }
}
const evidence = {
  ticket: 14,
  interval: assignment.interval,
  start: new Date().toISOString(),
  sourceRevision: assignment.sourceRevision,
  apkSourceRevision: assignment.apkSourceRevision,
  dirtyStateSha256: assignment.dirtyStateSha256,
  apkSha256: assignment.apkSha256,
  bundleSha256: assignment.bundleSha256,
  driverSha256: assignment.driverSha256,
  wrapperSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  package: badging,
  node: process.version,
  trials: [],
  noCamera: true,
  mediaMode: "media sentinel; synthetic public canvas only",
  closure: {},
};
const receipt = join(out, "ticket-14-interval.json");
const save = () => writeFile(receipt, JSON.stringify(evidence, null, 2));
let preexistingForwards;
const ownedRemotes = new Set();
function forwardInventory() {
  return execFileSync(assignment.adb, ["forward", "--list"], {
    encoding: "utf8",
    timeout: 5000,
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}
function ownedForward(line) {
  const [serial, local, remote, extra] = line.split(/\s+/);
  return (
    !extra &&
    serial === assignment.serial &&
    /^tcp:\d+$/.test(local) &&
    ownedRemotes.has(remote) &&
    !preexistingForwards.has(line)
  );
}
function cleanupOwnedForwards(stage) {
  if (!preexistingForwards) return;
  const outcome = { stage, removed: [] };
  evidence.closure.forwardChecks ??= [];
  evidence.closure.forwardChecks.push(outcome);
  try {
    const before = forwardInventory();
    const candidates = before.filter(ownedForward);
    assert.ok(
      candidates.length <= trials.length,
      "bounded owned forwarding count"
    );
    for (const line of candidates) {
      const [, local, remote] = line.split(/\s+/);
      // Exact assigned serial, known acceptance PID socket and new local port.
      // Never use --remove-all or touch a preexisting mapping.
      adb("forward", "--remove", local);
      outcome.removed.push({ local, remote });
    }
    const after = forwardInventory();
    outcome.ownedRemaining = after.filter(ownedForward).length;
    outcome.preexistingPreserved = [...preexistingForwards].every((line) =>
      after.includes(line)
    );
    outcome.inventorySha256 = hash(after.join("\n"));
    assert.equal(
      outcome.ownedRemaining,
      0,
      "interval-owned forwards must close"
    );
    assert.equal(
      outcome.preexistingPreserved,
      true,
      "preexisting forwards must remain intact"
    );
  } catch (error) {
    outcome.error = String(error);
    process.exitCode = 1;
  }
  return outcome;
}
let prior,
  sharingChanged = false,
  emulator,
  log,
  owned = false,
  stopped = false;
try {
  const devices = execFileSync(assignment.adb, ["devices"], {
    encoding: "utf8",
  });
  assert.equal(
    /emulator-5554\s+/.test(devices),
    false,
    "assigned serial must be free"
  );
  preexistingForwards = new Set(forwardInventory());
  evidence.preexistingForwards = {
    count: preexistingForwards.size,
    inventorySha256: hash([...preexistingForwards].join("\n")),
  };
  assert.equal(
    [...preexistingForwards].some(
      (line) => line.split(/\s+/)[0] === assignment.serial
    ),
    false,
    "preserve preexisting assigned-serial forwards by withholding launch"
  );
  prior = sharing();
  evidence.priorSharing = prior;
  if (prior.present) {
    assert.match(prior.type, /boolean/);
    assert.ok(prior.value === "0" || prior.value === "1");
  }
  guard();
  execFileSync("/usr/bin/defaults", ["write", domain, key, "-bool", "false"]);
  sharingChanged = true;
  assert.equal(sharing().value, "0");
  evidence.sharingDisabledAt = new Date().toISOString();
  const argv = [
    "-avd",
    avd,
    "-port",
    "5554",
    "-no-snapshot",
    "-no-window",
    "-no-audio",
    "-read-only",
    "-camera-front",
    "none",
    "-camera-back",
    "none",
  ];
  evidence.emulatorArgv = argv;
  evidence.processLocalAvdHome = avdHome;
  await copyFile(driver, join(out, "ticket-14-native-driver.mjs"));
  await copyFile(
    fileURLToPath(import.meta.url),
    join(out, "ticket-14-outer-wrapper.mjs")
  );
  await copyFile(assignment.bundle, join(out, "ticket-14-installed-probes.js"));
  log = await open(join(out, "ticket-14-emulator.log"), "wx");
  emulator = spawn(join(sdk, "emulator/emulator"), argv, {
    env: { ...process.env, ANDROID_AVD_HOME: avdHome },
    stdio: ["ignore", log.fd, log.fd],
  });
  let spawnError;
  emulator.once("error", (error) => {
    spawnError = error;
  });
  emulator.once("exit", (code, signal) => {
    stopped = true;
    evidence.closure.emulatorExit = { code, signal };
  });
  evidence.emulatorPid = emulator.pid;
  await save();
  const bootDeadline = Date.now() + 180000;
  let booted = false;
  while (Date.now() < bootDeadline) {
    guard();
    if (spawnError) throw spawnError;
    assert.equal(stopped, false, "owned emulator exited during boot");
    try {
      if (shell("getprop", "sys.boot_completed").trim() === "1") {
        booted = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  assert.equal(booted, true, "guest boot timeout");
  const consoleLines = adb("emu", "avd", "name")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "OK");
  assert.deepEqual(consoleLines, [avd]);
  owned = true;
  evidence.api = shell("getprop", "ro.build.version.sdk").trim();
  assert.equal(evidence.api, "35");
  evidence.build = shell("getprop", "ro.build.fingerprint").trim();
  evidence.abi = shell("getprop", "ro.product.cpu.abi").trim();
  evidence.provider = shell("dumpsys", "webviewupdate");
  assert.match(evidence.provider, /com.android.webview.*124\.0\.6367\.219/);
  evidence.size = shell("wm", "size").trim();
  evidence.density = shell("wm", "density").trim();
  // Request guest networking off; no cellular/remote-isolation qualification is claimed.
  shell("svc", "wifi", "disable");
  shell("svc", "data", "disable");
  evidence.networkRequested = {
    wifiOff: true,
    dataOff: true,
    isolationQualified: false,
  };
  guard();
  adb("install", "-r", assignment.apk);
  evidence.installedAt = new Date().toISOString();
  for (const trial of trials) {
    guard();
    assert.equal(sharing().value, "0");
    shell("am", "force-stop", packageId);
    assert.match(shell("pm", "clear", packageId), /Success/);
    shell("input", "keyevent", "224");
    shell("wm", "dismiss-keyguard");
    shell("am", "start", "-n", packageId + "/com.clipp.app.MainActivity");
    const readiness = { trial, freshAcceptanceData: true };
    const readyDeadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      guard();
      const power = shell("dumpsys", "power");
      const activity = shell("dumpsys", "activity", "activities");
      const windows = shell("dumpsys", "window");
      const display = shell("dumpsys", "display");
      if (
        /mWakefulness=Awake/.test(power) &&
        /(?:state ON|mState=ON)/.test(display) &&
        /(?:topResumedActivity|mResumedActivity).*com.clipp.app.acceptance\/com.clipp.app.MainActivity/.test(
          activity
        ) &&
        /mCurrentFocus=.*com.clipp.app.acceptance\/com.clipp.app.MainActivity/.test(
          windows
        ) &&
        /mKeyguardShowing=false/.test(activity)
      ) {
        readiness.awake = true;
        readiness.displayOn = true;
        readiness.acceptanceResumed = true;
        readiness.acceptanceFocused = true;
        readiness.keyguardHidden = true;
        ready = true;
        break;
      }
      await sleep(200);
    }
    assert.equal(ready, true, "native readiness failed before trial:" + trial);
    await sleep(1800);
    const expectedPid = shell("pidof", packageId).trim();
    assert.match(
      expectedPid,
      /^\d+$/,
      "one owned acceptance process before driver"
    );
    ownedRemotes.add("localabstract:webview_devtools_remote_" + expectedPid);
    const trialAssignment = {
      ...assignment,
      expectedPid,
      trials: [trial],
      authoritativeAssignmentPath: resolve(assignmentPath),
      authoritativeAssignmentSha256: hash(readFileSync(assignmentPath)),
    };
    const assigned = join(out, "ticket-14-" + trial + "-assignment.json");
    await writeFile(assigned, JSON.stringify(trialAssignment, null, 2));
    const result = join(out, "ticket-14-" + trial + ".json");
    const trialLog = await open(join(out, "ticket-14-" + trial + ".log"), "wx");
    let exit;
    try {
      const child = spawn(
        process.execPath,
        [driver, assigned, trial, assignment.bundle, result],
        { stdio: ["ignore", trialLog.fd, trialLog.fd] }
      );
      exit = await new Promise((done, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          setTimeout(() => {
            if (child.exitCode === null) child.kill("SIGKILL");
          }, 5000);
        }, 55000);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code, signal) => {
          clearTimeout(timer);
          done({ code, signal });
        });
      });
    } finally {
      await trialLog.close();
      const cleanup = cleanupOwnedForwards("after-driver-" + trial);
      await save();
      assert.equal(
        cleanup.error,
        undefined,
        "driver forwarding closure must complete before another trial"
      );
    }
    const observed = JSON.parse(await readFile(result, "utf8"));
    evidence.trials.push({
      trial,
      readiness,
      exit,
      result: observed.result,
      processSurvived: observed.processSurvived,
      receipt: result,
    });
    await save();
    shell("am", "force-stop", packageId);
    if (observed.result === "completed") {
      assert.equal(
        exit.code,
        0,
        "completed trial must have successful driver exit"
      );
      assert.equal(
        observed.error,
        undefined,
        "completed trial must have no failed verification"
      );
    }
    // Fatal/JS rejection is a diagnosis observation. Other failures end the interval.
    assert.ok(
      [
        "completed",
        "native-process-terminated",
        "native-fatal-exception",
        "javascript-error",
      ].includes(observed.result),
      "driver prerequisite/stage failure:" + trial
    );
    assert.equal(observed.forwardRemoved, true, "driver forwarding cleanup");
    assert.match(
      shell("dumpsys", "webviewupdate"),
      /com.android.webview.*124\.0\.6367\.219/,
      "same stock provider between trials"
    );
    if (trial === "scanner-before-media") {
      evidence.baselineCheckpoint = {
        start: new Date().toISOString(),
        pauseMs: 30000,
        receipt: result,
        result: observed.result,
        processSurvived: observed.processSurvived,
        lastStage: observed.events?.at(-1)?.stage,
      };
      await save();
      console.log(
        JSON.stringify({
          checkpoint: "baseline-before-split-probes",
          ...evidence.baselineCheckpoint,
        })
      );
      // The observer inspects the actual red loop and states ranked falsifiable
      // hypotheses during this bounded checkpoint. No camera or app is active.
      await sleep(30000);
      guard();
      evidence.baselineCheckpoint.completedAt = new Date().toISOString();
      await save();
    }
  }
} catch (error) {
  evidence.error = String(error);
  process.exitCode = 1;
} finally {
  cleanupOwnedForwards("failure-or-final-before-guest-stop");
  if (owned) {
    try {
      shell("am", "force-stop", packageId);
    } catch (error) {
      evidence.closure.appStopError = String(error);
    }
  }
  if (emulator?.pid && !stopped) {
    try {
      if (owned) adb("emu", "kill");
      else emulator.kill("SIGTERM");
    } catch {
      emulator.kill("SIGTERM");
    }
    const deadline = Date.now() + 10000;
    while (!stopped && Date.now() < deadline) await sleep(100);
    if (!stopped) {
      emulator.kill("SIGTERM");
      const more = Date.now() + 10000;
      while (!stopped && Date.now() < more) await sleep(100);
    }
  }
  evidence.closure.emulatorStopped = stopped || !emulator?.pid;
  cleanupOwnedForwards("after-guest-stop");
  if (sharingChanged && evidence.closure.emulatorStopped) {
    try {
      if (prior.present)
        execFileSync("/usr/bin/defaults", [
          "write",
          domain,
          key,
          "-bool",
          prior.value === "1" ? "true" : "false",
        ]);
      else execFileSync("/usr/bin/defaults", ["delete", domain, key]);
      evidence.closure.restoredSharing = sharing();
      assert.deepEqual(evidence.closure.restoredSharing, prior);
    } catch (error) {
      evidence.closure.sharingRestoreError = String(error);
      process.exitCode = 1;
    }
  } else if (sharingChanged) {
    evidence.closure.sharingRestorationWithheldUntilStop = true;
    process.exitCode = 1;
  }
  if (log) await log.close();
  evidence.end = new Date().toISOString();
  await save();
}
console.log(
  JSON.stringify({
    trials: evidence.trials.length,
    error: evidence.error,
    closure: evidence.closure,
    receipt,
  })
);
