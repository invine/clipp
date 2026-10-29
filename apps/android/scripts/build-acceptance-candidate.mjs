/** Build and freeze the isolated acceptance APK pair; never installs a device. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  realpath,
  copyFile,
  chmod,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { sourceIdentity } from "./android-candidate-provenance.mjs";

assert(!process.env.VITE_DEV_SERVER_URL, "development_server_override_refused");

const root = await realpath(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
);
const android = path.join(root, "apps/android");
const { values } = parseArgs({ options: { output: { type: "string" } } });
assert(
  values.output && path.isAbsolute(values.output),
  "absolute_frozen_output_required"
);
const parent = await realpath(path.dirname(values.output));
const destination = path.join(parent, path.basename(values.output));
assert(
  path.relative(root, destination).startsWith(`..${path.sep}`),
  "frozen_output_outside_checkout_required"
);
try {
  await realpath(destination);
  throw new Error("frozen_output_must_be_new");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: capture ? "pipe" : "inherit",
  });
  assert(
    !result.error && result.status === 0,
    `candidate_build_command_failed: ${command}`
  );
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}
const identity = await sourceIdentity(root);
assert(!identity.dirty, "committed_isolated_candidate_required");
const require = createRequire(path.join(android, "package.json"));
for (const name of [
  "@capacitor/android",
  "@capacitor/clipboard",
  "@capacitor/preferences",
  "@capacitor/local-notifications",
]) {
  const resolved = await realpath(require.resolve(`${name}/package.json`));
  assert(
    path.relative(root, resolved).startsWith(`node_modules${path.sep}`) ||
      path
        .relative(root, resolved)
        .startsWith(`apps${path.sep}android${path.sep}node_modules${path.sep}`),
    "candidate_dependency_outside_checkout"
  );
}
const java = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin/java")
  : "java";
const javaVersion = run(java, ["-version"], root, true);
assert(/version "21[."]/i.test(javaVersion), "jdk_21_required");
const aapt = process.env.CLIPP_ANDROID_AAPT2 || "aapt2";
const toolchain = {
  node: process.version,
  npm: run("npm", ["--version"], root, true),
  java: javaVersion,
  aapt2: run(aapt, ["version"], root, true),
};
run("npm", ["run", "build"], android);
run("npm", ["run", "cap:sync"], android);
run(
  "./gradlew",
  [
    "-I",
    "../scripts/native-acceptance.init.gradle",
    "-PclippAcceptance",
    ":app:assembleAcceptance",
    ":app:assembleAcceptanceAndroidTest",
  ],
  path.join(android, "android")
);
assert.deepEqual(
  await sourceIdentity(root),
  identity,
  "candidate_source_changed_during_build"
);
const app = path.join(
  android,
  "android/app/build/outputs/apk/acceptance/app-acceptance.apk"
);
const test = path.join(
  android,
  "android/app/build/outputs/apk/androidTest/acceptance/app-acceptance-androidTest.apk"
);
const packageOf = (apk) =>
  run(aapt, ["dump", "badging", apk], root, true).match(
    /package: name='([^']+)'/
  )?.[1];
assert.equal(
  packageOf(app),
  "com.clipp.app.acceptance",
  "candidate_package_mismatch"
);
assert.equal(
  packageOf(test),
  "com.clipp.app.acceptance.test",
  "candidate_test_package_mismatch"
);
const target = run(
  aapt,
  ["dump", "xmltree", "--file", "AndroidManifest.xml", test],
  root,
  true
).match(/android:targetPackage(?:\([^)]*\))?\s*=\s*"([^"]+)"/)?.[1];
assert.equal(
  target,
  "com.clipp.app.acceptance",
  "candidate_instrumentation_target_mismatch"
);
const hash = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const appHash = await hash(app),
  testHash = await hash(test);
await mkdir(destination, { mode: 0o700 });
for (const file of [app, test]) {
  const output = path.join(destination, path.basename(file));
  await copyFile(file, output);
  await chmod(output, 0o600);
  assert.equal(
    await hash(output),
    file === app ? appHash : testHash,
    "candidate_changed_during_freeze"
  );
}
const provenance = {
  schemaVersion: 2,
  ...identity,
  source: { checkout: root },
  artifact: path.basename(app),
  artifactSha256: appHash,
  applicationId: "com.clipp.app.acceptance",
  testArtifact: {
    file: path.basename(test),
    sha256: testHash,
    applicationId: "com.clipp.app.acceptance.test",
    targetPackage: target,
  },
  toolchain,
  lockfileSha256: await hash(path.join(root, "package-lock.json")),
  installationSha256: await hash(
    path.join(root, "node_modules/.package-lock.json")
  ),
  builtAt: new Date().toISOString(),
};
await writeFile(
  path.join(destination, "app-acceptance.apk.provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
  { mode: 0o600, flag: "wx" }
);
console.log(JSON.stringify(provenance, null, 2));
