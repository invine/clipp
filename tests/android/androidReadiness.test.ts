import {
  chmodSync,
  mkdirSync,
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
  installedMatches = true,
  splitPackage = false,
  interactionChanges = true,
  windowDumpFormat = "summary",
  uiDumpSpelling = "hierarchy",
  timeoutBudgetMs,
  adbDelayMs = 0,
  uiReadDelayMs = 0,
  serial = "emulator-5554",
}: {
  webView?: boolean;
  instrumentation?: boolean;
  emulator?: boolean;
  corruptProvenance?: boolean;
  installedMatches?: boolean;
  splitPackage?: boolean;
  interactionChanges?: boolean;
  windowDumpFormat?: "summary" | "windows-only";
  uiDumpSpelling?: "hierarchy" | "hierchary";
  timeoutBudgetMs?: number;
  adbDelayMs?: number;
  uiReadDelayMs?: number;
  serial?: string;
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "clipp-android-ready-"));
  const adb = join(directory, "adb");
  const argsFile = join(directory, "calls.txt");
  const candidate = join(directory, "app-acceptance.apk");
  const installedApk = join(directory, "installed-base.apk");
  const output = join(directory, "receipt");
  mkdirSync(output, { recursive: true });
  const uiStateFile = join(directory, "ui-state.xml");
  const uiBefore = join(directory, "ui-before.xml");
  const uiAfter = join(directory, "ui-after.xml");
  writeFileSync(
    uiBefore,
    '<hierarchy><node package="com.clipp.app.acceptance" class="android.widget.EditText" resource-id="com.clipp.app.acceptance:id/search" bounds="[0,0][100,40]" focusable="true" clickable="true" focused="true" text="private text" /></hierarchy>'
  );
  writeFileSync(
    uiAfter,
    '<hierarchy><node package="com.clipp.app.acceptance" class="android.widget.Button" resource-id="com.clipp.app.acceptance:id/history" bounds="[0,50][100,90]" focusable="true" clickable="true" focused="true" text="private text" /></hierarchy>'
  );
  writeFileSync(uiStateFile, readFileSync(uiBefore));
  if (timeoutBudgetMs !== undefined) {
    const startedAt = new Date(
      Date.now() - (20 * 60_000 - timeoutBudgetMs)
    ).toISOString();
    writeFileSync(
      join(output, "attempts.json"),
      JSON.stringify({
        version: 1,
        scenario: `android-readiness-${serial}`,
        diagnosticStartedAt: startedAt,
        attempts: [
          {
            number: 1,
            startedAt: new Date(Date.parse(startedAt) - 1000).toISOString(),
            finishedAt: startedAt,
            result: "failed",
          },
        ],
      })
    );
  }
  writeFileSync(candidate, "fixture candidate bytes");
  writeFileSync(
    installedApk,
    installedMatches
      ? "fixture candidate bytes"
      : "different installed candidate bytes"
  );
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
if [ "$1" = "pull" ]; then cp "$FIXTURE_INSTALLED_APK" "$3"; echo '1 file pulled'; exit 0; fi
case "$*" in
  "get-state") ${adbDelayMs > 0 ? `sleep ${adbDelayMs / 1000};` : ""} echo device ;;
  "shell getprop sys.boot_completed") echo 1 ;;
  "shell getprop ro.build.version.sdk") echo 33 ;;
  "shell getprop ro.kernel.qemu") echo '${emulator ? 1 : 0}' ;;
  "shell pm path com.clipp.app.acceptance")
    echo package:/data/app/com.clipp.app.acceptance/base.apk
    ${splitPackage ? "echo package:/data/app/com.clipp.app.acceptance/split_config.arm64_v8a.apk" : ":"}
    ;;
  "shell dumpsys webviewupdate") ${webView ? "echo 'Current WebView package (name, version): (com.android.webview, 133.0.6943.49)'" : "echo 'Current WebView package is null'"} ;;
  "shell pm list instrumentation com.clipp.app.acceptance") echo 'instrumentation:com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner (target=com.clipp.app.acceptance)' ;;
  "shell am instrument -w -e class com.getcapacitor.myapp.ExampleInstrumentedTest#useAppContext com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner") ${instrumentation ? "echo 'OK (1 test)'" : "echo 'INSTRUMENTATION_FAILED: process crashed'"} ;;
  "shell am start -W -n com.clipp.app.acceptance/com.clipp.app.MainActivity") echo 'Status: ok' ;;
  "shell dumpsys window") ${windowDumpFormat === "summary" ? "echo 'mCurrentFocus=Window{e3326aa u0 com.clipp.app.acceptance/com.clipp.app.MainActivity}'; echo 'mFocusedApp=ActivityRecord{d697132 u0 com.clipp.app.acceptance/com.clipp.app.MainActivity t30}'" : "echo 'Window #6 Window{e3326aa u0 com.clipp.app.acceptance/com.clipp.app.MainActivity}:'; echo '  mHasSurface=true'; echo '  isOnScreen=true'; echo '  isVisible=true'"} ;;
  "shell dumpsys window windows") echo 'Window #6 Window{e3326aa u0 com.clipp.app.acceptance/com.clipp.app.MainActivity}:'; echo '  mHasSurface=true'; echo '  isOnScreen=true'; echo '  isVisible=true' ;;
  "shell uiautomator dump /data/local/tmp/clipp-readiness-"*".xml") echo 'UI ${uiDumpSpelling} dumped to: /data/local/tmp/clipp-readiness.xml' ;;
  "exec-out cat /data/local/tmp/clipp-readiness-"*".xml") ${uiReadDelayMs > 0 ? `sleep ${uiReadDelayMs / 1000};` : ""} cat '${uiStateFile}' ;;
  "shell rm -f /data/local/tmp/clipp-readiness-"*".xml") : ;;
  "shell input keyevent KEYCODE_TAB") ${interactionChanges ? `cp '${uiAfter}' '${uiStateFile}';` : ":"} ;;
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
      ...(timeoutBudgetMs === undefined
        ? []
        : [
            "--diagnostic-change",
            "recheck the owned device",
            "--expected-observation",
            "the bounded adb command will time out inside the remaining budget",
          ]),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLIPP_ANDROID_ADB: adb,
        FIXTURE_INSTALLED_APK: installedApk,
        FIXTURE_UI_STATE: uiStateFile,
      },
    }
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
    expect(receipt.installedCandidate.sha256).toBe(receipt.candidate.sha256);
    expect(receipt.installedCandidate.matchesCandidate).toBe(true);
    expect(receipt.androidApi).toBe("33");
    expect(receipt.webViewProvider).toBe("com.android.webview");
    expect(receipt.webViewProviderVersion).toBe("133.0.6943.49");
    expect(receipt.instrumentation).toBe(
      "instrumentation:com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner (target=com.clipp.app.acceptance)"
    );
    expect(receipt.instrumentationProbe).toContain("OK (1 test)");
    expect(receipt.focusBeforeActivity).toBe(
      "com.clipp.app.acceptance/com.clipp.app.MainActivity"
    );
    expect(receipt.focusAfterActivity).toBe(receipt.focusBeforeActivity);
    expect(receipt.focusBefore).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.focusAfter).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.focusAfter).not.toBe(receipt.focusBefore);
    expect(receipt.interaction).toBe("tab_changed_focused_accessible_control");
    expect(JSON.stringify(receipt)).not.toContain("private text");
    expect(receipt.cleanup).toBe("passed");
    const calls = readFileSync(run.argsFile, "utf8").trim().split("\n");
    expect(calls.every((call) => call.startsWith("-s emulator-5554 "))).toBe(
      true
    );
    expect(calls).toContain("-s emulator-5554 shell dumpsys webviewupdate");
    expect(calls).toContain(
      "-s emulator-5554 shell pm list instrumentation com.clipp.app.acceptance"
    );
    expect(calls).not.toContain(
      "-s emulator-5554 shell pm list instrumentation com.clipp.app.acceptance.test"
    );
    expect(calls).toContain("-s emulator-5554 shell dumpsys window");
    expect(calls.join("\n")).not.toMatch(/barcode|gms\.version|settings put/i);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness rejects a visible window-list entry without explicit focus evidence", () => {
  const run = runReadiness({ windowDumpFormat: "windows-only" });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.stage).toBe("interaction");
    expect(receipt.failure).toContain("candidate_window_not_owned");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness fails when the UI action produces no observable effect", () => {
  const run = runReadiness({ interactionChanges: false });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.stage).toBe("interaction");
    expect(receipt.failure).toContain("candidate_ui_interaction_no_effect");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness accepts the platform's observed UIAutomator output spelling", () => {
  const run = runReadiness({ uiDumpSpelling: "hierchary" });
  try {
    expect(run.result.status).toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.result).toBe("passed");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("diagnostic adb work is bounded by the remaining 20-minute budget", () => {
  const run = runReadiness({ timeoutBudgetMs: 4000, adbDelayMs: 10000 });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.stage).toBe("device");
    expect(receipt.classification).toBe("runner");
    expect(receipt.failure).toContain("spawnSync");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("UI hierarchy cleanup is skipped and reported when the diagnostic budget expires", () => {
  const run = runReadiness({ timeoutBudgetMs: 3500, uiReadDelayMs: 10000 });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    const calls = readFileSync(run.argsFile, "utf8");
    expect(receipt.result).toBe("failed");
    expect(receipt.uiHierarchyCleanup).toBe("not-run-deadline");
    expect(receipt.cleanup).not.toBe("passed");
    expect(calls).toContain("exec-out cat /data/local/tmp/clipp-readiness-");
    expect(calls).not.toMatch(/shell rm -f \/data\/local\/tmp\/clipp-readiness/);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("default and connected Android instrumentation commands run readiness first", () => {
  const scripts = JSON.parse(
    readFileSync(join(repoRoot, "apps/android/package.json"), "utf8")
  ).scripts;
  expect(scripts["test:native:instrumentation"]).toBe(
    "npm run test:native:instrumentation:matrix"
  );
  expect(scripts["test:native:readiness"]).toContain(
    "node scripts/android-readiness.mjs"
  );
  const instrumentationCommands = Object.keys(scripts).filter((name) =>
    name.startsWith("test:native:instrumentation:")
  );
  for (const name of instrumentationCommands) {
    expect(
      scripts[name].indexOf("npm run test:native:readiness")
    ).toBeGreaterThanOrEqual(0);
    expect(scripts[name].indexOf("npm run test:native:readiness")).toBeLessThan(
      scripts[name].indexOf("gradlew")
    );
  }
});

test("Android readiness rejects an installed APK that differs from the candidate", () => {
  const run = runReadiness({ installedMatches: false });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.result).toBe("failed");
    expect(receipt.stage).toBe("installed-candidate");
    expect(receipt.classification).toBe("prerequisite");
    expect(receipt.installedCandidate.matchesCandidate).toBe(false);
    expect(receipt.installedCandidate.sha256).not.toBe(
      receipt.candidate.sha256
    );
    const calls = readFileSync(run.argsFile, "utf8");
    expect(calls).toMatch(
      /pull \/data\/app\/com\.clipp\.app\.acceptance\/base\.apk \/.*installed-base\.apk/
    );
    expect(calls).not.toContain("shell dumpsys webviewupdate");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android readiness refuses split APK installs that cannot match one candidate APK", () => {
  const run = runReadiness({ splitPackage: true });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.stage).toBe("installed-candidate");
    expect(receipt.failure).toContain(
      "installed_package_split_apks_unsupported"
    );
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(" pull ");
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
