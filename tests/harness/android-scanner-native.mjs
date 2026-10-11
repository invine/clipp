// Run only inside the coordinator's fresh exclusive native interval.
// This driver attaches to an already ready isolated acceptance document; it
// never boots, installs, clears data, launches an app, grants permission or opens media.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import WebSocket from "ws";

function stagesForTrial(trial) {
  return {
    feature: ["feature-result"],
    probe: ["probe-after", "probe-unavailable"],
    construct: ["construct-after", "provider-absent"],
    detect: ["detect-after", "provider-absent"],
    software: ["software-after"],
    "scanner-before-media": ["scanner-rejected", "scanner-returned"],
  }[trial];
}
function classifyReceipt(value) {
  const stages = stagesForTrial(value.trial);
  assert.ok(stages, "known diagnostic trial");
  const terminal = value.events.some((event) => stages.includes(event.stage));
  const javascriptError = value.events.some(
    (event) => event.stage === "javascript-error"
  );
  const samePidPresent =
    Boolean(value.pidBefore) && value.pidAfter === value.pidBefore;
  const fatalExceptionObserved = (value.fatal ?? []).some((line) =>
    line.includes("FATAL EXCEPTION")
  );
  const stageUnfinished = !terminal && !javascriptError;
  const stageTimedOut =
    stageUnfinished &&
    (value.stageWaitExpired === true || value.result === "stage-timeout");
  const verificationFailed =
    value.result === "completed" && Boolean(value.error);
  const result = !samePidPresent
    ? value.triggerInvokedAt
      ? "native-process-terminated"
      : "prerequisite-process-terminated"
    : fatalExceptionObserved
      ? "native-fatal-exception"
      : javascriptError
        ? "javascript-error"
        : verificationFailed
          ? "verification-failed"
          : terminal
            ? "completed"
            : stageTimedOut
              ? "stage-timeout"
              : "stage-incomplete";
  return {
    result,
    samePidPresent,
    fatalExceptionObserved,
    stageUnfinished,
    stageTimedOut,
  };
}
// Offline replay uses the same public outcome classification as the live driver.
// It never constructs an ADB command or touches native/browser/camera state.
if (process.argv[2] === "--replay") {
  assert.equal(
    process.argv.length,
    5,
    "--replay original-receipt.json new-output.json"
  );
  assert.notEqual(
    resolve(process.argv[3]),
    resolve(process.argv[4]),
    "preserve original receipt"
  );
  const original = JSON.parse(await readFile(process.argv[3], "utf8"));
  const replay = {
    trial: original.trial,
    originalResult: original.result,
    ...classifyReceipt(original),
  };
  await writeFile(process.argv[4], JSON.stringify(replay, null, 2));
  console.log(JSON.stringify(replay));
  process.exit(0);
}

const [assignmentPath, trial, bundlePath, outputPath] = process.argv.slice(2);
if (!outputPath)
  throw new Error("usage: assignment.json trial probes.js output.json");
const assignment = JSON.parse(await readFile(assignmentPath, "utf8"));
assert.equal(assignment.ticket, 14);
assert.equal(assignment.packageId, "com.clipp.app.acceptance");
assert.equal(assignment.exclusive, true);
assert.equal(assignment.camera, false);
assert.match(assignment.sourceRevision, /^[0-9a-f]{40}$/);
assert.match(assignment.dirtyStateSha256, /^[0-9a-f]{64}$/);
assert.match(assignment.apkSha256, /^[0-9a-f]{64}$/);
assert.match(assignment.expectedProvider, /\d+\.\d+\.\d+\.\d+/);
assert.ok(
  Date.now() < Date.parse(assignment.expiresAt),
  "fresh assignment required"
);
assert.ok(
  assignment.trials.includes(trial),
  "trial must be assigned explicitly"
);
assert.match(assignment.serial, /^emulator-\d+$/);
const adb = (...args) =>
  execFileSync(assignment.adb, ["-s", assignment.serial, ...args], {
    encoding: "utf8",
    timeout: 10000,
  });
