// Public CLI checks using inert metadata/receipts only. No ADB, CDP, app or guest.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

assert.ok(process.argv[2], "retained check output directory required");
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const cli = fileURLToPath(
  new URL("./android-scanner-native.mjs", import.meta.url)
);
const results = [];
function invoke(args) {
  try {
    return {
      exit: 0,
      stdout: execFileSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      }),
    };
  } catch (error) {
    return {
      exit: error.status,
      stdout: String(error.stdout),
      stderr: String(error.stderr),
    };
  }
}
async function fixture(name, changes = {}) {
  const path = join(out, `ticket-14-inert-${name}-root.json`);
  const value = {
    status: "ACTIVE",
    assignedBy: "root",
    ticket: 14,
    interval: "inert-metadata-only",
    exclusive: true,
    camera: false,
    packageId: "com.clipp.app.acceptance",
    sourceRevision: "0".repeat(40),
    dirtyStateSha256: "0".repeat(64),
    apkSha256: "0".repeat(64),
    expectedProvider: "com.android.webview, 124.0.6367.219",
    validFrom: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    trials: ["detect", "probe"],
    serial: "emulator-5554",
    adb: "/inert-metadata-must-never-invoke-adb",
    authoritativeAssignmentPath: path,
    ...changes,
  };
  await writeFile(path, JSON.stringify(value));
  return { path, value };
}
async function snapshot(name, root) {
  const path = join(out, `ticket-14-inert-${name}-child.json`);
  const value = {
    ...root.value,
    trials: ["detect"],
    expectedPid: "100",
    authoritativeAssignmentSha256: createHash("sha256")
      .update(await readFile(root.path))
      .digest("hex"),
  };
  await writeFile(path, JSON.stringify(value));
  return path;
}
async function check(name, changes, valid) {
  const root = await fixture(name, changes);
  const outcome = invoke(["--preflight", root.path, "detect"]);
  assert.equal(outcome.exit === 0, valid, name);
  results.push({ name, result: "passed", outcome });
}
await check("active", {}, true);
await check("draft", { status: "DRAFT" }, false);
await check("closed", { status: "CLOSED" }, false);
await check(
  "future",
  { validFrom: new Date(Date.now() + 60000).toISOString() },
  false
);
await check(
  "expired",
  { expiresAt: new Date(Date.now() - 1).toISOString() },
  false
);
await check("non-root", { assignedBy: "other" }, false);
await check("camera-enabled", { camera: true }, false);
await check("unassigned-trial", { trials: ["probe"] }, false);

const root = await fixture("snapshot-active");
const child = await snapshot("snapshot-active", root);
assert.equal(invoke(["--preflight", child, "detect"]).exit, 0);
results.push({
  name: "wrapper snapshot preserves authoritative scope",
  result: "passed",
});
await writeFile(root.path, JSON.stringify({ ...root.value, status: "CLOSED" }));
assert.notEqual(invoke(["--preflight", child, "detect"]).exit, 0);
results.push({
  name: "closed authoritative root rejects still-active child snapshot",
  result: "passed",
});

const liveRoot = await fixture("revoked-during-preflight");
const liveChild = await snapshot("revoked-during-preflight", liveRoot);
const childProcess = spawn(
  process.execPath,
  [cli, "--preflight", liveChild, "detect", "--watch-ms", "1000"],
  { stdio: ["ignore", "pipe", "pipe"] }
);
let stdout = "",
  stderr = "",
  revoked = false;
childProcess.stdout.on("data", (bytes) => {
  stdout += bytes;
  if (!revoked && stdout.includes('"valid":true')) {
    revoked = true;
    writeFileSync(
      liveRoot.path,
      JSON.stringify({ ...liveRoot.value, status: "CLOSED" })
    );
  }
});
childProcess.stderr.on("data", (bytes) => {
  stderr += bytes;
});
const exit = await new Promise((done, reject) => {
  const timer = setTimeout(() => {
    childProcess.kill("SIGTERM");
    reject(new Error("inert_preflight_timeout"));
  }, 5000);
  childProcess.once("error", reject);
  childProcess.once("exit", (code) => {
    clearTimeout(timer);
    done(code);
  });
});
assert.equal(revoked, true);
assert.notEqual(exit, 0);
results.push({
  name: "authoritative revocation after initial validation rejects subsequent operation guard",
  result: "passed",
  outcome: { exit, stdout, stderr },
});

const receipt = join(out, "ticket-14-inert-verification-failed.json");
await writeFile(
  receipt,
  JSON.stringify({
    trial: "detect",
    result: "verification-failed",
    error: "inert assertion: decodedExpected false",
    triggerInvokedAt: new Date().toISOString(),
    pidBefore: "100",
    pidAfter: "100",
    fatal: [],
    events: [{ stage: "detect-after", decodedExpected: false }],
  })
);
const replay = join(out, "ticket-14-inert-verification-failed-replay.json");
assert.equal(invoke(["--replay", receipt, replay]).exit, 0);
assert.equal(
  JSON.parse(await readFile(replay, "utf8")).result,
  "verification-failed"
);
results.push({
  name: "explicit failed decode stays verification-failed through offline public CLI",
  result: "passed",
});
await writeFile(
  join(out, "ticket-14-public-cli-checks.json"),
  JSON.stringify(results, null, 2)
);
console.log(
  `PASS ${results.length} inert public CLI cases; no native or camera operation`
);
