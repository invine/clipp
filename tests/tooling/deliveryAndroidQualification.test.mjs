import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateAcceptancePair,
  validateNativeReceipt,
  validateNativeUnit,
} from "../../scripts/delivery/android-qualification.mjs";

const cli = path.resolve("scripts/delivery.mjs");
function command(bin, args, cwd, env = {}) {
  return spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HUSKY: "0", ...env },
    timeout: 120_000,
  });
}
function checked(bin, args, cwd) {
  const result = command(bin, args, cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function fixture(
  t,
  {
    destinations = {},
    references = {},
    env = {},
    native = false,
    signing = { androidPackage: "unsigned-artifact" },
  } = {}
) {
  const base = mkdtempSync(path.join(tmpdir(), "clipp-delivery-android-"));
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
    "const fs=require('node:fs');fs.appendFileSync('checks.txt',process.argv[2]+'\\n');const n=process.argv[2];if(n==='jest')console.log('Tests: 3 passed, 3 total');if(n.endsWith('tooling'))console.log('ℹ tests 3\\nℹ pass 3\\nℹ fail 0\\nℹ cancelled 0\\nℹ skipped 0');"
  );
  writeFileSync(
    path.join(repo, "build.cjs"),
    "const fs=require('node:fs');const path=require('node:path');const d=path.join(__dirname,'apps',process.argv[2],'dist');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'build.txt'),'verified');"
  );
  writeFileSync(path.join(repo, "ui.cjs"), "console.log('1 passed')");
  if (native) {
    const android = path.join(repo, "apps", "android");
    const androidPackage = JSON.parse(
      readFileSync(path.join(android, "package.json"), "utf8")
    );
    androidPackage.scripts["test:native:unit"] = "node ../../unit.cjs";
    androidPackage.scripts["build:native:acceptance-candidate"] =
      "node ../../candidate.cjs";
    writeFileSync(
      path.join(android, "package.json"),
      JSON.stringify(androidPackage)
    );
    mkdirSync(path.join(android, "android", "gradle", "wrapper"), {
      recursive: true,
    });
    writeFileSync(
      path.join(
        android,
        "android",
        "gradle",
        "wrapper",
        "gradle-wrapper.properties"
      ),
      "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.11.1-all.zip\n"
    );
    writeFileSync(
      path.join(repo, "unit.cjs"),
      "const fs=require('node:fs');const path=require('node:path');const d=path.join(__dirname,'apps/android/android/app/build/test-results/testDebugUnitTest');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'TEST-unit.xml'),'<testsuite tests=\"2\" skipped=\"0\" failures=\"0\" errors=\"0\"/>');"
    );
    writeFileSync(
      path.join(repo, "candidate.cjs"),
      "const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');const crypto=require('node:crypto');const root=__dirname;const dir=process.argv.at(-1);fs.mkdirSync(dir,{recursive:true});const app=path.join(dir,'app-acceptance.apk');const test=path.join(dir,'app-acceptance-androidTest.apk');fs.writeFileSync(app,'frozen app');fs.writeFileSync(test,'frozen test');const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');const revision=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();const p={schemaVersion:2,revision,dirty:false,source:{checkout:root},artifact:path.basename(app),artifactSha256:hash(app),applicationId:'com.clipp.app.acceptance',callbackScheme:'clipp-relay-acceptance',signatures:{appCertificateSha256:'a'.repeat(64),testCertificateSha256:'b'.repeat(64)},toolchain:{java:'openjdk version \"21.0.1\"',aapt2:'Android Asset Packaging Tool (aapt) 2.19-11948202'},lockfileSha256:hash(path.join(root,'package-lock.json')),installationSha256:hash(path.join(root,'node_modules/.package-lock.json')),testArtifact:{file:path.basename(test),sha256:hash(test),applicationId:'com.clipp.app.acceptance.test',targetPackage:'com.clipp.app.acceptance'}};fs.writeFileSync(app+'.provenance.json',JSON.stringify(p));"
    );
    mkdirSync(path.join(android, "scripts"), { recursive: true });
    const cases = JSON.parse(
      readFileSync(path.resolve("scripts/delivery/profiles/v1.json"), "utf8")
    ).androidQualification.matrixCases;
    writeFileSync(
      path.join(android, "scripts", "android-readiness.mjs"),
      `import fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2);const value=k=>args[args.indexOf(k)+1];const p=JSON.parse(fs.readFileSync(value('--candidate-apk')+'.provenance.json','utf8'));const api=value('--expected-api');const serial=value('--serial');const cases=${JSON.stringify(cases)};const observed=process.env.CLIPP_FAKE_MISSING_CASE&&api==='31'?cases.slice(1):cases;const fail=process.env.CLIPP_FAKE_NATIVE_FAIL&&api==='31'&&!args.includes('--diagnostic-change');const history=path.join(process.env.CLIPP_ACCEPTANCE_STATE_ROOT,'api'+api,'history','fixture','attempts.json');fs.mkdirSync(path.dirname(history),{recursive:true});fs.writeFileSync(history,JSON.stringify({version:1,scenario:'android-native-acceptance',attempts:fail?[{number:1,result:'failed'}]:[{number:1,result:'failed'},{number:2,result:'passed'}]}));const receipt={result:fail?'failed':'passed',androidApi:api,isEmulator:'1',serial,candidate:{frozen:true,revision:p.revision,sha256:p.artifactSha256,testArtifact:{sha256:p.testArtifact.sha256}},cleanup:'passed',appCleanup:'passed',behavior:{suite:'matrix',passed:!fail,requiredTests:cases.length,observedPassedTests:observed},verifiedCoverage:['android-owned-readiness',...observed],history:{path:history,generation:0}};fs.writeFileSync(path.join(value('--output'),'receipt.json'),JSON.stringify(receipt));console.log(JSON.stringify(receipt));if(fail)process.exitCode=5;`
    );
    writeFileSync(
      path.join(repo, ".gitignore"),
      "node_modules/\napps/*/dist/\napps/android/android/app/build/\nchecks.txt\n"
    );
  } else
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
    JSON.stringify({
      schema: 1,
      runRoot: store,
      destinations,
      signing,
      references,
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
      "android-package",
      "--json",
    ],
    repo,
    env
  );
  assert.equal(planned.status, 0, planned.stdout);
  return {
    base,
    repo,
    store,
    config,
    revision,
    plan: JSON.parse(planned.stdout),
    env,
  };
}
function nativeSelection() {
  const destinations = { androidAcceptanceEffort: "fixture-qualification" };
  const serials = {};
  for (const api of [31, 33, 34, 35, 36]) {
    serials[api] = `emulator-${api}`;
    destinations[`androidAcceptanceSerialApi${api}`] = serials[api];
  }
  const references = {
    androidSdkRef: "env:CLIPP_TEST_ANDROID_HOME",
    javaHomeRef: "env:CLIPP_TEST_JAVA_HOME",
    androidAcceptanceStateRootRef: "env:CLIPP_TEST_ACCEPTANCE_STATE",
    androidAcceptanceAuthorizationRef: "env:CLIPP_TEST_ACCEPTANCE_AUTH",
  };
  return { destinations, references, serials };
}
function nativeTools(f, serials) {
  const sdk = path.join(f.base, "sdk");
  const jdk = path.join(f.base, "jdk");
  const adbLog = path.join(f.base, "adb.log");
  const aapt = path.join(sdk, "build-tools", "35.0.0", "aapt2");
  const apksigner = path.join(sdk, "build-tools", "35.0.0", "apksigner");
  const adb = path.join(sdk, "platform-tools", "adb");
  const java = path.join(jdk, "bin", "java");
  for (const file of [aapt, apksigner, adb, java])
    mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(java, "#!/bin/sh\necho 'openjdk version \"21.0.1\"'\n");
  writeFileSync(
    aapt,
    '#!/bin/sh\necho "Android Asset Packaging Tool (aapt) 2.19-11948202"\n'
  );
  writeFileSync(apksigner, "#!/bin/sh\necho 0.9\n");
  writeFileSync(
    adb,
    '#!/usr/bin/env node\nconst fs=require("node:fs");const a=process.argv.slice(2);if(a.includes("install"))fs.appendFileSync(process.env.CLIPP_FAKE_ADB_LOG,a.join(" ")+"\\n");if(a.includes("get-state"))console.log(process.env.CLIPP_FAKE_OFFLINE_API===a[1].split("-").at(-1)?"offline":"device");else if(a.includes("getprop")){const k=a.at(-1);if(k==="ro.kernel.qemu"||k==="sys.boot_completed")console.log("1");else if(k==="ro.build.version.sdk")console.log(a[1].split("-").at(-1));}else console.log("OK");\n'
  );
  for (const file of [aapt, apksigner, adb, java]) chmodSync(file, 0o755);
  const authorization = {
    schema: 1,
    scope: "isolated-android-acceptance",
    sourceRevision: f.revision,
    effort: "fixture-qualification",
    serials,
    appPackage: "com.clipp.app.acceptance",
    testPackage: "com.clipp.app.acceptance.test",
  };
  return {
    CLIPP_TEST_ANDROID_HOME: sdk,
    CLIPP_TEST_JAVA_HOME: jdk,
    CLIPP_TEST_ACCEPTANCE_STATE: path.join(f.base, "native-state"),
    CLIPP_TEST_ACCEPTANCE_AUTH: JSON.stringify(authorization),
    CLIPP_FAKE_ADB_LOG: adbLog,
    adbLog,
  };
}

test("Android qualification blocks for missing selected emulator configuration after common checks", (t) => {
  const f = fixture(t);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo
  );
  assert.notEqual(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(
    body.run.stages.commonVerify.state,
    "passed",
    JSON.stringify(body.run.stages.commonVerify.detail)
  );
  assert.equal(body.run.androidQualification.state, "blocked");
  assert.match(body.run.androidQualification.nextAction, /emulator/i);
  assert.equal(
    readFileSync(path.join(body.run.checkout, "checks.txt"), "utf8"),
    "lint\ntypecheck\njest\ncandidate-tooling\ndelivery-tooling\n"
  );
});

test("Android qualification blocks unavailable JDK and SDK before a native build", (t) => {
  const destinations = { androidAcceptanceEffort: "fixture-qualification" };
  for (const api of [31, 33, 34, 35, 36])
    destinations[`androidAcceptanceSerialApi${api}`] = `emulator-${api}`;
  const references = {
    androidSdkRef: "env:CLIPP_TEST_ANDROID_HOME",
    javaHomeRef: "env:CLIPP_TEST_JAVA_HOME",
    androidAcceptanceStateRootRef: "env:CLIPP_TEST_ACCEPTANCE_STATE",
    androidAcceptanceAuthorizationRef: "env:CLIPP_TEST_ACCEPTANCE_AUTH",
  };
  const f = fixture(t, { destinations, references });
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    {
      CLIPP_TEST_ANDROID_HOME: path.join(f.base, "missing-sdk"),
      CLIPP_TEST_JAVA_HOME: path.join(f.base, "missing-jdk"),
      CLIPP_TEST_ACCEPTANCE_STATE: path.join(f.base, "native-state"),
      CLIPP_TEST_ACCEPTANCE_AUTH: path.join(
        f.base,
        "acceptance-authorization.json"
      ),
    }
  );
  const body = JSON.parse(result.stdout);
  assert.equal(body.run.stages.commonVerify.state, "passed");
  assert.equal(body.run.androidQualification.state, "blocked");
  assert.match(body.run.androidQualification.nextAction, /JDK|SDK/);
});

