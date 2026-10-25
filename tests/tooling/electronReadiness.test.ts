import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "../..");
let fixture: string;
let repo: string;
let output: string;
beforeEach(() => {
  fixture = mkdtempSync(path.join(os.tmpdir(), "clipp-electron-readiness-"));
  repo = path.join(fixture, "repo");
  output = path.join(fixture, "evidence");
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  for (const name of [
    "electron-relay-acceptance.mjs",
    "native-acceptance-attempts.mjs",
    "source-identity.mjs",
  ]) {
    if (existsSync(path.join(root, "scripts", name)))
      copyFileSync(
        path.join(root, "scripts", name),
        path.join(repo, "scripts", name)
      );
  }
  mkdirSync(path.join(repo, "node_modules/playwright"), { recursive: true });
  writeFileSync(
    path.join(repo, "node_modules/playwright/package.json"),
    JSON.stringify({ type: "module", main: "index.js" })
  );
  writeFileSync(
    path.join(repo, "node_modules/playwright/index.js"),
    "export const _electron = { launch() { throw new Error('unexpected_launch'); } };"
  );
  mkdirSync(path.join(fixture, "bin"));
  writeFileSync(path.join(fixture, "bin/npm"), "#!/bin/sh\nexit 17\n", {
    mode: 0o755,
  });
  writeFileSync(path.join(repo, "package.json"), '{"type":"module"}');
  writeFileSync(
    path.join(repo, ".gitignore"),
    "node_modules\napps/electron/dist\n"
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
    const result = spawnSync("git", args, { cwd: repo });
    if (result.status !== 0) throw new Error(result.stderr.toString());
  }
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function run(extra: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      path.join(repo, "scripts/electron-relay-acceptance.mjs"),
      "--profile",
      path.join(fixture, "profile"),
      "--output",
      output,
      "--transport",
      "wss",
      "--preflight-only",
      ...extra,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        PATH: path.join(fixture, "bin") + path.delimiter + process.env.PATH,
      },
    }
  );
}
function receipt() {
  return JSON.parse(readFileSync(path.join(output, "receipt.json"), "utf8"));
}

test("a failed candidate build withholds native launch and preserves a prerequisite receipt", () => {
  const result = run();
  expect(result.status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "prerequisite",
    stage: "build",
    reason: "candidate_build_failed",
    shutdown: "not-launched",
    clipboardScope: { hostUsed: false, restoration: "not-requested" },
  });
});

test("a repeated command cannot reset failed readiness history or retry without a changed hypothesis", () => {
  run();
  const first = readFileSync(path.join(output, "receipt.json"), "utf8");
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("changed_diagnosis_required");
  expect(readFileSync(path.join(output, "receipt.json"), "utf8")).toBe(first);
  expect(
    JSON.parse(readFileSync(path.join(output, "attempts.json"), "utf8"))
      .attempts
  ).toHaveLength(1);
});