const packageId = assignment.packageId;
const output = resolve(outputPath);
const code = await readFile(bundlePath, "utf8");
const bundleSha256 = createHash("sha256").update(code).digest("hex");
assert.equal(bundleSha256, assignment.bundleSha256);
await mkdir(resolve(output, ".."), { recursive: true });
const evidence = {
  ticket: 14,
  trial,
  start: new Date().toISOString(),
  assignment: { interval: assignment.interval, serial: assignment.serial },
  bundleSha256,
  sourceRevision: assignment.sourceRevision,
  apkSourceRevision: assignment.apkSourceRevision,
  dirtyStateSha256: assignment.dirtyStateSha256,
  apkSha256: assignment.apkSha256,
  events: [],
  camera: "not-requested; media sentinel for scanner entry",
  result: "incomplete",
};
const terminalStages = stagesForTrial(trial);
assert.ok(terminalStages, "known diagnostic trial");
const reachedTerminal = () =>
  evidence.events.some((event) => terminalStages.includes(event.stage));
let writes = Promise.resolve();
const save = () => {
  const snapshot = JSON.stringify(evidence, null, 2);
  writes = writes.then(() => writeFile(output, snapshot));
  return writes;
};
const pid = () => {
  try {
    return adb("shell", "pidof", packageId).trim();
  } catch {
    return "";
  }
};
let socket,
  forwarded = false,
  requestId = 0;