test("native matrix receipt must name every frozen case on the selected API and APK pair", () => {
  const profile = JSON.parse(
    readFileSync(path.resolve("scripts/delivery/profiles/v1.json"), "utf8")
  ).androidQualification;
  const pair = {
    appSha256: "a".repeat(64),
    testSha256: "b".repeat(64),
    revision: "c".repeat(40),
  };
  const receipt = {
    result: "passed",
    androidApi: "31",
    isEmulator: "1",
    serial: "emulator-5554",
    candidate: {
      frozen: true,
      revision: pair.revision,
      sha256: pair.appSha256,
      testArtifact: { sha256: pair.testSha256 },
    },
    cleanup: "passed",
    appCleanup: "passed",
    behavior: {
      suite: "matrix",
      passed: true,
      requiredTests: profile.matrixCases.length,
      observedPassedTests: profile.matrixCases.slice(1),
    },
    verifiedCoverage: [
      "android-owned-readiness",
      ...profile.matrixCases.slice(1),
    ],
  };
  assert.throws(
    () =>
      validateNativeReceipt(receipt, profile, {
        api: 31,
        serial: "emulator-5554",
        pair,
      }),
    /native_behavior_coverage_missing/
  );
  receipt.behavior.observedPassedTests = [...profile.matrixCases];
  receipt.verifiedCoverage = [
    "android-owned-readiness",
    ...profile.matrixCases,
  ];
  assert.doesNotThrow(() =>
    validateNativeReceipt(receipt, profile, {
      api: 31,
      serial: "emulator-5554",
      pair,
    })
  );
  receipt.candidate.sha256 = "d".repeat(64);
  assert.throws(
    () =>
      validateNativeReceipt(receipt, profile, {
        api: 31,
        serial: "emulator-5554",
        pair,
      }),
    /native_candidate_mismatch/
  );
});

