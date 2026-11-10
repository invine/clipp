import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cli = path.resolve("scripts/delivery.mjs");
function command(bin, args, cwd, env = {}) {
  return spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HUSKY: "0", ...env },
    timeout: 90_000,
  });
}
function checked(bin, args, cwd) {
  const result = command(bin, args, cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function fixture(t) {
  const base = mkdtempSync(path.join(tmpdir(), "clipp-delivery-run-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, "repo");
  const store = path.join(base, "store");
  mkdirSync(repo);
  checked("git", ["init", "-b", "main"], repo);
  checked("git", ["config", "user.name", "Fixture"], repo);
  checked("git", ["config", "user.email", "fixture@example.invalid"], repo);
  for (const app of ["electron", "android", "extension"]) {
    mkdirSync(path.join(repo, "apps", app), { recursive: true });
    writeFileSync(
      path.join(repo, "apps", app, "package.json"),
      JSON.stringify({
        version: "1.2.3",
        scripts: { build: `node ../../build.cjs ${app}` },
      })
    );
  }
  writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({
      private: true,
      workspaces: ["apps/*", "packages/*"],
      scripts: {
        lint: "node check.cjs lint",
        typecheck: "node check.cjs typecheck",
        test: "node check.cjs jest",
        "check:candidate": "node check.cjs candidate-tooling",
        "check:delivery": "node check.cjs delivery-tooling",
        "test:ui-behavior": "node ui.cjs",
      },
    })
  );
  writeFileSync(
    path.join(repo, "check.cjs"),
    "const fs=require('node:fs'); const name=process.argv[2]; fs.appendFileSync('checks.txt',name+'\\n'); if(name==='lint' && process.env.CLIPP_VERIFY_DELAY_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Number(process.env.CLIPP_VERIFY_DELAY_MS)); if((name==='lint' && process.env.CLIPP_FAIL_VERIFY)||name===process.env.CLIPP_FAIL_CHECK) process.exit(5); if(process.env.CLIPP_GENERATE_KNOWN_OUTPUTS&&name==='jest'){fs.mkdirSync('.local/startup-replay-11111111-1111-4111-8111-111111111111',{recursive:true});fs.writeFileSync('.local/startup-replay-11111111-1111-4111-8111-111111111111/receipt.json','{}');} if(process.env.CLIPP_GENERATE_UNEXPECTED_OUTPUT&&name==='jest'){fs.mkdirSync('.local/startup-replay-not-a-uuid',{recursive:true});fs.writeFileSync('.local/startup-replay-not-a-uuid/receipt.json','{}');} if(name!==process.env.CLIPP_EMPTY_CHECK){if(name==='jest') console.log('Tests: 3 passed, 3 total'); if(name.endsWith('tooling')) console.log('ℹ tests 3\\nℹ pass 3\\nℹ fail 0\\nℹ cancelled 0\\nℹ skipped 0');}"
  );
  writeFileSync(
    path.join(repo, "build.cjs"),
    "const fs=require('node:fs'); const path=require('node:path'); const app=process.argv[2]; const dist=path.join(__dirname,'apps',app,'dist'); fs.mkdirSync(dist,{recursive:true}); fs.writeFileSync(path.join(dist,'build.txt'),'verified'); fs.appendFileSync(path.join(__dirname,'checks.txt'),app+'-build\\n');"
  );
  writeFileSync(
    path.join(repo, "ui.cjs"),
    "const fs=require('node:fs'); fs.appendFileSync('checks.txt','ui\\n'); if(process.env.CLIPP_GENERATE_KNOWN_OUTPUTS){fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/.last-run.json','{}');} if(process.env.CLIPP_FAIL_UI){fs.mkdirSync('test-results/example',{recursive:true});fs.writeFileSync('test-results/example/error-context.md','fixture failure');process.exit(5);} console.log('1 passed');"
  );
  writeFileSync(
    path.join(repo, ".gitignore"),
    "node_modules/\napps/*/dist/\nchecks.txt\n"
  );
  checked(
    "npm",
    [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    repo
  );
  checked("git", ["add", "."], repo);
  checked("git", ["commit", "-m", "fixture"], repo);
  const revision = checked("git", ["rev-parse", "HEAD"], repo);
  const config = path.join(base, "config.json");
  writeFileSync(
    config,
    JSON.stringify({ schema: 1, runRoot: store, destinations: {} })
  );
  const planned = command(
    process.execPath,
    [
      cli,
      "plan",
      "--repo",
      repo,
      "--config",
      config,
      "--source",
      revision,
      "--target",
      "electron-package",
      "--json",
    ],
    repo
  );
  assert.equal(planned.status, 0, planned.stdout);
  return {
    base,
    repo,
    store,
    config,
    revision,
    plan: JSON.parse(planned.stdout),
  };
}
function delivery(args, cwd) {
  return command(process.execPath, [cli, ...args, "--json"], cwd);
}

test("public Android local run and status retain uncertain install outcome", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: { androidDeviceSerial: "emulator-5556" },
      signing: { androidLocal: "debug" },
    })
  );
  const planned = command(
    process.execPath,
    [
      cli,
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "android-local",
      "--json",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  // The CLI and durable run stay real; only device-facing adapters are controlled.
  const modules = {
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification = {state:"passed",pair:{appSha256:"a",testSha256:"b"}}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid({run,save}) { run.stages.androidPackage.state = "passed"; save(); }`,
    "./android-local.mjs": `export async function installAndroidLocal({run,save}) { run.stages.androidLocal.pending = {kind:"install",number:1}; run.stages.androidLocal.attempts.push({number:1,kind:"install",state:"uncertain"}); run.stages.androidLocal.state = "uncertain"; save(); throw new Error("Selected device disconnected during install"); }`,
  };
  const loader = path.join(f.base, "android-local-loader.mjs");
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules = ${JSON.stringify(urls)}; export async function resolve(specifier, context, nextResolve) { if (context.parentURL?.endsWith('/delivery/run.mjs') && modules[specifier]) return {url: modules[specifier], shortCircuit: true}; return nextResolve(specifier, context); }`
  );
  const run = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(run.status, 1, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.code, "android_install_uncertain");
  assert.equal(result.run.targets["android-local"].state, "uncertain");
  assert.equal(result.run.stages.androidLocal.state, "uncertain");
  assert.equal(result.run.stages.androidLocal.pending.kind, "install");
  const record = path.join(f.store, "runs", plan.plan.id, "run.json");
  const beforeStatus = readFileSync(record, "utf8");
  const status = delivery(
    ["status", plan.plan.id, "--config", f.config],
    f.repo
  );
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.equal(
    JSON.parse(status.stdout).run.stages.androidLocal.state,
    "uncertain"
  );
  assert.equal(readFileSync(record, "utf8"), beforeStatus);
});

test("public run and status retain uncertain Play commit outcome", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: {
        playApplicationId: "com.clipp.app",
        playTrack: "internal",
      },
    })
  );
  const planned = command(
    process.execPath,
    [
      cli,
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "android-internal",
      "--json",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  // Keep the public CLI, common gates, run persistence, and error mapping real.
  // Replace only platform adapters so this test cannot contact Play or emulators.
  const modules = {
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification = {state:"passed",pair:{appSha256:"a",testSha256:"b"}}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid({run,save}) { run.stages.androidPackage.state = "passed"; save(); }`,
    "./android-internal.mjs": `export async function publishInternal({run,save}) { run.stages.androidInternal.pending = {kind:"commit",number:1}; run.stages.androidInternal.attempts.push({number:1,kind:"commit",state:"uncertain"}); run.stages.androidInternal.state = "uncertain"; save(); throw new Error("Play commit readback unavailable"); }`,
  };
  const loader = path.join(f.base, "play-loader.mjs");
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules = ${JSON.stringify(urls)}; export async function resolve(specifier, context, nextResolve) { if (context.parentURL?.endsWith('/delivery/run.mjs') && modules[specifier]) return {url: modules[specifier], shortCircuit: true}; return nextResolve(specifier, context); }`
  );
  const run = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(run.status, 1, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.code, "play_response_uncertain");
  assert.equal(result.run.targets["android-internal"].state, "uncertain");
  assert.equal(result.run.stages.androidInternal.state, "uncertain");
  assert.equal(
    result.run.stages.androidInternal.detail.code,
    "play_response_uncertain"
  );
  assert.equal(result.run.stages.androidInternal.pending.kind, "commit");
  const record = path.join(f.store, "runs", plan.plan.id, "run.json");
  const beforeStatus = readFileSync(record, "utf8");
  const status = delivery(
    ["status", plan.plan.id, "--config", f.config],
    f.repo
  );
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.equal(
    JSON.parse(status.stdout).run.stages.androidInternal.state,
    "uncertain"
  );
  assert.equal(readFileSync(record, "utf8"), beforeStatus);
});

