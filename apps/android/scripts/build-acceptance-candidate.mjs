import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceIdentity } from "./android-candidate-provenance.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const android = path.join(root, "apps/android");
function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

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

const apk = path.join(
  android,
  "android/app/build/outputs/apk/acceptance/app-acceptance.apk"
);
const identity = await sourceIdentity(root);
const artifactSha256 = createHash("sha256")
  .update(await readFile(apk))
  .digest("hex");
const provenance = {
  schemaVersion: 1,
  ...identity,
  artifact: path.basename(apk),
  artifactSha256,
  applicationId: "com.clipp.app.acceptance",
  builtAt: new Date().toISOString(),
};
await writeFile(
  `${apk}.provenance.json`,
  `${JSON.stringify(provenance, null, 2)}\n`,
  { mode: 0o600 }
);
console.log(JSON.stringify(provenance, null, 2));