test("acceptance pair provenance binds both APKs to the frozen committed source", (t) => {
  const base = mkdtempSync(path.join(tmpdir(), "clipp-acceptance-pair-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const app = path.join(base, "app-acceptance.apk");
  const testApk = path.join(base, "app-acceptance-androidTest.apk");
  writeFileSync(app, "app bytes");
  writeFileSync(testApk, "test bytes");
  const hash = (file) =>
    createHash("sha256").update(readFileSync(file)).digest("hex");
  const plan = {
    source: { commit: "a".repeat(40), lockfileSha256: "b".repeat(64) },
  };
  const run = {
    checkout: "/frozen/checkout",
    installationSha256: "c".repeat(64),
  };
  const provenance = {
    schemaVersion: 2,
    revision: plan.source.commit,
    dirty: false,
    source: { checkout: run.checkout },
    artifact: path.basename(app),
    artifactSha256: hash(app),
    applicationId: "com.clipp.app.acceptance",
    lockfileSha256: plan.source.lockfileSha256,
    installationSha256: run.installationSha256,
    testArtifact: {
      file: path.basename(testApk),
      sha256: hash(testApk),
      applicationId: "com.clipp.app.acceptance.test",
      targetPackage: "com.clipp.app.acceptance",
    },
  };
  writeFileSync(`${app}.provenance.json`, JSON.stringify(provenance));
  assert.throws(
    () => validateAcceptancePair(base, plan, run),
    /acceptance_signature_or_callback_missing/
  );
  provenance.callbackScheme = "clipp-relay-acceptance";
  provenance.signatures = {
    appCertificateSha256: "d".repeat(64),
    testCertificateSha256: "e".repeat(64),
  };
  provenance.toolchain = {
    java: 'openjdk version "21.0.1"',
    aapt2: "Android Asset Packaging Tool (aapt) 2.19-11948202",
  };
  writeFileSync(`${app}.provenance.json`, JSON.stringify(provenance));
  assert.doesNotThrow(() => validateAcceptancePair(base, plan, run));
  provenance.revision = "d".repeat(40);
  writeFileSync(`${app}.provenance.json`, JSON.stringify(provenance));
  assert.throws(
    () => validateAcceptancePair(base, plan, run),
    /acceptance_source_mismatch/
  );
  provenance.revision = plan.source.commit;
  provenance.testArtifact.sha256 = "e".repeat(64);
  writeFileSync(`${app}.provenance.json`, JSON.stringify(provenance));
  assert.throws(
    () => validateAcceptancePair(base, plan, run),
    /acceptance_artifact_changed/
  );
});

test("native unit gate rejects zero, skipped and failing Gradle XML results", (t) => {
  const base = mkdtempSync(path.join(tmpdir(), "clipp-native-unit-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const report = path.join(base, "TEST-example.xml");
  writeFileSync(
    report,
    '<testsuite tests="0" skipped="0" failures="0" errors="0"/>'
  );
  assert.throws(() => validateNativeUnit(base), /native_unit_coverage_missing/);
  writeFileSync(
    report,
    '<testsuite tests="3" skipped="1" failures="0" errors="0"/>'
  );
  assert.throws(() => validateNativeUnit(base), /native_unit_coverage_missing/);
  writeFileSync(
    report,
    '<testsuite tests="3" skipped="0" failures="1" errors="0"/>'
  );
  assert.throws(() => validateNativeUnit(base), /native_unit_coverage_missing/);
  writeFileSync(
    report,
    '<testsuite tests="3" skipped="0" failures="0" errors="0"/>'
  );
  assert.equal(validateNativeUnit(base).cases, 3);
});

test("Android qualification runs the frozen acceptance pair on each selected emulator and reuses receipts", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  assert.notEqual(first.status, 0, first.stdout);
  const run = JSON.parse(first.stdout).run;
  assert.equal(run.stages.commonVerify.state, "passed");
  assert.equal(
    run.androidQualification.state,
    "passed",
    run.androidQualification.nextAction
  );
  assert.deepEqual(Object.keys(run.androidQualification.matrix), [
    "31",
    "33",
    "34",
    "35",
    "36",
  ]);
  assert.equal(run.targets["android-package"].state, "pending");
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    10
  );
  const replay = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  assert.equal(
    JSON.parse(replay.stdout).run.androidQualification.state,
    "passed"
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    10
  );
});

test("changed acceptance APK blocks qualification replay without repeating installation", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(first.stdout).run;
  assert.equal(
    run.androidQualification.state,
    "passed",
    run.androidQualification.nextAction
  );
  writeFileSync(run.androidQualification.pair.app, "tampered app");
  const replay = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const changed = JSON.parse(replay.stdout);
  assert.notEqual(replay.status, 0);
  assert.equal(changed.run.stages.commonVerify.state, "passed");
  assert.equal(changed.run.androidQualification.state, "failed");
  assert.match(
    changed.run.androidQualification.nextAction,
    /acceptance_artifact_changed/
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    10
  );
});

test("a rewritten run record cannot reuse an acceptance pair outside its owned run store", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(first.stdout).run;
  assert.equal(
    run.androidQualification.state,
    "passed",
    run.androidQualification.nextAction
  );
  const external = path.join(f.base, "external-pair");
  mkdirSync(external);
  for (const name of [
    "app-acceptance.apk",
    "app-acceptance-androidTest.apk",
    "app-acceptance.apk.provenance.json",
  ])
    copyFileSync(
      path.join(path.dirname(run.androidQualification.pair.app), name),
      path.join(external, name)
    );
  const record = path.join(f.store, "runs", f.plan.plan.id, "run.json");
  const rewritten = JSON.parse(readFileSync(record, "utf8"));
  rewritten.androidQualification.pair.app = path.join(
    external,
    "app-acceptance.apk"
  );
  delete rewritten.integritySha256;
  rewritten.integritySha256 = createHash("sha256")
    .update(JSON.stringify(rewritten))
    .digest("hex");
  writeFileSync(record, JSON.stringify(rewritten));
  const replay = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const result = JSON.parse(replay.stdout);
  assert.equal(result.run.stages.commonVerify.state, "passed");
  assert.equal(result.run.androidQualification.state, "failed");
  assert.match(
    result.run.androidQualification.nextAction,
    /native_evidence_changed/
  );
});