test("run prepares the frozen commit and records common checks without touching the caller checkout", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.repo, "caller.txt"), "keep me");
  const first = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(first.status, 0, first.stdout);
  const result = JSON.parse(first.stdout);
  assert.equal(result.code, "delivery_incomplete");
  assert.equal(result.run.source.commit, f.revision);
  assert.equal(result.run.stages.prepare.state, "passed");
  assert.equal(result.run.stages.commonVerify.state, "passed");
  assert.deepEqual(
    result.run.stages.commonVerify.attempts.map((attempt) => attempt.checkId),
    [
      "lint",
      "typecheck",
      "jest",
      "candidate-tooling",
      "delivery-tooling",
      "electron-build",
      "android-web-build",
      "chrome-build",
      "ui-behavior",
    ]
  );
  assert.equal(
    readFileSync(path.join(f.repo, "caller.txt"), "utf8"),
    "keep me"
  );
  assert.equal(checked("git", ["rev-parse", "HEAD"], f.repo), f.revision);
  const checkout = result.run.checkout;
  assert.notEqual(checkout, f.repo);
  assert.equal(
    readFileSync(path.join(checkout, "checks.txt"), "utf8"),
    "lint\ntypecheck\njest\ncandidate-tooling\ndelivery-tooling\nelectron-build\nandroid-build\nextension-build\nui\n"
  );
  const receipt = path.join(f.store, "runs", f.plan.plan.id, "run.json");
  const before = readFileSync(receipt, "utf8");
  const status = delivery(
    ["status", f.plan.plan.id, "--config", f.config],
    f.repo
  );
  assert.equal(status.status, 0, status.stdout);
  assert.equal(
    JSON.parse(status.stdout).run.stages.commonVerify.state,
    "passed"
  );
  assert.equal(readFileSync(receipt, "utf8"), before);
  const replay = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(replay.status, 0);
  assert.equal(
    readFileSync(path.join(checkout, "checks.txt"), "utf8"),
    "lint\ntypecheck\njest\ncandidate-tooling\ndelivery-tooling\nelectron-build\nandroid-build\nextension-build\nui\n"
  );
});

