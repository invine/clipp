import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
const root = process.cwd();
const localVariables = new Set(
  spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" })
    .stdout.trim()
    .split("\n")
);
const baseEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !localVariables.has(name) && !/^GIT_CONFIG_(KEY|VALUE)_/.test(name)
  )
);
function candidateFixture(target = "com.clipp.app.acceptance") {
  const directory = mkdtempSync(path.join(tmpdir(), "clipp-android-build-"));
  const source = path.join(directory, "source");
  const bin = path.join(directory, "bin");
  mkdirSync(path.join(source, "apps/android/scripts"), { recursive: true });
  mkdirSync(path.join(source, "scripts"));
  mkdirSync(path.join(source, "apps/android/android"));
  mkdirSync(bin);
  for (const name of [
    "apps/android/scripts/build-acceptance-candidate.mjs",
    "apps/android/scripts/android-candidate-provenance.mjs",
    "scripts/source-identity.mjs",
  ])
    copyFileSync(path.join(root, name), path.join(source, name));
  writeFileSync(
    path.join(source, ".gitignore"),
    "node_modules\n**/app/build\n"
  );
  writeFileSync(path.join(source, "package-lock.json"), "{}");
  writeFileSync(path.join(source, "apps/android/package.json"), "{}");
  mkdirSync(path.join(source, "node_modules"));
  writeFileSync(path.join(source, "node_modules/.package-lock.json"), "{}");
  for (const name of [
    "android",
    "clipboard",
    "preferences",
    "local-notifications",
  ]) {
    const module = path.join(source, "node_modules/@capacitor", name);
    mkdirSync(module, { recursive: true });
    writeFileSync(
      path.join(module, "package.json"),
      JSON.stringify({ name: `@capacitor/${name}`, version: "7.0.0" })
    );
  }
  const script = (name: string, body: string) => {
    writeFileSync(name, "#!/bin/sh\n" + body);
    chmodSync(name, 0o755);
  };
  script(
    path.join(bin, "npm"),
    'if [ "$1" = "--version" ]; then echo 11.20.0; fi\n'
  );
  script(path.join(bin, "java"), "echo 'openjdk version \"21.0.13\"'\n");
  script(
    path.join(bin, "aapt2"),
    `case "$*" in version) echo AAPT2 ;; *xmltree*) echo 'A: android:targetPackage(0x01010021)="${target}"' ;; *androidTest.apk*) echo "package: name='com.clipp.app.acceptance.test'" ;; *) echo "package: name='com.clipp.app.acceptance'" ;; esac\n`
  );
  script(
    path.join(source, "apps/android/android/gradlew"),
    "mkdir -p app/build/outputs/apk/acceptance app/build/outputs/apk/androidTest/acceptance\nprintf app-bytes > app/build/outputs/apk/acceptance/app-acceptance.apk\nprintf test-bytes > app/build/outputs/apk/androidTest/acceptance/app-acceptance-androidTest.apk\n"
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
    const result = spawnSync("git", args, {
      cwd: source,
      env: { ...baseEnvironment, HUSKY: "0" },
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  const output = path.join(directory, "frozen");
  const invoke = (environment: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [
        path.join(
          source,
          "apps/android/scripts/build-acceptance-candidate.mjs"
        ),
        "--output",
        output,
      ],
      {
        cwd: source,
        encoding: "utf8",
        env: {
          ...baseEnvironment,
          ...environment,
          JAVA_HOME: "",
          PATH: bin + path.delimiter + process.env.PATH,
          CLIPP_ANDROID_AAPT2: path.join(bin, "aapt2"),
        },
        timeout: 15000,
      }
    );
  return { directory, source, output, invoke };
}
test("the maintained Android builder freezes a source-bound acceptance app/test APK pair", () => {
  const f = candidateFixture();
  try {
    const result = f.invoke();
    expect(result.status).toBe(0);
    const record = JSON.parse(
      readFileSync(
        path.join(f.output, "app-acceptance.apk.provenance.json"),
        "utf8"
      )
    );
    expect(record).toMatchObject({
      schemaVersion: 2,
      dirty: false,
      applicationId: "com.clipp.app.acceptance",
      testArtifact: {
        applicationId: "com.clipp.app.acceptance.test",
        targetPackage: "com.clipp.app.acceptance",
      },
    });
    expect(record.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.testArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      readFileSync(path.join(f.output, record.testArtifact.file), "utf8")
    ).toBe("test-bytes");
    expect(f.invoke().status).toBe(1);
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
test("a test APK targeting the normal app is rejected before frozen publication", () => {
  const f = candidateFixture("com.clipp.app");
  try {
    const result = f.invoke();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "candidate_instrumentation_target_mismatch"
    );
    expect(existsSync(f.output)).toBe(false);
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test("ambient development renderer URLs are refused before building a frozen APK", () => {
  const f = candidateFixture();
  try {
    const result = f.invoke({ VITE_DEV_SERVER_URL: "http://127.0.0.1:4173" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("development_server_override_refused");
    expect(
      existsSync(path.join(f.source, "apps/android/android/app/build"))
    ).toBe(false);
    expect(existsSync(f.output)).toBe(false);
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
