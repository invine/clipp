import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();

function runReadiness({
  webView = true,
  instrumentation = true,
  emulator = true,
  corruptProvenance = false,
  serial = "emulator-5554",
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "clipp-android-ready-"));
  const adb = join(directory, "adb");
  const argsFile = join(directory, "calls.txt");
  const candidate = join(directory, "app-acceptance.apk");
  const output = join(directory, "receipt");
  writeFileSync(candidate, "fixture candidate bytes");
  const source = spawnSync(
    process.execPath,
    [
      join(repoRoot, "apps/android/scripts/android-candidate-provenance.mjs"),
      "--source-identity",
    ],
    { encoding: "utf8" }
  );
  if (source.status !== 0) throw new Error(source.stderr);
  writeFileSync(
    `${candidate}.provenance.json`,
    JSON.stringify({
      schemaVersion: 1,
      ...JSON.parse(source.stdout),
      artifact: "app-acceptance.apk",
      artifactSha256: corruptProvenance
        ? "0".repeat(64)
        : createHash("sha256").update(readFileSync(candidate)).digest("hex"),
      applicationId: "com.clipp.app.acceptance",
    })
  );
  writeFileSync(
    adb,
    `#!/bin/sh
printf '%s\\n' "$*" >> '${argsFile}'
shift
if [ "$1" != "emulator-5554" ]; then echo 'error: device serial not found'; exit 1; fi
shift
case "$*" in
  "get-state") echo device ;;
  "shell getprop sys.boot_completed") echo 1 ;;
  "shell getprop ro.build.version.sdk") echo 33 ;;
  "shell getprop ro.kernel.qemu") echo '${emulator ? 1 : 0}' ;;
  "shell pm path com.clipp.app.acceptance") echo package:/data/app/com.clipp.app.acceptance/base.apk ;;
  "shell cmd webviewupdate getCurrentWebViewPackage") ${webView ? "echo com.android.webview versionName=133.0.6943.49" : "echo No WebView provider available"} ;;
  "shell pm list instrumentation com.clipp.app.acceptance.test") echo 'instrumentation:com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner (target=com.clipp.app.acceptance)' ;;
  "shell am instrument -w -e class com.getcapacitor.myapp.ExampleInstrumentedTest#useAppContext com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner") ${instrumentation ? "echo 'OK (1 test)'" : "echo 'INSTRUMENTATION_FAILED: process crashed'"} ;;
  "shell am start -W -n com.clipp.app.acceptance/com.clipp.app.MainActivity") echo 'Status: ok' ;;
  "shell dumpsys window windows") echo 'mCurrentFocus=Window{ab12 com.clipp.app.acceptance/com.clipp.app.MainActivity}' ;;
  "shell input keyevent KEYCODE_TAB") : ;;
  *) echo unexpected_probe:"$*"; exit 2 ;;
esac
`
  );
  chmodSync(adb, 0o755);
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, "apps/android/scripts/android-readiness.mjs"),
      "--serial",
      serial,
      "--candidate-apk",
      candidate,
      "--output",
      output,
    ],
    { encoding: "utf8", env: { ...process.env, CLIPP_ANDROID_ADB: adb } }
  );
  return { directory, argsFile, output, result };
}

test("Android readiness probes one candidate serial through WebView, instrumentation and interaction", () => {
  const run = runReadiness();
  try {
    expect(run.result.status).toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.result).toBe("passed");
    expect(receipt.serial).toBe("emulator-5554");
    expect(receipt.candidate.appPackage).toBe("com.clipp.app.acceptance");
    expect(receipt.candidate.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.androidApi).toBe("33");
    expect(receipt.instrumentationProbe).toContain("OK (1 test)");
    expect(receipt.cleanup).toBe("not-required");
    const calls = readFileSync(run.argsFile, "utf8").trim().split("\n");
    expect(calls.every((call) => call.startsWith("-s emulator-5554 "))).toBe(
      true
    );
    expect(calls.at(-1)).toContain("dumpsys window windows");
    expect(calls.join("\n")).not.toMatch(/barcode|gms\.version|settings put/i);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness rejects a candidate whose provenance does not match its bytes", () => {
  const run = runReadiness({ corruptProvenance: true });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.stage).toBe("candidate");
    expect(receipt.failure).toContain("candidate_artifact_changed_after_build");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness classifies instrumentation failures as runner failures", () => {
  const run = runReadiness({ instrumentation: false });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.stage).toBe("instrumentation");
    expect(receipt.classification).toBe("runner");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain("shell am start");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness withholds instrumentation when the active WebView provider is missing", () => {
  const run = runReadiness({ webView: false });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.result).toBe("failed");
    expect(receipt.stage).toBe("webview");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(
      "shell am instrument"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness rejects physical devices before instrumentation", () => {
  const run = runReadiness({ emulator: false });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.failure).toContain("android_emulator_required");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(
      "shell am instrument"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness rejects an unavailable exact serial before touching another device", () => {
  const run = runReadiness({ serial: "missing-device" });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.serial).toBe("missing-device");
    expect(receipt.stage).toBe("device");
    expect(readFileSync(run.argsFile, "utf8")).toContain(
      "-s missing-device get-state"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