test("an incomplete native matrix remains failed and does not install again on replay", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    { ...environment, CLIPP_FAKE_MISSING_CASE: "1" }
  );
  const run = JSON.parse(first.stdout).run;
  assert.equal(run.stages.commonVerify.state, "passed");
  assert.equal(run.androidQualification.state, "failed");
  assert.match(
    run.androidQualification.nextAction,
    /native_behavior_coverage_missing/
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    2
  );
  const replay = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const resumed = JSON.parse(replay.stdout).run;
  assert.equal(resumed.androidQualification.state, "blocked");
  assert.match(
    resumed.androidQualification.nextAction,
    /diagnos|review|policy/i
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    2
  );
});

test("a failed native attempt resumes only with a changed diagnostic decision", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    { ...environment, CLIPP_FAKE_NATIVE_FAIL: "1" }
  );
  assert.equal(
    JSON.parse(first.stdout).run.androidQualification.state,
    "failed"
  );
  const replay = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  assert.equal(
    JSON.parse(replay.stdout).run.androidQualification.state,
    "blocked"
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    2
  );
  const resumed = command(
    process.execPath,
    [
      cli,
      "run",
      f.plan.path,
      "--native-diagnostic-change",
      "emulator repaired",
      "--native-expected-observation",
      "all matrix cases pass",
      "--json",
    ],
    f.repo,
    environment
  );
  assert.equal(
    JSON.parse(resumed.stdout).run.androidQualification.state,
    "passed",
    JSON.parse(resumed.stdout).run.androidQualification.nextAction
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    10
  );
});

