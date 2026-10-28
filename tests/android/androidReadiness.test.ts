import {
  chmodSync,
  copyFileSync,
  realpathSync,
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
const gitVariables = new Set(
  spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" })
    .stdout.trim()
    .split("\n")
);
const fixtureEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !gitVariables.has(name) && !/^GIT_CONFIG_(KEY|VALUE)_/.test(name)
  )
);

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
  suite = "readiness",
  frozenPair = false,
  testInstalledMatches = true,
  bundledUrl = "https://localhost/",
  entrypoint,
  nativeResults = "all",
  cleanupFails = false,
  failingAdbCanary = false,
  advanceEvidenceClock = false,
  instrumentationTarget = "com.clipp.app.acceptance",
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
  suite?: string;
  frozenPair?: boolean;
  testInstalledMatches?: boolean;
  bundledUrl?: string | null;
  entrypoint?: string;
  nativeResults?: "all" | "missing" | "ignored" | "zero" | "focus-fails";
  cleanupFails?: boolean;
  failingAdbCanary?: boolean;
  advanceEvidenceClock?: boolean;
  instrumentationTarget?: string;
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "clipp-android-ready-"));
  const sourceRoot = join(directory, "source");
  mkdirSync(join(sourceRoot, "apps/android/scripts"), { recursive: true });
  mkdirSync(join(sourceRoot, "scripts"));
  for (const name of [
    "apps/android/scripts/android-readiness.mjs",
    "apps/android/scripts/android-candidate-provenance.mjs",
    "scripts/source-identity.mjs",
    "scripts/native-acceptance-attempts.mjs",
  ])
    copyFileSync(join(repoRoot, name), join(sourceRoot, name));
  writeFileSync(
    join(sourceRoot, "package.json"),
    JSON.stringify({ private: true, workspaces: ["apps/*"] })
  );
  copyFileSync(
    join(repoRoot, "apps/android/package.json"),
    join(sourceRoot, "apps/android/package.json")
  );
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ],
  ]) {
    const git = spawnSync("git", args, {
      cwd: sourceRoot,
      encoding: "utf8",
      env: { ...fixtureEnvironment, HUSKY: "0" },
    });
    if (git.status !== 0) throw new Error(git.stderr);
  }
  const adb = join(directory, "adb");
  const argsFile = join(directory, "calls.txt");
  writeFileSync(argsFile, "");
  const candidate = join(directory, "app-acceptance.apk");
  const installedApk = join(directory, "installed-base.apk");
  const testApk = join(directory, "app-acceptance-androidTest.apk");
  const installedTestApk = join(directory, "installed-test-base.apk");
  writeFileSync(testApk, "frozen instrumentation bytes");
  writeFileSync(
    installedTestApk,
    testInstalledMatches
      ? "frozen instrumentation bytes"
      : "wrong installed test bytes"
  );
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
    mkdirSync(join(directory, "legacy/attempt-1"), { recursive: true });
    writeFileSync(
      join(directory, "legacy/attempt-1/receipt.json"),
      JSON.stringify({
        result: "failed",
        stage: "device",
        classification: "runner",
      })
    );
    writeFileSync(
      join(directory, "legacy/attempts.json"),
      JSON.stringify({
        version: 1,
        scenario: "android-native-acceptance",
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
      join(sourceRoot, "apps/android/scripts/android-candidate-provenance.mjs"),
      "--source-identity",
    ],
    { encoding: "utf8", env: fixtureEnvironment }
  );
  if (source.status !== 0) throw new Error(source.stderr);
  writeFileSync(
    `${candidate}.provenance.json`,
    JSON.stringify({
      schemaVersion: frozenPair ? 2 : 1,
      ...(frozenPair
        ? {
            source: { checkout: realpathSync(sourceRoot) },
            testArtifact: {
              file: "app-acceptance-androidTest.apk",
              sha256: createHash("sha256")
                .update(readFileSync(testApk))
                .digest("hex"),
              applicationId: "com.clipp.app.acceptance.test",
              targetPackage: "com.clipp.app.acceptance",
            },
          }
        : {}),
      ...JSON.parse(source.stdout),
      artifact: "app-acceptance.apk",
      artifactSha256: corruptProvenance
        ? "0".repeat(64)
        : createHash("sha256").update(readFileSync(candidate)).digest("hex"),
      applicationId: "com.clipp.app.acceptance",
    })
  );
  const focused =
    "com.clipp.app.BackgroundContinuityManifestTest#explicitTextQueueSurvivesRestartAndPreservesRepeatedEventIdentity";
  const matrix = [
    "ManagedRelayCredentialStoreTest",
    "BackgroundContinuityLifecycleTest",
    "BackgroundContinuityManifestTest",
    "BackgroundContinuityDiagnosticsTest",
  ].flatMap((name) => {
    const java = readFileSync(
      join(
        repoRoot,
        `apps/android/android/app/src/androidTest/java/com/clipp/app/${name}.java`
      ),
      "utf8"
    );
    return [...java.matchAll(/@Test\s+public void (\w+)/g)].map(
      (match) => `com.clipp.app.${name}#${match[1]}`
    );
  });
  const statuses = (units: string[]) => {
    const actual =
      nativeResults === "zero" ||
      (nativeResults === "focus-fails" && units.length === 1)
        ? []
        : nativeResults === "missing"
          ? units.slice(1)
          : units;
    return (
      actual
        .map((unit) => {
          const [name, method] = unit.split("#");
          return `INSTRUMENTATION_STATUS: class=${name}\nINSTRUMENTATION_STATUS: test=${method}\nINSTRUMENTATION_STATUS_CODE: ${nativeResults === "ignored" ? -3 : 0}`;
        })
        .join("\n") +
      `\nOK (${nativeResults === "zero" ? 0 : units.length} tests)`
    );
  };

  writeFileSync(
    adb,
    `#!/bin/sh
printf '%s\\n' "$*" >> '${argsFile}'
shift
if [ "$1" != "emulator-5554" ]; then echo 'error: device serial not found'; exit 1; fi
shift
if [ "$1" = "pull" ]; then case "$2" in */com.clipp.app.acceptance.test/*) cp "$FIXTURE_TEST_APK" "$3" ;; *) cp "$FIXTURE_INSTALLED_APK" "$3" ;; esac; echo '1 file pulled'; exit 0; fi
case "$*" in
  "get-state") ${adbDelayMs > 0 ? `sleep ${adbDelayMs / 1000};` : ""} echo device ;;
  "shell getprop sys.boot_completed") echo 1 ;;
  "shell getprop ro.build.version.sdk") echo 33 ;;
  "shell getprop ro.build.fingerprint") echo android/owned/emulator:31/fixture ;;
  "shell getprop ro.product.model") echo Owned_Emulator ;;
  "shell getprop ro.hardware") echo ranchu ;;
  "shell getprop ro.kernel.qemu") echo '${emulator ? 1 : 0}' ;;
  "shell pm path com.clipp.app.acceptance.test") echo package:/data/app/com.clipp.app.acceptance.test/base.apk ;;
  "shell pm path com.clipp.app.acceptance")
    echo package:/data/app/com.clipp.app.acceptance/base.apk
    ${splitPackage ? "echo package:/data/app/com.clipp.app.acceptance/split_config.arm64_v8a.apk" : ":"}
    ;;
  "shell dumpsys webviewupdate") ${webView ? "echo 'Current WebView package (name, version): (com.android.webview, 133.0.6943.49)'" : "echo 'Current WebView package is null'"} ;;
  "shell pm list instrumentation com.clipp.app.acceptance") echo 'instrumentation:com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner (target=${instrumentationTarget})' ;;
  "shell am instrument -w -e class com.clipp.app.AcceptanceReadinessTest#bundledWebViewStarts com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner") ${instrumentation ? `${bundledUrl ? `echo 'INSTRUMENTATION_STATUS: clipp_bundled_url=${bundledUrl}';` : ""} echo 'OK (1 test)'` : "echo 'INSTRUMENTATION_FAILED: process crashed'"} ;;
  "shell am instrument -w -e class com.getcapacitor.myapp.ExampleInstrumentedTest#useAppContext com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner") ${instrumentation ? "echo 'OK (1 test)'" : "echo 'INSTRUMENTATION_FAILED: process crashed'"} ;;
  "shell am instrument -w -r -e class com.clipp.app.BackgroundContinuityManifestTest#explicitTextQueueSurvivesRestartAndPreservesRepeatedEventIdentity com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner") cat <<'FOCUSED'
${statuses([focused])}
FOCUSED
;;
  "shell am instrument -w -r -e class "*) cat <<'MATRIX'
${statuses(matrix)}
MATRIX
;;
  "shell am start -W -n com.clipp.app.acceptance/com.clipp.app.MainActivity") echo 'Status: ok' ;;
  "shell dumpsys window") ${windowDumpFormat === "summary" ? "echo 'mCurrentFocus=Window{e3326aa u0 com.clipp.app.acceptance/com.clipp.app.MainActivity}'; echo 'mFocusedApp=ActivityRecord{d697132 u0 com.clipp.app.acceptance/com.clipp.app.MainActivity t30}'" : "echo 'Window #6 Window{e3326aa u0 com.clipp.app.acceptance/com.clipp.app.MainActivity}:'; echo '  mHasSurface=true'; echo '  isOnScreen=true'; echo '  isVisible=true'"} ;;
  "shell dumpsys window windows") echo 'Window #6 Window{e3326aa u0 com.clipp.app.acceptance/com.clipp.app.MainActivity}:'; echo '  mHasSurface=true'; echo '  isOnScreen=true'; echo '  isVisible=true' ;;
  "shell uiautomator dump /data/local/tmp/clipp-readiness-"*".xml") echo 'UI ${uiDumpSpelling} dumped to: /data/local/tmp/clipp-readiness.xml' ;;
  "exec-out cat /data/local/tmp/clipp-readiness-"*".xml") ${uiReadDelayMs > 0 ? `sleep ${uiReadDelayMs / 1000};` : ""} cat '${uiStateFile}' ;;
  "shell rm -f /data/local/tmp/clipp-readiness-"*".xml") : ;;
  "shell am force-stop com.clipp.app.acceptance") ${cleanupFails ? "echo owned-cleanup-failed; exit 1" : ":"} ;;
  "shell input keyevent KEYCODE_TAB") ${interactionChanges ? `if cmp -s '${uiStateFile}' '${uiAfter}'; then cp '${uiBefore}' '${uiStateFile}'; else cp '${uiAfter}' '${uiStateFile}'; fi;` : ":"} ;;
  *) echo unexpected_probe:"$*"; exit 2 ;;
esac
`
  );
  chmodSync(adb, 0o755);
  const preload = join(directory, "evidence-clock.mjs");
  writeFileSync(
    preload,
    `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.writeFile;
let offset = 0;
const originalNow = Date.now;
Date.now = () => originalNow() + offset;
fs.writeFile = async (file, ...args) => {
  const result = await original(file, ...args);
  if (String(file).endsWith('native-behavior.private.log')) offset += 21 * 60_000;
  return result;
};
syncBuiltinESMExports();
`
  );
  if (failingAdbCanary) {
    const original = readFileSync(adb, "utf8");
    writeFileSync(
      adb,
      original.replace(
        'case "$*" in',
        'case "$*" in\n  "get-state") echo SYNTHETIC_PRIVATE_DIAGNOSTIC >&2; exit 1 ;;'
      )
    );
  }
  const invoke = (extra: string[] = []) =>
    spawnSync(
      entrypoint ? "npm" : process.execPath,
      entrypoint
        ? ["--workspace", "apps/android", "run", entrypoint, "--", ...extra]
        : [
            ...(advanceEvidenceClock ? ["--import", preload] : []),
            join(sourceRoot, "apps/android/scripts/android-readiness.mjs"),
            "--serial",
            serial,
            "--suite",
            suite,
            "--candidate-apk",
            candidate,
            "--output",
            output,
            ...extra,
            ...(timeoutBudgetMs === undefined
              ? []
              : [
                  "--import-history",
                  join(directory, "legacy/attempts.json"),
                  "--diagnostic-change",
                  "recheck the owned device",
                  "--expected-observation",
                  "the bounded adb command will time out inside the remaining budget",
                ]),
          ],
      {
        encoding: "utf8",
        cwd: sourceRoot,
        env: {
          ...fixtureEnvironment,
          CLIPP_TEST_SERIAL: serial,
          CLIPP_ANDROID_CANDIDATE_APK: candidate,
          CLIPP_ANDROID_EVIDENCE_DIR: output,
          CLIPP_ACCEPTANCE_STATE_ROOT: join(directory, "state"),
          CLIPP_ANDROID_ADB: adb,
          FIXTURE_INSTALLED_APK: installedApk,
          FIXTURE_TEST_APK: installedTestApk,
          FIXTURE_UI_STATE: uiStateFile,
        },
      }
    );
  return { directory, argsFile, output, result: invoke(), invoke };
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
    expect(receipt.failure).toBe("android_adb_timeout");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("UI hierarchy cleanup retains its separate allowance after the diagnostic budget expires", () => {
  const run = runReadiness({ timeoutBudgetMs: 3500, uiReadDelayMs: 10000 });
  try {
    expect(run.result.status).not.toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    const calls = readFileSync(run.argsFile, "utf8");
    expect(receipt.result).toBe("failed");
    expect(receipt.uiHierarchyCleanup).toBe("passed");
    expect(receipt.classification).toBe("runner");
    expect(calls).toContain("exec-out cat /data/local/tmp/clipp-readiness-");
    expect(calls).toMatch(/shell rm -f \/data\/local\/tmp\/clipp-readiness/);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("all maintained Android instrumentation aliases use the selected candidate and one serial runner", () => {
  const scripts = JSON.parse(
    readFileSync(join(repoRoot, "apps/android/package.json"), "utf8")
  ).scripts;
  for (const name of Object.keys(scripts).filter((name) =>
    name.startsWith("test:native:instrumentation")
  )) {
    expect(scripts[name]).toContain("node scripts/android-readiness.mjs");
    expect(scripts[name]).toContain("$CLIPP_TEST_SERIAL");
    expect(scripts[name]).not.toContain("gradlew");
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

test("public Android retries exclude initial execution and retain the first-failure deadline", () => {
  const directory = mkdtempSync(join(tmpdir(), "clipp-android-clock-"));
  try {
    const candidate = join(directory, "app-acceptance.apk");
    const output = join(directory, "evidence");
    const preload = join(directory, "clock.mjs");
    writeFileSync(
      preload,
      `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
let now = Number(process.env.FIXTURE_NOW);
Date.now = () => now;
const readFile = fs.readFile;
fs.readFile = async (file, ...args) => {
  if (String(file) === ${JSON.stringify(candidate)}) {
    now += Number(process.env.FIXTURE_INITIAL_DURATION);
    throw Object.assign(new Error('fixture_candidate_missing'), {code:'ENOENT'});
  }
  return readFile(file, ...args);
};
syncBuiltinESMExports();
`
    );
    const run = (now: number, duration: number, change?: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          preload,
          join(repoRoot, "apps/android/scripts/android-readiness.mjs"),
          "--serial",
          "emulator-clock-fixture",
          "--candidate-apk",
          candidate,
          "--output",
          output,
          ...(change
            ? [
                "--diagnostic-change",
                change,
                "--expected-observation",
                "candidate becomes readable",
              ]
            : []),
        ],
        {
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...process.env,
            CLIPP_ANDROID_ADB: join(directory, "must-not-launch-adb"),
            CLIPP_ACCEPTANCE_STATE_ROOT: join(directory, "state"),
            FIXTURE_NOW: String(now),
            FIXTURE_INITIAL_DURATION: String(duration),
          },
        }
      );
    const start = Date.parse("2026-10-25T00:00:00.000Z");
    const failure = start + 21 * 60_000;
    expect(run(start, 21 * 60_000).status).not.toBe(0);
    const historyPath = join(output, "attempts.json");
    const history = () => JSON.parse(readFileSync(historyPath, "utf8"));
    const first = history();
    expect(first.diagnosticStartedAt).toBe(new Date(failure).toISOString());
    expect(first.attempts[0].finishedAt).toBe(new Date(failure).toISOString());
    const retry = run(failure + 11 * 60_000, 0, "repair missing candidate");
    expect(retry.stderr).not.toContain("diagnostic_time_budget_exhausted");
    const second = history();
    expect(second.attempts).toHaveLength(2);
    expect(second.attempts[0]).toEqual(first.attempts[0]);
    expect(second.diagnosticStartedAt).toBe(first.diagnosticStartedAt);
    const expired = run(failure + 20 * 60_000, 0, "replace candidate build");
    expect(expired.stderr).toContain("diagnostic_time_budget_exhausted");
    expect(history()).toEqual(second);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Android semantic failure history survives changing the output directory", () => {
  const run = runReadiness({ webView: false });
  try {
    expect(run.result.status).toBe(1);
    const continued = run.invoke([
      "--output",
      join(run.directory, "another-output"),
    ]);
    expect(continued.stderr).toContain("changed_diagnosis_required");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("focused Android instrumentation requires the frozen app and matching test APK record", () => {
  const run = runReadiness({ suite: "focused" });
  try {
    expect(run.result.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8")).failure
    ).toContain("frozen_android_candidate_required");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(
      "shell am instrument"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("frozen Android preflight verifies the matching installed instrumentation APK", () => {
  const run = runReadiness({ frozenPair: true, testInstalledMatches: false });
  try {
    expect(run.result.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8")).failure
    ).toContain("installed_test_candidate_differs");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(
      "shell am instrument"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("selected Android native behavior follows the same candidate-bound readiness and records actual passed tests", () => {
  const run = runReadiness({ suite: "focused", frozenPair: true });
  try {
    expect(run.result.status).toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.behavior).toMatchObject({
      suite: "focused",
      requiredTests: 1,
      passed: true,
    });
    expect(receipt.verifiedCoverage).toEqual([
      "android-owned-readiness",
      "com.clipp.app.BackgroundContinuityManifestTest#explicitTextQueueSurvivesRestartAndPreservesRepeatedEventIdentity",
    ]);
    expect(receipt.installedTestCandidate.matchesCandidate).toBe(true);
    const calls = readFileSync(run.argsFile, "utf8");
    expect(calls.indexOf("shell input keyevent KEYCODE_TAB")).toBeLessThan(
      calls.indexOf("shell am instrument -w -r")
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("a focused Android pass retains its limited scope and admits an ordinary same-candidate matrix extension", () => {
  const run = runReadiness({ suite: "focused", frozenPair: true });
  try {
    expect(run.result.status).toBe(0);
    const focused = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(focused.behavior.requiredTests).toBe(1);
    const continued = run.invoke([
      "--suite",
      "matrix",
      "--output",
      join(run.directory, "matrix-output"),
    ]);
    expect(continued.status).toBe(0);
    const matrix = JSON.parse(
      readFileSync(join(run.directory, "matrix-output/receipt.json"), "utf8")
    );
    expect(matrix.behavior).toMatchObject({
      suite: "matrix",
      requiredTests: 27,
      passed: true,
    });
    expect(matrix.history.generation).toBe(1);
    expect(
      JSON.parse(readFileSync(focused.history.path, "utf8")).attempts
    ).toHaveLength(1);
    expect(
      JSON.parse(readFileSync(matrix.history.path, "utf8")).diagnosticStartedAt
    ).toBe(null);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("frozen Android readiness refuses an observed remote WebView renderer", () => {
  const run = runReadiness({
    frozenPair: true,
    bundledUrl: "http://remote-fixture.invalid/",
  });
  try {
    expect(run.result.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8")).failure
    ).toContain("bundled_webview_url_required");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("the connected npm entrypoint runs the installed selected-serial matrix without another Gradle device/build", () => {
  const run = runReadiness({
    frozenPair: true,
    entrypoint: "test:native:instrumentation:connected",
  });
  try {
    expect(run.result.status).toBe(0);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8"))
        .behavior
    ).toMatchObject({ suite: "matrix", requiredTests: 27, passed: true });
    expect(
      readFileSync(run.argsFile, "utf8")
        .trim()
        .split("\n")
        .every((line) => line.startsWith("-s emulator-5554 "))
    ).toBe(true);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

for (const nativeResults of ["zero", "missing", "ignored"] as const)
  test(`Android cannot claim native coverage from ${nativeResults} instrumentation results`, () => {
    const run = runReadiness({
      suite: "focused",
      frozenPair: true,
      nativeResults,
    });
    try {
      expect(run.result.status).toBe(1);
      const receipt = JSON.parse(
        readFileSync(join(run.output, "receipt.json"), "utf8")
      );
      expect(receipt.failure).toContain("native_behavior_coverage_missing");
      expect(receipt.classification).toBe("runner");
      expect(receipt.ordinaryScope).toBeUndefined();
    } finally {
      rmSync(run.directory, { recursive: true, force: true });
    }
  });
test("a failed focused case cannot reset its budget by selecting matrix coverage", () => {
  const run = runReadiness({
    suite: "focused",
    frozenPair: true,
    nativeResults: "focus-fails",
  });
  try {
    expect(run.result.status).toBe(1);
    expect(run.invoke(["--suite", "matrix"]).stderr).toContain(
      "changed_diagnosis_required"
    );
    const repaired = run.invoke([
      "--suite",
      "matrix",
      "--diagnostic-change",
      "full class discovery addresses missing method selection",
      "--expected-observation",
      "all native methods actually report passed",
    ]);
    expect(repaired.status).toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.history.generation).toBe(0);
    expect(
      JSON.parse(readFileSync(receipt.history.path, "utf8")).attempts
    ).toHaveLength(2);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
test("ordinary Android extension refuses unchanged scope and a different frozen pair", () => {
  const run = runReadiness({ suite: "focused", frozenPair: true });
  try {
    expect(run.result.status).toBe(0);
    expect(
      run.invoke(["--output", join(run.directory, "another")]).stderr
    ).toContain("ordinary_coverage_not_expanded");
    const file = join(run.directory, "app-acceptance.apk.provenance.json");
    const record = JSON.parse(readFileSync(file, "utf8"));
    record.testArtifact.sha256 = "f".repeat(64);
    writeFileSync(file, JSON.stringify(record));
    expect(run.invoke(["--suite", "matrix"]).stderr).toContain(
      "ordinary_candidate_mismatch"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
test("Android successor decision must match the verified frozen source before any device command", () => {
  const run = runReadiness({ suite: "focused", frozenPair: true });
  try {
    expect(run.result.status).toBe(0);
    const prior = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    const decision = join(run.directory, "successor.json");
    writeFileSync(
      decision,
      JSON.stringify({
        previousHistory: prior.history.path,
        candidateRevision: "f".repeat(40),
        affectedScenarios: ["android-native-acceptance"],
        reason: "qualify the changed native candidate",
      })
    );
    writeFileSync(run.argsFile, "");
    expect(run.invoke(["--successor", decision]).status).toBe(1);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.failure).toContain("successor_candidate_binding_mismatch");
    expect(readFileSync(run.argsFile, "utf8")).toBe("");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("a passed Android matrix cannot be downgraded into an ordinary fresh focused batch", () => {
  const run = runReadiness({ suite: "matrix", frozenPair: true });
  try {
    expect(run.result.status).toBe(0);
    expect(run.invoke(["--suite", "focused"]).stderr).toContain(
      "ordinary_coverage_not_expanded"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
test("owned Android cleanup failure cannot be hidden by passed native behavior", () => {
  const run = runReadiness({
    suite: "focused",
    frozenPair: true,
    cleanupFails: true,
  });
  try {
    expect(run.result.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8"))
    ).toMatchObject({
      result: "failed",
      stage: "cleanup",
      classification: "runner",
      appCleanup: "failed",
    });
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("five Android failures exhaust one semantic budget across aliases, outputs and port labels", () => {
  const run = runReadiness({
    suite: "focused",
    frozenPair: true,
    webView: false,
  });
  try {
    expect(run.result.status).toBe(1);
    for (let index = 1; index <= 4; index++)
      expect(
        run.invoke([
          "--suite",
          "matrix",
          "--output",
          join(run.directory, `retry-${index}`),
          "--diagnostic-change",
          `distinct diagnostic ${index}`,
          "--expected-observation",
          `provider observation ${index}`,
          ...(index === 4 ? ["--serial", "emulator-5566"] : []),
        ]).status
      ).toBe(1);
    const exhausted = run.invoke([
      "--suite",
      "matrix",
      "--output",
      join(run.directory, "another-label"),
      "--diagnostic-change",
      "new label is not a budget",
      "--expected-observation",
      "no launch",
    ]);
    expect(exhausted.stderr).toContain("diagnostic_attempt_budget_exhausted");
    const history = JSON.parse(
      readFileSync(join(run.output, "attempts.json"), "utf8")
    );
    expect(history.attempts).toHaveLength(5);
    for (const attempt of history.attempts)
      expect(attempt.result).toBe("failed");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
}, 30000);

test("API-specific selection validates the actual selected serial instead of switching guests", () => {
  const run = runReadiness({
    frozenPair: true,
    entrypoint: "test:native:instrumentation:api31",
  });
  try {
    expect(run.result.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8")).failure
    ).toContain("selected_android_api_mismatch");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(
      "shell am instrument"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
test("instrumentation registered against another package is never executed", () => {
  const run = runReadiness({
    frozenPair: true,
    instrumentationTarget: "com.clipp.app",
  });
  try {
    expect(run.result.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(run.output, "receipt.json"), "utf8")).failure
    ).toContain("acceptance_instrumentation_unavailable");
    expect(readFileSync(run.argsFile, "utf8")).not.toContain(
      "shell am instrument"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
test("a failed matrix cannot use narrower focused coverage to launder a new ordinary budget", () => {
  const run = runReadiness({
    suite: "matrix",
    frozenPair: true,
    nativeResults: "missing",
  });
  try {
    expect(run.result.status).toBe(1);
    expect(
      run.invoke([
        "--suite",
        "focused",
        "--diagnostic-change",
        "a narrower successful test is insufficient",
        "--expected-observation",
        "same unresolved matrix budget",
      ]).stderr
    ).toContain("ordinary_coverage_cannot_narrow");
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(
      JSON.parse(readFileSync(receipt.history.path, "utf8")).attempts
    ).toHaveLength(1);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("failed Android driver details stay private across receipt and command output", () => {
  const run = runReadiness({ failingAdbCanary: true });
  try {
    expect(run.result.status).toBe(1);
    const receiptText = readFileSync(join(run.output, "receipt.json"), "utf8");
    expect(receiptText + run.result.stdout + run.result.stderr).not.toContain(
      "SYNTHETIC_PRIVATE_DIAGNOSTIC"
    );
    const receipt = JSON.parse(receiptText);
    expect(receipt.failure).toBe("android_adb_failed");
    const history = JSON.parse(readFileSync(receipt.history.path, "utf8"));
    const privateFile = join(
      receipt.history.path,
      "..",
      history.attempts.at(-1).receipt,
      "..",
      "failure.private.log"
    );
    expect(readFileSync(privateFile, "utf8")).toContain(
      "SYNTHETIC_PRIVATE_DIAGNOSTIC"
    );
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("Android evidence persistence cannot establish pass after the remaining diagnostic deadline", () => {
  const run = runReadiness({
    frozenPair: true,
    suite: "focused",
    timeoutBudgetMs: 60000,
    advanceEvidenceClock: true,
  });
  try {
    expect(run.result.status).toBe(1);
    const receipt = JSON.parse(
      readFileSync(join(run.output, "receipt.json"), "utf8")
    );
    expect(receipt.classification).toBe("runner");
    expect(receipt.failure).toContain("diagnostic_time_budget_exhausted");
    expect(receipt.behavior?.passed).not.toBe(true);
    expect(receipt.ordinaryScope).toBeUndefined();
    expect(receipt.appCleanup).toBe("passed");
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
