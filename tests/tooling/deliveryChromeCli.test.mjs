import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cli = path.resolve("scripts/delivery.mjs");
function command(bin, args, cwd) {
  return spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, HUSKY: "0" },
  });
}
function checked(bin, args, cwd) {
  const result = command(bin, args, cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "clipp-delivery-chrome-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  const store = path.join(root, "store");
  const stable = path.join(root, "stable");
  const profile = path.join(root, "profile", "Default");
  mkdirSync(repo);
  mkdirSync(stable);
  writeFileSync(path.join(stable, "stale.txt"), "prior build");
  checked("git", ["init", "-b", "main"], repo);
  checked("git", ["config", "user.name", "Fixture"], repo);
  checked("git", ["config", "user.email", "fixture@example.invalid"], repo);
  for (const app of ["electron", "android", "extension"]) {
    mkdirSync(path.join(repo, "apps", app), { recursive: true });
    writeFileSync(
      path.join(repo, "apps", app, "package.json"),
      JSON.stringify({
        version: "1.2.3",
        scripts: { build: "node ../../build.cjs " + app },
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
        "check:candidate": "node check.cjs candidate",
        "check:delivery": "node check.cjs delivery",
        "test:ui-behavior": "node check.cjs ui",
      },
    })
  );
  writeFileSync(
    path.join(repo, "check.cjs"),
    `const name=process.argv[2];if(name==='jest')console.log('Tests: 1 passed, 1 total');if(name==='candidate'||name==='delivery')console.log('ℹ tests 1\\nℹ pass 1\\nℹ fail 0\\nℹ cancelled 0\\nℹ skipped 0');if(name==='ui')console.log('1 passed');`
  );
  writeFileSync(
    path.join(repo, "build.cjs"),
    `const fs=require('node:fs');const p=require('node:path');const app=process.argv[2],dist=p.join(__dirname,'apps',app,'dist');fs.mkdirSync(dist,{recursive:true});if(app!=='extension'){fs.writeFileSync(p.join(dist,'built.txt'),'ok');process.exit(0)}for(const dir of ['src','assets'])fs.mkdirSync(p.join(dist,dir),{recursive:true});const files={'service-worker-loader.js':'import \\'./assets/background.js\\';','assets/background.js':'self.CLIPP=true;','offscreen.html':'<script src="/assets/offscreen.js"></script>','assets/offscreen.js':'self.CLIPP_OFFSCREEN=true;','src/popup.html':'<script src="/assets/popup.js"></script><div id="root">Ready</div>','assets/popup.js':'document.querySelector("#root").textContent="Ready";','src/options.html':'Options','icon.png':'icon'};for(const [name,value] of Object.entries(files))fs.writeFileSync(p.join(dist,name),value);fs.writeFileSync(p.join(dist,'manifest.json'),JSON.stringify({manifest_version:3,version:'1.2.3',background:{service_worker:'service-worker-loader.js',type:'module'},action:{default_popup:'src/popup.html',default_icon:{16:'icon.png'}},options_page:'src/options.html',icons:{16:'icon.png'},web_accessible_resources:[{resources:['offscreen.html']}]}));`
  );
  const scripts = path.join(repo, "apps/extension/scripts");
  mkdirSync(scripts, { recursive: true });
  for (const name of [
    "verify-identity-initialization",
    "verify-pairing-response",
    "verify-offscreen-storage",
    "verify-managed-relay-mv3",
  ]) {
    writeFileSync(
      path.join(scripts, `${name}.mjs`),
      `console.log('${name} passed')`
    );
  }
  writeFileSync(
    path.join(scripts, "verify-popup-history-performance.mjs"),
    `import fs from 'node:fs';import p from 'node:path';const out=process.env.CLIPP_POPUP_TIMING_OUTPUT;fs.mkdirSync(out,{recursive:true});const rows=[];for(const [surface,width,label] of [['popup',480,null],['popup',480,null],['popup',480,null],['popup',320,null],['options',1440,null],['popup',480,'Extension'],['popup',320,'Extension']])rows.push({surface,width,count:43,sourceName:label,currentHistoryRows:43,elapsedMs:10,labelWidthReads:0,labels:Array.from({length:43},()=>({fullTitle:true,fits:true,visible:true,truncated:!label,display:label||'A…'}))});fs.writeFileSync(p.join(out,'timings.json'),JSON.stringify(rows));console.log('populated History passed')`
  );
  writeFileSync(path.join(repo, ".gitignore"), "node_modules/\napps/*/dist/\n");
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
  const authorization = path.join(root, "authorization.json");
  writeFileSync(
    authorization,
    JSON.stringify({
      schema: 1,
      scope: "local-chrome-extension",
      sourceRevision: revision,
      destination: stable,
      profilePath: profile,
      authorizedBy: "fixture user instruction",
    })
  );
  const config = path.join(root, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      schema: 1,
      runRoot: store,
      destinations: { chromeExtensionDir: stable, chromeProfilePath: profile },
      references: { chromeAuthorizationRef: `file:${authorization}` },
    })
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
      "chrome-local",
      "--json",
    ],
    repo
  );
  assert.equal(planned.status, 0, planned.stdout + planned.stderr);
  return {
    root,
    repo,
    store,
    stable,
    config,
    plan: JSON.parse(planned.stdout),
  };
}

test("public Chrome delivery replaces the full tree, blocks for loaded profile, and preserves replay evidence", (t) => {
  const f = fixture(t);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo
  );
  assert.notEqual(first.status, 0, first.stdout);
  const result = JSON.parse(first.stdout);
  assert.equal(
    result.code,
    "delivery_incomplete",
    JSON.stringify(result.run.stages.commonVerify)
  );
  assert.equal(result.run.stages.commonVerify.state, "passed");
  assert.equal(result.run.targets["chrome-local"].state, "blocked");
  assert.match(
    result.run.targets["chrome-local"].nextAction,
    /load or reload/i
  );
  assert.ok(readFileSync(path.join(f.stable, "delivery-build.json")));
  assert.ok(!readdirSync(f.stable).includes("stale.txt"));
  const backup = result.run.stages.chromeLocal.replacement.backup;
  assert.equal(
    readFileSync(path.join(backup, "stale.txt"), "utf8"),
    "prior build"
  );
  const attempts = result.run.stages.chromeLocal.attempts.length;
  const second = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo
  );
  assert.notEqual(second.status, 0, second.stdout);
  const replay = JSON.parse(second.stdout);
  assert.equal(replay.run.stages.chromeLocal.attempts.length, attempts);
  assert.equal(replay.run.stages.chromeLocal.replacement.backup, backup);
  writeFileSync(path.join(f.stable, "delivery-build.json"), "tampered");
  const changed = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo
  );
  assert.notEqual(changed.status, 0);
  assert.equal(
    JSON.parse(changed.stdout).run.targets["chrome-local"].state,
    "failed"
  );
});
