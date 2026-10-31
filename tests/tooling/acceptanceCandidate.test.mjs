import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  chmodSync,
  existsSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import { acquireOwnedRelayProfile } from "../../apps/extension/scripts/owned-relay-profile.mjs";
import { beginNativeAttempt } from "../../scripts/native-acceptance-attempts.mjs";

const command = resolve("scripts/prepare-acceptance-candidate.mjs");
const localGitVariables = spawnSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8",
});
assert.equal(localGitVariables.status, 0, localGitVariables.stderr);
const repositoryEnvironment = new Set(
  localGitVariables.stdout.trim().split("\n")
);
const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !repositoryEnvironment.has(name) && !/^GIT_CONFIG_(KEY|VALUE)_/.test(name)
  )
);
function run(bin, args, cwd, environment = {}) {
  return spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: { ...cleanEnvironment, HUSKY: "0", ...environment },
  });
}
function fixture(t, setup = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "clipp-candidate-"));
  t.after(() => {
    const retained = join(root, "unexpected-preparation.json");
    if (existsSync(retained)) {
      const summary = JSON.parse(readFileSync(retained, "utf8"));
      t.diagnostic(
        `Synthetic preparation evidence retained: ${JSON.stringify(summary)}`
      );
      return;
    }
    rmSync(root, { recursive: true, force: true });
  });
  const source = join(root, "source");
  mkdirSync(join(source, "apps/electron"), { recursive: true });
  mkdirSync(join(source, "scripts"));
  mkdirSync(join(source, "packages/electron"), { recursive: true });
  writeFileSync(
    join(source, "packages/electron/package.json"),
    JSON.stringify({
      name: "electron",
      version: "43.4.0",
      bin: { "install-electron": "install.cjs" },
    })
  );
  writeFileSync(
    join(source, "packages/electron/install.cjs"),
    `const fs=require('node:fs');const path=require('node:path');fs.mkdirSync(path.join(__dirname,'dist'),{recursive:true});fs.writeFileSync(path.join(__dirname,'dist/electron'),'runtime fixture',{mode:0o755});fs.writeFileSync(path.join(__dirname,'path.txt'),'electron');`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(source, "package.json"),
    JSON.stringify({
      private: true,
      workspaces: ["apps/*", "packages/*"],
      scripts: { postinstall: "node install-runtime.cjs" },
    })
  );
  writeFileSync(
    join(source, "apps/electron/package.json"),
    JSON.stringify({
      name: "clipp-electron",
      version: "1.0.0",
      scripts: { build: "node ../../build-runtime.cjs" },
    })
  );
  writeFileSync(
    join(source, "scripts/electron-relay-acceptance.mjs"),
    "// fixture runner v1"
  );
  mkdirSync(join(source, "packages/fixture-runtime"), { recursive: true });
  writeFileSync(
    join(source, "packages/fixture-runtime/package.json"),
    JSON.stringify({
      name: "fixture-runtime",
      version: "1.0.0",
      main: "dist/index.cjs",
    })
  );
  writeFileSync(
    join(source, "install-runtime.cjs"),
    `const fs=require('node:fs');fs.mkdirSync('packages/fixture-runtime/dist',{recursive:true});fs.writeFileSync('packages/fixture-runtime/dist/index.cjs','module.exports="fixture"');`
  );
  writeFileSync(
    join(source, "build-runtime.cjs"),
    `const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/main.cjs','fixture');for(const entry of ['main','preload'])fs.writeFileSync('dist/'+entry+'.meta.json',JSON.stringify({outputs:{['dist/'+entry+'.cjs']:{imports:[{path:'electron',external:true,kind:'require-call'},{path:'fixture-runtime',external:true,kind:'require-call'},{path:'node:fs',external:true,kind:'require-call'}]}}}));`
  );
  writeFileSync(join(source, "scenario.json"), '{"scenario":"fixture"}');
  writeFileSync(join(source, ".gitignore"), "node_modules\ndist\npath.txt\n");
  setup(source);
  const install = run(
    "npm",
    [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    source
  );
  assert.equal(install.status, 0, `fixture npm install: ${install.stderr}`);
  for (const args of [
    ["init"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
  ]) {
    const result = run("git", args, source);
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  }
  const revision = run("git", ["rev-parse", "HEAD"], source).stdout.trim();
  const destination = join(root, "frozen");
  const args = [
    "prepare",
    "--source",
    source,
    "--revision",
    revision,
    "--destination",
    destination,
    "--scenario",
    "fixture",
    "--scenario-input",
    "scenario.json",
  ];
  const invoke = (extra = args) =>
    run(process.execPath, [command, ...extra], source);
  return {
    root,
    source,
    destination,
    invoke,
    args,
    record: `${destination}.candidate.json`,
  };
}

test("prepares a committed isolated Electron build while preserving unrelated dirty work", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, "unrelated.txt"), "owner work");
  writeFileSync(join(f.source, "scenario.json"), "excluded dirty scenario");
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(f.record));
  assert.equal(record.scenario.id, "fixture");
  assert.equal(
    readFileSync(join(f.destination, "apps/electron/dist/main.cjs"), "utf8"),
    "fixture"
  );
  assert.equal(
    readFileSync(join(f.source, "unrelated.txt"), "utf8"),
    "owner work"
  );
  assert.equal(
    readFileSync(join(f.source, "scenario.json"), "utf8"),
    "excluded dirty scenario"
  );
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("records the installed Electron version rather than a declared range", (t) => {
  const f = fixture(t);
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(f.record)).runtimeVersion, "43.4.0");
});

test("rejects dependency links into another worktree including workspace-local dependencies", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const local = join(f.destination, "apps/electron/node_modules");
  mkdirSync(local);
  symlinkSync(f.source, join(local, "foreign"));
  const result = f.invoke(["verify", "--record", f.record]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /wrong-worktree/);
});

test("rejects mutated source, lockfile, artifacts and installed runtime before reuse", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  for (const [name, content, reason] of [
    ["package-lock.json", "{}", /source mutation/],
    ["scenario.json", '{"changed":true}', /source mutation/],
    ["apps/electron/dist/main.cjs", "stale artifact", /candidate artifacts/],
    [
      "packages/electron/package.json",
      '{"name":"electron","version":"0.0.0"}',
      /source mutation/,
    ],
  ]) {
    const target = join(f.destination, name);
    const original = readFileSync(target);
    writeFileSync(target, content);
    const result = f.invoke(["verify", "--record", f.record]);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, reason);
    writeFileSync(target, original);
  }
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("missing declared inputs fail preparation without overwriting source or existing destinations", (t) => {
  const f = fixture(t);
  const args = [...f.args];
  args[args.indexOf("--scenario-input") + 1] = "absent.json";
  const result = f.invoke(args);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing declared build input/);
  assert.notEqual(f.invoke().status, 0);
  assert.equal(
    readFileSync(join(f.source, "scenario.json"), "utf8"),
    '{"scenario":"fixture"}'
  );
});

