import { test } from "node:test";
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
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

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
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
 const state={identity:{deviceId:'controlled-device'},clips:[],pinnedIds:[]};let filter='All';
 const clipboard={readText:()=>'',writeText(){}};
 const app={setName(){},getPath:()=>env.CLIPP_RELAY_ACCEPTANCE_PROFILE,focus(){},exit(){throw new Error('controlled runtime exit');}};
 const win={id:1,isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,isFocused:()=>true,show(){},focus(){},restore(){},webContents:{focus(){},id:2,getOSProcessId:()=>7,getURL:()=>pathToFileURL(path.resolve('apps/electron/dist/renderer/index.html')).href,sendInputEvent(event){if(event.type==='mouseUp'){if(event.x>90){if(${JSON.stringify(nativeMode)}!=='pin-input-unobservable')state.pinnedIds=[state.clips[0].id];}else filter=event.x<30?'Pinned':'All';}}}};
 const api={getState:async()=>{const content=clipboard.readText();if(content && !state.clips.some(clip=>clip.content===content))state.clips.push({id:'controlled-clip',content,originPeerId:state.identity.deviceId});return state;}};
 const browser={window:{clipp:api},document:{hasFocus:()=>true}};const browserEvaluate=(fn,arg)=>vm.runInNewContext('('+String(fn)+')',browser)(arg);
 const card={getByTitle:()=>({boundingBox:async()=>({x:100,y:1,width:10,height:10})}),waitFor:async()=>{if(filter!=='Pinned'||!state.pinnedIds.length)throw new Error('native pin not observed');}};
 const page={setDefaultTimeout(){},waitForFunction:async(fn,arg)=>{if(String(fn).includes('window.clipp') && !await browserEvaluate(fn,arg))throw new Error('public state observation failed');},getByRole:(_,options)=>({boundingBox:async()=>({x:options.name==='Pinned'?20:40,y:1,width:10,height:10})}),locator:()=>({filter:()=>card}),evaluate:async(fn,arg)=>browserEvaluate(fn,arg)};
 const previousExecutable=process.execPath;const previousLoader=Module._load;
 Object.defineProperty(process.versions,'electron',{value:'43.4.0',configurable:true});process.getSystemVersion=()=>'controlled';
 Module._load=function(name,...rest){return name==='electron'?{app,clipboard}:previousLoader.call(this,name,...rest);};
 try{if(executablePath)process.execPath=executablePath;require(args[0]);}finally{process.execPath=previousExecutable;Module._load=previousLoader;}
 return{process:()=>child,firstWindow:async()=>{if(!globalThis.__clippProductStarted)throw new Error('product not started');return page;},browserWindow:async()=>({evaluate:async(fn,arg)=>fn(win,arg)}),evaluate:async(fn,arg)=>{const argv=process.argv;const executable=process.execPath;process.argv=[executablePath,args[0]];if(executablePath)process.execPath=executablePath;try{return await fn({app,clipboard,BrowserWindow:{getFocusedWindow:()=>win},safeStorage:{isEncryptionAvailable:()=>false}},arg);}finally{process.argv=argv;process.execPath=executable;}},close:async()=>{child.exitCode=0;child.emit('exit',0,null);}};
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
  });
  f.args[f.args.indexOf("--scenario") + 1] = scenario;
  const prepared = f.invoke();
  assert.equal(prepared.status, 0, prepared.stderr);
  const accept = (extra = []) =>
    run(
      process.execPath,
      [
        join(f.destination, "scripts/electron-relay-acceptance.mjs"),
        "--candidate-record",
        f.record,
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
          : ["--preflight-only"]),
        ...extra,
      ],
      f.destination,
      { CLIPP_ACCEPTANCE_STATE_ROOT: join(f.root, "state") }
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
  assert.notEqual(
    selected.accept(["--candidate-record", other.record]).status,
    0
  );
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
  assert.notEqual(f.accept().status, 0);
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