test("missing upload signing reference does not block native qualification", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, {
    ...selection,
    native: true,
    signing: { androidPackage: "upload" },
  });
  const environment = nativeTools(f, selection.serials);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(result.stdout).run;
  assert.equal(
    run.androidQualification.state,
    "passed",
    run.androidQualification.nextAction
  );
  assert.equal(run.targets["android-package"].state, "pending");
});

test("native build can finish while acceptance installation waits for matching authorization", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  delete environment.CLIPP_TEST_ACCEPTANCE_AUTH;
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(result.stdout).run;
  assert.equal(run.androidQualification.state, "blocked");
  assert.match(run.androidQualification.nextAction, /authorization/);
  assert.equal(run.androidQualification.unit.cases, 2);
  assert.equal(run.androidQualification.pair.revision, f.revision);
  assert.equal(
    run.androidQualification.attempts.filter(
      (item) => item.id === "android-acceptance-build"
    ).length,
    1
  );
  assert.equal(run.androidQualification.matrix[31], undefined);
});

test("wrong selected emulator API blocks before either acceptance APK is installed", (t) => {
  const selection = nativeSelection();
  selection.serials[31] = "emulator-999";
  selection.destinations.androidAcceptanceSerialApi31 = "emulator-999";
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(result.stdout).run;
  assert.equal(run.androidQualification.state, "blocked");
  assert.match(
    run.androidQualification.nextAction,
    /native_emulator_unavailable/
  );
  assert.equal(existsSync(environment.adbLog), false);
});

