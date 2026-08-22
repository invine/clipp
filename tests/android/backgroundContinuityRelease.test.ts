import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function runApi36Preflight(apiLevel: number, emulator = true) {
  const directory = mkdtempSync(join(tmpdir(), "clipp-android-api-check-"));
  const adb = join(directory, "adb");
  writeFileSync(adb, `#!/bin/sh
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nemulator-5554\\tdevice\\n'
  exit 0
fi
if [ "$5" = "ro.kernel.qemu" ]; then
  printf '${emulator ? 1 : 0}\\n'
  exit 0
fi
printf '${apiLevel}\\n'
`);
  chmodSync(adb, 0o755);
  try {
    return spawnSync(
      process.execPath,
      [join(repoRoot, "apps/android/scripts/verify-api-36-emulator.mjs")],
      {
        encoding: "utf8",
        env: { ...process.env, CLIPP_ANDROID_ADB: adb },
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Android diagnostics are excluded from automatic backup and device transfer", () => {
  const manifest = readRepoFile("apps/android/android/app/src/main/AndroidManifest.xml");
  const legacyRules = readRepoFile("apps/android/android/app/src/main/res/xml/backup_rules.xml");
  const extractionRules = readRepoFile("apps/android/android/app/src/main/res/xml/data_extraction_rules.xml");

  expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
  expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  expect(legacyRules).toContain('<exclude domain="sharedpref" path="clipp_background_continuity_diagnostics.xml" />');
  expect(extractionRules).toMatch(/<cloud-backup>[\s\S]*<exclude domain="sharedpref" path="clipp_background_continuity_diagnostics\.xml" \/>[\s\S]*<\/cloud-backup>/);
  expect(extractionRules).toMatch(/<device-transfer>[\s\S]*<exclude domain="sharedpref" path="clipp_background_continuity_diagnostics\.xml" \/>[\s\S]*<\/device-transfer>/);
});

test("Android instrumentation preflight accepts an Android 16 target", () => {
  const result = runApi36Preflight(36);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("emulator-5554 (API 36)");
});

test("Android instrumentation preflight rejects targets below Android 16", () => {
  const result = runApi36Preflight(35);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("API 36 or later");
});

test("Android instrumentation preflight rejects a physical Android 16 device", () => {
  const result = runApi36Preflight(36, false);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("API 36 or later emulator");
});
