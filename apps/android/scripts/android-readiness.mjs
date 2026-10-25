/** Readiness gate for the exact Android candidate and serial used by acceptance. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

function invoke(args, stage, classification = "prerequisite") {
  const result = spawnSync(adb, ["-s", serial, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
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

const attempt = await beginNativeAttempt({
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
  receipt.stage = "webview";
  receipt.webViewProvider = invoke(
    ["shell", "cmd", "webviewupdate", "getCurrentWebViewPackage"],
    "webview"
  );
  const webViewVersion = receipt.webViewProvider.match(
    /com\.[\w.]*webview[\s\S]*?(\d+\.\d+(?:\.\d+)*)/i
  );
  assert(webViewVersion, "active_webview_provider_unavailable");
  receipt.webViewProviderVersion = webViewVersion[1];

  receipt.stage = "instrumentation";
  receipt.instrumentation = invoke(
    ["shell", "pm", "list", "instrumentation", testPackage],
    "instrumentation"
  );
  assert(
    receipt.instrumentation.includes(testPackage),
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
  receipt.focusBefore = invoke(
    ["shell", "dumpsys", "window", "windows"],
    "interaction",
    "runner"
  );
  assert(
    receipt.focusBefore.includes(appPackage),
    "candidate_window_not_owned"
  );
  receipt.input = invoke(
    ["shell", "input", "keyevent", "KEYCODE_TAB"],
    "interaction",
    "runner"
  );
  receipt.focusAfter = invoke(
    ["shell", "dumpsys", "window", "windows"],
    "interaction",
    "runner"
  );
  assert(
    receipt.focusAfter.includes(appPackage),
    "candidate_lost_window_focus"
  );

  receipt.result = "passed";
  receipt.classification = "none";
} catch (error) {
  receipt.stage = error.stage || receipt.stage;
  receipt.classification = error.classification || "prerequisite";
  receipt.failure = error.message;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await attempt.finish(receipt);
}

console.log(JSON.stringify(receipt, null, 2));
if (receipt.result !== "passed") process.exitCode = 1;
