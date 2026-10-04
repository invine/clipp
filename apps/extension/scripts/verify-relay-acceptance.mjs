import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: directory,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const transport of ["wss", "webrtc-direct"]) {
  run("npm", ["run", "build:relay-acceptance"], {
    ...process.env,
    CLIPP_RELAY_ACCEPTANCE_TRANSPORT: transport,
  });
  const env = { ...process.env, CLIPP_EXTENSION_FIXTURE_TRANSPORT: transport };
  run(process.execPath, ["scripts/verify-managed-relay-mv3.mjs"], env);
  run(process.execPath, ["scripts/verify-offscreen-storage.mjs"], env);
}
console.log(
  "Disposable Chrome fixtures passed for both transport selections. Google authorization, live relay transfer and credential-bearing worker suspension were not run."
);
