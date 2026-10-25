/** Readiness gate for the exact Android candidate and serial used by acceptance. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { sourceIdentity } from "./android-candidate-provenance.mjs";
import { beginNativeAttempt } from "../../../scripts/native-acceptance-attempts.mjs";

const { values } = parseArgs({
  options: {
    serial: { type: "string" },
    "candidate-apk": { type: "string" },
    output: { type: "string" },
    "diagnostic-change": { type: "string" },
    "expected-observation": { type: "string" },
    timeout: { type: "string", default: "20" },
  },
});
for (const field of ["serial", "candidate-apk", "output"]) {
  assert(values[field], `${field.replaceAll("-", "_")}_required`);
}
assert(
  path.isAbsolute(values["candidate-apk"]),
  "absolute_candidate_apk_required"
);
assert(path.isAbsolute(values.output), "absolute_output_required");
const timeout = Number(values.timeout) * 1_000;
assert(
  Number.isInteger(timeout) && timeout > 0 && timeout <= 60_000,
  "bounded_timeout_required"
);

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const serial = values.serial.trim();
assert(serial.length > 0 && !/[\s;]/.test(serial), "valid_serial_required");
const adb = process.env.CLIPP_ANDROID_ADB || "adb";
const appPackage = "com.clipp.app.acceptance";
const testPackage = "com.clipp.app.acceptance.test";
const activity = `${appPackage}/com.clipp.app.MainActivity`;
let attempt;

function assertWithinBudget(stage) {
  try {
    attempt?.assertBudget();
  } catch (error) {
    error.stage = stage;
    error.classification = "runner";
    throw error;
  }
}

function remainingTimeout(stage) {
  assertWithinBudget(stage);
  try {
    return attempt ? attempt.remainingMs(timeout) : timeout;
  } catch (error) {
    error.stage = stage;
    error.classification = "runner";
    throw error;
  }
}

function invoke(args, stage, classification = "prerequisite") {
  const result = spawnSync(adb, ["-s", serial, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: remainingTimeout(stage),
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error || result.status !== 0) {
    const error = new Error(
      `${stage}: ${output || result.error?.message || `exit ${result.status}`}`
    );
    error.stage = stage;
    error.classification =
      result.error?.code === "ETIMEDOUT" ? "runner" : classification;
    throw error;
  }
  assertWithinBudget(stage);
  return output;
}

async function candidateIdentity() {
  const apk = await readFile(values["candidate-apk"]);
  const provenance = JSON.parse(
    await readFile(`${values["candidate-apk"]}.provenance.json`, "utf8")
  );
  const currentSource = await sourceIdentity(root);
  assert.equal(path.basename(values["candidate-apk"]), "app-acceptance.apk");
  assert.equal(provenance.schemaVersion, 1, "candidate_provenance_invalid");
  assert.equal(
    provenance.applicationId,
    appPackage,
    "candidate_package_mismatch"
  );
  assert.equal(
    provenance.artifactSha256,
    createHash("sha256").update(apk).digest("hex"),
    "candidate_artifact_changed_after_build"
  );
  assert.deepEqual(
    {
      revision: provenance.revision,
      dirty: provenance.dirty,
      sourceSha256: provenance.sourceSha256,
    },
    currentSource,
    "candidate_source_changed_after_build"
  );
  return {
    path: path.basename(values["candidate-apk"]),
    sha256: provenance.artifactSha256,
    revision: provenance.revision,
    dirty: provenance.dirty,
    sourceSha256: provenance.sourceSha256,
    appPackage,
  };
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyInstalledCandidate(packagePaths, candidateHash) {
  const paths = packagePaths
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^package:(\/\S+)$/);
      assert(match, "installed_package_path_unparseable");
      return match[1];
    });
  assert.equal(paths.length, 1, "installed_package_split_apks_unsupported");
  assert.equal(
    path.basename(paths[0]),
    "base.apk",
    "installed_package_base_apk_missing"
  );

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "clipp-android-installed-apk-")
  );
  const localApk = path.join(temporaryDirectory, "installed-base.apk");
  let failure;
  let installedSha256;
  try {
    execFileSync(adb, ["-s", serial, "pull", paths[0], localApk], {
      cwd: root,
      encoding: "utf8",
      timeout: remainingTimeout("installed-candidate"),
      maxBuffer: 1024 * 1024,
    });
    assertWithinBudget("installed-candidate");
    const details = await stat(localApk);
    assert(
      details.isFile() && details.size > 0,
      "installed_candidate_pull_empty"
    );
    installedSha256 = await sha256File(localApk);
    assertWithinBudget("installed-candidate");
  } catch (error) {
    failure = error;
  }
  try {
    await rm(temporaryDirectory, { recursive: true, force: false });
  } catch (error) {
    if (failure) failure.cleanupFailure = error.message;
    else
      failure = Object.assign(
        new Error("installed_candidate_temp_cleanup_failed"),
        {
          stage: "cleanup",
          classification: "runner",
          cleanupFailure: error.message,
        }
      );
  }
  if (failure) throw failure;
  return {
    package: appPackage,
    devicePath: paths[0],
    sha256: installedSha256,
    matchesCandidate: installedSha256 === candidateHash,
    temporaryArtifactCleanup: "passed",
  };
}

function focusedActivity(windowDump) {
  const match = windowDump.match(
    /(?:mCurrentFocus|mFocusedApp)=Window\{[^}]*\s([^\s}]+\/[^\s}]+)\}/
  );
  return match?.[1] ?? null;
}

function focusedNodeFingerprint(hierarchy) {
  const nodes = hierarchy.match(/<node\b[^>]*>/g) ?? [];
  const focused = nodes.find((node) => {
    const packageName = node.match(/\bpackage="([^"]*)"/)?.[1];
    return packageName === appPackage && /\bfocused="true"/.test(node);
  });
  if (!focused) return null;

  // Avoid retaining user-visible text or content descriptions from the UI tree.
  const attribute = (name) =>
    focused.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";
  const descriptor = [
    attribute("class"),
    attribute("resource-id"),
    attribute("bounds"),
    attribute("clickable"),
    attribute("focusable"),
  ].join("\n");
  return createHash("sha256").update(descriptor).digest("hex");
}

function readUiHierarchy() {
  const devicePath = `/data/local/tmp/clipp-readiness-${process.pid}-${attempt.number}.xml`;
  try {
    const dumpResult = invoke(
      ["shell", "uiautomator", "dump", devicePath],
      "interaction",
      "runner"
    );
    assert.match(
      dumpResult,
      /hierarchy dumped to/i,
      "ui_hierarchy_dump_failed"
    );
    const hierarchy = invoke(
      ["exec-out", "cat", devicePath],
      "interaction",
      "runner"
    );
    assert.match(hierarchy, /^<?xml|<hierarchy\b/i, "ui_hierarchy_unreadable");
    return hierarchy;
  } finally {
    invoke(["shell", "rm", "-f", devicePath], "cleanup", "runner");
  }
}

attempt = await beginNativeAttempt({
  output: values.output,
  scenario: `android-readiness-${serial}`,
  change: values["diagnostic-change"],
  expectation: values["expected-observation"],
});
const receipt = {
  schemaVersion: 1,
  result: "failed",
  stage: "candidate",
  classification: "prerequisite",
  cleanup: "not-required",
  serial,
  attempt: attempt.number,
  startedAt: new Date().toISOString(),
};

try {
  receipt.candidate = await candidateIdentity();
  assertWithinBudget("candidate");
  assert.equal(receipt.candidate.appPackage, appPackage);
  receipt.stage = "device";
  const state = invoke(["get-state"], "device", "prerequisite");
  assert.equal(state, "device", "selected_device_not_ready");
  receipt.bootCompleted = invoke(
    ["shell", "getprop", "sys.boot_completed"],
    "boot"
  );
  assert.equal(receipt.bootCompleted, "1", "device_boot_incomplete");
  receipt.androidApi = invoke(
    ["shell", "getprop", "ro.build.version.sdk"],
    "device"
  );
  assert(Number(receipt.androidApi) >= 31, "android_api_31_required");
  receipt.isEmulator = invoke(["shell", "getprop", "ro.kernel.qemu"], "device");
  assert.equal(receipt.isEmulator, "1", "android_emulator_required");

  receipt.stage = "installed-candidate";
  receipt.installedPackage = invoke(
    ["shell", "pm", "path", appPackage],
    "installed-candidate"
  );
  assert(
    receipt.installedPackage.startsWith("package:"),
    "acceptance_candidate_not_installed"
  );
  receipt.installedCandidate = await verifyInstalledCandidate(
    receipt.installedPackage,
    receipt.candidate.sha256
  );
  receipt.cleanup = receipt.installedCandidate.temporaryArtifactCleanup;
  assert(
    receipt.installedCandidate.matchesCandidate,
    "installed_candidate_differs_from_supplied_apk"
  );
  receipt.stage = "webview";
  receipt.webViewDiagnostic = invoke(
    ["shell", "dumpsys", "webviewupdate"],
    "webview"
  );
  const webViewProvider = receipt.webViewDiagnostic.match(
    /Current WebView package \(name, version\):\s*\(([^,]+),\s*([^)]+)\)/i
  );
  assert(webViewProvider, "active_webview_provider_unavailable");
  receipt.webViewProvider = webViewProvider[1].trim();
  receipt.webViewProviderVersion = webViewProvider[2].trim();
  assert(
    receipt.webViewProvider !== "null" &&
      receipt.webViewProviderVersion !== "null",
    "active_webview_provider_unavailable"
  );

  receipt.stage = "instrumentation";
  receipt.instrumentation = invoke(
    ["shell", "pm", "list", "instrumentation", appPackage],
    "instrumentation"
  );
  assert(
    receipt.instrumentation
      .split(/\r?\n/)
      .some((line) =>
        new RegExp(
          `^instrumentation:${testPackage}/[^\\s]+ \\(target=${appPackage}\\)$`
        ).test(line)
      ),
    "acceptance_instrumentation_unavailable"
  );
  receipt.instrumentationProbe = invoke(
    [
      "shell",
      "am",
      "instrument",
      "-w",
      "-e",
      "class",
      "com.getcapacitor.myapp.ExampleInstrumentedTest#useAppContext",
      `${testPackage}/androidx.test.runner.AndroidJUnitRunner`,
    ],
    "instrumentation",
    "runner"
  );
  if (!/OK \(1 test\)/.test(receipt.instrumentationProbe)) {
    const error = new Error("instrumentation_probe_failed");
    error.stage = "instrumentation";
    error.classification = "runner";
    throw error;
  }

  receipt.stage = "interaction";
  receipt.launch = invoke(
    ["shell", "am", "start", "-W", "-n", activity],
    "interaction",
    "runner"
  );
  assert(/Status: ok/.test(receipt.launch), "candidate_launch_failed");
  receipt.focusBeforeActivity = focusedActivity(
    invoke(["shell", "dumpsys", "window", "windows"], "interaction", "runner")
  );
  assert(
    receipt.focusBeforeActivity === activity,
    "candidate_window_not_owned"
  );
  const hierarchyBefore = readUiHierarchy();
  receipt.focusBefore = focusedNodeFingerprint(hierarchyBefore);
  receipt.input = invoke(
    ["shell", "input", "keyevent", "KEYCODE_TAB"],
    "interaction",
    "runner"
  );
  receipt.focusAfterActivity = focusedActivity(
    invoke(["shell", "dumpsys", "window", "windows"], "interaction", "runner")
  );
  assert(
    receipt.focusAfterActivity === activity,
    "candidate_lost_window_focus"
  );
  receipt.focusAfter = focusedNodeFingerprint(readUiHierarchy());
  assert(
    receipt.focusAfter && receipt.focusAfter !== receipt.focusBefore,
    "candidate_ui_interaction_no_effect"
  );
  receipt.interaction = "tab_changed_focused_accessible_control";

  receipt.result = "passed";
  receipt.classification = "none";
} catch (error) {
  receipt.stage = error.stage || receipt.stage;
  receipt.classification = error.classification || "prerequisite";
  receipt.failure = error.message;
  if (error.cleanupFailure) {
    receipt.cleanup = "failed";
    receipt.cleanupFailure = error.cleanupFailure;
  }
} finally {
  receipt.finishedAt = new Date().toISOString();
  await attempt.finish(receipt);
}

console.log(JSON.stringify(receipt, null, 2));
if (receipt.result !== "passed") process.exitCode = 1;