test("Electron packaging reports a target-local prerequisite when the candidate has no native package config", (t) => {
  const f = fixture(t);
  const result = delivery(["run", f.plan.path], f.repo);
  const report = JSON.parse(result.stdout);
  assert.equal(report.run.stages.commonVerify.state, "passed");
  assert.equal(report.run.targets["electron-package"].state, "blocked");
  assert.match(
    report.run.targets["electron-package"].nextAction,
    /Native Electron dependency inventory is unavailable/i
  );
});

test("Electron local prepares its package dependency without selecting a package target", (t) => {
  const f = fixture(t);
  const destination = path.join(f.base, "Applications", "Clipp.app");
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: { electronInstallPath: destination },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "electron-local",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const result = delivery(["run", plan.path], f.repo);
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.run.stages.commonVerify.state, "passed");
  assert.deepEqual(Object.keys(report.run.targets), ["electron-local"]);
  assert.equal(report.run.targets["electron-local"].state, "blocked");
  assert.match(
    report.run.targets["electron-local"].nextAction,
    /native Electron dependency inventory/i
  );
});

test("changed installed dependency inventory blocks replay instead of reusing a pass", (t) => {
  const f = fixture(t);
  const first = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(first.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const checkout = JSON.parse(first.stdout).run.checkout;
  const installed = path.join(checkout, "node_modules", ".package-lock.json");
  writeFileSync(installed, readFileSync(installed, "utf8") + "tamper");
  const replay = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(replay.status, 0);
  assert.equal(
    JSON.parse(replay.stdout).code,
    "candidate_installation_changed"
  );
  assert.equal(
    readFileSync(path.join(checkout, "checks.txt"), "utf8"),
    "lint\ntypecheck\njest\ncandidate-tooling\ndelivery-tooling\nelectron-build\nandroid-build\nextension-build\nui\n"
  );
});

test("failed local verification preserves its attempt and resumes the same candidate", (t) => {
  const f = fixture(t);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    { CLIPP_FAIL_VERIFY: "1" }
  );
  assert.notEqual(first.status, 0);
  const failed = JSON.parse(first.stdout);
  assert.equal(failed.code, "required_check_failed");
  assert.equal(failed.run.stages.prepare.state, "passed");
  assert.equal(failed.run.stages.commonVerify.state, "failed");
  assert.equal(failed.run.stages.commonVerify.attempts.length, 1);
  const second = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(second.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const checkout = JSON.parse(first.stdout).run.checkout;
  assert.equal(
    readFileSync(path.join(checkout, "checks.txt"), "utf8"),
    "lint\nlint\ntypecheck\njest\ncandidate-tooling\ndelivery-tooling\nelectron-build\nandroid-build\nextension-build\nui\n"
  );
  assert.equal(
    JSON.parse(second.stdout).run.stages.commonVerify.attempts.length,
    10
  );
});

test("resume reuses passing checks before a later failed gate", (t) => {
  const f = fixture(t);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    { CLIPP_FAIL_CHECK: "candidate-tooling" }
  );
  assert.equal(JSON.parse(first.stdout).code, "required_check_failed");
  const resumed = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(resumed.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const checks = readFileSync(
    path.join(JSON.parse(resumed.stdout).run.checkout, "checks.txt"),
    "utf8"
  )
    .trim()
    .split("\n");
  assert.deepEqual(checks.slice(0, 5), [
    "lint",
    "typecheck",
    "jest",
    "candidate-tooling",
    "candidate-tooling",
  ]);
  assert.equal(checks.filter((check) => check === "lint").length, 1);
  assert.equal(
    checks.filter((check) => check === "candidate-tooling").length,
    2
  );
});

test("a zero-case required test gate cannot pass verification", (t) => {
  const f = fixture(t);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    { CLIPP_EMPTY_CHECK: "candidate-tooling" }
  );
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).code, "required_check_empty");
  assert.equal(
    JSON.parse(result.stdout).run.stages.commonVerify.state,
    "failed"
  );
});

