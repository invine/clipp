import { spawn, spawnSync } from "node:child_process";
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
    "node_modules\napps/electron/dist\n.local\n"
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
      "--history-root",
      path.join(fixture, "history"),
      "--effort",
      "approved-effort",
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
        CLIPP_ACCEPTANCE_STATE_ROOT: path.join(fixture, "state"),
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

test("four distinct diagnostic attempts are admitted and every failed receipt remains available", () => {
  run();
  for (let retryNumber = 1; retryNumber <= 4; retryNumber += 1) {
    const retry = [
      "--diagnostic-change",
      `diagnosis ${retryNumber}`,
      "--expected-observation",
      `distinguishing observation ${retryNumber}`,
    ];
    run(retry);
    if (retryNumber === 1)
      expect(run(retry).stderr).toContain("unchanged_diagnosis_refused");
  }
  expect(
    run([
      "--diagnostic-change",
      "fifth diagnostic change",
      "--expected-observation",
      "fifth diagnostic observation",
    ]).stderr
  ).toContain("diagnostic_attempt_budget_exhausted");
  const history = JSON.parse(
    readFileSync(path.join(output, "attempts.json"), "utf8")
  );
  expect(history.attempts).toHaveLength(5);
  for (const number of [1, 2, 3, 4, 5])
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

test("initial setup time is excluded while diagnostic rebuild time exhausts the public budget", () => {
  const clock = path.join(fixture, "clock.json");
  const initial = Date.parse("2026-10-28T00:00:00Z");
  writeFileSync(clock, String(initial));
  const runner = path.join(repo, "scripts/electron-relay-acceptance.mjs");
  writeFileSync(
    runner,
    `import {readFileSync as readClock} from 'node:fs';\nDate.now=()=>Number(readClock(${JSON.stringify(clock)},'utf8'));\n` +
      readFileSync(runner, "utf8")
  );
  writeFileSync(
    path.join(fixture, "bin/npm"),
    `#!${process.execPath}\nimport fs from 'node:fs'; const clock=${JSON.stringify(clock)};fs.writeFileSync(clock,String(Number(fs.readFileSync(clock,'utf8'))+21*60*1000));process.exit(17);\n`,
    { mode: 0o755 }
  );
  expect(run().status).toBe(1);
  const history = JSON.parse(
    readFileSync(path.join(output, "attempts.json"), "utf8")
  );
  expect(history.diagnosticStartedAt).toBe("2026-10-28T00:21:00.000Z");
  const retry = [
    "--diagnostic-change",
    "repair build",
    "--expected-observation",
    "build succeeds",
  ];
  expect(run(retry).status).toBe(1);
  expect(
    run([
      "--diagnostic-change",
      "repair host",
      "--expected-observation",
      "startup succeeds",
    ]).stderr
  ).toContain("diagnostic_time_budget_exhausted");
  expect(
    JSON.parse(readFileSync(path.join(output, "attempts.json"), "utf8"))
      .attempts
  ).toHaveLength(2);
});

test("semantic failure history survives an output-directory change", () => {
  run([
    "--history-root",
    path.join(fixture, "history"),
    "--effort",
    "approved-effort",
    "--environment",
    "host-arm64",
  ]);
  const result = run([
    "--history-root",
    path.join(fixture, "history"),
    "--effort",
    "approved-effort",
    "--environment",
    "host-arm64",
    "--output",
    path.join(fixture, "other-output"),
  ]);
  expect(result.stderr).toContain("changed_diagnosis_required");
  expect(existsSync(path.join(fixture, "other-output/receipt.json"))).toBe(
    false
  );
});

test("a hung owned-target observation receives a bounded command deadline", () => {
  workingRuntime("hung-observation");
  const adapter = path.join(repo, "node_modules/playwright/index.js");
  writeFileSync(
    adapter,
    readFileSync(adapter, "utf8").replace(
      "const previous = process.argv;",
      "if (mode === 'hung-observation') return new Promise(()=>{}); const previous = process.argv;"
    )
  );
  const result = run(["--command-timeout-ms", "100"]);
  expect(result.status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    stage: "target",
    reason: "owned_command_deadline_exhausted",
    shutdown: "graceful",
  });
});

test("human environment labels cannot reset the same host scenario", () => {
  run(["--environment", "first label"]);
  expect(
    run([
      "--environment",
      "new candidate or chat label",
      "--output",
      path.join(fixture, "renamed"),
    ]).stderr
  ).toContain("changed_diagnosis_required");
});

test("an explicit renewal preserves and references the failed history", () => {
  run();
  const pointer = JSON.parse(
    readFileSync(path.join(output, "history.json"), "utf8")
  );
  const decision = path.join(fixture, "renewal.json");
  writeFileSync(
    decision,
    JSON.stringify({
      previousHistory: pointer.history,
      authorizedBy: "approved operator decision",
      reason: "new host access available",
    })
  );
  expect(
    run([
      "--renewal",
      decision,
      "--diagnostic-change",
      "new host route",
      "--expected-observation",
      "build succeeds",
    ]).status
  ).toBe(1);
  const current = JSON.parse(
    readFileSync(path.join(output, "history.json"), "utf8")
  );
  expect(current.generation).toBe(1);
  const renewedHistory = JSON.parse(readFileSync(current.history, "utf8"));
  expect(renewedHistory.diagnosticStartedAt).toBe(
    renewedHistory.attempts[0].startedAt
  );
  expect(
    JSON.parse(readFileSync(pointer.history, "utf8")).attempts
  ).toHaveLength(1);
  expect(
    JSON.parse(readFileSync(current.history, "utf8")).attempts
  ).toHaveLength(1);
  expect(
    existsSync(
      path.join(path.dirname(pointer.history), "attempt-1/receipt.json")
    )
  ).toBe(true);
});

function realOwnedRuntime(mode: "normal" | "timeout" | "reuse") {
  workingRuntime();
  const adapter = path.join(repo, "node_modules/playwright/index.js");
  let source = readFileSync(adapter, "utf8");
  source =
    "import {spawn} from 'node:child_process';\nimport {appendFileSync} from 'node:fs';\n" +
    source;
  source = source.replace(
    "const child = new EventEmitter(); child.pid = process.pid; child.exitCode = null; child.signalCode = null;",
    `const child = spawn(process.execPath, ['-e', "process.on('message',()=>process.exit(0)); setTimeout(()=>process.exit(0),1500)", ${JSON.stringify(mode === "reuse" ? "unrelated-canary" : "")} || args[0]], {detached:true, stdio:['ignore','pipe','pipe','ipc']});`
  );
  const retainedChildren =
    process.env.CLIPP_OWNED_CHILD_EVIDENCE ??
    path.join(os.tmpdir(), "clipp-owned-fixture-children.jsonl");
  source = source.replace(
    "const win =",
    `appendFileSync(${JSON.stringify(retainedChildren)},JSON.stringify({pid:child.pid,parentPid:process.pid,marker:args[0],mode:${JSON.stringify(mode)},startedAt:new Date().toISOString(),maximumLifetimeMs:1500})+'\\n'); const win =`
  );
  source = source.replace(
    "return await fn({app,BrowserWindow:",
    "const value = await fn({app,BrowserWindow:"
  );
  source = source.replace(
    "}},arg); } finally",
    "}},arg); if(value?.pid) value.pid=child.pid; return value; } finally"
  );
  source = source.replace(
    "close:async()=>{child.exitCode=mode.includes('shutdown')?1:0;child.emit('exit',child.exitCode,null);}",
    mode === "normal"
      ? "close:async()=>{child.send('exit');}"
      : "close:async()=>new Promise(()=>{})"
  );
  // In the unrelated-PID simulation the adapter releases its own canary after
  // the runner's bounded ownership check; the runner must never signal it.
  if (mode === "reuse")
    source = source.replace(
      "const win =",
      "setTimeout(()=>child.send('exit'),700); const win ="
    );
  writeFileSync(adapter, source);
}

test("a real owned child exits normally through the public runner", () => {
  realOwnedRuntime("normal");
  expect(run().status).toBe(0);
  expect(receipt()).toMatchObject({
    result: "passed",
    shutdown: "graceful",
    processOwnership: {
      identityObserved: true,
      isolatedGroup: true,
      groupId: expect.any(Number),
    },
  });
});

test("bounded cleanup signals only a currently verified owned child", () => {
  realOwnedRuntime("timeout");
  expect(run(["--cleanup-timeout-ms", "100"]).status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    cleanup: { termination: "verified-owned-child-signalled" },
  });
});