test("wrong Android build-tools version blocks native work", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const aapt = path.join(
    environment.CLIPP_TEST_ANDROID_HOME,
    "build-tools",
    "35.0.0",
    "aapt2"
  );
  writeFileSync(aapt, "#!/bin/sh\necho aapt2-34.0.0\n");
  chmodSync(aapt, 0o755);
  const result = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(result.stdout).run;
  assert.equal(run.androidQualification.state, "blocked");
  assert.match(run.androidQualification.nextAction, /build-tools/);
  assert.equal(run.androidQualification.attempts?.length || 0, 0);
});

test("native state root cannot resolve through an ancestor symlink into candidate source", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  delete environment.CLIPP_TEST_ACCEPTANCE_AUTH;
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const initial = JSON.parse(first.stdout).run;
  assert.equal(initial.androidQualification.state, "blocked");
  const link = path.join(f.base, "redirect");
  symlinkSync(initial.checkout, link);
  const replay = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    {
      ...environment,
      CLIPP_TEST_ACCEPTANCE_STATE: path.join(link, "new-state"),
    }
  );
  const run = JSON.parse(replay.stdout).run;
  assert.equal(run.androidQualification.state, "blocked");
  assert.match(
    run.androidQualification.nextAction,
    /outside candidate checkout/
  );
  assert.equal(existsSync(path.join(initial.checkout, "new-state")), false);
});

test("an unavailable later emulator resumes without repeating completed API matrices", (t) => {
  const selection = nativeSelection();
  const f = fixture(t, { ...selection, native: true });
  const environment = nativeTools(f, selection.serials);
  const first = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    { ...environment, CLIPP_FAKE_OFFLINE_API: "34" }
  );
  const partial = JSON.parse(first.stdout).run;
  assert.equal(partial.androidQualification.state, "blocked");
  assert.deepEqual(Object.keys(partial.androidQualification.matrix), [
    "31",
    "33",
  ]);
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    4
  );
  const resumed = command(
    process.execPath,
    [cli, "run", f.plan.path, "--json"],
    f.repo,
    environment
  );
  const run = JSON.parse(resumed.stdout).run;
  assert.equal(
    run.androidQualification.state,
    "passed",
    run.androidQualification.nextAction
  );
  assert.equal(
    readFileSync(environment.adbLog, "utf8").trim().split("\n").length,
    10
  );
});