test("run uses the frozen remote commit after main advances", (t) => {
  const f = fixture(t);
  const remote = path.join(f.base, "remote.git");
  checked("git", ["init", "--bare", remote], f.base);
  checked("git", ["remote", "add", "origin", remote], f.repo);
  checked("git", ["push", "-u", "origin", "main"], f.repo);
  const planned = command(
    process.execPath,
    [
      cli,
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      "origin/main",
      "--target",
      "electron-package",
      "--json",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stdout);
  const saved = JSON.parse(planned.stdout);
  writeFileSync(path.join(f.repo, "later.txt"), "not selected");
  checked("git", ["add", "later.txt"], f.repo);
  checked("git", ["commit", "-m", "later"], f.repo);
  checked("git", ["push", "origin", "main"], f.repo);
  const result = delivery(["run", saved.path], f.repo);
  assert.equal(JSON.parse(result.stdout).run.source.commit, f.revision);
  assert.equal(
    existsSync(path.join(JSON.parse(result.stdout).run.checkout, "later.txt")),
    false
  );
});

test("corrupt run records and changed built artifacts block replay", (t) => {
  const f = fixture(t);
  const first = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(first.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const output = path.join(
    JSON.parse(first.stdout).run.checkout,
    "apps",
    "electron",
    "dist",
    "build.txt"
  );
  writeFileSync(output, "changed");
  const changed = delivery(["run", f.plan.path], f.repo);
  assert.equal(JSON.parse(changed.stdout).code, "candidate_artifact_changed");
  const record = path.join(f.store, "runs", f.plan.plan.id, "run.json");
  writeFileSync(record, "broken JSON");
  const invalid = delivery(
    ["status", f.plan.plan.id, "--config", f.config],
    f.repo
  );
  assert.notEqual(invalid.status, 0);
  assert.equal(JSON.parse(invalid.stdout).code, "run_unavailable");
});

test("a missing passed-check log blocks reuse", (t) => {
  const f = fixture(t);
  const first = delivery(["run", f.plan.path], f.repo);
  const run = JSON.parse(first.stdout).run;
  assert.equal(run.stages.commonVerify.state, "passed");
  const log = path.join(
    f.store,
    "runs",
    f.plan.plan.id,
    run.stages.commonVerify.attempts[0].log
  );
  rmSync(log);
  const replay = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(replay.status, 0);
  assert.equal(JSON.parse(replay.stdout).code, "candidate_evidence_changed");
});

test("an edited run record cannot redirect replay into the caller checkout", (t) => {
  const f = fixture(t);
  const first = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(first.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const record = path.join(f.store, "runs", f.plan.plan.id, "run.json");
  const run = JSON.parse(readFileSync(record, "utf8"));
  run.checkout = f.repo;
  writeFileSync(record, JSON.stringify(run));
  const replay = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(replay.status, 0);
  assert.equal(JSON.parse(replay.stdout).code, "invalid_run");
  const { integritySha256: _oldDigest, ...body } = run;
  run.integritySha256 = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  writeFileSync(record, JSON.stringify(run));
  const redirected = delivery(["run", f.plan.path], f.repo);
  assert.equal(JSON.parse(redirected.stdout).code, "invalid_run");
  assert.equal(existsSync(path.join(f.repo, "checks.txt")), false);
});

test("an unwritable run store blocks before candidate preparation", (t) => {
  const f = fixture(t);
  chmodSync(f.store, 0o500);
  let result;
  try {
    result = delivery(["run", f.plan.path], f.repo);
  } finally {
    chmodSync(f.store, 0o700);
  }
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).code, "prerequisite_unavailable");
  assert.equal(existsSync(path.join(f.store, "runs", f.plan.plan.id)), false);
});

test("known test-output directories do not masquerade as source edits", (t) => {
  const f = fixture(t);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    {
      CLIPP_GENERATE_KNOWN_OUTPUTS: "1",
    }
  );
  assert.equal(JSON.parse(result.stdout).code, "delivery_incomplete");
  assert.equal(
    JSON.parse(result.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const replay = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(replay.stdout).run.stages.commonVerify.state,
    "passed"
  );
});

test("unexpected files under a generated-output prefix still fail source validation", (t) => {
  const f = fixture(t);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    {
      CLIPP_GENERATE_UNEXPECTED_OUTPUT: "1",
    }
  );
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).code, "candidate_artifact_invalid");
});