test("a reused or mismatched process identity preserves cleanup uncertainty without signalling", () => {
  realOwnedRuntime("reuse");
  expect(run(["--cleanup-timeout-ms", "100"]).status).toBe(1);
  expect(receipt()).toMatchObject({
    result: "failed",
    shutdown: "uncertain-owned-process",
    cleanup: { termination: "ownership_uncertain_no_signal" },
  });
});

test("concurrent admission is refused and interrupted history survives a new invocation", async () => {
  const marker = path.join(fixture, "building");
  writeFileSync(
    path.join(fixture, "bin/npm"),
    `#!${process.execPath}\nimport fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'owned build');setTimeout(()=>process.exit(17),1000);\n`,
    { mode: 0o755 }
  );
  const child = spawn(
    process.execPath,
    [
      path.join(repo, "scripts/electron-relay-acceptance.mjs"),
      "--profile",
      path.join(fixture, "profile"),
      "--output",
      output,
      "--history-root",
      path.join(fixture, "history"),
      "--effort",
      "approved-effort",
      "--transport",
      "wss",
      "--preflight-only",
    ],
    {
      cwd: repo,
      stdio: "ignore",
      env: {
        ...process.env,
        CLIPP_ACCEPTANCE_STATE_ROOT: path.join(fixture, "state"),
        PATH: path.join(fixture, "bin") + path.delimiter + process.env.PATH,
      },
    }
  );
  const exit = new Promise((resolve) => child.once("exit", resolve));
  try {
    const deadline = Date.now() + 5000;
    while (!existsSync(marker) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(existsSync(marker)).toBe(true);
    expect(
      run([
        "--diagnostic-change",
        "concurrent change",
        "--expected-observation",
        "must not launch",
      ]).stderr
    ).toContain("diagnostic_attempt_active_or_ownership_uncertain");
    child.kill("SIGKILL");
    await exit;
    writeFileSync(path.join(fixture, "bin/npm"), "#!/bin/sh\nexit 17\n", {
      mode: 0o755,
    });
    expect(
      run([
        "--diagnostic-change",
        "recover interruption",
        "--expected-observation",
        "build reaches launch",
      ]).status
    ).toBe(1);
    const history = JSON.parse(
      readFileSync(path.join(output, "attempts.json"), "utf8")
    );
    expect(history.attempts).toHaveLength(2);
    expect(
      JSON.parse(
        readFileSync(path.join(output, "attempt-1/receipt.json"), "utf8")
      )
    ).toMatchObject({
      result: "failed",
      stage: "interrupted",
      classification: "unknown",
      reason: "runner_interrupted",
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exit;
  }
}, 15000);

test("changing the history directory cannot silently restart a registered scenario", () => {
  run();
  expect(
    run([
      "--history-root",
      path.join(fixture, "new-history"),
      "--output",
      path.join(fixture, "new-output"),
    ]).stderr
  ).toContain("registered_history_location_changed");
});

test("explicit legacy import retains exhausted attempts and failed receipts", () => {
  const legacy = path.join(fixture, "legacy");
  mkdirSync(legacy);
  const attempts = [1, 2, 3, 4, 5].map((number) => ({
    number,
    startedAt: "2026-10-28T00:00:00Z",
    finishedAt: "2026-10-28T00:01:00Z",
    result: "failed",
    stage: "launch",
    classification: "runner",
    receipt: `attempt-${number}/receipt.json`,
  }));
  writeFileSync(
    path.join(legacy, "attempts.json"),
    JSON.stringify({
      version: 1,
      scenario: "electron-readiness",
      diagnosticStartedAt: "2026-10-28T00:01:00Z",
      attempts,
    })
  );
  for (const attempt of attempts) {
    mkdirSync(path.join(legacy, `attempt-${attempt.number}`));
    writeFileSync(
      path.join(legacy, attempt.receipt),
      JSON.stringify({ result: "failed", reason: "historical-host-failure" })
    );
  }
  expect(
    run(["--import-history", path.join(legacy, "attempts.json")]).stderr
  ).toContain("diagnostic_attempt_budget_exhausted");
  expect(
    JSON.parse(
      readFileSync(path.join(legacy, "attempt-1/receipt.json"), "utf8")
    )
  ).toMatchObject({ reason: "historical-host-failure" });
});

test("independent frozen candidate clones share the failed semantic history", () => {
  run();
  const source = repo;
  const clone = path.join(fixture, "independent-candidate");
  const result = spawnSync(
    "git",
    ["clone", "--quiet", "--no-hardlinks", source, clone],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(0);
  mkdirSync(path.join(clone, "node_modules/playwright"), { recursive: true });
  copyFileSync(
    path.join(source, "node_modules/playwright/package.json"),
    path.join(clone, "node_modules/playwright/package.json")
  );
  copyFileSync(
    path.join(source, "node_modules/playwright/index.js"),
    path.join(clone, "node_modules/playwright/index.js")
  );
  repo = clone;
  expect(
    run([
      "--history-root",
      path.join(fixture, "new-candidate-history"),
      "--output",
      path.join(fixture, "new-candidate-output"),
    ]).stderr
  ).toContain("registered_history_location_changed");
  expect(
    run(["--output", path.join(fixture, "candidate-output")]).stderr
  ).toContain("changed_diagnosis_required");
});
