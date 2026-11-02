// JDK-only SOURCE fixture. Never calls Gradle/SDK/ADB/Android or native UI.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { sources } from "../../../tests/harness/android-host-task-input-native/platform-stubs.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(root, "package.json"));
const capacitor = dirname(require.resolve("@capacitor/android/package.json"));
const actual = [
  join(
    root,
    "apps/android/android/app/src/main/java/com/clipp/app/HostTaskInputPlugin.java"
  ),
  ...["PluginCall", "JSObject"].map((name) =>
    join(capacitor, `capacitor/src/main/java/com/getcapacitor/${name}.java`)
  ),
];
const javaHome = process.env.CLIPP_SOURCE_JAVA_HOME ?? process.env.JAVA_HOME;
const command = (name) => (javaHome ? join(javaHome, "bin", name) : name);
const run = (name, args) => {
  const result = spawnSync(command(name), args, {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0)
    throw new Error(
      result.stderr ||
        result.stdout ||
        result.error?.message ||
        `${name} failed`
    );
  return result;
};
const directory = mkdtempSync(join(tmpdir(), "clipp-host-task-input-source-"));
try {
  const stubFiles = Object.entries(sources).map(([name, source]) => {
    const file = join(directory, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
    return file;
  });
  console.log(
    JSON.stringify({
      scope:
        "SOURCE_ONLY_ACTUAL_JAVA_AND_CAPACITOR_INTEGER_CONTAINER_NO_JSON_PARSER_OR_NATIVE_UI",
      capacitorVersion: require("@capacitor/android/package.json").version,
      sources: Object.fromEntries(
        actual.map((file) => [
          file,
          createHash("sha256").update(readFileSync(file)).digest("hex"),
        ])
      ),
      externalStubs: Object.keys(sources),
      javac: run("javac", ["-version"]).stdout.trim(),
    })
  );
  const classes = join(directory, "classes");
  mkdirSync(classes);
  run("javac", [
    "-encoding",
    "UTF-8",
    "-d",
    classes,
    ...stubFiles,
    ...actual,
    join(
      root,
      "tests/harness/android-host-task-input-native/HostTaskInputBoundary.java"
    ),
  ]);
  process.stdout.write(
    run("java", ["-cp", classes, "com.clipp.app.HostTaskInputBoundary"]).stdout
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