test("a failed UI gate retains its diagnostics and can resume without replaying earlier checks", (t) => {
  const f = fixture(t);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    {
      CLIPP_FAIL_UI: "1",
    }
  );
  assert.equal(JSON.parse(first.stdout).code, "required_check_failed");
  const resumed = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(resumed.stdout).run.stages.commonVerify.state,
    "passed"
  );
  const run = JSON.parse(resumed.stdout).run;
  assert.equal(
    run.stages.commonVerify.attempts.filter(
      (attempt) => attempt.checkId === "jest"
    ).length,
    1
  );
  assert.ok(
    run.uiFailureDiagnostics?.some((file) =>
      file.path.endsWith("error-context.md")
    )
  );
  assert.ok(
    existsSync(
      path.join(
        f.store,
        "runs",
        f.plan.plan.id,
        run.uiFailureDiagnostics[0].copy
      )
    )
  );
  writeFileSync(
    path.join(
      f.store,
      "runs",
      f.plan.plan.id,
      run.uiFailureDiagnostics[0].copy
    ),
    "tampered diagnostic"
  );
  const replay = delivery(["run", f.plan.path], f.repo);
  assert.equal(JSON.parse(replay.stdout).code, "candidate_evidence_changed");
});

test("a second process cannot run the same plan while the first owns it", async (t) => {
  const f = fixture(t);
  const child = spawn(process.execPath, [cli, "run", f.plan.path, "--json"], {
    cwd: f.repo,
    env: { ...process.env, HUSKY: "0", CLIPP_VERIFY_DELAY_MS: "1600" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childOutput = "";
  child.stdout.on("data", (part) => {
    childOutput += part;
  });
  const runRecord = path.join(f.store, "runs", f.plan.plan.id, "run.json");
  const deadline = Date.now() + 5000;
  while (
    (!existsSync(runRecord) ||
      JSON.parse(readFileSync(runRecord, "utf8")).stages.commonVerify.state !==
        "running") &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(existsSync(runRecord), "first run did not start");
  const competing = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(competing.status, 0);
  assert.equal(JSON.parse(competing.stdout).code, "resource_owned");
  await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(JSON.parse(childOutput).run.stages.commonVerify.state, "passed");
});

test("an edited saved plan cannot select new inputs before first execution", (t) => {
  const f = fixture(t);
  const plan = JSON.parse(readFileSync(f.plan.path, "utf8"));
  plan.targets = { "chrome-local": plan.targets["electron-package"] };
  writeFileSync(f.plan.path, JSON.stringify(plan));
  const result = delivery(["run", f.plan.path], f.repo);
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).code, "plan_changed");
  assert.equal(existsSync(path.join(f.store, "runs", f.plan.plan.id)), false);
});

test("interrupted owner waits for its running command before resuming and retains its attempt", async (t) => {
  const f = fixture(t);
  const child = spawn(process.execPath, [cli, "run", f.plan.path, "--json"], {
    cwd: f.repo,
    env: { ...process.env, HUSKY: "0", CLIPP_VERIFY_DELAY_MS: "1800" },
    stdio: "ignore",
  });
  const record = path.join(f.store, "runs", f.plan.plan.id, "run.json");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (existsSync(record)) {
      const run = JSON.parse(readFileSync(record, "utf8"));
      if (
        run.stages.commonVerify.state === "running" &&
        run.stages.commonVerify.attempts.at(-1)?.pid
      )
        break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(
    JSON.parse(readFileSync(record, "utf8")).stages.commonVerify.state,
    "running"
  );
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
  const uncertain = delivery(["run", f.plan.path], f.repo);
  assert.equal(JSON.parse(uncertain.stdout).code, "ownership_uncertain");
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const resumed = delivery(["run", f.plan.path], f.repo);
  assert.equal(
    JSON.parse(resumed.stdout).run.stages.commonVerify.state,
    "passed"
  );
  assert.equal(
    JSON.parse(resumed.stdout).run.stages.commonVerify.attempts[0].state,
    "interrupted"
  );
});

test("mixed run reports independent completion and every remaining target action", (t) => {
  const f = fixture(t);
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "electron-package",
      "--target",
      "android-package",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const loader = path.join(f.base, "mixed-loader.mjs");
  const modules = {
    "./electron.mjs": `export const electronNativeInventory=()=>({}); export const inspectElectronConfig=()=>({}); export async function packageElectron({run,save}) { run.targets["electron-package"]={state:"complete",nextAction:null}; run.stages.electronPackage.state="passed"; save(); }`,
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification={state:"blocked",nextAction:"connect owned acceptance emulator"}; run.targets["android-package"]={state:"blocked",nextAction:"connect owned acceptance emulator"}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid() { throw Error("blocked dependency must not package"); }`,
  };
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules=${JSON.stringify(urls)}; export async function resolve(specifier,context,nextResolve){if(context.parentURL?.endsWith('/delivery/run.mjs')&&modules[specifier])return {url:modules[specifier],shortCircuit:true};return nextResolve(specifier,context);}`
  );
  const first = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(first.status, 1, first.stderr || first.stdout);
  const result = JSON.parse(first.stdout);
  assert.equal(result.code, "delivery_incomplete");
  assert.equal(result.run.targets["electron-package"].state, "complete");
  assert.equal(result.run.targets["android-package"].state, "blocked");
  assert.deepEqual(result.run.aggregate, {
    state: "incomplete",
    complete: ["electron-package"],
    outstanding: [
      {
        target: "android-package",
        state: "blocked",
        nextAction: "connect owned acceptance emulator",
      },
    ],
  });
  const replay = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(replay.status, 1, replay.stderr || replay.stdout);
  assert.equal(
    JSON.parse(replay.stdout).run.targets["electron-package"].state,
    "complete"
  );
  const human = command(
    process.execPath,
    [cli, "status", plan.plan.id, "--config", f.config],
    f.repo
  );
  assert.equal(human.status, 0, human.stderr || human.stdout);
  assert.match(human.stdout, /electron-package: complete/);
  assert.match(
    human.stdout,
    /android-package: blocked — connect owned acceptance emulator/
  );
});

test("shared verification failure blocks every selected target", (t) => {
  const f = fixture(t);
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "electron-package",
      "--target",
      "android-package",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const result = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { CLIPP_FAIL_VERIFY: "1" }
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.code, "required_check_failed");
  assert.deepEqual(
    report.run.aggregate.outstanding.map((item) => item.target),
    ["electron-package", "android-package"]
  );
  for (const target of Object.values(report.run.targets)) {
    assert.equal(target.state, "failed");
    assert.match(target.nextAction, /commonVerify failed/);
  }
});

test("mixed Android targets retain separate upload and debug package receipts", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: { androidDeviceSerial: "owned-emulator-1" },
      signing: { androidPackage: "upload", androidLocal: "debug" },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "android-package",
      "--target",
      "android-local",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const loader = path.join(f.base, "android-modes-loader.mjs");
  const modules = {
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification={state:"passed",pair:{appSha256:"a",testSha256:"b"}}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid({run,mode,stageName,save}) { const stage=run.stages[stageName]; stage.state="passed"; stage.receipt={signing:mode,buildIdentity:mode+"-artifact"}; if(mode==="upload") run.targets["android-package"]={state:"complete",nextAction:null}; save(); }`,
    "./android-local.mjs": `export const createAdbDevice=()=>({}); export async function installAndroidLocal({run,packageStage,save}) { if(packageStage?.receipt?.signing!=="debug") throw Error("local install borrowed wrong package mode"); run.targets["android-local"]={state:"complete",nextAction:null}; run.stages.androidLocal.state="passed"; save(); }`,
  };
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules=${JSON.stringify(urls)}; export async function resolve(specifier,context,nextResolve){if(context.parentURL?.endsWith('/delivery/run.mjs')&&modules[specifier])return {url:modules[specifier],shortCircuit:true};return nextResolve(specifier,context);}`
  );
  const first = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const result = JSON.parse(first.stdout);
  assert.deepEqual(result.run.graph, [
    { id: "prepare", dependsOn: [] },
    { id: "commonVerify", dependsOn: ["prepare"] },
    { id: "androidQualification", dependsOn: ["commonVerify"] },
    { id: "androidPackage:upload", dependsOn: ["androidQualification"] },
    { id: "androidPackage:debug", dependsOn: ["androidQualification"] },
    {
      id: "androidLocal",
      dependsOn: ["androidQualification", "androidPackage:debug"],
    },
  ]);
  assert.equal(result.run.stages.androidPackage.receipt.signing, "upload");
  assert.equal(
    result.run.stages.androidAdditionalPackage.receipt.signing,
    "debug"
  );
  assert.equal(result.run.targets["android-package"].state, "complete");
  assert.equal(result.run.targets["android-local"].state, "complete");
  const replay = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(replay.status, 0, replay.stderr || replay.stdout);
  assert.equal(
    JSON.parse(replay.stdout).run.stages.androidPackage.receipt.buildIdentity,
    "upload-artifact"
  );
});

test("unsigned artifact package and internal release use separate upload receipt", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: {
        playApplicationId: "com.clipp.app",
        playTrack: "internal",
      },
      signing: { androidPackage: "unsigned-artifact" },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "android-package",
      "--target",
      "android-internal",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  assert.equal(
    plan.plan.targets["android-package"].signing,
    "unsigned-artifact"
  );
  assert.equal(plan.plan.targets["android-internal"].signing, "upload");
  assert.ok(
    plan.plan.targets["android-internal"].prerequisites.includes(
      "reference:androidSigningRef"
    )
  );
  assert.ok(
    !plan.plan.targets["android-internal"].prerequisites.includes(
      "signing:android-internal-requires-upload"
    )
  );
  const loader = path.join(f.base, "internal-modes-loader.mjs");
  const modules = {
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification={state:"passed",pair:{appSha256:"a",testSha256:"b"}}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid({run,mode,stageName,save}) { const stage=run.stages[stageName]; stage.state="passed"; stage.receipt={signing:mode,buildIdentity:mode+"-artifact"}; if(mode==="unsigned-artifact") run.targets["android-package"]={state:"complete",nextAction:null}; save(); }`,
    "./android-internal.mjs": `export async function publishInternal({run,packageStage,save}) { if(packageStage?.receipt?.signing!=="upload") throw Error("publication borrowed wrong package mode"); run.targets["android-internal"]={state:"complete",nextAction:null}; run.stages.androidInternal.state="passed"; save(); }`,
  };
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules=${JSON.stringify(urls)}; export async function resolve(specifier,context,nextResolve){if(context.parentURL?.endsWith('/delivery/run.mjs')&&modules[specifier])return {url:modules[specifier],shortCircuit:true};return nextResolve(specifier,context);}`
  );
  const result = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.code, "delivery_complete");
  assert.equal(
    report.run.stages.androidPackage.receipt.signing,
    "unsigned-artifact"
  );
  assert.equal(
    report.run.stages.androidAdditionalPackage.receipt.signing,
    "upload"
  );
  assert.deepEqual(report.run.aggregate.outstanding, []);
});