function workingRuntime(mode = "") {
  writeFileSync(
    path.join(fixture, "bin/npm"),
    `#!${process.execPath}\nimport fs from 'node:fs';\nfs.mkdirSync('apps/electron/dist/renderer', {recursive:true});\nfor (const name of ['main.cjs','preload.js','renderer/index.html']) fs.writeFileSync('apps/electron/dist/'+name,'fixture build');\n`,
    { mode: 0o755 }
  );
  writeFileSync(
    path.join(repo, "node_modules/playwright/index.js"),
    `
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mode = ${JSON.stringify(mode)};
export const _electron = { async launch({args,env}) {
 const child = new EventEmitter(); child.pid = process.pid; child.exitCode = null; child.signalCode = null;
 const win = { id: 1, isDestroyed:()=>false, isVisible:()=>true, isMinimized:()=>false, isFocused:()=>true, show(){}, focus(){}, restore(){}, webContents:{ focus(){}, id: 2, getOSProcessId:()=>7, getURL:()=>pathToFileURL(path.resolve('apps/electron/dist/renderer/index.html')).href, sendInputEvent(){} } };
 const app = { getPath:()=>mode==='wrong-profile'?'/wrong-profile':env.CLIPP_RELAY_ACCEPTANCE_PROFILE, focus(){}, getAppPath:()=>path.dirname(args[0]) };
 const page = { url:()=>win.webContents.getURL(), setDefaultTimeout(){}, waitForFunction:async()=> { if(mode.startsWith('failed-interaction')) throw Object.assign(new Error('private canary'), {name:'TimeoutError'}); }, getByRole:()=>({boundingBox:async()=>({x:1,y:1,width:10,height:10})}), evaluate:async()=>true };
 return { process:()=>child, firstWindow:async()=>page, browserWindow:async()=>({evaluate:async(fn,arg)=>fn(win,arg)}), evaluate:async(fn,arg)=>{
   const previous = process.argv; process.argv = [process.execPath,args[0]];
   process.getSystemVersion = ()=>'fixture';
   try { return await fn({app,BrowserWindow:{getFocusedWindow:()=>win},safeStorage:{isEncryptionAvailable:()=>false}},arg); } finally { process.argv=previous; }
 }, close:async()=>{child.exitCode=mode.includes('shutdown')?1:0;child.emit('exit',child.exitCode,null);} };
} };
`
  );
}

test("the runner withholds acceptance when the launched native process uses another profile", () => {
  workingRuntime("wrong-profile");
  const result = run();
  expect(result.status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "runner",
    stage: "target",
    reason: "owned_target_mismatch",
    shutdown: "graceful",
  });
});

test("a focused interaction failure is runner evidence and cannot become product acceptance", () => {
  workingRuntime("failed-interaction");
  const result = run();
  expect(result.status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "runner",
    stage: "interaction",
    reason: "readiness_interaction_failed",
    shutdown: "graceful",
  });
  expect(JSON.stringify(receipt())).not.toContain("private canary");
});

test("a successful no-op build cannot qualify stale Electron artifacts", () => {
  workingRuntime();
  mkdirSync(path.join(repo, "apps/electron/dist/renderer"), {
    recursive: true,
  });
  for (const name of ["main.cjs", "preload.js", "renderer/index.html"])
    writeFileSync(path.join(repo, "apps/electron/dist", name), "stale");
  writeFileSync(path.join(fixture, "bin/npm"), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  run();
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "prerequisite",
    stage: "build",
    reason: "candidate_artifact_missing",
    shutdown: "not-launched",
  });
});

test("failed owned-process cleanup cannot turn readiness into a pass", () => {
  workingRuntime("failed-shutdown");
  const result = run();
  expect(result.status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "runner",
    stage: "cleanup",
    reason: "owned_test_shutdown_failed",
    shutdown: "failed-owned-process",
  });
  expect(
    JSON.parse(
      readFileSync(path.join(output, "attempt-1/receipt.json"), "utf8")
    )
  ).toEqual(receipt());
});

test("only two distinct diagnostic attempts are admitted and every failed receipt remains available", () => {
  run();
  const retry = [
    "--diagnostic-change",
    "repair build tool",
    "--expected-observation",
    "build reaches native launch",
  ];
  run(retry);
  expect(run(retry).stderr).toContain("unchanged_diagnosis_refused");
  run([
    "--diagnostic-change",
    "replace broken dependency fixture",
    "--expected-observation",
    "build exits zero",
  ]);
  expect(
    run([
      "--diagnostic-change",
      "another change",
      "--expected-observation",
      "build succeeds",
    ]).stderr
  ).toContain("diagnostic_attempt_budget_exhausted");
  const history = JSON.parse(
    readFileSync(path.join(output, "attempts.json"), "utf8")
  );
  expect(history.attempts).toHaveLength(3);
  for (const number of [1, 2, 3])
    expect(
      JSON.parse(
        readFileSync(
          path.join(output, `attempt-${number}/receipt.json`),
          "utf8"
        )
      )
    ).toMatchObject({
      result: "failed",
      stage: "build",
      shutdown: "not-launched",
    });
}, 15000);