const pending = new Map();
let port;
let triggered = false;
function cdp(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolveRequest, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("cdp_timeout:" + method));
    }, 5000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      message.error
        ? reject(new Error(JSON.stringify(message.error)))
        : resolveRequest(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  assert.equal(
    Boolean(response.exceptionDetails),
    false,
    JSON.stringify(response.exceptionDetails)
  );
  return response.result.value;
}
try {
  evidence.pidBefore = pid();
  assert.match(
    evidence.pidBefore,
    /^\d+$/,
    "exactly one live isolated app process"
  );
  if (assignment.expectedPid)
    assert.equal(
      evidence.pidBefore,
      assignment.expectedPid,
      "wrapper-owned acceptance PID"
    );
  evidence.api = adb("shell", "getprop", "ro.build.version.sdk").trim();
  assert.equal(evidence.api, assignment.api);
  evidence.provider = adb("shell", "dumpsys", "webviewupdate");
  assert.ok(evidence.provider.includes(assignment.expectedProvider));
  evidence.permissionBefore = adb(
    "shell",
    "cmd",
    "appops",
    "get",
    packageId,
    "CAMERA"
  );
  evidence.resumed = adb("shell", "dumpsys", "activity", "activities")
    .split("\n")
    .filter((line) => /topResumedActivity|mResumedActivity/.test(line));
  assert.ok(
    evidence.resumed.some((line) => line.includes(packageId)),
    "acceptance Activity resumed"
  );
  const remote = "localabstract:webview_devtools_remote_" + evidence.pidBefore;
  port = Number(adb("forward", "tcp:0", remote).trim());
  assert.ok(port > 0);
  forwarded = true;
  evidence.forwardPort = port;
  await save();
  let target;
  const attachDeadline = Date.now() + 12000;
  while (!target && Date.now() < attachDeadline) {
    assert.equal(
      pid(),
      evidence.pidBefore,
      "process live before provider trigger"
    );
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(1500),
        })
      ).json();
      target = targets.find(
        (value) =>
          value.type === "page" && value.url.startsWith("https://localhost/")
      );
    } catch {}
    if (!target) await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(target, "correct live Capacitor document");
  evidence.document = { url: target.url, id: target.id };
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => {
    const timer = setTimeout(
      () => reject(new Error("cdp_connect_timeout")),
      5000
    );
    socket.once("open", () => {
      clearTimeout(timer);
      resolveSocket();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.on("message", async (raw) => {
    const message = JSON.parse(String(raw));
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      callback?.(message);
    }
    if (message.method === "Runtime.consoleAPICalled") {
      for (const arg of message.params.args) {
        if (
          typeof arg.value === "string" &&
          arg.value.startsWith("[CLIPP-SCANNER-14]")
        ) {
          evidence.events.push(
            JSON.parse(arg.value.slice("[CLIPP-SCANNER-14]".length))
          );
          await save();
        }
      }
    }
  });
  await cdp("Runtime.enable");
  let ready;
  evidence.documentReadiness = [];
  const readyDeadline = Date.now() + 12000;
  while (Date.now() < readyDeadline) {
    assert.equal(
      pid(),
      evidence.pidBefore,
      "process live before provider trigger"
    );
    try {
      ready = await evaluate(
        "({ready:document.readyState,focus:document.hasFocus(),app:!!document.querySelector('.app-shell'),existing:!!window.clippScannerDiagnosis})"
      );
      evidence.documentReadiness.push({ time: Date.now(), ...ready });
      if (ready.ready === "complete" && ready.focus && ready.app) break;
    } catch (error) {
      evidence.documentReadiness.push({
        time: Date.now(),
        error: String(error),
      });
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, "document readiness unavailable");
  assert.equal(ready.ready, "complete");
  assert.equal(ready.focus, true);
  assert.equal(ready.app, true);
  assert.equal(ready.existing, false, "fresh document per trial");
  evidence.readiness = ready;
  await evaluate(code);
  await save();
  triggered = true;
  evidence.triggerInvokedAt = new Date().toISOString();
  await evaluate(
    `void window.clippScannerDiagnosis.run(${JSON.stringify(trial)})`
  );
  const deadline = Date.now() + 8000;
  do {
    evidence.pidAfter = pid();
    if (evidence.pidAfter !== evidence.pidBefore) break;
    if (
      reachedTerminal() ||
      evidence.events.some((event) => event.stage === "javascript-error")
    )
      break;
    await new Promise((done) => setTimeout(done, 100));
  } while (Date.now() < deadline);
  evidence.stageWaitExpired =
    Date.now() >= deadline &&
    evidence.pidAfter === evidence.pidBefore &&
    !reachedTerminal() &&
    !evidence.events.some((event) => event.stage === "javascript-error");
  // Allow asynchronous provider termination after a JavaScript return to surface.
  await new Promise((done) => setTimeout(done, 500));
  evidence.pidAfter = pid();
  const log = adb(
    "logcat",
    "-d",
    "--pid=" + evidence.pidBefore,
    "-v",
    "threadtime",
    "AndroidRuntime:E",
    "*:S"
  );
  evidence.fatal = log
    .split("\n")
    .filter((line) =>
      /FATAL EXCEPTION|Process: com.clipp.app.acceptance|UncaughtExceptionException|GooglePlayServicesMissingManifestValueException|InterfaceRegistrar.bindBarcodeDetectionProvider|at WV\.|JniAndroid.handleException/.test(
        line
      )
    );
  evidence.processSurvived = evidence.pidAfter === evidence.pidBefore;
  Object.assign(evidence, classifyReceipt(evidence));
  assert.equal(
    evidence.processSurvived,
    true,
    "scanner provider must preserve the native process"
  );
  assert.equal(evidence.result, "completed");
  if (trial === "software")
    assert.ok(
      evidence.events.some(
        (event) =>
          event.stage === "software-after" &&
          event.decodedExpected &&
          event.blankIsNull
      )
    );
  if (trial === "detect")
    assert.ok(
      evidence.events.some(
        (event) => event.stage === "detect-after" && event.decodedExpected
      )
    );
  if (trial === "scanner-before-media")
    assert.ok(
      evidence.events.some((event) => event.stage === "media-sentinel-reached")
    );
} catch (error) {
  evidence.error = String(error);
  if (evidence.result === "completed") {
    evidence.stageResult = evidence.result;
    evidence.result = "verification-failed";
  }
  evidence.pidAfter ??= pid();
  evidence.processSurvived = evidence.pidAfter === evidence.pidBefore;
  if (!evidence.processSurvived && evidence.pidBefore) {
    evidence.result = triggered
      ? "native-process-terminated"
      : "prerequisite-process-terminated";
    try {
      evidence.fatal = adb(
        "logcat",
        "-d",
        "--pid=" + evidence.pidBefore,
        "-v",
        "threadtime",
        "AndroidRuntime:E",
        "*:S"
      )
        .split("\n")
        .filter((line) =>
          /FATAL EXCEPTION|Process: com.clipp.app.acceptance|UncaughtExceptionException|GooglePlayServicesMissingManifestValueException|InterfaceRegistrar.bindBarcodeDetectionProvider|at WV\.|JniAndroid.handleException/.test(
            line
          )
        );
    } catch {}
  }
  process.exitCode = 1;
} finally {
  socket?.close();
  if (forwarded) {
    try {
      adb("forward", "--remove", "tcp:" + port);
      evidence.forwardRemoved = true;
    } catch (error) {
      evidence.cleanupError = String(error);
      process.exitCode = 1;
    }
  }
  evidence.end = new Date().toISOString();
  await save();
}
console.log(
  JSON.stringify({
    trial,
    result: evidence.result,
    processSurvived: evidence.processSurvived,
    output,
  })
);
