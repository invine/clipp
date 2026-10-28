import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
setTimeout(()=>process.exit(0),4000);
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
let opened=false,pinned=false,search='';
const behavior=process.env.FIXTURE_BEHAVIOR;
const locator={async click(){if(behavior==='input')throw new Error('unavailable_native_input');},async evaluate(){return true;},async fill(text){search=text;},async inputValue(){return search;},async waitFor(){},async isVisible(){return true;},first(){pinned=true;return this;}};
const popup={url:()=> 'chrome-extension://fixture/src/popup.html',getByRole:()=>locator,getByTitle:()=>locator,getByPlaceholder:()=>locator,getByText:()=>locator,async evaluate(fn,arg){if(arg?.type==='getRuntimeState')return {state:{pinnedIds:pinned?['clip']:[]}};if(arg)return {ok:true};return {id:'fixture',isPopup:behavior!=='tab',memory:behavior!=='boundary',focused:true};}};
const tab={url:()=> 'about:blank',async bringToFront(){}};
const session={async send(method){if(method==='Extensions.getExtensions'){if(behavior==='worker')throw new Error('acceptance_operation_timeout');if(behavior==='private')throw new Error('SYNTHETIC_PRIVATE_CANARY');return {extensions:[{id:'fixture',enabled:true,path:${JSON.stringify(path.join(repo, "apps/extension/dist"))}}]};}if(method==='Target.getTargetInfo')return {targetInfo:{targetId:'tab'}};if(method==='Extensions.triggerAction')opened=true;return {};}};
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
 return spawn(bin,args,opts);
};
const original = cp.spawnSync;
let observations = 0;
cp.spawnSync = (bin,args,options) => {
 if(bin!=='ps') return original(bin,args,options);
 if(args[0]==='-ax') return {status:0,stdout:''};
 try {
  process.kill(Number(args[1]),0);
  const profile = fs.readFileSync(profileRecord,'utf8');
  observations++;
  return {status:0,stdout:(process.env.FIXTURE_BEHAVIOR==='reuse' && observations>1?'reused fixture ':'owned fixture ')+'--user-data-dir='+profile};
 } catch { return {status:1,stdout:''}; }
};
syncBuiltinESMExports();
`
  );
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function invoke(behavior = "", extra: string[] = [], selectedOutput = output) {
  return spawnSync(
    process.execPath,
    [
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
    ],
    {
      cwd: repo,
      encoding: "utf8",
      timeout: 12000,
      env: {
        ...process.env,
        FIXTURE_BEHAVIOR: behavior,
        CLIPP_ACCEPTANCE_STATE_ROOT: path.join(fixture, "state"),
      },
    }
  );
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
test("the selected toolbar path records a visible behavior with owned cleanup", () => {
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