test("three Android modes preserve unsigned and debug progress while upload is blocked", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: {
        playApplicationId: "com.clipp.app",
        playTrack: "internal",
        androidDeviceSerial: "owned-emulator-1",
      },
      signing: { androidPackage: "unsigned-artifact", androidLocal: "debug" },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "android-package",
      "--target",
      "android-internal",
      "--target",
      "android-local",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const loader = path.join(f.base, "three-modes-loader.mjs");
  const modules = {
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification={state:"passed",pair:{appSha256:"a",testSha256:"b"}}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid({run,mode,stageName,save}) { if(mode==="upload") throw Object.assign(Error("upload signing identity unavailable"),{code:"prerequisite_unavailable"}); const stage=run.stages[stageName]; stage.state="passed"; stage.receipt={signing:mode,buildIdentity:mode+"-artifact"}; if(mode==="unsigned-artifact") run.targets["android-package"]={state:"complete",nextAction:null}; save(); }`,
    "./android-local.mjs": `export async function installAndroidLocal({run,packageStage,save}) { if(packageStage?.receipt?.signing!=="debug") throw Error("local borrowed wrong mode"); run.targets["android-local"]={state:"complete",nextAction:null}; run.stages.androidLocal.state="passed"; save(); }`,
    "./android-internal.mjs": `export async function publishInternal() { throw Error("blocked upload must not publish"); }`,
  };
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules=${JSON.stringify(urls)}; export async function resolve(specifier,context,nextResolve){if(context.parentURL?.endsWith('/delivery/run.mjs')&&modules[specifier])return {url:modules[specifier],shortCircuit:true};return nextResolve(specifier,context);}`
  );
  const result = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.code, "delivery_incomplete");
  assert.equal(
    report.run.stages.androidPackage.receipt.signing,
    "unsigned-artifact"
  );
  assert.equal(report.run.stages.androidAdditionalPackage.state, "blocked");
  assert.equal(report.run.stages.androidThirdPackage.receipt.signing, "debug");
  assert.equal(report.run.targets["android-package"].state, "complete");
  assert.equal(report.run.targets["android-internal"].state, "blocked");
  assert.equal(report.run.targets["android-local"].state, "complete");
  assert.deepEqual(
    report.run.aggregate.outstanding.map((item) => item.target),
    ["android-internal"]
  );
});