test("a successor preserves its frozen predecessor and requires affected scenarios", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const args = [...f.args];
  args[args.indexOf("--destination") + 1] = join(f.root, "successor");
  assert.notEqual(f.invoke([...args, "--previous", f.record]).status, 0);
  const result = f.invoke([
    ...args,
    "--previous",
    f.record,
    "--affected",
    "fixture,relay-wss",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const successor = JSON.parse(
    readFileSync(join(f.root, "successor.candidate.json"))
  );
  assert.deepEqual(successor.successor.affectedScenarios, [
    "fixture",
    "relay-wss",
  ]);
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("rejects a destination whose physical parent aliases the source checkout", (t) => {
  const f = fixture(t);
  symlinkSync(f.source, join(f.root, "alias"));
  const args = [...f.args];
  args[args.indexOf("--destination") + 1] = join(
    f.root,
    "alias",
    "new-candidate"
  );
  const result = f.invoke(args);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside source checkout/);
});

test("a changed preparation runner can create a successor but cannot reuse old evidence", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const nextRunner = join(f.root, "next-runner.mjs");
  writeFileSync(
    nextRunner,
    `${readFileSync(command, "utf8")}\n// successor runner version\n`
  );
  const reuse = run(
    process.execPath,
    [nextRunner, "verify", "--record", f.record],
    f.source
  );
  assert.notEqual(reuse.status, 0);
  const args = [...f.args];
  args[args.indexOf("--destination") + 1] = join(
    f.root,
    "next-runner-candidate"
  );
  const successor = run(
    process.execPath,
    [nextRunner, ...args, "--previous", f.record, "--affected", "fixture"],
    f.source
  );
  assert.equal(successor.status, 0, successor.stderr);
});

test("hook Git context cannot redirect candidate preparation or mutate its parent index", (t) => {
  const parent = fixture(t);
  const f = fixture(t);
  writeFileSync(
    join(parent.source, "parent-work.txt"),
    "preserve hook owner work"
  );
  const index = readFileSync(join(parent.source, ".git/index"));
  const config = readFileSync(join(parent.source, ".git/config"));
  const status = run("git", ["status", "--porcelain"], parent.source).stdout;
  const environment = {
    GIT_DIR: join(parent.source, ".git"),
    GIT_WORK_TREE: parent.source,
    GIT_COMMON_DIR: join(parent.source, ".git"),
    GIT_INDEX_FILE: join(parent.source, ".git/index"),
    GIT_OBJECT_DIRECTORY: join(parent.source, ".git/objects"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(parent.source, ".git/objects"),
    GIT_PREFIX: "unrelated-prefix/",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.bare",
    GIT_CONFIG_VALUE_0: "true",
  };
  const prepared = run(
    process.execPath,
    [command, ...f.args],
    f.source,
    environment
  );
  assert.equal(prepared.status, 0, prepared.stderr);
  const verified = run(
    process.execPath,
    [command, "verify", "--record", f.record],
    f.source,
    environment
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(readFileSync(join(parent.source, ".git/index")), index);
  assert.deepEqual(readFileSync(join(parent.source, ".git/config")), config);
  assert.equal(
    run("git", ["status", "--porcelain"], parent.source).stdout,
    status
  );
  assert.equal(
    readFileSync(join(parent.source, "parent-work.txt"), "utf8"),
    "preserve hook owner work"
  );
});

test("prepares tracked internal dependency links before their generated targets exist", (t) => {
  const f = fixture(t, (source) =>
    symlinkSync("node_modules/node-datachannel/build", join(source, "build"))
  );
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(f.record));
  assert.equal(record.inputs.build.link, "node_modules/node-datachannel/build");
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("tracked external source links remain rejected", (t) => {
  const f = fixture(t, (source) =>
    symlinkSync("../foreign-worktree/build", join(source, "build"))
  );
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /wrong-worktree source link/);
});

test("a tracked dangling link cannot substitute for a required scenario input", (t) => {
  const f = fixture(t, (source) => {
    rmSync(join(source, "scenario.json"));
    symlinkSync("generated/missing.json", join(source, "scenario.json"));
  });
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT|regular candidate file/);
});

test("rejects installed runtime executable and emitted external module mutation", (t) => {
  const f = fixture(t);
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  for (const name of [
    "packages/electron/dist/electron",
    "packages/fixture-runtime/dist/index.cjs",
  ]) {
    const target = join(f.destination, name);
    const original = readFileSync(target);
    writeFileSync(target, "mutated installed runtime bytes");
    const mutated = f.invoke(["verify", "--record", f.record]);
    assert.notEqual(mutated.status, 0, name);
    assert.match(mutated.stderr, /runtime artifacts changed/);
    writeFileSync(target, original);
  }
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("missing runtime executables and changed execution permissions invalidate a candidate", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const executable = join(f.destination, "packages/electron/dist/electron");
  const original = readFileSync(executable);
  rmSync(executable);
  assert.notEqual(f.invoke(["verify", "--record", f.record]).status, 0);
  writeFileSync(executable, original, { mode: 0o755 });
  chmodSync(executable, 0o644);
  const result = f.invoke(["verify", "--record", f.record]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runtime artifacts changed/);
});

test("unselected installed tooling does not require universal artifact certification", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const tooling = join(f.destination, "node_modules/unused-tooling");
  mkdirSync(tooling);
  writeFileSync(join(tooling, "index.js"), "unselected tool bytes");
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("preparation refuses an installed Electron package without its declared executable", (t) => {
  const f = fixture(t, (source) => {
    const installer = join(source, "packages/electron/install.cjs");
    writeFileSync(
      installer,
      readFileSync(installer, "utf8").replace(
        "fs.writeFileSync(path.join(__dirname,'dist/electron'),'runtime fixture',{mode:0o755});",
        ""
      )
    );
  });
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT|installed Electron/);
});

test("emitted dynamic imports resolve import-only packages without loading them", (t) => {
  const f = fixture(t, (source) => {
    writeFileSync(
      join(source, "packages/fixture-runtime/package.json"),
      JSON.stringify({
        name: "fixture-runtime",
        version: "1.0.0",
        exports: { ".": { import: "./dist/index.cjs" } },
      })
    );
    const builder = join(source, "build-runtime.cjs");
    writeFileSync(
      builder,
      readFileSync(builder, "utf8").replace(
        "path:'fixture-runtime',external:true,kind:'require-call'",
        "path:'fixture-runtime',external:true,kind:'dynamic-import'"
      )
    );
  });
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("preparation rejects a missing external package emitted by the selected build", (t) => {
  const f = fixture(t, (source) => {
    const builder = join(source, "build-runtime.cjs");
    writeFileSync(
      builder,
      readFileSync(builder, "utf8").replace(
        "path:'fixture-runtime'",
        "path:'absent-runtime-input'"
      )
    );
  });
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absent-runtime-input/);
});

test("prepares the installed pinned Electron distribution through its explicit installer", (t) => {
  const f = fixture(t);
  assert.equal(existsSync(join(f.source, "packages/electron/path.txt")), false);
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(
      join(f.destination, "packages/electron/dist/electron"),
      "utf8"
    ),
    "runtime fixture"
  );
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("distribution overrides fail before cloning or touching a user distribution", (t) => {
  const f = fixture(t);
  const outside = join(f.root, "user-distribution");
  mkdirSync(outside);
  const canary = join(outside, "electron");
  writeFileSync(canary, "preserve owned user distribution");
  const result = run(process.execPath, [command, ...f.args], f.source, {
    ELECTRON_OVERRIDE_DIST_PATH: outside,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ELECTRON_OVERRIDE_DIST_PATH is unsupported/);
  assert.equal(existsSync(f.destination), false);
  assert.equal(
    readFileSync(canary, "utf8"),
    "preserve owned user distribution"
  );
});

test("cross-platform installer overrides cannot mislabel the selected runtime", (t) => {
  const f = fixture(t);
  const result = run(process.execPath, [command, ...f.args], f.source, {
    ELECTRON_INSTALL_ARCH: "unsupported-other-architecture",
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /unsupported Electron installation target override/
  );
  assert.equal(existsSync(f.destination), false);
});

test("preserves exact leading whitespace and embedded newlines in tracked candidate paths", (t) => {
  const name = " leading\nscenario.json";
  const f = fixture(t, (source) =>
    writeFileSync(join(source, name), '{"scenario":"exact-path"}')
  );
  const args = [...f.args];
  args[args.indexOf("--scenario-input") + 1] = name;
  const prepared = f.invoke(args);
  assert.equal(prepared.status, 0, prepared.stderr);
  const record = JSON.parse(readFileSync(f.record));
  assert.equal(record.scenario.input, name);
  assert.equal(typeof record.inputs[name], "string");
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

function frozenElectronFixture(
  t,
  nativeMode = "healthy",
  scenario = "electron-readiness"
) {
  const f = fixture(t, (source) => {
    for (const name of [
      "electron-relay-acceptance.mjs",
      "native-acceptance-attempts.mjs",
      "source-identity.mjs",
      "prepare-acceptance-candidate.mjs",
      "electron-required-native.cjs",
      ...(scenario === "electron-relay-pairing" &&
      existsSync(resolve("scripts/relay-pairing-acceptance.mjs"))
        ? ["relay-pairing-acceptance.mjs"]
        : []),
    ])
      writeFileSync(
        join(source, "scripts", name),
        readFileSync(resolve("scripts", name))
      );
    for (const [directory, name, body] of [
      [
        "sqlite",
        "better-sqlite3",
        `module.exports=class Database{constructor(){${nativeMode === "missing" ? "require('./missing-required-addon.node');" : nativeMode === "abi" ? "throw Object.assign(new Error('NODE_MODULE_VERSION 137 does not match runtime 148'),{code:'ERR_DLOPEN_FAILED'});" : ""}}close(){}};`,
      ],
      ["wrtc", "@koush/wrtc", "module.exports={RTCPeerConnection:class{}};"],
      [
        "unselected",
        "unselected-native",
        "require('./unavailable-optional.node');",
      ],
    ]) {
      mkdirSync(join(source, "packages", directory), { recursive: true });
      writeFileSync(
        join(source, "packages", directory, "package.json"),
        JSON.stringify({ name, version: "1.0.0", main: "index.cjs" })
      );
      writeFileSync(join(source, "packages", directory, "index.cjs"), body);
    }
    mkdirSync(join(source, "packages/playwright"));
    writeFileSync(
      join(source, "packages/playwright/package.json"),
      JSON.stringify({
        name: "playwright",
        version: "1.0.0",
        type: "module",
        main: "index.js",
      })
    );
    writeFileSync(
      join(source, "packages/playwright/index.js"),
      `
import Module,{createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
export const _electron={async launch({args,env,executablePath}){
 if(${JSON.stringify(nativeMode)}.startsWith('launch-')){
   const observation=path.join(path.dirname(args[0]),'required-native.json');
   if(${JSON.stringify(nativeMode)}==='launch-malformed')writeFileSync(observation,'{malformed observation');
   if(${JSON.stringify(nativeMode)}==='launch-unreadable')mkdirSync(observation);
   throw new Error('controlled GUI launch unavailable');
 }
 const child=new EventEmitter();child.pid=process.pid;child.exitCode=null;child.signalCode=null;
 const pairing=${JSON.stringify(scenario)}==='electron-relay-pairing'?require('../pairing-driver/state.cjs'):null;
 const state=pairing?pairing.electron:{identity:{deviceId:'controlled-device'},clips:[],pinnedIds:[]};let filter='All';let captureReadyAt=0;let pinReadyAt=0;let pendingPin;
 const clipboard={readText:()=>'',writeText(){}};
 const app={setName(){},getPath:()=>env.CLIPP_RELAY_ACCEPTANCE_PROFILE,focus(){},exit(){throw new Error('controlled runtime exit');}};
 const win={id:1,isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,isFocused:()=>true,show(){},focus(){},restore(){},webContents:{focus(){},id:2,getOSProcessId:()=>7,getURL:()=>pathToFileURL(path.resolve('apps/electron/dist/renderer/index.html')).href,sendInputEvent(event){if(event.type==='mouseUp'){if(pairing){pairing.electronClick(event.x,clipboard);if(event.x<90)filter=event.x<30?'Pinned':'All';return;}if(event.x>90){if(${JSON.stringify(nativeMode)}!=='pin-input-unobservable'){if(${JSON.stringify(nativeMode)}==='delayed-pin'){pinReadyAt=Date.now()+300;pendingPin=state.clips[0].id;}else state.pinnedIds=[state.clips[0].id];}}else filter=event.x<30?'Pinned':'All';}}}};
 const api={getState:async()=>{if(pairing)return pairing.observeElectron(clipboard);const content=clipboard.readText();if(content && !captureReadyAt)captureReadyAt=Date.now()+300;if(content && !state.clips.some(clip=>clip.content===content) && (${JSON.stringify(nativeMode)}!=='delayed-capture'||Date.now()>=captureReadyAt))state.clips.push({id:'controlled-clip',content,originPeerId:state.identity.deviceId});if(pendingPin&&Date.now()>=pinReadyAt)state.pinnedIds=[pendingPin];return state;}};
 const browser={window:{clipp:api},document:{hasFocus:()=>true}};const browserEvaluate=(fn,arg)=>vm.runInNewContext('('+String(fn)+')',browser)(arg);
 const card={getByTitle:(title)=>({boundingBox:async()=>{const expected=${JSON.stringify(nativeMode)}==='adopted-pin'?'Pin Clip':'Pin';if(typeof title==='string'?title!==expected:!title.test(expected))throw new Error('visible_pin_title_missing');return {x:100,y:1,width:10,height:10};}}),waitFor:async()=>{if(filter!=='Pinned'||!state.pinnedIds.length)throw new Error('native pin not observed');}};
 const page={setDefaultTimeout(){},waitForFunction:async(fn,arg)=>{if(String(fn).includes('window.clipp')){const success=browserEvaluate(fn,arg);if(!success)throw new Error('public state observation failed');}},getByRole:(_,options)=>({count:async()=>pairing?pairing.electronCount(options.name):0,boundingBox:async()=>({x:pairing?pairing.electronPoint(options.name):(options.name==='Pinned'?20:40),y:1,width:10,height:10})}),locator:()=>({filter:()=>card,getByRole:()=>({boundingBox:async()=>({x:300,y:1,width:10,height:10})})}),evaluate:async(fn,arg)=>browserEvaluate(fn,arg)};
 const previousExecutable=process.execPath;const previousLoader=Module._load;
 Object.defineProperty(process.versions,'electron',{value:'43.4.0',configurable:true});process.getSystemVersion=()=>'controlled';
 Module._load=function(name,...rest){return name==='electron'?{app,clipboard}:previousLoader.call(this,name,...rest);};
 try{if(executablePath)process.execPath=executablePath;require(args[0]);}finally{process.execPath=previousExecutable;Module._load=previousLoader;}
 return{process:()=>child,firstWindow:async()=>{if(!globalThis.__clippProductStarted)throw new Error('product not started');return page;},browserWindow:async()=>({evaluate:async(fn,arg)=>fn(win,arg)}),evaluate:async(fn,arg)=>vm.runInNewContext('('+String(fn)+')',{process:{...process,execPath:executablePath,argv:[executablePath,args[0]]}})({app,clipboard,BrowserWindow:{getFocusedWindow:()=>win},safeStorage:{isEncryptionAvailable:()=>false}},arg),close:async()=>{if(pairing)pairing.electronClosedAt=Date.now();child.exitCode=0;child.emit('exit',0,null);}};
}};
`
    );
    writeFileSync(
      join(source, "build-runtime.cjs"),
      `const fs=require('node:fs');fs.mkdirSync('dist/renderer',{recursive:true});fs.writeFileSync('dist/main.cjs',${JSON.stringify(nativeMode === "unusable-window" ? "globalThis.__clippProductStarted=false;" : "globalThis.__clippProductStarted=true;")});fs.writeFileSync('dist/preload.js','// selected preload');fs.writeFileSync('dist/renderer/index.html','selected renderer');fs.appendFileSync('../../build-count','built\\n');for(const entry of ['main','preload'])fs.writeFileSync('dist/'+entry+'.meta.json',JSON.stringify({outputs:{['dist/'+entry+'.cjs']:{imports:[{path:'electron',external:true,kind:'require-call'},{path:'better-sqlite3',external:true,kind:'require-call'},{path:'@koush/wrtc',external:true,kind:'require-call'}]}}}));`
    );
    writeFileSync(
      join(source, "install-runtime.cjs"),
      `const fs=require('node:fs');fs.mkdirSync('packages/sqlite/prebuilds',{recursive:true});fs.writeFileSync('packages/sqlite/prebuilds/fixture.node','selected native fixture');`
    );
    writeFileSync(
      join(source, "packages/electron/abi_version"),
      process.versions.modules
    );
    writeFileSync(
      join(source, ".gitignore"),
      "node_modules\ndist\npath.txt\nprebuilds\nbuild-count\n"
    );
    if (scenario === "electron-relay-pairing")
      setupPairingCompanion(source, nativeMode);
  });
  f.args[f.args.indexOf("--scenario") + 1] = scenario;
  const prepared = f.invoke();
  assert.equal(prepared.status, 0, prepared.stderr);
  const accept = (
    extra = [],
    candidateRecord = f.record,
    runner = join(f.destination, "scripts/electron-relay-acceptance.mjs")
  ) =>
    run(
      process.execPath,
      [
        runner,
        "--candidate-record",
        candidateRecord,
        "--effort",
        "frozen-fixture",
        "--history-root",
        join(f.root, "history"),
        "--profile",
        join(f.root, "profile"),
        "--output",
        join(f.root, "evidence"),
        "--transport",
        "wss",
        ...(scenario === "electron-clipboard-history"
          ? ["--scenario", "clipboard-history"]
          : scenario === "electron-relay-pairing"
            ? [
                "--scenario",
                "relay-pairing",
                "--discovery",
                "https://relay.example/v1/relay",
              ]
            : ["--preflight-only"]),
        ...extra,
      ],
      f.destination,
      {
        CLIPP_ACCEPTANCE_STATE_ROOT: join(f.root, "state"),
        PAIRING_FIXTURE_ROOT: f.root,
        ...(scenario === "electron-relay-pairing"
          ? {
              NODE_OPTIONS:
                "--import=" +
                join(f.destination, "packages/chrome-driver/process.mjs"),
            }
          : {}),
      }
    );
  const receipt = () =>
    JSON.parse(readFileSync(join(f.root, "evidence/receipt.json"), "utf8"));
  return { ...f, accept, receipt };
}

test("the maintained Electron command consumes a frozen selected candidate without rebuilding or loading unused native branches", (t) => {
  const f = frozenElectronFixture(t);
  const originalBuild = readFileSync(
    join(f.destination, "build-count"),
    "utf8"
  );
  const accepted = f.accept();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(
    readFileSync(join(f.destination, "build-count"), "utf8"),
    originalBuild
  );
  assert.equal(
    f.receipt().frozenCandidate.revision,
    JSON.parse(readFileSync(f.record)).source.revision
  );
  assert.equal(f.receipt().result, "passed");
});

test("required native-loader absence fails at the owning runtime stage before product readiness", (t) => {
  const f = frozenElectronFixture(t, "missing");
  assert.notEqual(f.accept().status, 0);
  assert.equal(f.receipt().stage, "required-native");
  assert.equal(f.receipt().classification, "prerequisite");
  assert.equal(f.receipt().reason, "required_native_module_missing");
});

test("owning-runtime native ABI failure remains a prerequisite failure rather than readiness", (t) => {
  const f = frozenElectronFixture(t, "abi");
  assert.notEqual(f.accept().status, 0);
  assert.equal(f.receipt().stage, "required-native");
  assert.equal(f.receipt().reason, "required_native_abi_mismatch");
  assert.equal(f.receipt().classification, "prerequisite");
});

test("frozen Electron preflight rejects stale application and selected native identities", (t) => {
  const f = frozenElectronFixture(t);
  for (const [index, name] of [
    "apps/electron/dist/main.cjs",
    "packages/sqlite/prebuilds/fixture.node",
  ].entries()) {
    const file = join(f.destination, name);
    const original = readFileSync(file);
    writeFileSync(file, "stale selected bytes");
    const result = f.accept(
      index
        ? [
            "--diagnostic-change",
            "verify changed native bytes",
            "--expected-observation",
            "frozen native identity refusal",
          ]
        : []
    );
    assert.notEqual(result.status, 0);
    assert.equal(f.receipt().stage, "frozen-candidate");
    assert.equal(f.receipt().classification, "prerequisite");
    assert.equal(f.receipt().reason, "frozen_candidate_invalid");
    writeFileSync(file, original);
  }
});

test("the running source checkout must own the selected frozen candidate", (t) => {
  const selected = frozenElectronFixture(t);
  const other = frozenElectronFixture(t);
  assert.notEqual(selected.accept([], other.record).status, 0);
  assert.equal(selected.receipt().reason, "frozen_candidate_checkout_mismatch");
});

test("the frozen candidate scenario must match the selected runtime observation", (t) => {
  const f = frozenElectronFixture(t, "healthy", "electron-wss");
  assert.notEqual(f.accept().status, 0);
  assert.equal(f.receipt().reason, "frozen_candidate_scenario_mismatch");
});

test("the frozen local-history scenario reaches capture and native pinning beyond readiness", (t) => {
  const f = frozenElectronFixture(t, "healthy", "electron-clipboard-history");
  const accepted = f.accept();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(f.receipt().behavior, {
    scenario: "clipboard-history",
    localClipCaptured: true,
    nativePinObserved: true,
    pinnedFilterVisible: true,
    persistedPublicState: true,
    passed: true,
  });
  assert.equal(f.receipt().requiredNative.result, "passed");
});

test("required-native success cannot qualify an unusable product window", (t) => {
  const f = frozenElectronFixture(t, "unusable-window");
  assert.notEqual(f.accept().status, 0);
  assert.equal(f.receipt().requiredNative.result, "passed");
  assert.equal(f.receipt().stage, "product-startup");
  assert.equal(f.receipt().reason, "product_startup_unavailable");
});

test("the selected history scenario fails when native pin input has no observable product effect", (t) => {
  const f = frozenElectronFixture(
    t,
    "pin-input-unobservable",
    "electron-clipboard-history"
  );
  const started = Date.now();
  assert.notEqual(f.accept(["--timeout-seconds", "1"]).status, 0);
  assert(
    Date.now() - started < 5000,
    "no-effect observation exceeded bounded scenario time"
  );
  assert.equal(f.receipt().stage, "clipboard-history");
  assert.notEqual(f.receipt().behavior?.passed, true);
});

for (const mode of ["launch-absent", "launch-malformed", "launch-unreadable"]) {
  test(`unavailable native observation (${mode}) remains launch evidence without a loader diagnosis`, (t) => {
    const f = frozenElectronFixture(t, mode);
    assert.notEqual(f.accept().status, 0);
    assert.equal(f.receipt().stage, "launch");
    assert.equal(f.receipt().classification, "runner");
    assert.equal(f.receipt().reason, "native_observation_unavailable");
    assert.equal(f.receipt().requiredNative, undefined);
    assert.match(f.receipt().recoveryAction, /GUI|launch/i);
    assert.doesNotMatch(
      f.receipt().recoveryAction,
      /fix reproducible setup|loader failure/i
    );
  });
}

for (const mode of ["delayed-capture", "delayed-pin"])
  test(`the local-history runner awaits ${mode} public state with the installed synchronous predicate contract`, (t) => {
    const f = frozenElectronFixture(t, mode, "electron-clipboard-history");
    const result = f.accept();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.receipt().behavior.passed, true);
  });

test("relay Pairing rejects an unregistered Chrome mapping before any native launch", (t) => {
  const f = frozenElectronFixture(t, "healthy", "electron-relay-pairing");
  const manifest = join(f.root, "pairing.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      version: 1,
      registeredExtensionId: "",
      chromeArguments: [],
    })
  );
  const result = f.accept(["--pairing-record", manifest]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pairing_registered_extension_required/);
  assert.equal(existsSync(join(f.root, "evidence/receipt.json")), false);
});

function setupPairingCompanion(source, mode) {
  writeFileSync(
    join(source, ".gitignore"),
    readFileSync(join(source, ".gitignore"), "utf8") + ".local\n"
  );
  const scripts = join(source, "apps/extension/scripts");
  mkdirSync(scripts, { recursive: true });
  for (const name of [
    "toolbar-acceptance.mjs",
    "clipboard-acceptance.mjs",
    "verify-clipboard-io.mjs",
    ...(existsSync(resolve("apps/extension/scripts/owned-relay-profile.mjs"))
      ? ["owned-relay-profile.mjs"]
      : []),
  ])
    writeFileSync(
      join(scripts, name),
      readFileSync(resolve("apps/extension/scripts", name))
    );
  if (mode === "initial-verifier-failure") {
    const file = join(scripts, "toolbar-acceptance.mjs");
    const body = readFileSync(file, "utf8");
    assert.ok(body.includes("return execFileSync(bin, argv, {"));
    writeFileSync(
      file,
      body.replace(
        "return execFileSync(bin, argv, {",
        'return execFileSync(bin, argv[0]?.endsWith("prepare-acceptance-candidate.mjs") && argv.includes("verify") ? ["-e", "process.stderr.write(\\"SYNTHETIC_VERIFIER_PRIVATE_CANARY\\".repeat(1000));process.exit(23)"] : argv, {'
      )
    );
  }
  // Capture only synthetic child-command diagnostics. This script is written
  // before fixture Git commit/freeze, so its manifest binds the exact logger.
  const toolbar = join(scripts, "toolbar-acceptance.mjs");
  let toolbarBody = readFileSync(toolbar, "utf8");
  const commandStart = toolbarBody.indexOf(
    "  function command(bin, argv, maximum = 60000) {"
  );
  const commandEnd = toolbarBody.indexOf(
    "  async function verifyBase()",
    commandStart
  );
  assert.ok(commandStart >= 0 && commandEnd > commandStart);
  let childCommand = toolbarBody.slice(commandStart, commandEnd);
  childCommand = childCommand.replace(
    "    attempt.assertBudget();",
    `    attempt.assertBudget();
    const childStarted = Date.now();
    const recordChild = (observation) => appendFileSync(join(process.env.PAIRING_FIXTURE_ROOT, "candidate-command-events.jsonl"), JSON.stringify({...observation, elapsedMs: Date.now()-childStarted})+"\\n", {mode:0o600});`
  );
  childCommand = childCommand.replace(
    "return execFileSync(bin,",
    "const output = execFileSync(bin,"
  );
  const caught =
    '    } catch {\n      throw new Error("candidate_command_failed");';
  assert.ok(childCommand.includes(caught));
  childCommand = childCommand.replace(
    caught,
    `      recordChild({status:0,signal:null});
      return output;
    } catch (error) {
      recordChild({status:error.status??null,signal:error.signal??null,code:error.code??null,stderr:String(error.stderr??"").slice(0,8192)});
      throw new Error("candidate_command_failed");`
  );
  toolbarBody =
    'import { appendFileSync } from "node:fs";\n' +
    toolbarBody.slice(0, commandStart) +
    childCommand +
    toolbarBody.slice(commandEnd);
  writeFileSync(toolbar, toolbarBody);
  const stateDir = join(source, "packages/pairing-driver");
  mkdirSync(stateDir);
  writeFileSync(
    join(stateDir, "package.json"),
    JSON.stringify({
      name: "pairing-driver",
      version: "1.0.0",
      main: "state.cjs",
    })
  );
  writeFileSync(
    join(stateDir, "state.cjs"),
    `
const E='E'.repeat(40), C='C'.repeat(40), R='R'.repeat(40), key='owned-relay';
const base=(id)=>({identity:{deviceId:id,membershipView:{admittedPeerIds:[id],revokedPeerIds:[]}},devices:[],pending:[],waiting:[],pairingState:{outcomes:[]},clips:[],pinnedIds:[],managedRelayConfigurations:[{kind:'managed',key,discoveryUrl:'https://relay.example/v1/relay'}],managedRelayStates:[{kind:'managed',key,status:${JSON.stringify(mode)}==='not-ready'&&!process.argv.includes('toolbar-relay-account-preparation')?'login_needed':'ready',peerId:R}],peerConnections:[]});
const modal=${JSON.stringify(mode)}==='adopted-modal',badged=modal||${JSON.stringify(mode)}==='badged-requests';const fs=require('node:fs'),path=require('node:path');const record=(name)=>fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-pairing-actions'),name+'\\n');
const electron=base(E), chrome=base(C);if(${JSON.stringify(mode)}.startsWith('fresh-auth')){chrome.managedRelayConfigurations=[];chrome.managedRelayStates=[];}if(${JSON.stringify(mode)}==='identity-changed'&&!process.argv.includes('toolbar-relay-account-preparation'))chrome.identity.deviceId='D'.repeat(40);
if(${JSON.stringify(mode)}==='prep-configuration')chrome.managedRelayConfigurations=null;
const route=(peer)=>({peerId:peer,hasRelay:true,hasDirect:${JSON.stringify(mode)}==='unknown-route'?undefined:${JSON.stringify(mode)}==='direct',addrs:['/dns4/relay.example/tcp/443/wss/p2p/'+R+'/p2p-circuit/p2p/'+peer]});
module.exports={electronTask:null,chromeTask:null,electron,chrome,E,C,R,target:'clipp:pair:public-signed-fixture',submitted:false,accepted:false,
 electronCount(name){return name==='Close QR dialog'?Number(this.electronTask==='qr'):name==='Close Pairing'?Number(modal&&this.electronTask==='pairing'):0;},
 electronPoint(name){if(name instanceof RegExp){if(!name.test(badged?'Requests active requests':'Requests'))throw new Error('requests_accessible_name_missing');name='requests-navigation';}if(badged&&name==='Requests')throw new Error('badged_requests_exact_name_missing');if(name==='requests-navigation')name='Requests';if(modal&&this.electronTask&&!({pairing:['Show my QR','Close Pairing'],qr:['Copy pairing text','Close QR dialog']})[this.electronTask].includes(name))throw new Error('electron_task_background_inert');return ({Pinned:20,All:40,Devices:200,'Pair this device':220,'Show my QR':240,'Copy pairing text':260,Requests:280,Accept:300,'Close QR dialog':320,'Close Pairing':340})[name]||10;},
 chromeClick(name){if(name instanceof RegExp&&name.source.startsWith('^Requests')){if(!name.test(badged?'Requests (loading)':'Requests'))throw new Error('requests_accessible_name_missing');name='requests-navigation';}if(badged&&name==='Requests')throw new Error('badged_requests_exact_name_missing');if(name==='requests-navigation')name='Requests';if(modal&&this.chromeTask&&!({pairing:['Paste pairing text','Close Pairing'],paste:['Pairing text','Submit pairing text','Back to Pairing']})[this.chromeTask].includes(name))throw new Error('chrome_task_background_inert');if(name==='Pair this device')this.chromeTask='pairing';if(name==='Paste pairing text')this.chromeTask='paste';if(name==='Back to Pairing'){this.chromeTask='pairing';record('chrome-back-preserves-'+electron.pending.length);}if(name==='Close Pairing'){this.chromeTask=null;record('chrome-close-preserves-'+electron.pending.length);}if(name==='Discard pairing input'){this.submitted=false;electron.pending=[];throw new Error('submitted_request_discarded');}},
 observeElectron(clipboard){const text=clipboard.readText();if(text.startsWith('clipp-native-local-')&&!electron.clips.some(c=>c.content===text))electron.clips.push({id:'eclip',content:text,originPeerId:E});return electron;},
 electronClick(x,clipboard){if(x===225)this.electronTask='pairing';if(x===245)this.electronTask='qr';if(x===325){this.electronTask='pairing';record('electron-close-qr');}if(x===345){this.electronTask=null;record('electron-close-pairing');}if(x===305&&modal&&(this.electronTask||this.chromeTask||!this.submitted||!electron.pending.length))throw new Error('native_accept_requires_preserved_request_and_unblocked_workspaces');if(x===105)electron.pinnedIds=['eclip'];if(x===265)clipboard.writeText(this.target);if(x===305&&${JSON.stringify(mode)}!=='no-accept'){this.accepted=true;electron.identity.membershipView.admittedPeerIds=[E,C];chrome.identity.membershipView.admittedPeerIds=[C,E];electron.devices=[{deviceId:C}];chrome.devices=[{deviceId:E}];electron.pending=[];chrome.waiting=[];}},
 submit(text){if(text!==this.target)throw new Error('invalid public target');this.submitted=true;electron.pending=[{deviceId:C,requestVersion:1}];chrome.waiting=[{deviceId:E}];electron.peerConnections=[route(C)];chrome.peerConnections=[route(E)];}
};`
  );
  const driver = join(source, "packages/chrome-driver");
  mkdirSync(driver);
  writeFileSync(
    join(driver, "package.json"),
    JSON.stringify({
      name: "@playwright/test",
      version: "1.0.0",
      type: "module",
      main: "index.js",
    })
  );
  writeFileSync(
    join(driver, "browser.cjs"),
    `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
if(process.argv.includes('--version')){console.log('Fixture Chromium 1');process.exit(0);}
const profile=process.argv.find(x=>x.startsWith('--user-data-dir=')).slice(16),root=process.env.PAIRING_FIXTURE_ROOT,human=!process.argv.includes('--remote-debugging-port=0'),mode=${JSON.stringify(mode)};
fs.writeFileSync(path.join(root,'chrome-profile'),profile);fs.writeFileSync(path.join(profile,'owned.pid'),String(process.pid));
fs.appendFileSync(path.join(root,'chrome-launches'),JSON.stringify({profile,phase:process.env.PAIRING_FIXTURE_OPERATION||'case',argv:process.argv.slice(2)})+'\\n');
if(human){
 const poll=setInterval(()=>{let record;try{record=JSON.parse(fs.readFileSync(path.join(path.dirname(profile),'pairing-profile.json'),'utf8'));}catch{return;}
 if(record.lastTarget?.pid!==process.pid||!record.lastTarget?.fingerprint)return;
 clearInterval(poll);
 if(mode!=='human-missing')fs.writeFileSync(path.join(profile,'synthetic-installed-extension.json'),JSON.stringify({id:mode==='human-wrong-id'?'b'.repeat(32):'a'.repeat(32),enabled:mode!=='human-disabled',installedViaCDP:mode==='human-cdp-only',path:mode==='human-wrong-path'?path.resolve('apps/electron/dist'):path.resolve('apps/extension/.local/relay-acceptance/wss')}));
 if(mode.startsWith('fresh-auth')){const configs=mode==='fresh-auth-save-rejected'?[]:[{key:'ui-generated-relay',name:'Pairing relay',kind:'managed',discoveryUrl:'https://relay.example/v1/relay'}];fs.writeFileSync(path.join(profile,'synthetic-normal-login.json'),JSON.stringify(configs));fs.writeFileSync(path.join(root,'normal-setup-actions'),'settings-ui\\nconnections-ui\\nadd-relay-ui\\nconfigure-approved-relay\\nsettings-ui\\nconnections-ui\\nexpand-relay-ui\\nlogin-ui\\n');}
 if(mode==='human-not-ready')fs.writeFileSync(path.join(profile,'synthetic-human-not-ready'),'true');
 if(mode==='human-source-changed')fs.appendFileSync(path.resolve('apps/extension/.local/relay-acceptance/wss/src/popup.html'),'changed during human phase');
 fs.writeFileSync(path.join(profile,'synthetic-human-completed'),'true');process.exit(0);
 },10);
}else fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'12345\\n/devtools/browser/fixture');
setTimeout(()=>process.exit(0),10000);`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(driver, "process.mjs"),
    `import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.spawn,ps=cp.spawnSync;let owned;cp.spawn=function(bin,args,options){const child=original.call(this,bin,args,options);if(bin.endsWith('/browser.cjs'))owned={child,command:bin+' '+args.join(' ')};return child;};cp.spawnSync=function(bin,args,options){if(bin==='ps'&&args[0]==='-ax'&&${JSON.stringify(mode)}==='human-uncertain'&&owned&&!owned.command.includes('--remote-debugging-port=0')&&owned.child.exitCode!==null)return {status:1,stdout:''};if(bin==='ps'&&args[0]==='-ax')return {status:0,stdout:owned&&owned.child.exitCode===null&&owned.child.signalCode===null?owned.child.pid+' '+owned.command:''};if(bin==='ps'&&args[0]==='-p'&&Number(args[1])===process.pid)return {status:0,stdout:'  1 Thu Oct 29 00:00:00 2026 '+process.argv.join(' ')};if(bin==='ps'&&owned&&args[0]==='-p'&&Number(args[1])===owned.child.pid)return owned.child.exitCode===null&&owned.child.signalCode===null?{status:0,stdout:'  '+process.pid+' Thu Oct 29 00:00:00 2026 '+owned.command}:{status:1,stdout:''};return ps.call(this,bin,args,options);};syncBuiltinESMExports();`
  );
  writeFileSync(
    join(driver, "index.js"),
    `
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const f=require('../pairing-driver/state.cjs');const id='a'.repeat(32);let open=false,typed='',focused=true,managementOpened=false,settingsOpened=false,cardOpened=false,connectionsOpened=false,relayEditorOpen=false,relayName='',relayDiscovery='';const ownProfile=()=>fs.readFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'chrome-profile'),'utf8');const authUrl='https://accounts.google.com/o/oauth2/auth?code=SYNTHETIC_OAUTH_CODE_CANARY&state=SYNTHETIC_OAUTH_STATE_CANARY';const persistHistory=()=>fs.writeFileSync(path.join(ownProfile(),'synthetic-history.json'),JSON.stringify({clips:f.chrome.clips,pinnedIds:f.chrome.pinnedIds}));
const locator=(name,scope)=>({async click(){if(name==='Log in'){fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'controlled-login-attempts'),'login\\n');throw new Error('controlled_authentication_forbidden');}f.chromeClick(name);if(${JSON.stringify(mode)}==='input')throw new Error('native input unavailable');if(name==='Paste pairing text'&&${JSON.stringify(mode)}==='focus-lost')focused=false;if(name==='Settings'){settingsOpened=true;fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'settings-ui\\n');}if(name==='Connections'){connectionsOpened=true;fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'connections-ui\\n');}if(name==='Add relay'){if(!connectionsOpened)throw new Error('settings_navigation_required');relayEditorOpen=true;fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'add-relay-ui\\n');}if(name==='Save'&&${JSON.stringify(mode)}==='fresh-auth-save-rejected')return;if(name==='Save'){if(!relayEditorOpen||relayName!=='Pairing relay'||relayDiscovery!=='https://relay.example/v1/relay')throw new Error('approved_relay_form_required');f.chrome.managedRelayConfigurations=[{key:'ui-generated-relay',name:relayName,kind:'managed',discoveryUrl:relayDiscovery}];f.chrome.managedRelayStates=f.chrome.managedRelayConfigurations.map(config=>({...config,status:'login_needed',peerId:f.R}));relayEditorOpen=false;fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'configure-approved-relay\\n');}if(name==='summary'){cardOpened=true;fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'expand-relay-ui\\n');}if(name==='Log in'&&${JSON.stringify(mode)}.startsWith('fresh-auth')){if(${JSON.stringify(mode)}==='fresh-auth'&&(!settingsOpened||!connectionsOpened||!cardOpened))throw new Error('selected_settings_card_is_closed');f.chrome.managedRelayStates=f.chrome.managedRelayConfigurations.map(config=>({...config,status:'ready',peerId:f.R}));fs.writeFileSync(path.join(ownProfile(),'synthetic-normal-login.json'),JSON.stringify(f.chrome.managedRelayConfigurations));fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'login-ui\\n');}if(name==='Submit pairing text')f.submit(typed);if(name===(${JSON.stringify(mode)}==='adopted-pin'?'Pin Clip':'Pin') || (name instanceof RegExp && name.test(${JSON.stringify(mode)}==='adopted-pin'?'Pin Clip':'Pin'))){const clip=f.chrome.clips.find(value=>(!scope||value.content===scope)&&!f.chrome.pinnedIds.includes(value.id));if(!clip)throw new Error('new_unpinned_clip_not_visible');f.chrome.pinnedIds.push(clip.id);persistHistory();}},async fill(value){if(name==='Name')relayName=value;else if(name==='HTTPS discovery URL')relayDiscovery=value;else typed=value;},async count(){if(name==='Connections')return Number(${JSON.stringify(mode)}.startsWith('fresh-auth'));if(name==='.managed-relay-editor')return Number(relayEditorOpen);if(name==='Back to Pairing')return Number(${JSON.stringify(mode)}==='adopted-modal'&&f.chromeTask==='paste');if(name==='Close Pairing')return Number(${JSON.stringify(mode)}==='adopted-modal'&&f.chromeTask==='pairing');return name==='Settings'&&${JSON.stringify(mode)}.startsWith('fresh-auth')?1:0;},async evaluate(fn){return String(fn).includes('tagName')?{tag:${JSON.stringify(mode)}==='fresh-auth'?'DETAILS':'DIV',open:cardOpened}:true;},async waitFor(){if(name?.includes('Acceptance')&&!f.accepted)throw new Error('unconfirmed acceptance');},async isVisible(){return name?.includes("Acceptance")?f.accepted:f.chrome.clips.some(c=>c.content===name);},filter(options){return locator(name,options?.hasText||scope);},locator:(child)=>locator(child,scope),getByTitle:(title)=>locator(title,scope),first(){return this;},getByText:(text)=>locator(text),getByRole:(_,q)=>locator(q.name),getByLabel:(label)=>locator(label)});
const popup={url:()=> 'chrome-extension://'+id+'/src/popup.html',getByRole:(_,q)=>locator(q.name),getByLabel:(name)=>locator(name),getByTitle:(name)=>locator(name),keyboard:{async insertText(value){typed=value;}},locator:(name)=>locator(name),getByText:(name)=>locator(name),async evaluate(fn,arg){if(arg?.type==='managedRelaySet'&&${JSON.stringify(mode)}.startsWith('fresh-auth'))return {ok:false,error:'unsupported_legacy_configuration_command'};if(arg?.type==='managedRelaySet'){f.chrome.managedRelayConfigurations=arg.configurations;f.chrome.managedRelayStates=arg.configurations.map(config=>({...config,status:'login_needed',peerId:f.R}));fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'normal-setup-actions'),'configure-approved-relay\\n');return {ok:true};}if(arg?.target==='offscreen')return {ok:false,error:'offscreen_control_unauthorized'};if(arg?.type==='getStatus'&&${JSON.stringify(mode)}==='prep-transport')return {started:true,relayAcceptanceTransport:'webrtc-direct',acceptanceMemoryClipboard:true,secret:'SYNTHETIC_OAUTH_CODE_CANARY'};if(arg?.type==='getStatus')return {started:true,acceptanceMemoryClipboard:!(${JSON.stringify(mode)}==='no-early-memory'&&!process.argv.includes('toolbar-relay-account-preparation')),...(${JSON.stringify(mode)}==='ordinary-build'&&!process.argv.includes('toolbar-relay-account-preparation')?{}:{relayAcceptanceTransport:'wss'})};if(String(fn).includes('document.hasFocus')&&!String(fn).includes('chrome.runtime.id'))return focused;if(arg?.type==='getRuntimeState'||String(fn).includes('getRuntimeState'))return {state:structuredClone(f.chrome)};if(arg?.type==='clipboardUpdate'){if(!f.chrome.clips.some(value=>value.content===arg.text))f.chrome.clips.push({id:'cclip-'+(f.chrome.clips.length+1),content:arg.text,originPeerId:f.chrome.identity.deviceId});persistHistory();return {ok:true};}return {id,isPopup:true,memory:true,earlyMemory:${JSON.stringify(mode)}!=='prep-early-memory'&&(${JSON.stringify(mode)}!=='verification-continuation'||process.env.VERIFY_CONTINUATION==='1'),focused:true};}};
const tab={url:()=> 'about:blank',async bringToFront(){open=false;}};
const session={async send(method,arg){if(method==='Extensions.loadUnpacked'){fs.appendFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'controlled-load-attempts'),'load\\n');throw new Error('controlled_installation_forbidden');}if(method==='Extensions.getExtensions'&&${JSON.stringify(mode)}==='oauth-private')throw new Error('https://accounts.google.com/o/oauth2/auth?code=SYNTHETIC_OAUTH_CODE_CANARY&state=SYNTHETIC_OAUTH_STATE_CANARY');if(method==='Extensions.getExtensions'){const file=path.join(ownProfile(),'synthetic-installed-extension.json');let installed=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;if(installed?.installedViaCDP){fs.unlinkSync(file);installed=null;}if(installed&&${JSON.stringify(mode)}==='wrong-id'&&!process.argv.includes('toolbar-relay-account-preparation'))installed.id='b'.repeat(32);return {extensions:installed?(${JSON.stringify(mode)}==='human-duplicate'?[installed,installed]:[installed]):[]};}if(method==='Target.getTargetInfo')return {targetInfo:{targetId:'page',type:'page',url:'about:blank',browserContextId:'owned'}};if(method==='Target.getTargets')return {targetInfos:[{targetId:'tab',type:'tab',url:'about:blank',browserContextId:'owned'}]};if(method==='Browser.getWindowForTarget')return {windowId:1};if(method==='Extensions.triggerAction')open=true;return {};}};
const context={async addInitScript(){},serviceWorkers:()=>${JSON.stringify(mode)}==='dormant-worker'&&!managementOpened?[]:[{url:()=> 'chrome-extension://'+id+'/background.js'}],pages:()=>open?[tab,popup]:[tab],async newPage(){let url='';return {async goto(value){url=value;if(value==='chrome-extension://'+id+'/src/options.html')managementOpened=true;},url:()=>url,evaluate:popup.evaluate,async bringToFront(){},locator:(name)=>locator(name),getByRole:(_,q)=>locator(q.name),getByLabel:(label)=>locator(label)};},async newCDPSession(){return session;}};
export const chromium={executablePath:()=>path.resolve('packages/chrome-driver/browser.cjs'),async connectOverCDP(){if(fs.existsSync(path.join(ownProfile(),'synthetic-history.json'))){const history=JSON.parse(fs.readFileSync(path.join(ownProfile(),'synthetic-history.json'),'utf8'));f.chrome.clips=history.clips;f.chrome.pinnedIds=history.pinnedIds;}if(fs.existsSync(path.join(ownProfile(),'synthetic-normal-login.json'))){f.chrome.managedRelayConfigurations=JSON.parse(fs.readFileSync(path.join(ownProfile(),'synthetic-normal-login.json'),'utf8'));f.chrome.managedRelayStates=f.chrome.managedRelayConfigurations.map(config=>({...config,status:'ready',peerId:f.R}));}if(fs.existsSync(path.join(ownProfile(),'synthetic-human-not-ready')))f.chrome.managedRelayStates=f.chrome.managedRelayConfigurations.map(config=>({...config,status:'login_needed',peerId:f.R}));return {contexts:()=>[context],async newBrowserCDPSession(){return session;},async close(){if(${JSON.stringify(mode)}==='near-cleanup'&&!process.argv.includes('toolbar-relay-account-preparation')){while(!f.electronClosedAt)await new Promise(done=>setTimeout(done,1));await new Promise(done=>setTimeout(done,Math.max(0,f.electronClosedAt+42-Date.now())));}if(${JSON.stringify(mode)}==='slow-cleanup'&&!process.argv.includes('toolbar-relay-account-preparation')){const receipt=path.join(process.env.PAIRING_FIXTURE_ROOT,'evidence/receipt.json'),deadline=Date.now()+5000;while(!fs.existsSync(receipt)&&Date.now()<deadline)await new Promise(done=>setTimeout(done,10));const published=fs.existsSync(receipt);fs.writeFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'companion-close-observation.json'),JSON.stringify({electronReceiptPublished:published,electronResult:published?JSON.parse(fs.readFileSync(receipt,'utf8')).result:undefined}));if(!published)throw new Error('electron_cleanup_waited_for_companion');}if(${JSON.stringify(mode)}==='cleanup'&&!process.argv.includes('toolbar-relay-account-preparation'))throw new Error('SYNTHETIC_PRIVATE_CLEANUP_CANARY');const profile=fs.readFileSync(path.join(process.env.PAIRING_FIXTURE_ROOT,'chrome-profile'),'utf8');process.kill(Number(fs.readFileSync(path.join(profile,'owned.pid'),'utf8')),'SIGTERM');}};}};
`
  );
  const build = join(source, "build-runtime.cjs");
  writeFileSync(
    build,
    readFileSync(build, "utf8") +
      `;fs.mkdirSync('../../apps/extension/.local/relay-acceptance/wss/src',{recursive:true});fs.writeFileSync('../../apps/extension/.local/relay-acceptance/wss/manifest.json','{"version":"1"}');fs.writeFileSync('../../apps/extension/.local/relay-acceptance/wss/src/popup.html','fixture popup');`
  );
}
function relayPairFixture(t, mode = "healthy") {
  const f = frozenElectronFixture(t, mode, "electron-relay-pairing");
  const verified = f.invoke(["verify", "--record", f.record]);
  assert.equal(verified.status, 0, verified.stderr);
  const base = JSON.parse(verified.stdout);
  const browser = realpathSync(
      join(f.destination, "packages/chrome-driver/browser.cjs")
    ),
    extension = realpathSync(
      join(f.destination, "apps/extension/.local/relay-acceptance/wss")
    ),
    id = "a".repeat(32);
  const artifacts = Object.fromEntries(
    ["manifest.json", "src/popup.html"].map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(join(extension, name)))
        .digest("hex"),
    ])
  );
  const extRecord = join(f.root, "extension.json");
  writeFileSync(
    extRecord,
    JSON.stringify({
      version: 1,
      sourceRevision: base.revision,
      baseArtifact: base.artifact,
      baseRecord: f.record,
      extensionPath: extension,
      stagedExtensionPath: extension,
      rawLoadPath: extension,
      realLoadPath: extension,
      registeredExtensionId: id,
      relayAcceptanceTransport: "wss",
      acceptanceMemoryClipboard: true,
      artifacts,
      browser: {
        path: browser,
        sha256: createHash("sha256")
          .update(readFileSync(browser))
          .digest("hex"),
        version: "Fixture Chromium 1",
      },
    })
  );
  const record = join(f.root, "pairing.json");
  writeFileSync(
    record,
    JSON.stringify({
      version: 1,
      registeredExtensionId: id,
      chromeArguments: [
        "--scenario",
        "toolbar-relay-pairing",
        "--effort",
        "frozen-fixture",
        "--history-root",
        join(f.root, "history"),
        "--output",
        join(f.root, "chrome-evidence"),
        "--candidate-record",
        f.record,
        "--extension-record",
        extRecord,
        "--discovery",
        "https://relay.example/v1/relay",
        "--registered-extension-id",
        id,
      ],
    })
  );
  const profileRoot = join(realpathSync(f.root), "state/owned-chrome-profiles"),
    profileRecord = join(profileRoot, "pairing-profile.json");
  const manifest = JSON.parse(readFileSync(record));
  manifest.chromeArguments.push(
    "--profile-root",
    profileRoot,
    "--profile-record",
    profileRecord
  );
  writeFileSync(record, JSON.stringify(manifest));
  const prepareAccount = ({
    expectFailureAt,
    extra = [],
    toolingRoot = f.destination,
    environment = {},
  } = {}) => {
    const result = run(
      process.execPath,
      [
        join(toolingRoot, "apps/extension/scripts/verify-clipboard-io.mjs"),
        ...JSON.parse(readFileSync(record)).chromeArguments.flatMap((value) =>
          value === "toolbar-relay-pairing"
            ? ["toolbar-relay-account-preparation"]
            : value === join(f.root, "chrome-evidence")
              ? [join(f.root, "account-evidence")]
              : [value]
        ),
        "--timeout-seconds",
        "15",
        ...extra,
      ],
      f.destination,
      {
        CLIPP_ACCEPTANCE_STATE_ROOT: join(realpathSync(f.root), "state"),
        PAIRING_FIXTURE_ROOT: f.root,
        PAIRING_FIXTURE_OPERATION: "account-preparation",
        ...environment,
        NODE_OPTIONS:
          "--import=" +
          join(f.destination, "packages/chrome-driver/process.mjs"),
      }
    );
    let receipt;
    try {
      receipt = JSON.parse(
        readFileSync(join(f.root, "account-evidence/receipt.json"), "utf8")
      );
    } catch {
      /* A failed runner may not have emitted a receipt. */
    }
    if (
      result.status !== 0 &&
      (!expectFailureAt || receipt?.operation !== expectFailureAt)
    ) {
      const childPath = join(f.root, "candidate-command-events.jsonl");
      let child;
      try {
        child = readFileSync(childPath, "utf8")
          .trim()
          .split("\n")
          .map(JSON.parse)
          .findLast((value) => value.status !== 0);
      } catch {
        /* Preserve the runner failure even if its child produced no diagnostic. */
      }
      const observed = child ?? {
        status: result.status,
        signal: result.signal,
        code: result.error?.code,
      };
      const codes = [
        "ETIMEDOUT",
        "ENOENT",
        "EACCES",
        "EPERM",
        "EAGAIN",
        "ENOBUFS",
        "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      ];
      const summary = {
        root: f.root,
        childFailureObserved: Boolean(child),
        status: Number.isInteger(observed.status) ? observed.status : null,
        signal:
          typeof observed.signal === "string" &&
          /^SIG[A-Z0-9]+$/.test(observed.signal)
            ? observed.signal
            : null,
        code:
          observed.code == null
            ? null
            : codes.includes(observed.code)
              ? observed.code
              : "other",
        privateDiagnostic: childPath,
        privateRunnerDiagnostic: join(
          f.root,
          "unexpected-preparation.private.json"
        ),
      };
      writeFileSync(
        summary.privateRunnerDiagnostic,
        JSON.stringify({
          stdout: String(result.stdout ?? "").slice(0, 8192),
          stderr: String(result.stderr ?? "").slice(0, 8192),
        }),
        { mode: 0o600 }
      );
      writeFileSync(
        join(f.root, "unexpected-preparation.json"),
        JSON.stringify(summary),
        { mode: 0o600 }
      );
      return {
        ...result,
        stdout: "",
        stderr: `Unexpected synthetic preparation failure; evidence retained: ${JSON.stringify(summary)}\n`,
      };
    }
    return result;
  };
  return {
    ...f,
    extRecord,
    pairingRecord: record,
    profileRecord,
    profileRoot,
    prepareAccount,
    launches: () =>
      existsSync(join(f.root, "chrome-launches"))
        ? readFileSync(join(f.root, "chrome-launches"), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
    runPair(extra = [], prepare = true) {
      if (prepare && !existsSync(profileRecord)) {
        const ready = prepareAccount();
        assert.equal(ready.status, 0, ready.stdout + ready.stderr);
      }
      return f.accept([
        "--pairing-record",
        record,
        "--timeout-seconds",
        "5",
        ...extra,
      ]);
    },
  };
}

test("relay Pairing observes normal request, native Accept and reciprocal Membership with both owned cleanups", (t) => {
  const f = relayPairFixture(t);
  const result = f.runPair();
  assert.equal(
    result.status,
    0,
    result.stdout +
      result.stderr +
      readdirSync(f.root, { recursive: true })
        .filter((x) => x.endsWith("failure.private.json"))
        .map((x) => readFileSync(join(f.root, x), "utf8"))
        .join("\n")
  );
  assert.equal(f.receipt().pairing?.reciprocalMembership, true);
  assert.equal(f.receipt().shutdown, "graceful");
  const chrome = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(chrome.pairing?.reciprocalMembership, true);
  assert.equal(chrome.shutdown, "verified-owned-browser-closed");
});

test("relay Pairing reads acceptance proof through the authorized background status protocol", (t) => {
  const f = relayPairFixture(t, "background-status");
  const result = f.runPair();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.receipt().pairing?.reciprocalMembership, true);
});

for (const mode of ["badged-requests", "adopted-modal"]) {
  test(`relay Pairing follows normal ${mode} navigation without discarding the submitted request`, (t) => {
    const f = relayPairFixture(t, mode);
    const result = f.runPair();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(f.receipt().pairing?.reciprocalMembership, true);
    if (mode === "adopted-modal") {
      assert.deepEqual(
        readFileSync(join(f.root, "normal-pairing-actions"), "utf8")
          .trim()
          .split("\n"),
        [
          "electron-close-qr",
          "electron-close-pairing",
          "chrome-back-preserves-1",
          "chrome-close-preserves-1",
        ]
      );
    }
  });
}

test("relay Pairing pins the exact fresh Clip through adopted Pin Clip controls", (t) => {
  const f = relayPairFixture(t, "adopted-pin");
  const result = f.runPair();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.receipt().pairing?.reciprocalMembership, true);
  assert.equal(f.receipt().behavior?.persistedPublicState, true);
  const chrome = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(chrome.behavior?.freshClip, true);
  assert.equal(chrome.behavior?.exactNewPin, true);
  assert.equal(chrome.behavior?.pinPersisted, true);
});

for (const mode of [
  "not-ready",
  "direct",
  "no-accept",
  "input",
  "wrong-id",
  "cleanup",
  "focus-lost",
  "unknown-route",
  "identity-changed",
  "no-early-memory",
]) {
  test(`relay Pairing refuses ${mode} without laundering either owned receipt`, (t) => {
    const f = relayPairFixture(t, mode);
    const result = f.runPair();
    assert.notEqual(result.status, 0);
    const electron = f.receipt(),
      chrome = JSON.parse(
        readFileSync(join(f.root, "chrome-evidence/receipt.json"))
      );
    assert.equal(electron.result, "failed");
    assert.equal(chrome.result, "failed");
    assert.ok(electron.history.key);
    assert.ok(chrome.history.key);
    assert.notEqual(electron.history.key, chrome.history.key);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /SYNTHETIC_PRIVATE_CLEANUP_CANARY|clipp:pair:public-signed-fixture/
    );
    if (mode === "cleanup") {
      assert.equal(chrome.shutdown, "unknown");
      assert.equal(chrome.classification, "cleanup");
      assert.equal(chrome.pairing.reciprocalMembership, true);
    }
    if (mode === "wrong-id") assert.equal(chrome.stage, "worker");
    if (["direct", "no-accept", "not-ready"].includes(mode))
      assert.equal(electron.stage, "relay-pairing");
  });
}

test("relay Pairing refuses an alias mapping drift before either native launch", (t) => {
  const f = relayPairFixture(t),
    sidecar = JSON.parse(readFileSync(f.extRecord));
  const ready = f.prepareAccount();
  assert.equal(ready.status, 0, ready.stdout + ready.stderr);
  sidecar.rawLoadPath += "-different";
  writeFileSync(f.extRecord, JSON.stringify(sidecar));
  const result = f.runPair();
  assert.notEqual(result.status, 0);
  assert.equal(f.receipt().shutdown, "not-launched");
  assert.equal(
    f.launches().filter((value) => value.phase === "case").length,
    0
  );
  const chrome = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(chrome.stage, "candidate");
  assert.equal(chrome.result, "failed");
});

test("relay Pairing cannot reset a failed semantic attempt through the same output", (t) => {
  const f = relayPairFixture(t, "direct");
  assert.notEqual(f.runPair().status, 0);
  const before = readFileSync(join(f.root, "evidence/receipt.json"), "utf8"),
    chromeBefore = readFileSync(
      join(f.root, "chrome-evidence/receipt.json"),
      "utf8"
    );
  const result = f.runPair();
  assert.notEqual(result.status, 0);
  assert.equal(
    readFileSync(join(f.root, "evidence/receipt.json"), "utf8"),
    before
  );
  assert.equal(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"), "utf8"),
    chromeBefore
  );
  assert.match(result.stdout + result.stderr, /diagnos|renew|failed/i);
});

for (const [name, value] of [
  ["effort", "other"],
  ["discovery", "https://other.example/v1/relay"],
  ["candidate-record", "/tmp/other-record.json"],
]) {
  test(`relay Pairing rejects repeated scalar ${name} before native admission`, (t) => {
    const f = relayPairFixture(t),
      result = f.runPair([`--${name}`, value]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate_electron_option/);
    assert.equal(existsSync(join(f.root, "evidence/receipt.json")), false);
    assert.equal(
      f.launches().filter((value) => value.phase === "case").length,
      0
    );
  });
}
test("relay Pairing companion cleanup wait consumes only the owning cleanup allowance", (t) => {
  const f = relayPairFixture(t, "slow-cleanup"),
    result = f.runPair(["--cleanup-timeout-ms", "50"]);
  assert.notEqual(result.status, 0);
  const receipt = f.receipt();
  assert.deepEqual(
    JSON.parse(readFileSync(join(f.root, "companion-close-observation.json"))),
    { electronReceiptPublished: true, electronResult: "failed" },
    "Electron must finalize its public receipt before companion close can finish"
  );
  assert.equal(receipt.result, "failed");
  const chrome = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(chrome.result, "failed");
});

test("relay Pairing near-deadline cleanup rendezvous gives both immutable receipts one outcome", (t) => {
  const f = relayPairFixture(t, "near-cleanup"),
    result = f.runPair(["--cleanup-timeout-ms", "50"]),
    electron = f.receipt(),
    chrome = JSON.parse(
      readFileSync(join(f.root, "chrome-evidence/receipt.json"))
    );
  assert.equal(
    electron.result,
    chrome.result,
    "the two immutable joint receipts disagreed across the cleanup deadline"
  );
  if (electron.result === "passed") {
    assert.equal(result.status, 0);
    assert.equal(electron.shutdown, "graceful");
    assert.equal(chrome.shutdown, "verified-owned-browser-closed");
  } else assert.notEqual(result.status, 0);
});

test("relay Pairing refuses an ordinary Chrome runtime before requesting a peer", (t) => {
  const f = relayPairFixture(t, "ordinary-build"),
    result = f.runPair();
  assert.notEqual(result.status, 0);
  const electron = f.receipt(),
    chrome = JSON.parse(
      readFileSync(join(f.root, "chrome-evidence/receipt.json"))
    );
  assert.equal(electron.result, "failed");
  assert.equal(chrome.result, "failed");
  assert.equal(electron.pairing, undefined);
  assert.equal(chrome.pairing, undefined);
  assert.equal(electron.stage, "relay-pairing");
});

test("account preparation separates human authentication from controlled public Ready verification", (t) => {
  const f = relayPairFixture(t),
    result = f.prepareAccount();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const launches = f.launches();
  assert.equal(
    launches.length,
    2,
    "human-only browser must close before a distinct controlled verification launch"
  );
  assert.equal(launches[0].profile, launches[1].profile);
  assert.deepEqual(launches[0].argv, [
    `--user-data-dir=${launches[0].profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "chrome://extensions/",
  ]);
  assert.ok(launches[1].argv.includes("--remote-debugging-port=0"));
  const receipt = JSON.parse(
    readFileSync(join(f.root, "account-evidence/receipt.json"))
  );
  assert.equal(
    receipt.humanPreparation.shutdown,
    "verified-owned-browser-closed"
  );
  assert.equal(receipt.humanPreparation.debuggerAttached, false);
  assert.equal(receipt.humanPreparation.runtimeIsolationObserved, false);
  assert.equal(receipt.accountPreparation.readyObserved, true);
  const closure = JSON.parse(
    readFileSync(receipt.humanPreparation.closureProof)
  );
  assert.equal(closure.profile, launches[0].profile);
  assert.equal(closure.shutdown, "verified-owned-browser-closed");
});

for (const mode of [
  "human-wrong-id",
  "human-wrong-path",
  "human-disabled",
  "human-duplicate",
  "human-not-ready",
  "human-source-changed",
  "human-cdp-only",
  "human-uncertain",
]) {
  test(`human preparation refuses ${mode} without reinstall, controlled login or invented Ready`, (t) => {
    const operation =
      mode === "human-not-ready"
        ? "observe_owned_relay_ready"
        : mode === "human-source-changed"
          ? "verify_controlled_launch_inputs"
          : mode === "human-uncertain"
            ? "verify_human_browser_closed"
            : "observe_loaded_extension_inventory";
    const f = relayPairFixture(t, mode),
      result = f.prepareAccount({ expectFailureAt: operation });
    assert.notEqual(result.status, 0);
    const receipt = JSON.parse(
      readFileSync(join(f.root, "account-evidence/receipt.json"))
    );
    assert.equal(receipt.operation, operation);
    assert.notEqual(receipt.accountPreparation?.prepared, true);
    assert.equal(existsSync(join(f.root, "controlled-load-attempts")), false);
    assert.equal(existsSync(join(f.root, "controlled-login-attempts")), false);
    const ownership = JSON.parse(readFileSync(f.profileRecord));
    assert.notEqual(ownership.status, "prepared");
    assert.equal(
      f.launches().length,
      ["human-source-changed", "human-uncertain"].includes(mode) ? 1 : 2
    );
    if (mode === "human-uncertain") {
      assert.equal(receipt.shutdown, "unknown");
      assert.equal(ownership.status, "uncertain");
      assert.equal(existsSync(f.profileRecord + ".lock"), true);
      assert.notEqual(
        receipt.humanPreparation.shutdown,
        "verified-owned-browser-closed"
      );
      assert.equal(receipt.clipboard.humanRuntimeObserved, false);
      assert.equal(receipt.clipboard.controlledRuntimeObserved, false);
      assert.equal(receipt.clipboard.hostUsed, undefined);
    } else
      assert.equal(
        receipt.humanPreparation.shutdown,
        "verified-owned-browser-closed"
      );
    if (mode === "human-source-changed") {
      assert.equal(receipt.shutdown, "verified-owned-browser-closed");
      assert.equal(receipt.cleanupFailure, undefined);
      assert.equal(ownership.status, "closed-unprepared");
      assert.equal(existsSync(f.profileRecord + ".lock"), false);
      assert.equal(existsSync(receipt.humanPreparation.closureProof), true);
    }
    if (mode === "human-cdp-only") {
      const failures = readdirSync(join(f.root, "account-evidence"), {
        recursive: true,
      }).filter((name) => name.endsWith("failure.private.json"));
      assert.equal(failures.length, 1);
      const diagnostic = JSON.parse(
        readFileSync(join(f.root, "account-evidence", failures[0]), "utf8")
      );
      assert.equal(
        diagnostic.protocol.acknowledgedId,
        null,
        "expected registration is not a CDP acknowledgement"
      );
      assert.equal(
        diagnostic.protocol.installedObservedId ?? null,
        null,
        "absent installation cannot be reported as observed"
      );
    }
    if (mode === "human-not-ready")
      assert.equal(receipt.failure, "owned_human_login_required");
  });
}

test("normal account preparation retains one owned Chrome profile before the bounded Pairing case", (t) => {
  const f = relayPairFixture(t),
    prepared = f.prepareAccount();
  assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
  const ownership = JSON.parse(readFileSync(f.profileRecord));
  assert.equal(ownership.status, "prepared");
  assert.ok(existsSync(ownership.profile));
  writeFileSync(
    join(ownership.profile, "DevToolsActivePort"),
    "stale-owned-endpoint"
  );
  writeFileSync(
    join(ownership.profile, "synthetic-retention-canary"),
    "same-owned-directory"
  );

  const result = f.runPair();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    readFileSync(join(ownership.profile, "synthetic-retention-canary"), "utf8"),
    "same-owned-directory"
  );
  const after = JSON.parse(readFileSync(f.profileRecord));
  assert.equal(after.profile, ownership.profile);
  assert.equal(after.publicDeviceId, ownership.publicDeviceId);
  assert.equal(after.status, "prepared");
});

test("Pairing requires completed owned account preparation before either feature attempt", (t) => {
  const f = relayPairFixture(t),
    result = f.runPair([], false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /owned_relay_profile_preparation_required/);
  assert.equal(existsSync(join(f.root, "evidence/receipt.json")), false);
  assert.equal(f.launches().length, 0);
});

for (const defect of [
  "outside-root",
  "public-record",
  "marker",
  "alias",
  "singleton-lock",
  "active-worker",
  "exclusive-lock",
  "proof-pointer",
]) {
  test(`retained Chrome ownership refuses ${defect} without opening a feature browser`, (t) => {
    const f = relayPairFixture(t);
    const prep = f.prepareAccount();
    assert.equal(prep.status, 0, prep.stdout + prep.stderr);
    const ownership = JSON.parse(readFileSync(f.profileRecord));
    let expected;
    if (defect === "outside-root") {
      const manifest = JSON.parse(readFileSync(f.pairingRecord));
      manifest.chromeArguments[
        manifest.chromeArguments.indexOf("--profile-root") + 1
      ] = join(f.root, "ordinary-profile");
      writeFileSync(f.pairingRecord, JSON.stringify(manifest));
      expected = "owned_profile_allowed_root_required";
    } else if (defect === "public-record") {
      chmodSync(f.profileRecord, 0o644);
      expected = "owned_profile_private_metadata_required";
    } else if (defect === "marker") {
      writeFileSync(
        join(ownership.profile, ".clipp-owned-relay-profile.json"),
        JSON.stringify({ nonce: "wrong", record: f.profileRecord })
      );
      expected = "owned_profile_marker_mismatch";
    } else if (defect === "alias") {
      const unrelated = join(f.root, "unrelated-profile");
      mkdirSync(unrelated);
      writeFileSync(
        join(unrelated, "synthetic-private-canary"),
        "DO_NOT_READ_OR_COPY"
      );
      renameSync(ownership.profile, ownership.profile + "-retained");
      symlinkSync(unrelated, ownership.profile);
      expected = "owned_profile_alias_forbidden";
    } else if (defect === "singleton-lock") {
      symlinkSync("own-host-12345", join(ownership.profile, "SingletonLock"));
      expected = "owned_profile_chrome_lock_present";
    } else if (defect === "active-worker") {
      ownership.lastTarget.runnerPid = process.pid;
      delete ownership.lastTarget.runnerBirth;
      writeFileSync(f.profileRecord, JSON.stringify(ownership));
      expected = "owned_profile_previous_process_unconfirmed";
    } else if (defect === "exclusive-lock") {
      writeFileSync(f.profileRecord + ".lock", "retained unknown owner", {
        mode: 0o600,
      });
      expected = "owned_profile_lock_active_or_uncertain";
    } else {
      ownership.preparationReceipt = join(
        f.root,
        "synthetic-private-canary.json"
      );
      writeFileSync(ownership.preparationReceipt, "DO_NOT_READ_OR_COPY", {
        mode: 0o600,
      });
      writeFileSync(f.profileRecord, JSON.stringify(ownership));
      expected = "owned_profile_preparation_proof_invalid";
    }
    const result = f.runPair();
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(expected), result.stdout + result.stderr);
    assert.equal(existsSync(join(f.root, "evidence/receipt.json")), false);
    assert.equal(
      f.launches().filter((value) => value.phase === "case").length,
      0
    );
    assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_READ_OR_COPY/);
  });
}

test("account preparation never persists OAuth URLs or callback payloads in public or private diagnostics", (t) => {
  const f = relayPairFixture(t, "oauth-private"),
    result = f.prepareAccount({
      expectFailureAt: "observe_extension_identity",
    });
  assert.notEqual(result.status, 0);
  const evidence = [
    result.stdout,
    result.stderr,
    ...[join(f.root, "history"), join(f.root, "account-evidence")].flatMap(
      (directory) =>
        readdirSync(directory, { recursive: true })
          .filter((name) => name.endsWith(".json") || name.endsWith(".log"))
          .map((name) => readFileSync(join(directory, name), "utf8"))
    ),
  ].join("\n");
  assert.doesNotMatch(
    evidence,
    /SYNTHETIC_OAUTH_(?:CODE|STATE)_CANARY|accounts\.google\.com\/o\/oauth2/
  );
});

for (const [mode, operation, detail] of [
  [
    "prep-early-memory",
    "verify_management_early_memory",
    { earlyMemory: false },
  ],
  [
    "prep-transport",
    "read_owned_transport_status",
    { transport: { started: true, transport: "webrtc-direct", memory: true } },
  ],
  [
    "prep-configuration",
    "read_owned_relay_configuration",
    { configurationShape: "unavailable" },
  ],
  [
    "fresh-auth-save-rejected",
    "read_owned_relay_configuration",
    { configurationShape: "empty", configurationResult: "not-confirmed" },
  ],
]) {
  test(`account preparation refusal exposes only safe checkpoints for ${mode}`, (t) => {
    const f = relayPairFixture(t, mode),
      result = f.prepareAccount({ expectFailureAt: operation });
    assert.notEqual(result.status, 0);
    const receipt = JSON.parse(
      readFileSync(join(f.root, "account-evidence/receipt.json"))
    );
    assert.equal(receipt.operation, operation);
    assert.equal(receipt.shutdown, "verified-owned-browser-closed");
    for (const [field, expected] of Object.entries(detail))
      assert.deepEqual(receipt.preparation[field], expected);
    const artifacts = [
      result.stdout,
      result.stderr,
      ...readdirSync(join(f.root, "account-evidence"), { recursive: true })
        .filter((name) => name.endsWith(".json"))
        .map((name) =>
          readFileSync(join(f.root, "account-evidence", name), "utf8")
        ),
    ].join("\n");
    assert.doesNotMatch(
      artifacts,
      /SYNTHETIC_OAUTH_(?:CODE|STATE)_CANARY|accounts\.google\.com\/o\/oauth2/
    );
  });
}

test("unexpected initial verifier failure retains bounded private child evidence after fixture cleanup", async (t) => {
  let root, result;
  const publicDiagnostics = [];
  await t.test("forced synthetic verifier failure", (child) => {
    const f = relayPairFixture(
      {
        after: child.after.bind(child),
        diagnostic(message) {
          publicDiagnostics.push(message);
          child.diagnostic(message);
        },
      },
      "initial-verifier-failure"
    );
    root = f.root;
    result = f.prepareAccount();
    assert.notEqual(result.status, 0);
    assert.equal(
      JSON.parse(readFileSync(join(root, "account-evidence/receipt.json")))
        .operation,
      "verify_frozen_candidate"
    );
  });
  assert.ok(
    existsSync(root),
    "unexpected preparation root was erased before diagnosis"
  );
  const file = join(root, "candidate-command-events.jsonl");
  const events = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(events.at(-1).status, 23);
  assert.equal(events.at(-1).signal, null);
  assert.equal(events.at(-1).code, null);
  assert.match(events.at(-1).stderr, /SYNTHETIC_VERIFIER_PRIVATE_CANARY/);
  assert.equal(events.at(-1).stderr.length, 8192);
  assert.equal(
    statSync(join(root, "unexpected-preparation.private.json")).mode & 0o777,
    0o600
  );
  const receipt = readFileSync(
    join(root, "account-evidence/receipt.json"),
    "utf8"
  );
  assert.doesNotMatch(
    [result.stdout, result.stderr, receipt, ...publicDiagnostics].join("\n"),
    /SYNTHETIC_VERIFIER_PRIVATE_CANARY/
  );
  assert.match(publicDiagnostics.join("\n"), /retained/);
});

test("an explicitly expected preparation verifier refusal still cleans its synthetic root", async (t) => {
  let root;
  await t.test("expected synthetic verifier refusal", (child) => {
    const f = relayPairFixture(child, "initial-verifier-failure");
    root = f.root;
    const result = f.prepareAccount({
      expectFailureAt: "verify_frozen_candidate",
    });
    assert.notEqual(result.status, 0);
    assert.equal(
      statSync(join(root, "candidate-command-events.jsonl")).mode & 0o777,
      0o600
    );
  });
  assert.equal(existsSync(root), false);
});

test("account setup configures only the approved fresh relay and uses normal login UI before retained-profile Pairing", (t) => {
  const f = relayPairFixture(t, "fresh-auth"),
    setup = f.prepareAccount();
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  assert.equal(
    readFileSync(join(f.root, "normal-setup-actions"), "utf8"),
    "settings-ui\nconnections-ui\nadd-relay-ui\nconfigure-approved-relay\nsettings-ui\nconnections-ui\nexpand-relay-ui\nlogin-ui\n"
  );
  const prepared = JSON.parse(
    readFileSync(join(f.root, "account-evidence/receipt.json"))
  );
  assert.equal(prepared.preparation.configurationResult, "applied-observed");
  assert.equal(prepared.preparation.configurationShape, "approved-single");
  const result = f.runPair();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const launches = f.launches();
  assert.equal(launches.length, 3);
  assert.equal(launches[0].profile, launches[1].profile);
  assert.equal(launches[1].profile, launches[2].profile);
  const evidence = [
    setup.stdout,
    setup.stderr,
    result.stdout,
    result.stderr,
    ...[
      join(f.root, "history"),
      join(f.root, "account-evidence"),
      join(f.root, "chrome-evidence"),
    ].flatMap((directory) =>
      readdirSync(directory, { recursive: true })
        .filter((name) => name.endsWith(".json") || name.endsWith(".log"))
        .map((name) => readFileSync(join(directory, name), "utf8"))
    ),
  ].join("\n");
  assert.doesNotMatch(
    evidence,
    /SYNTHETIC_OAUTH_(?:CODE|STATE)_CANARY|accounts\.google\.com\/o\/oauth2/
  );
});

test("retained-profile diagnostics qualify a fresh Clip and Pin while preserving prior pins", (t) => {
  const f = relayPairFixture(t, "direct");
  assert.notEqual(f.runPair().status, 0);
  const first = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(first.behavior?.passed, true);
  const change = [
    "--diagnostic-change",
    "observe a fresh retained-history preflight",
    "--expected-observation",
    "new Clip and Pin while the direct route remains refused",
  ];
  const manifest = JSON.parse(readFileSync(f.pairingRecord));
  manifest.chromeArguments.push(...change);
  writeFileSync(f.pairingRecord, JSON.stringify(manifest));
  assert.notEqual(f.runPair(change).status, 0);
  const next = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(next.behavior?.passed, true);
  assert.equal(next.behavior.priorPinnedCount, 1);
  assert.equal(next.behavior.exactNewPin, true);
});

test("semantic budget renewal accepts failed history followed by a charged not-run diagnostic", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "clipp-renewal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = {
    output: join(root, "output"),
    historyRoot: join(root, "history"),
    registryRoot: join(root, "registry"),
    identity: {
      effort: "synthetic-renewal",
      scenario: "setup",
      environment: "synthetic",
    },
    scenario: "setup",
  };
  let previousHistory;
  for (const [index, result] of [
    "not-run",
    "failed",
    "not-run",
    "failed",
    "not-run",
  ].entries()) {
    const attempt = await beginNativeAttempt({
      ...options,
      change: `diagnosis-${index}`,
      expectation: "distinguish synthetic setup",
    });
    await attempt.finish({
      result,
      stage: "synthetic",
      shutdown: "not-launched",
    });
    previousHistory = attempt.history;
  }
  const prior = JSON.parse(readFileSync(previousHistory, "utf8"));
  const receipts = prior.attempts.map((attempt) => {
    const file = join(previousHistory, "..", attempt.receipt);
    return [file, readFileSync(file, "utf8")];
  });
  await assert.rejects(
    beginNativeAttempt({
      ...options,
      change: "without-renewal",
      expectation: "no budget reset",
    }),
    /diagnostic_attempt_budget_exhausted/
  );
  const renewal = join(root, "renewal.json");
  writeFileSync(
    renewal,
    JSON.stringify({
      previousHistory,
      authorizedBy: "synthetic explicit decision",
      reason: "synthetic environment repaired",
    })
  );
  const attempt = await beginNativeAttempt({
    ...options,
    renewal,
    change: "environment-repaired",
    expectation: "setup now settles",
  });
  assert.equal(attempt.number, 1);
  assert.notEqual(attempt.history, previousHistory);
  const receipt = {
    result: "not-run",
    stage: "synthetic",
    shutdown: "not-launched",
  };
  await attempt.finish(receipt);
  assert.equal(receipt.history.generation, 1);
  assert.equal(receipt.history.predecessor, previousHistory);
  const retained = JSON.parse(readFileSync(previousHistory, "utf8"));
  const { renewedBy, ...unchanged } = retained;
  assert.deepEqual(unchanged, prior);
  assert.equal(renewedBy.decision.previousHistory, previousHistory);
  for (const [file, bytes] of receipts)
    assert.equal(readFileSync(file, "utf8"), bytes);
  const next = JSON.parse(readFileSync(attempt.history, "utf8"));
  assert.equal(next.attempts[0].change, "environment-repaired");
  assert.equal(next.diagnosticStartedAt, next.attempts[0].startedAt);
});

for (const [results, allowed] of [
  [["not-run"], false],
  [["failed", "passed", "not-run"], false],
  [["passed", "failed", "not-run"], true],
  [["failed", "running", "not-run"], false],
  [["failed", "unknown", "not-run"], false],
]) {
  test(`semantic budget renewal ${allowed ? "accepts" : "refuses"} history ${results.join(" then ")}`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), "clipp-renewal-refusal-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const options = {
      output: join(root, "output"),
      historyRoot: join(root, "history"),
      registryRoot: join(root, "registry"),
      identity: {
        effort: "synthetic-renewal",
        scenario: "setup",
        environment: "synthetic",
      },
      scenario: "setup",
    };
    let previousHistory;
    for (const [index, result] of results.entries()) {
      const attempt = await beginNativeAttempt({
        ...options,
        change: `diagnosis-${index}`,
        expectation: "distinguish synthetic setup",
      });
      // Seed the later-pass case as non-passing first; ordinary admission already
      // refuses extending a passed history. The durable fixture below challenges
      // renewal even if an imported/retained history contains a later not-run.
      await attempt.finish({
        result: ["failed", "not-run"].includes(result) ? result : "not-run",
        stage: "synthetic",
        shutdown: "not-launched",
      });
      previousHistory = attempt.history;
    }
    for (const [index, result] of results.entries()) {
      if (["failed", "not-run"].includes(result)) continue;
      const history = JSON.parse(readFileSync(previousHistory, "utf8"));
      const changed = history.attempts[index];
      changed.result = result;
      writeFileSync(previousHistory, JSON.stringify(history));
      const file = join(previousHistory, "..", changed.receipt);
      const receipt = JSON.parse(readFileSync(file, "utf8"));
      receipt.result = result;
      writeFileSync(file, JSON.stringify(receipt));
    }
    const before = readFileSync(previousHistory, "utf8");
    const renewal = join(root, "renewal.json");
    writeFileSync(
      renewal,
      JSON.stringify({
        previousHistory,
        authorizedBy: "synthetic explicit decision",
        reason: "synthetic environment repaired",
      })
    );
    const admission = beginNativeAttempt({
      ...options,
      renewal,
      change: "environment-repaired",
      expectation: "setup now settles",
    });
    if (allowed) {
      const attempt = await admission;
      assert.notEqual(attempt.history, previousHistory);
      await attempt.finish({
        result: "not-run",
        stage: "synthetic",
        shutdown: "not-launched",
      });
      assert.deepEqual(
        JSON.parse(readFileSync(previousHistory, "utf8")).attempts,
        JSON.parse(before).attempts
      );
    } else {
      await assert.rejects(admission, /renewal_must_reference_failed_history/);
      assert.equal(readFileSync(previousHistory, "utf8"), before);
      assert.equal(existsSync(join(previousHistory, "../../budget-1")), false);
    }
  });
}

test("verification-only profile binding continues positive closed unprepared ownership without inventing isolation", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "clipp-verification-")));
  const previousState = process.env.CLIPP_ACCEPTANCE_STATE_ROOT;
  process.env.CLIPP_ACCEPTANCE_STATE_ROOT = root;
  t.after(() => {
    if (previousState === undefined)
      delete process.env.CLIPP_ACCEPTANCE_STATE_ROOT;
    else process.env.CLIPP_ACCEPTANCE_STATE_ROOT = previousState;
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, "history"));
  const options = {
    "profile-root": join(root, "owned-chrome-profiles"),
    "profile-record": join(root, "owned-chrome-profiles/profile.json"),
    "history-root": join(root, "history"),
    "registered-extension-id": "a".repeat(32),
    discovery: "https://relay.example/v1/relay",
  };
  const binding = {
    sourceRevision: "a".repeat(40),
    bundleSha256: "b".repeat(64),
  };
  const first = await acquireOwnedRelayProfile(options, {
    preparation: true,
    verifyClosed: () => true,
  });
  await first.bind(binding);
  await first.recordTarget({
    profile: first.profile,
    pid: 123,
    runnerPid: 456,
  });
  await first.closed({});
  const ordinary = await acquireOwnedRelayProfile(options, {
    preparation: true,
    verifyClosed: () => true,
  });
  await assert.rejects(
    ordinary.bind(binding),
    /owned_profile_candidate_binding_changed/
  );
  await ordinary.releaseUnlaunched();
  await assert.rejects(
    acquireOwnedRelayProfile(options, {
      preparation: false,
      verifyClosed: () => true,
    }),
    /owned_profile_preparation_proof_invalid/
  );
  const continuation = await acquireOwnedRelayProfile(options, {
    preparation: true,
    verificationOnly: true,
    verifyClosed: () => true,
  });
  await continuation.bind(binding);
  assert.notEqual(
    JSON.parse(readFileSync(options["profile-record"]))
      .startupIsolationVerified,
    true
  );
  await assert.rejects(
    continuation.bind({ ...binding, bundleSha256: "c".repeat(64) }),
    /owned_profile_candidate_binding_changed/
  );
  await continuation.releaseUnlaunched();
  await assert.rejects(
    acquireOwnedRelayProfile(options, {
      preparation: true,
      verificationOnly: true,
      verifyClosed: () => false,
    }),
    /owned_profile_previous_process_unconfirmed/
  );
  symlinkSync("closed-host-123", join(first.profile, "SingletonLock"));
  await assert.rejects(
    acquireOwnedRelayProfile(options, {
      preparation: true,
      verificationOnly: true,
      verifyClosed: () => true,
    }),
    /owned_profile_chrome_lock_present/
  );
  rmSync(join(first.profile, "SingletonLock"));
  await assert.rejects(
    acquireOwnedRelayProfile(options, {
      preparation: false,
      verificationOnly: true,
      verifyClosed: () => true,
    }),
    /verification_only_preparation_required/
  );
  await assert.rejects(
    acquireOwnedRelayProfile(
      {
        ...options,
        "profile-record": join(options["profile-root"], "missing.json"),
      },
      { preparation: true, verificationOnly: true, verifyClosed: () => true }
    ),
    /owned_relay_profile_preparation_required/
  );
});

test("verification-only preparation checks a frozen external app using its retained closed profile without human or OAuth actions", (t) => {
  const f = relayPairFixture(t, "verification-continuation");
  const first = f.prepareAccount({
    expectFailureAt: "verify_management_early_memory",
  });
  assert.notEqual(first.status, 0);
  const prior = JSON.parse(readFileSync(f.profileRecord));
  assert.equal(prior.status, "closed-unprepared");
  assert.notEqual(prior.startupIsolationVerified, true);
  const toolingRoot = join(f.root, "maintained-tooling");
  for (const file of [
    "apps/extension/scripts/toolbar-acceptance.mjs",
    "apps/extension/scripts/owned-relay-profile.mjs",
    "apps/extension/scripts/clipboard-acceptance.mjs",
    "apps/extension/scripts/verify-clipboard-io.mjs",
    "scripts/native-acceptance-attempts.mjs",
    "scripts/prepare-acceptance-candidate.mjs",
  ]) {
    mkdirSync(join(toolingRoot, file, ".."), { recursive: true });
    writeFileSync(join(toolingRoot, file), readFileSync(resolve(file)));
  }
  symlinkSync(
    join(f.destination, "node_modules"),
    join(toolingRoot, "node_modules")
  );
  const before = f.launches().length;
  const verifier = join(
    toolingRoot,
    "scripts/prepare-acceptance-candidate.mjs"
  );
  const trusted = readFileSync(verifier);
  writeFileSync(
    verifier,
    Buffer.concat([
      trusted,
      Buffer.from("\n// SYNTHETIC_VERIFIER_SOURCE_CANARY\n"),
    ])
  );
  const refused = f.prepareAccount({
    toolingRoot,
    expectFailureAt: "verify_frozen_candidate",
    extra: [
      "--verification-only",
      "--diagnostic-change",
      "untrusted-verifier",
      "--expected-observation",
      "refuse before external verifier execution",
    ],
    environment: { VERIFY_CONTINUATION: "1" },
  });
  assert.notEqual(refused.status, 0);
  const refusedReceipt = JSON.parse(
    readFileSync(join(f.root, "account-evidence/receipt.json"))
  );
  const failure = readFileSync(
    join(
      refusedReceipt.history.path,
      "..",
      `attempt-${JSON.parse(readFileSync(refusedReceipt.history.path)).attempts.length}`,
      "failure.private.json"
    ),
    "utf8"
  );
  assert.equal(JSON.parse(failure).error.guard, "candidate_verifier_untrusted");
  assert.doesNotMatch(
    refused.stdout + refused.stderr + failure,
    /SYNTHETIC_VERIFIER_SOURCE_CANARY/
  );
  assert.equal(f.launches().length, before);
  assert.notEqual(
    JSON.parse(readFileSync(f.profileRecord)).startupIsolationVerified,
    true
  );
  writeFileSync(verifier, trusted);
  writeFileSync(join(prior.profile, "synthetic-human-not-ready"), "true");
  const notReady = f.prepareAccount({
    toolingRoot,
    expectFailureAt: "observe_owned_relay_ready",
    extra: [
      "--verification-only",
      "--diagnostic-change",
      "credentials-not-ready",
      "--expected-observation",
      "refuse login_needed without OAuth",
    ],
    environment: { VERIFY_CONTINUATION: "1" },
  });
  assert.notEqual(notReady.status, 0);
  assert.equal(
    JSON.parse(readFileSync(join(f.root, "account-evidence/receipt.json")))
      .failure,
    "owned_human_login_required"
  );
  assert.equal(existsSync(join(f.root, "controlled-login-attempts")), false);
  rmSync(join(prior.profile, "synthetic-human-not-ready"));
  const beforeSuccess = f.launches().length;
  const result = f.prepareAccount({
    toolingRoot,
    extra: [
      "--verification-only",
      "--diagnostic-change",
      "verify-completed-human-login",
      "--expected-observation",
      "public Ready without another human login",
    ],
    environment: { VERIFY_CONTINUATION: "1" },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.launches().length, beforeSuccess + 1);
  assert.ok(f.launches().at(-1).argv.includes("--remote-debugging-port=0"));
  assert.equal(f.launches().at(-1).profile, prior.profile);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /human preparation:|Complete Google authorization/
  );
  assert.equal(existsSync(join(f.root, "controlled-load-attempts")), false);
  assert.equal(existsSync(join(f.root, "controlled-login-attempts")), false);
  const receipt = JSON.parse(
    readFileSync(join(f.root, "account-evidence/receipt.json"))
  );
  assert.equal(receipt.accountPreparation.prepared, true);
  assert.equal(receipt.humanPreparation, undefined);
  assert.equal(receipt.tooling.root, realpathSync(toolingRoot));
  assert.equal(
    receipt.tooling.scripts["apps/extension/scripts/toolbar-acceptance.mjs"],
    createHash("sha256")
      .update(
        readFileSync(resolve("apps/extension/scripts/toolbar-acceptance.mjs"))
      )
      .digest("hex")
  );
  assert.notEqual(
    receipt.tooling.scripts["apps/extension/scripts/toolbar-acceptance.mjs"],
    createHash("sha256")
      .update(
        readFileSync(
          join(f.destination, "apps/extension/scripts/toolbar-acceptance.mjs")
        )
      )
      .digest("hex")
  );
  assert.equal(receipt.candidate.checkout, realpathSync(f.destination));
  const after = JSON.parse(readFileSync(f.profileRecord));
  assert.equal(after.nonce, prior.nonce);
  assert.deepEqual(after.binding, prior.binding);
  assert.equal(after.startupIsolationVerified, true);
  assert.equal(after.status, "prepared");
});

test("owned account preparation wakes a dormant installed worker through its isolated management page", (t) => {
  const f = relayPairFixture(t, "dormant-worker");
  const result = f.prepareAccount();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const receipt = JSON.parse(
    readFileSync(join(f.root, "account-evidence/receipt.json"))
  );
  assert.equal(receipt.accountPreparation.prepared, true);
  assert.equal(receipt.preparation.earlyMemory, true);
  assert.equal(receipt.shutdown, "verified-owned-browser-closed");
});

function externalPairingFixture(t) {
  const f = relayPairFixture(t, "dormant-worker");
  const ready = f.prepareAccount();
  assert.equal(ready.status, 0, ready.stdout + ready.stderr);
  const toolingRoot = join(f.root, "pairing-tooling");
  for (const file of [
    "scripts/relay-pairing-acceptance.mjs",
    "scripts/native-acceptance-attempts.mjs",
    "scripts/prepare-acceptance-candidate.mjs",
    "apps/extension/scripts/toolbar-acceptance.mjs",
    "apps/extension/scripts/owned-relay-profile.mjs",
    "apps/extension/scripts/clipboard-acceptance.mjs",
    "apps/extension/scripts/verify-clipboard-io.mjs",
  ]) {
    mkdirSync(join(toolingRoot, file, ".."), { recursive: true });
    writeFileSync(join(toolingRoot, file), readFileSync(resolve(file)));
  }
  symlinkSync(
    join(f.destination, "node_modules"),
    join(toolingRoot, "node_modules")
  );
  const entry = join(f.root, "compose-pairing.mjs");
  writeFileSync(
    entry,
    'import fs from "node:fs";import {runRelayPairing} from ' +
      JSON.stringify(
        "file:" + join(toolingRoot, "scripts/relay-pairing-acceptance.mjs")
      ) +
      ";import {runElectronAcceptance} from " +
      JSON.stringify(
        "file:" + join(f.destination, "scripts/electron-relay-acceptance.mjs")
      ) +
      ';const args=process.argv.slice(2);const record=JSON.parse(fs.readFileSync(args[args.indexOf("--pairing-record")+1]));await runRelayPairing(args,record,runElectronAcceptance);'
  );
  return { f, toolingRoot, entry };
}

test("maintained Pairing composes owning runners over a separate unchanged frozen application", (t) => {
  const { f, toolingRoot, entry } = externalPairingFixture(t);
  const before = readFileSync(
    join(f.destination, "apps/extension/scripts/toolbar-acceptance.mjs")
  );
  const result = f.accept(
    ["--pairing-record", f.pairingRecord, "--timeout-seconds", "15"],
    f.record,
    entry
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const chrome = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(f.receipt().result, "passed");
  assert.equal(chrome.result, "passed");
  assert.equal(chrome.tooling.root, realpathSync(toolingRoot));
  assert.equal(chrome.candidate.checkout, realpathSync(f.destination));
  assert.ok(
    readFileSync(
      join(f.destination, "apps/extension/scripts/toolbar-acceptance.mjs")
    ).equals(before)
  );
});

test("external Pairing refuses an untrusted verifier before launching Chrome or exposing its source", (t) => {
  const { f, toolingRoot, entry } = externalPairingFixture(t);
  const verifier = join(
    toolingRoot,
    "scripts/prepare-acceptance-candidate.mjs"
  );
  writeFileSync(
    verifier,
    readFileSync(verifier, "utf8") +
      "\n// SYNTHETIC_PAIRING_VERIFIER_SOURCE_CANARY\n"
  );
  const launches = f.launches().length;
  const result = f.accept(
    ["--pairing-record", f.pairingRecord, "--timeout-seconds", "15"],
    f.record,
    entry
  );
  assert.notEqual(result.status, 0);
  assert.equal(f.launches().length, launches);
  const receipt = JSON.parse(
    readFileSync(join(f.root, "chrome-evidence/receipt.json"))
  );
  assert.equal(receipt.shutdown, "not-launched");
  const history = JSON.parse(readFileSync(receipt.history.path));
  const failure = readFileSync(
    join(
      receipt.history.path,
      "..",
      "attempt-" + history.attempts.length,
      "failure.private.json"
    ),
    "utf8"
  );
  assert.equal(JSON.parse(failure).error.guard, "candidate_verifier_untrusted");
  assert.doesNotMatch(
    result.stdout + result.stderr + failure,
    /SYNTHETIC_PAIRING_VERIFIER_SOURCE_CANARY/
  );
});
