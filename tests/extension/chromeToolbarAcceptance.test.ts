import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import os from "node:os";

const root = path.resolve(__dirname, "../..");
const runner = path.join(
  root,
  "apps/extension/scripts/verify-clipboard-io.mjs"
);
test("the public toolbar command requires frozen identity before any browser launch", () => {
  const result = spawnSync(
    process.execPath,
    [runner, "--scenario", "toolbar-history", "--validate-only"],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("effort_required");
  expect(result.stderr).not.toContain("authorization_reference_required");
});

let fixture: string, repo: string, output: string;
beforeEach(() => {
  fixture = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "clipp-chrome-toolbar-"))
  );
  repo = path.join(fixture, "repo");
  output = path.join(fixture, "output");
  mkdirSync(path.join(repo, "apps/extension/scripts"), { recursive: true });
  mkdirSync(path.join(repo, "scripts"));
  for (const name of [
    "verify-clipboard-io.mjs",
    "toolbar-acceptance.mjs",
    "clipboard-acceptance.mjs",
  ])
    copyFileSync(
      path.join(root, "apps/extension/scripts", name),
      path.join(repo, "apps/extension/scripts", name)
    );
  copyFileSync(
    path.join(root, "scripts/native-acceptance-attempts.mjs"),
    path.join(repo, "scripts/native-acceptance-attempts.mjs")
  );
  writeFileSync(
    path.join(repo, "scripts/prepare-acceptance-candidate.mjs"),
    `console.log(JSON.stringify({verified:true,artifact:'base-bound',revision:'${"a".repeat(40)}'}));`
  );
  mkdirSync(path.join(repo, "apps/extension/dist/src"), { recursive: true });
  writeFileSync(
    path.join(repo, "apps/extension/dist/manifest.json"),
    '{"version":"1"}'
  );
  writeFileSync(
    path.join(repo, "apps/extension/dist/src/popup.html"),
    "<html>fixture</html>"
  );
  writeFileSync(
    path.join(fixture, "base.json"),
    JSON.stringify({ source: { checkout: repo, revision: "a".repeat(40) } })
  );
  const bin = path.join(fixture, "browser.cjs");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
if(process.argv.includes('--version')){console.log('Fixture Chromium 1');process.exit(0);}
const dir=process.argv.find(x=>x.startsWith('--user-data-dir=')).split('=').slice(1).join('=');
fs.writeFileSync(path.join(dir,'DevToolsActivePort'),'12345\\n/devtools/browser/fixture');fs.writeFileSync(${JSON.stringify(path.join(fixture, "pid"))},String(process.pid));
setTimeout(()=>{fs.writeFileSync(${JSON.stringify(path.join(fixture, "self-expired"))},"expired");process.exit(0);},4000);
`,
    { mode: 0o755 }
  );
  const playwright = path.join(repo, "node_modules/@playwright/test");
  mkdirSync(playwright, { recursive: true });
  writeFileSync(
    path.join(playwright, "package.json"),
    '{"type":"module","main":"index.js"}'
  );
  writeFileSync(
    path.join(playwright, "index.js"),
    `