test("shared replay failure preserves completed destination and recovery skips installation", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: {
        electronInstallPath: path.join(f.base, "Applications", "Clipp.app"),
      },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "electron-local",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const loader = path.join(f.base, "completed-replay-loader.mjs");
  const modules = {
    "./electron.mjs": `export const electronNativeInventory=()=>({}); export const inspectElectronConfig=()=>({}); export async function packageElectron({run,save}) { run.stages.electronPackage.state="passed"; save(); }`,
    "./electron-local.mjs": `export async function installElectronLocal({run,save}) { if(run.targets["electron-local"].state==="complete") return; run.stages.electronLocal.installCount=(run.stages.electronLocal.installCount||0)+1; run.targets["electron-local"]={state:"complete",nextAction:null}; save(); }`,
  };
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules=${JSON.stringify(urls)}; export async function resolve(specifier,context,nextResolve){if(context.parentURL?.endsWith('/delivery/run.mjs')&&modules[specifier])return {url:modules[specifier],shortCircuit:true};return nextResolve(specifier,context);}`
  );
  const run = () =>
    command(process.execPath, [cli, "run", plan.path, "--json"], f.repo, {
      NODE_OPTIONS: `--experimental-loader=${loader}`,
    });
  const first = JSON.parse(run().stdout);
  assert.equal(first.code, "delivery_complete");
  assert.equal(first.run.stages.electronLocal.installCount, 1);
  const installed = path.join(
    first.run.checkout,
    "node_modules",
    ".package-lock.json"
  );
  const original = readFileSync(installed);
  writeFileSync(installed, Buffer.concat([original, Buffer.from("tampered")]));
  const failed = JSON.parse(run().stdout);
  assert.equal(failed.code, "candidate_installation_changed");
  assert.equal(failed.run.targets["electron-local"].state, "complete");
  assert.equal(failed.run.aggregate.state, "incomplete");
  writeFileSync(installed, original);
  const recovered = JSON.parse(run().stdout);
  assert.equal(recovered.code, "delivery_complete");
  assert.equal(recovered.run.targets["electron-local"].state, "complete");
  assert.equal(recovered.run.stages.electronLocal.installCount, 1);
});

test("unresolved local signing blocks only that target after shared qualification", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: { androidDeviceSerial: "owned-emulator-1" },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "android-local",
      "--target",
      "electron-package",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  const loader = path.join(f.base, "missing-mode-loader.mjs");
  const modules = {
    "./electron.mjs": `export const electronNativeInventory=()=>({}); export const inspectElectronConfig=()=>({}); export async function packageElectron({run,save}) { run.targets["electron-package"]={state:"complete",nextAction:null}; run.stages.electronPackage.state="passed"; save(); }`,
    "./android-qualification.mjs": `export async function qualifyAndroid({run,save}) { run.androidQualification={state:"passed",pair:{appSha256:"a",testSha256:"b"}}; save(); }`,
    "./android-package.mjs": `export async function packageAndroid() { throw Error("missing signing mode must not package"); }`,
  };
  const urls = Object.fromEntries(
    Object.entries(modules).map(([name, source]) => [
      name,
      `data:text/javascript,${encodeURIComponent(source)}`,
    ])
  );
  writeFileSync(
    loader,
    `const modules=${JSON.stringify(urls)}; export async function resolve(specifier,context,nextResolve){if(context.parentURL?.endsWith('/delivery/run.mjs')&&modules[specifier])return {url:modules[specifier],shortCircuit:true};return nextResolve(specifier,context);}`
  );
  const result = command(
    process.execPath,
    [cli, "run", plan.path, "--json"],
    f.repo,
    { NODE_OPTIONS: `--experimental-loader=${loader}` }
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.code, "delivery_incomplete");
  assert.equal(report.run.targets["electron-package"].state, "complete");
  assert.equal(report.run.targets["android-local"].state, "blocked");
  assert.match(
    report.run.targets["android-local"].nextAction,
    /signing:androidLocal/
  );
});

test("a failed shared Electron package blocks its selected local dependent", (t) => {
  const f = fixture(t);
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: {
        electronInstallPath: path.join(f.base, "Applications", "Clipp.app"),
      },
    })
  );
  const planned = delivery(
    [
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.revision,
      "--target",
      "electron-package",
      "--target",
      "electron-local",
    ],
    f.repo
  );
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const first = delivery(["run", JSON.parse(planned.stdout).path], f.repo);
  assert.equal(first.status, 1, first.stderr || first.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.run.targets["electron-package"].state, "blocked");
  assert.equal(report.run.targets["electron-local"].state, "blocked");
  assert.match(
    report.run.targets["electron-local"].nextAction,
    /Native Electron dependency inventory is unavailable/i
  );
});
