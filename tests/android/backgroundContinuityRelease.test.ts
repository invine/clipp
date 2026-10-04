import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function runApi31Preflight(apiLevel: number, emulator = true) {
  const directory = mkdtempSync(join(tmpdir(), "clipp-android-api-check-"));
  const adb = join(directory, "adb");
  writeFileSync(
    adb,
    `#!/bin/sh
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nemulator-5554\\tdevice\\n'
  exit 0
fi
if [ "$5" = "ro.kernel.qemu" ]; then
  printf '${emulator ? 1 : 0}\\n'
  exit 0
fi
printf '${apiLevel}\\n'
`
  );
  chmodSync(adb, 0o755);
  try {
    return spawnSync(
      process.execPath,
      [join(repoRoot, "apps/android/scripts/verify-api-31-emulator.mjs")],
      {
        encoding: "utf8",
        env: { ...process.env, CLIPP_ANDROID_ADB: adb },
      }
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Android diagnostics are excluded from automatic backup and device transfer", () => {
  const manifest = readRepoFile(
    "apps/android/android/app/src/main/AndroidManifest.xml"
  );
  const legacyRules = readRepoFile(
    "apps/android/android/app/src/main/res/xml/backup_rules.xml"
  );
  const extractionRules = readRepoFile(
    "apps/android/android/app/src/main/res/xml/data_extraction_rules.xml"
  );

  expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
  expect(manifest).toContain(
    'android:dataExtractionRules="@xml/data_extraction_rules"'
  );
  expect(legacyRules).toContain(
    '<exclude domain="sharedpref" path="clipp_background_continuity_diagnostics.xml" />'
  );
  expect(extractionRules).toMatch(
    /<cloud-backup>[\s\S]*<exclude domain="sharedpref" path="clipp_background_continuity_diagnostics\.xml" \/>[\s\S]*<\/cloud-backup>/
  );
  expect(extractionRules).toMatch(
    /<device-transfer>[\s\S]*<exclude domain="sharedpref" path="clipp_background_continuity_diagnostics\.xml" \/>[\s\S]*<\/device-transfer>/
  );
});

test("Android background continuity declares partial wake-lock permission", () => {
  const manifest = readRepoFile(
    "apps/android/android/app/src/main/AndroidManifest.xml"
  );

  expect(manifest).toContain(
    '<uses-permission android:name="android.permission.WAKE_LOCK" />'
  );
});

test("Android instrumentation preflight accepts an Android 12 target", () => {
  const result = runApi31Preflight(31);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("emulator-5554 (API 31)");
});

test("Android instrumentation preflight rejects targets below Android 12", () => {
  const result = runApi31Preflight(30);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("API 31 or later");
});

test("Android instrumentation preflight rejects a physical Android 12 device", () => {
  const result = runApi31Preflight(31, false);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("API 31 or later emulator");
});

test("Android managed-device release matrix covers every required platform seam", () => {
  const gradle = readRepoFile("apps/android/android/app/build.gradle");
  const packageJson = readRepoFile("apps/android/package.json");

  for (const apiLevel of [31, 33, 34, 35, 36]) {
    expect(gradle).toContain(`clippApi${apiLevel}`);
    expect(gradle).toContain(`apiLevel = ${apiLevel}`);
    expect(packageJson).toContain(`test:native:instrumentation:api${apiLevel}`);
    expect(packageJson).toContain(`clippApi${apiLevel}AcceptanceAndroidTest`);
  }
  expect(packageJson).toContain(
    "backgroundContinuityGroupAcceptanceAndroidTest"
  );
  expect(packageJson).toContain("-PclippAcceptance");
});