import fs from 'node:fs';
let opened=false,pinned=false,search='',inventoryCalls=0,installAcked=false;
const behavior=process.env.FIXTURE_BEHAVIOR;
const locator={async count(){return 1;},async click(){if(behavior==='input')throw new Error('unavailable_native_input');},async evaluate(){return true;},async fill(text){search=text;},async inputValue(){return search;},async waitFor(){},async isVisible(){return true;},first(){pinned=true;return this;}};
const popup={isClosed:()=>false,url:()=> 'chrome-extension://fixture/src/popup.html',locator:()=>({...locator,count:async()=>0}),getByRole:()=>locator,getByTitle:()=>locator,getByPlaceholder:()=>({...locator,async fill(){throw new Error('header_search_hidden_in_native_popup');}}),getByText:()=>locator,async evaluate(fn,arg){if(arg?.type==='getRuntimeState')return {state:{pinnedIds:pinned?['clip']:[]}};if(arg)return {ok:true};return {id:'fixture',isPopup:behavior!=='tab',memory:behavior!=='boundary',focused:true};}};
const tab={url:()=> 'about:blank',async bringToFront(){}};
const session={async send(method,params){if(method==='Extensions.loadUnpacked'){installAcked=true;return {id:behavior==='delayed-wrong-id'?'other-id':'fixture'};}if(method==='Extensions.getExtensions'){inventoryCalls++;if(behavior.startsWith('delayed')&&(!installAcked||inventoryCalls<3))return {extensions:[]};if(behavior==='worker')throw new Error('acceptance_operation_timeout');if(behavior==='private')throw new Error('SYNTHETIC_PRIVATE_CANARY');return {extensions:[{id:'fixture',enabled:behavior!=='delayed-disabled',path:behavior==='delayed-wrong-path'?${JSON.stringify(path.join(repo, "apps/extension"))}:${JSON.stringify(path.join(repo, "apps/extension/dist"))}}]};}if(method==='Target.getTargetInfo')return {targetInfo:{targetId:'page-id',type:'page',url:'about:blank',browserContextId:'owned-context'}};
if(method==='Target.getTargets')return {targetInfos:[{targetId:'tab-id',type:'tab',url:behavior==='tab-url-mismatch'?'https://wrong.invalid/':'about:blank',browserContextId:behavior==='tab-context-mismatch'?'different-context':'owned-context'},...(behavior==='ambiguous-tab'?[{targetId:'second-tab-id',type:'tab',url:'about:blank',browserContextId:'owned-context'}]:[])]};
if(method==='Browser.getWindowForTarget')return {windowId:behavior==='tab-window-mismatch'&&params.targetId!=='page-id'?2:1};
if(method==='Extensions.triggerAction'){if(params.targetId!=='tab-id')throw new Error('Action can only be triggered on a tab target.');opened=true;}return {};}};
const context={async addInitScript(){},serviceWorkers:()=>[{url:()=> 'chrome-extension://fixture/background.js'}],pages:()=>opened?[tab,popup]:[tab],async newCDPSession(){return session;}};
export const chromium={executablePath:()=>${JSON.stringify(bin)},async connectOverCDP(){return {contexts:()=>[context],async newBrowserCDPSession(){return session;},async close(){if(behavior==='cleanup')throw new Error('cleanup_fixture');if(behavior==='reuse')return;const pid=Number(fs.readFileSync(${JSON.stringify(path.join(fixture, "pid"))},'utf8'));process.kill(pid,'SIGTERM');}};}};
 `
  );
  // Controlled public process adapter: observes only its self-expiring owned child.
  writeFileSync(
    path.join(fixture, "process.mjs"),
    `