test("resuming an expired diagnostic history refuses another native launch", () => {
  run();
  const historyPath = path.join(output, "attempts.json");
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  history.diagnosticStartedAt = "2000-01-01T00:00:00.000Z";
  writeFileSync(historyPath, JSON.stringify(history));
  const result = run([
    "--diagnostic-change",
    "repair environment",
    "--expected-observation",
    "build succeeds",
  ]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("diagnostic_time_budget_exhausted");
  expect(JSON.parse(readFileSync(historyPath, "utf8")).attempts).toHaveLength(
    1
  );
});

test("readiness-only success identifies its built candidate and explicitly excludes relay qualification", () => {
  workingRuntime();
  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("relay transfer not tested");
  expect(receipt()).toMatchObject({
    result: "passed",
    mode: "readiness-only",
    candidate: {
      dirty: false,
      revision: expect.stringMatching(/^[a-f0-9]{40}$/),
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
    build: { artifacts: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } },
    readiness: {
      ownedWindowFocused: true,
      interaction: "native-history-filter-pinned-and-all",
      passed: true,
    },
    shutdown: "graceful",
  });
});

test("a cleanup failure preserves the original readiness failure and its classification", () => {
  workingRuntime("failed-interaction-and-shutdown");
  run();
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "runner",
    stage: "interaction",
    reason: "readiness_interaction_failed",
    shutdown: "failed-owned-process",
    cleanup: {
      reason: "owned_test_shutdown_failed",
      classification: "runner",
      result: "failed",
    },
  });
});

test("source edits during the build prevent a candidate provenance claim", () => {
  workingRuntime();
  const npmPath = path.join(fixture, "bin/npm");
  writeFileSync(
    npmPath,
    readFileSync(npmPath, "utf8") +
      "\nfs.appendFileSync('package.json', '\\n');\n"
  );
  run();
  expect(receipt()).toMatchObject({
    result: "failed",
    classification: "prerequisite",
    stage: "build",
    reason: "candidate_source_changed_during_build",
    shutdown: "not-launched",
  });
});

test("the initial Electron build is outside the diagnostic clock, but retry rebuild time counts", () => {
  expect(
    readFileSync(
      path.join(repo, "scripts/electron-relay-acceptance.mjs"),
      "utf8"
    )
  ).toContain("deferDiagnosticClockUntilFailure: true");
  const helperUrl = pathToFileURL(
    path.join(repo, "scripts/native-acceptance-attempts.mjs")
  ).href;
  const source = `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beginNativeAttempt } from ${JSON.stringify(helperUrl)};
let now = Date.parse('2026-10-25T00:00:00.000Z');
const output = ${JSON.stringify(output)};
const options = { output, scenario: 'electron-readiness', deferDiagnosticClockUntilFailure: true, now: () => now };
const initial = await beginNativeAttempt(options);
let history = JSON.parse(await readFile(output + '/attempts.json', 'utf8'));
assert.equal(history.diagnosticStartedAt, null);
now += 21 * 60 * 1000;
initial.assertBudget();
assert.equal(initial.remainingMs(180_000), 180_000);
await initial.finish({ result: 'failed', stage: 'build', classification: 'prerequisite' });
history = JSON.parse(await readFile(output + '/attempts.json', 'utf8'));
assert.equal(history.diagnosticStartedAt, new Date(now).toISOString());
const retry = await beginNativeAttempt({ ...options, change: 'repair build failure', expectation: 'candidate build succeeds' });
assert.equal(retry.remainingMs(20 * 60 * 1000), 20 * 60 * 1000);
now += 2 * 60 * 1000;
assert.equal(retry.remainingMs(20 * 60 * 1000), 18 * 60 * 1000);
`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    {
      encoding: "utf8",
      timeout: 10_000,
    }
  );
  expect(result.status).toBe(0);
}, 15000);