import cp from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const profileRecord = ${JSON.stringify(path.join(fixture, "profile"))};
const spawn = cp.spawn;
cp.spawn = (bin,args,opts) => {
 const argument = args.find(x=>x.startsWith('--user-data-dir='));
 if(argument) fs.writeFileSync(profileRecord,argument.slice('--user-data-dir='.length));
 const child = spawn(bin,args,opts);
 if(argument && child.pid) {
  fs.writeFileSync(${JSON.stringify(path.join(fixture, "pid"))},String(child.pid));
  if(process.env.FIXTURE_BEHAVIOR==='unidentified' && process.env.CLIPP_CHROME_OWNED_CHILD_EVIDENCE) fs.appendFileSync(process.env.CLIPP_CHROME_OWNED_CHILD_EVIDENCE,JSON.stringify({pid:child.pid,profile:argument.slice('--user-data-dir='.length),expiresAfterMs:4000})+'\\n');
  const kill=child.kill.bind(child);
  child.kill=signal=>{fs.appendFileSync(${JSON.stringify(path.join(fixture, "signals"))},String(signal)+'\\n');return kill(signal);};
 }
 return child;
};
const original = cp.spawnSync;
let observations = 0;
cp.spawnSync = (bin,args,options) => {
 if(bin!=='ps') return original(bin,args,options);
 let supplied = {};
 try { supplied = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(fixture, "observations.json"))},'utf8')); } catch {}
 if(args[0]==='-ax') return {status:0,stdout:supplied.snapshot??''};
 const pid = Number(args[1]);
 if(String(pid) in supplied) return supplied[pid] === null ? {status:1,stdout:''} : {status:0,stdout:supplied[pid]};
 try {
  process.kill(pid,0);
  let childPid;
  try { childPid = Number(fs.readFileSync(${JSON.stringify(path.join(fixture, "pid"))},'utf8')); } catch {}
  if(pid !== childPid) return {status:0,stdout:'123 Wed Oct 28 09:00:00 2026 fixture-worker'};
  if(process.env.FIXTURE_BEHAVIOR==='unidentified') return {status:2,stdout:''};
  const profile = fs.readFileSync(profileRecord,'utf8');
  observations++;
  return {status:0,stdout:'123 Wed Oct 28 10:00:00 2026 '+(process.env.FIXTURE_BEHAVIOR==='reuse' && observations>1?'reused fixture ':'owned fixture ')+${JSON.stringify(bin)}+' --user-data-dir='+profile};
 } catch { return {status:1,stdout:''}; }
};
const rename = fs.promises.rename;
fs.promises.rename = async (from,to) => {
 await rename(from,to);
 if(String(to).endsWith('/unresolved-target.json') && process.env.FIXTURE_HOLD_INTENT) {
  fs.writeFileSync(${JSON.stringify(path.join(fixture, "intent-ready"))},'ready');
  await new Promise((done)=>{const poll=setInterval(()=>{if(fs.existsSync(${JSON.stringify(path.join(fixture, "release-intent"))})){clearInterval(poll);done();}},20);setTimeout(()=>{clearInterval(poll);done();},3000);});
 }
 if(String(to).endsWith('/unresolved-target.json') && process.env.FIXTURE_STALL_INTENT) await new Promise(()=>{});
};
if(process.env.FIXTURE_STALL_INTENT){const timeout=globalThis.setTimeout;globalThis.setTimeout=(task,ms,...args)=>timeout(task,ms===15000?1000:ms,...args);}
syncBuiltinESMExports();
`
  );
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function argumentsFor(extra: string[] = [], selectedOutput = output) {
  return [
    "--import",
    path.join(fixture, "process.mjs"),
    path.join(repo, "apps/extension/scripts/verify-clipboard-io.mjs"),
    "--scenario",
    "toolbar-history",
    "--effort",
    "fixture-effort",
    "--history-root",
    path.join(fixture, "history"),
    "--output",
    selectedOutput,
    "--candidate-record",
    path.join(fixture, "base.json"),
    "--extension-record",
    path.join(fixture, "extension.json"),
    ...extra,
  ];
}
function invoke(behavior = "", extra: string[] = [], selectedOutput = output) {
  return spawnSync(process.execPath, argumentsFor(extra, selectedOutput), {
    cwd: repo,
    encoding: "utf8",
    timeout: 12000,
    env: {
      ...process.env,
      FIXTURE_BEHAVIOR: behavior,
      CLIPP_ACCEPTANCE_STATE_ROOT: path.join(fixture, "state"),
    },
  });
}
function result() {
  return JSON.parse(readFileSync(path.join(output, "receipt.json"), "utf8"));
}
function freeze() {
  const digest = (text: string | Buffer) =>
    createHash("sha256").update(text).digest("hex");
  writeFileSync(
    path.join(fixture, "extension.json"),
    JSON.stringify({
      version: 1,
      sourceRevision: "a".repeat(40),
      baseArtifact: "base-bound",
      baseRecord: path.join(fixture, "base.json"),
      extensionPath: path.join(repo, "apps/extension/dist"),
      artifacts: {
        "manifest.json": digest('{"version":"1"}'),
        "src/popup.html": digest("<html>fixture</html>"),
      },
      browser: {
        path: path.join(fixture, "browser.cjs"),
        sha256: digest(readFileSync(path.join(fixture, "browser.cjs"))),
        version: "Fixture Chromium 1",
      },
    })
  );
}
test("the native toolbar popup captures and pins a visible clip while header search is hidden", () => {
  freeze();
  const run = invoke();
  if (run.status !== 0) throw new Error(run.stdout + run.stderr);
  expect(result()).toMatchObject({
    result: "passed",
    surface: { kind: "actual-toolbar-popup" },
    behavior: { pinPersisted: true },
    clipboard: { hostUsed: false },
    shutdown: "verified-owned-browser-closed",
  });
});
test.each(["tab", "boundary"])(
  "%s evidence cannot qualify the actual toolbar popup",
  (mode) => {
    freeze();
    expect(invoke(mode).status).toBe(1);
    expect(result()).toMatchObject({
      failure: "wrong_target",
      shutdown: "verified-owned-browser-closed",
    });
    expect(result().behavior).toBeUndefined();
  }
);
test("a stale extension artifact refuses launch", () => {
  freeze();
  writeFileSync(path.join(repo, "apps/extension/dist/src/popup.html"), "stale");
  expect(invoke().status).toBe(1);
  expect(result()).toMatchObject({
    stage: "candidate",
    failure: "stale_candidate",
    shutdown: "not-launched",
  });
});
test.each([
  ["worker", "worker_evaluation_timeout"],
  ["input", "unavailable_input"],
])("%s failure is classified before the product scenario", (mode, reason) => {
  freeze();
  expect(invoke(mode).status).toBe(1);
  expect(result()).toMatchObject({ failure: reason });
  expect(result().behavior).toBeUndefined();
});
test("private driver errors never enter receipts or public output", () => {
  freeze();
  const run = invoke("private");
  expect(run.status).toBe(1);
  expect(
    run.stdout +
      run.stderr +
      readFileSync(path.join(output, "receipt.json"), "utf8")
  ).not.toContain("SYNTHETIC_PRIVATE_CANARY");
  const pointer = JSON.parse(
    readFileSync(path.join(output, "history.json"), "utf8")
  );
  const history = JSON.parse(readFileSync(pointer.history, "utf8"));
  const privateFile = path.join(
    path.dirname(pointer.history),
    `attempt-${history.attempts.length}`,
    "failure.private.json"
  );
  expect(readFileSync(privateFile, "utf8")).toContain(
    "SYNTHETIC_PRIVATE_CANARY"
  );
});
test("cleanup failure suppresses success and retains canonical target ownership", () => {
  freeze();
  expect(invoke("cleanup").status).toBe(1);
  expect(result()).toMatchObject({
    classification: "cleanup",
    shutdown: "unknown",
  });
  const next = invoke(
    "",
    [
      "--diagnostic-change",
      "new output",
      "--expected-observation",
      "owned browser is absent",
    ],
    path.join(fixture, "renamed-output")
  );
  expect(next.status).toBe(1);
  expect(next.stderr).toContain("owned_target_active_or_uncertain");
});
test("five failed attempts survive output changes and refuse a sixth launch", () => {
  freeze();
  for (let index = 0; index < 5; index++) {
    const run = invoke(
      "tab",
      index
        ? [
            "--diagnostic-change",
            `distinct change ${index}`,
            "--expected-observation",
            "toolbar visible",
          ]
        : [],
      path.join(fixture, `output-${index}`)
    );
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('"failure":"wrong_target"');
  }
  const sixth = invoke(
    "tab",
    [
      "--diagnostic-change",
      "sixth",
      "--expected-observation",
      "toolbar visible",
    ],
    path.join(fixture, "sixth")
  );
  expect(sixth.status).toBe(1);
  expect(sixth.stderr).toContain("diagnostic_attempt_budget_exhausted");
}, 15000);
test("an unchanged retry and expired diagnostic time fail before launch", () => {
  freeze();
  expect(invoke("tab").status).toBe(1);
  const unchanged = invoke("tab", [], path.join(fixture, "new-output"));
  expect(unchanged.stderr).toContain("changed_diagnosis_required");
  const pointer = JSON.parse(
    readFileSync(path.join(output, "history.json"), "utf8")
  );
  const history = JSON.parse(readFileSync(pointer.history, "utf8"));
  history.diagnosticStartedAt = new Date(Date.now() - 21 * 60000).toISOString();
  writeFileSync(pointer.history, JSON.stringify(history));
  const expired = invoke("tab", [
    "--diagnostic-change",
    "new hypothesis",
    "--expected-observation",
    "new result",
  ]);
  expect(expired.stderr).toContain("diagnostic_time_budget_exhausted");
});

test("an aliased extension directory fails before browser launch", () => {
  freeze();
  const dist = path.join(repo, "apps/extension/dist");
  const replacement = path.join(fixture, "unrelated-extension");
  mkdirSync(replacement);
  rmSync(dist, { recursive: true });
  symlinkSync(replacement, dist);
  expect(invoke().status).toBe(1);
  expect(result()).toMatchObject({
    failure: "stale_candidate",
    shutdown: "not-launched",
  });
});
test("a reused process fingerprint withholds signaling and retains uncertainty", () => {
  freeze();
  expect(invoke("reuse").status).toBe(1);
  expect(result()).toMatchObject({
    classification: "cleanup",
    shutdown: "unknown",
  });
});

function seedOwnership(
  target: Record<string, unknown>,
  observations: Record<string, unknown>
) {
  freeze();
  writeFileSync(path.join(repo, "apps/extension/dist/src/popup.html"), "stale");
  expect(invoke().status).toBe(1);
  const pointer = JSON.parse(
    readFileSync(path.join(output, "history.json"), "utf8")
  );
  const canonical = path.join(
    fixture,
    "history",
    pointer.key,
    "unresolved-target.json"
  );
  writeFileSync(canonical, JSON.stringify(target));
  writeFileSync(
    path.join(fixture, "observations.json"),
    JSON.stringify(observations)
  );
  return canonical;
}
const workerBirth = "Wed Oct 28 09:00:00 2026";
const childBirth = "Wed Oct 28 10:00:00 2026";
const retry = [
  "--diagnostic-change",
  "observe retained ownership",
  "--expected-observation",
  "safe isolation is established",
];
test("a live target with unchanged birth retains ownership after its command changes", () => {
  const profile = path.join(fixture, "retained-profile");
  const canonical = seedOwnership(
    {
      profile,
      runnerPid: 777000,
      runnerBirth: workerBirth,
      pid: 777001,
      birth: childBirth,
      fingerprint: "original-command",
    },
    {
      777000: null,
      777001: `123 ${childBirth} changed-command-without-profile`,
    }
  );
  const retained = readFileSync(canonical, "utf8");
  const run = invoke("", retry);
  expect(run.stderr).toContain("owned_target_active_or_uncertain");
  expect(readFileSync(canonical, "utf8")).toBe(retained);
});
test("a proven different target birth can admit a safe successor without signaling it", () => {
  const profile = path.join(fixture, "retained-profile");
  seedOwnership(
    {
      profile,
      runnerPid: 777000,
      runnerBirth: workerBirth,
      pid: 777001,
      birth: childBirth,
    },
    {
      777000: null,
      777001: "123 Thu Oct 29 11:00:00 2026 unrelated-replacement",
    }
  );
  const run = invoke("", retry);
  expect(run.stderr).not.toContain("owned_target_active_or_uncertain");
  expect(run.stdout).toContain('"failure":"stale_candidate"');
});
test("a live worker launch intent with no child PID cannot be cleared by admission", () => {
  const canonical = seedOwnership(
    {
      profile: path.join(fixture, "retained-profile"),
      runnerPid: 777000,
      runnerBirth: workerBirth,
      phase: "launch-intent",
    },
    { 777000: `123 ${workerBirth} fixture-worker` }
  );
  const retained = readFileSync(canonical, "utf8");
  expect(invoke("", retry).stderr).toContain(
    "owned_target_active_or_uncertain"
  );
  expect(readFileSync(canonical, "utf8")).toBe(retained);
});
test("an interrupted launch with an observed current profile remains uncertain", () => {
  const profile = path.join(fixture, "retained-profile");
  const canonical = seedOwnership(
    {
      profile,
      runnerPid: 777000,
      runnerBirth: workerBirth,
      phase: "launch-intent",
    },
    { 777000: null, snapshot: `777001 --user-data-dir=${profile}` }
  );
  const retained = readFileSync(canonical, "utf8");
  expect(invoke("", retry).stderr).toContain(
    "owned_target_active_or_uncertain"
  );
  expect(readFileSync(canonical, "utf8")).toBe(retained);
});
test("concurrent admission preserves the live worker's durable pre-PID launch intent", async () => {
  freeze();
  const first = spawn(process.execPath, argumentsFor(), {
    cwd: repo,
    stdio: "ignore",
    env: {
      ...process.env,
      CLIPP_ACCEPTANCE_STATE_ROOT: path.join(fixture, "state"),
      FIXTURE_BEHAVIOR: "tab",
      FIXTURE_HOLD_INTENT: "1",
    },
  });
  const exited = new Promise<number | null>((done) => first.once("exit", done));
  try {
    const ready = path.join(fixture, "intent-ready");
    const until = Date.now() + 4000;
    while (!existsSync(ready) && Date.now() < until)
      await new Promise((done) => setTimeout(done, 20));
    expect(existsSync(ready)).toBe(true);
    const pointer = JSON.parse(
      readFileSync(path.join(output, "history.json"), "utf8")
    );
    const canonical = path.join(
      fixture,
      "history",
      pointer.key,
      "unresolved-target.json"
    );
    const retained = readFileSync(canonical, "utf8");
    const concurrent = invoke("", retry, path.join(fixture, "second-output"));
    expect(concurrent.status).toBe(1);
    expect(readFileSync(canonical, "utf8")).toBe(retained);
  } finally {
    writeFileSync(path.join(fixture, "release-intent"), "release");
    await exited;
  }
}, 10000);
test("a timed out durable intent write retains uncertainty and withholds browser launch", () => {
  freeze();
  const run = spawnSync(process.execPath, argumentsFor(), {
    cwd: repo,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      CLIPP_ACCEPTANCE_STATE_ROOT: path.join(fixture, "state"),
      FIXTURE_STALL_INTENT: "1",
    },
  });
  expect(run.status).toBe(1);
  const receipt = result();
  expect(receipt).toMatchObject({
    result: "failed",
    failure: "command_timeout",
    classification: "cleanup",
    shutdown: "unknown",
  });
  const pointer = JSON.parse(
    readFileSync(path.join(output, "history.json"), "utf8")
  );
  const target = JSON.parse(
    readFileSync(
      path.join(fixture, "history", pointer.key, "unresolved-target.json"),
      "utf8"
    )
  );
  expect(target).toMatchObject({ phase: "launch-intent" });
  expect(target.pid).toBeUndefined();
}, 10000);

test.each(["missing-recorded-birth", "unknown-observation"])(
  "%s cannot release a still-live target",
  (mode) => {
    const profile = path.join(fixture, "retained-profile");
    const canonical = seedOwnership(
      {
        profile,
        runnerPid: 777000,
        runnerBirth: workerBirth,
        pid: 777001,
        ...(mode === "missing-recorded-birth" ? {} : { birth: childBirth }),
      },
      {
        777000: null,
        777001:
          mode === "unknown-observation"
            ? "unparseable-live-observation"
            : `123 ${childBirth} changed-command`,
      }
    );
    const retained = readFileSync(canonical, "utf8");
    expect(invoke("", retry).stderr).toContain(
      "owned_target_active_or_uncertain"
    );
    expect(readFileSync(canonical, "utf8")).toBe(retained);
  }
);

test("unavailable child identity at launch and cleanup never authorizes a signal", async () => {
  freeze();
  const expired = path.join(fixture, "self-expired");
  try {
    const run = invoke("unidentified");
    expect(run.status).toBe(1);
    expect(existsSync(path.join(fixture, "signals"))).toBe(false);
    expect(result()).toMatchObject({
      result: "failed",
      classification: "cleanup",
      shutdown: "unknown",
    });
    const pointer = JSON.parse(
      readFileSync(path.join(output, "history.json"), "utf8")
    );
    const target = JSON.parse(
      readFileSync(
        path.join(fixture, "history", pointer.key, "unresolved-target.json"),
        "utf8"
      )
    );
    expect(target).toMatchObject({
      pid: Number(readFileSync(path.join(fixture, "pid"), "utf8")),
      runnerBirth: workerBirth,
      phase: "pid-recorded",
    });
    expect(target.birth).toBeUndefined();
  } finally {
    // The unidentified controlled child owns a four-second self-expiry. Preserve
    // its PID/marker until that boundary, including when a signal regression fails.
    const deadline = Date.now() + 4500;
    while (!existsSync(expired) && Date.now() < deadline)
      await new Promise((done) => setTimeout(done, 25));
  }
}, 10000);

test("the load acknowledgement waits for matching delayed extension inventory", () => {
  freeze();
  const run = invoke("delayed");
  if (run.status !== 0) throw new Error(run.stdout + run.stderr);
  expect(result()).toMatchObject({
    result: "passed",
    extension: { id: "fixture", pathMatches: true },
  });
});
test.each(["delayed-wrong-id", "delayed-disabled", "delayed-wrong-path"])(
  "%s cannot bypass acknowledged extension identity",
  (mode) => {
    freeze();
    expect(invoke(mode).status).toBe(1);
    expect(result()).toMatchObject({
      failure: "wrong_target",
      shutdown: "verified-owned-browser-closed",
    });
    expect(result().surface).toBeUndefined();
  }
);

test("the action maps a renderer page to its unique owned browser tab", () => {
  freeze();
  const run = invoke();
  if (run.status !== 0) throw new Error(run.stdout + run.stderr);
  expect(result()).toMatchObject({
    result: "passed",
    actionTarget: {
      pageTargetId: "page-id",
      tabTargetId: "tab-id",
      windowId: 1,
    },
  });
});
test.each([
  "ambiguous-tab",
  "tab-url-mismatch",
  "tab-context-mismatch",
  "tab-window-mismatch",
])("%s withholds the actual toolbar action", (mode) => {
  freeze();
  expect(invoke(mode).status).toBe(1);
  expect(result()).toMatchObject({
    failure: "wrong_target",
    shutdown: "verified-owned-browser-closed",
  });
  expect(result().surface).toBeUndefined();
});

test("public Chrome renewal consumes an explicit decision in the same history", () => {
  freeze();
  expect(invoke("input").status).toBe(1);
  const previous = result().history;
  const before = JSON.parse(readFileSync(previous.path, "utf8"));
  const decision = {
    previousHistory: previous.path,
    authorizedBy: "synthetic explicit operator decision",
    reason: "synthetic input repaired",
  };
  const decisionPath = path.join(fixture, "renewal.json");
  const decisionBytes = JSON.stringify(decision);
  writeFileSync(decisionPath, decisionBytes);
  const nextOutput = path.join(fixture, "renewed");
  const run = invoke(
    "",
    [
      "--renewal",
      decisionPath,
      "--diagnostic-change",
      "input-repaired",
      "--expected-observation",
      "normal popup input succeeds",
    ],
    nextOutput
  );
  expect(run.status).toBe(0);
  const renewed = JSON.parse(
    readFileSync(path.join(nextOutput, "receipt.json"), "utf8")
  );
  expect(renewed.history).toMatchObject({
    key: previous.key,
    generation: 1,
    predecessor: previous.path,
  });
  const nextHistory = JSON.parse(readFileSync(renewed.history.path, "utf8"));
  expect(nextHistory.attempts).toHaveLength(1);
  const retained = JSON.parse(readFileSync(previous.path, "utf8"));
  const { renewedBy, ...unchanged } = retained;
  expect(unchanged).toEqual(before);
  expect(renewedBy.decision).toEqual(decision);
  expect(readFileSync(decisionPath, "utf8")).toBe(decisionBytes);
  rmSync(path.join(fixture, "pid"), { force: true });
  const replay = invoke(
    "",
    [
      "--renewal",
      decisionPath,
      "--diagnostic-change",
      "replay",
      "--expected-observation",
      "decision is not reused",
    ],
    path.join(fixture, "replayed")
  );
  expect(replay.status).toBe(1);
  expect(existsSync(path.join(fixture, "pid"))).toBe(false);
}, 15000);

test.each([
  "missing-value",
  "relative",
  "oversized-path",
  "missing-file",
  "malformed",
  "duplicate-option",
])("public Chrome renewal refuses %s before launch", (mode) => {
  freeze();
  const decisionPath = path.join(fixture, "renewal.json");
  writeFileSync(
    decisionPath,
    mode === "malformed"
      ? "{broken"
      : JSON.stringify({ authorizedBy: "synthetic" })
  );
  const flags =
    mode === "missing-value"
      ? ["--renewal"]
      : mode === "relative"
        ? ["--renewal", "relative.json"]
        : mode === "oversized-path"
          ? ["--renewal", "/" + "x".repeat(4096)]
          : mode === "missing-file"
            ? ["--renewal", path.join(fixture, "absent.json")]
            : mode === "duplicate-option"
              ? ["--renewal", decisionPath, "--renewal", decisionPath]
              : ["--renewal", decisionPath];
  const run = invoke("", flags);
  expect(run.status).toBe(1);
  expect(existsSync(path.join(fixture, "pid"))).toBe(false);
  if (mode === "missing-value" || mode === "duplicate-option")
    expect(run.stderr).toContain("unique_option_value_required");
  if (mode === "relative" || mode === "oversized-path")
    expect(run.stderr).toContain("bounded_absolute_renewal_required");
  if (mode === "malformed")
    expect(run.stderr).toContain("candidate_metadata_invalid");
});

test("public Chrome renewal refuses an unapproved decision before launch", () => {
  freeze();
  expect(invoke("input").status).toBe(1);
  const decisionPath = path.join(fixture, "renewal.json");
  writeFileSync(
    decisionPath,
    JSON.stringify({
      previousHistory: result().history.path,
      authorizedBy: "",
      reason: "synthetic input repaired",
    })
  );
  rmSync(path.join(fixture, "pid"), { force: true });
  const run = invoke(
    "",
    [
      "--renewal",
      decisionPath,
      "--diagnostic-change",
      "new-observation",
      "--expected-observation",
      "approval required",
    ],
    path.join(fixture, "unapproved")
  );
  expect(run.status).toBe(1);
  expect(run.stderr).toContain("renewal_must_reference_failed_history");
  expect(existsSync(path.join(fixture, "pid"))).toBe(false);
}, 15000);
