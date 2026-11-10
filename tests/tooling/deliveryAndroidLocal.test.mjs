import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAdbDevice,
  installAndroidLocal,
} from "../../scripts/delivery/android-local.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const outputRoot = mkdtempSync(
    path.join(os.tmpdir(), "clipp-android-local-")
  );
  const apk = Buffer.from("verified-debug-apk");
  writeFileSync(path.join(outputRoot, "app.apk"), apk);
  const certificate = "a".repeat(64);
  const plan = {
    id: "11111111-1111-4111-8111-111111111111",
    outputRoot,
    source: { commit: "b".repeat(40) },
    targets: {
      "android-local": {
        signing: "debug",
        destinationIdentity: "emulator-5556",
      },
    },
    profile: {
      androidPackage: { applicationId: "com.clipp.app" },
      androidQualification: { sdkBuildTools: "35.0.0" },
    },
    privateReferences: {},
  };
  const receipt = {
    source: plan.source.commit,
    buildIdentity: "c".repeat(64),
    signing: "debug",
    signature: { state: "debug", certificateSha256: certificate },
    qualification: { appSha256: "d".repeat(64), testSha256: "e".repeat(64) },
    version: {
      applicationId: "com.clipp.app",
      versionCode: "42",
      versionName: "1.2.3",
      minSdk: "31",
    },
    apk: { path: "app.apk", sha256: sha(apk) },
  };
  const run = {
    source: plan.source,
    stages: {
      androidPackage: { state: "passed", receipt },
      androidLocal: { state: "pending", attempts: [] },
    },
    androidQualification: {
      state: "passed",
      pair: { appSha256: "d".repeat(64), testSha256: "e".repeat(64) },
    },
    targets: { "android-local": { state: "pending" } },
  };
  const calls = [];
  let installed = null;
  const device = {
    async observe() {
      calls.push("observe");
      return {
        serial: "emulator-5556",
        state: "device",
        booted: true,
        api: 35,
        installed,
      };
    },
    async install() {
      calls.push("install");
      installed = {
        applicationId: "com.clipp.app",
        versionCode: "42",
        versionName: "1.2.3",
        certificateSha256: certificate,
        apkSha256: receipt.apk.sha256,
      };
      return { accepted: true };
    },
    async launch() {
      calls.push("launch");
      return { started: true };
    },
    async readiness() {
      calls.push("readiness");
      return {
        activity: "com.clipp.app/com.clipp.app.MainActivity",
        process: true,
        focused: true,
      };
    },
  };
  return {
    plan,
    run,
    device,
    calls,
    apk,
    receipt,
    certificate,
    setInstalled(value) {
      installed = value;
    },
    save() {},
  };
}

function authorize(f) {
  const file = path.join(f.plan.outputRoot, "authorization.json");
  writeFileSync(
    file,
    JSON.stringify({
      schema: 1,
      scope: "local-android-installation",
      sourceRevision: f.plan.source.commit,
      buildIdentity: f.receipt.buildIdentity,
      serial: "emulator-5556",
      applicationId: "com.clipp.app",
      apkSha256: f.receipt.apk.sha256,
      signing: "debug",
      authorizedBy: "operator",
      authorizedAt: "2026-11-10T00:00:00Z",
    })
  );
  f.plan.privateReferences.androidInstallAuthorizationRef = `file:${file}`;
}

test("Android local requires matching authorization before device access", async () => {
  const f = fixture();
  await assert.rejects(installAndroidLocal(f), {
    code: "android_install_unauthorized",
  });
  assert.deepEqual(f.calls, []);
});

test("Android local installs only the selected compatible APK and confirms readiness", async () => {
  const f = fixture();
  authorize(f);
  await installAndroidLocal(f);
  assert.equal(f.run.targets["android-local"].state, "complete");
  assert.deepEqual(f.calls, [
    "observe",
    "observe",
    "install",
    "observe",
    "launch",
    "readiness",
  ]);
  await installAndroidLocal(f);
  assert.equal(f.calls.filter((call) => call === "install").length, 1);
});

test("Android local blocks signature conflict and downgrade before install", async () => {
  const conflict = fixture();
  authorize(conflict);
  conflict.setInstalled({
    applicationId: "com.clipp.app",
    versionCode: "41",
    versionName: "1.2.2",
    certificateSha256: "f".repeat(64),
    apkSha256: "f".repeat(64),
  });
  await assert.rejects(installAndroidLocal(conflict), {
    code: "android_signature_conflict",
  });
  assert.equal(conflict.calls.includes("install"), false);
  const downgrade = fixture();
  authorize(downgrade);
  downgrade.setInstalled({
    applicationId: "com.clipp.app",
    versionCode: "43",
    versionName: "1.2.4",
    certificateSha256: downgrade.certificate,
    apkSha256: "f".repeat(64),
  });
  await assert.rejects(installAndroidLocal(downgrade), {
    code: "android_downgrade_required",
  });
  assert.equal(downgrade.calls.includes("install"), false);
});

test("lost install acknowledgement reconciles the exact installed APK", async () => {
  const f = fixture();
  authorize(f);
  f.device.install = async () => {
    f.calls.push("install");
    f.setInstalled({
      applicationId: "com.clipp.app",
      versionCode: "42",
      versionName: "1.2.3",
      certificateSha256: f.certificate,
      apkSha256: f.receipt.apk.sha256,
    });
    throw new Error("response lost");
  };
  await assert.rejects(installAndroidLocal(f), {
    code: "android_install_uncertain",
  });
  assert.equal(f.run.stages.androidLocal.state, "uncertain");
  await installAndroidLocal(f);
  assert.equal(f.run.targets["android-local"].state, "complete");
  assert.equal(f.calls.filter((call) => call === "install").length, 1);
});

test("stale device lock requires exact installed payload before recovery", async () => {
  const f = fixture();
  authorize(f);
  const identity = `android-device:emulator-5556:com.clipp.app`;
  const digest = sha(identity);
  const lock = path.join(
    os.tmpdir(),
    `clipp-delivery-locks-${process.getuid?.() ?? "user"}`,
    `${digest}.json`
  );
  mkdirSync(path.dirname(lock), { recursive: true });
  writeFileSync(
    lock,
    JSON.stringify({
      schema: 1,
      identitySha256: digest,
      pid: 2147483647,
      token: "abandoned",
      startedAt: "2026-11-10T00:00:00Z",
    })
  );
  try {
    await assert.rejects(installAndroidLocal(f), {
      code: "ownership_uncertain",
    });
    assert.equal(f.calls.includes("install"), false);
    f.setInstalled({
      applicationId: "com.clipp.app",
      versionCode: "42",
      versionName: "1.2.3",
      certificateSha256: f.certificate,
      apkSha256: f.receipt.apk.sha256,
    });
    await installAndroidLocal(f);
    assert.equal(f.run.targets["android-local"].state, "complete");
    assert.equal(f.calls.includes("install"), false);
  } finally {
    rmSync(lock, { force: true });
  }
});

test("lost launch acknowledgement reconciles readiness without relaunch", async () => {
  const f = fixture();
  authorize(f);
  f.device.launch = async () => {
    f.calls.push("launch");
    throw new Error("response lost");
  };
  await assert.rejects(installAndroidLocal(f), {
    code: "android_launch_uncertain",
  });
  await installAndroidLocal(f);
  assert.equal(f.run.targets["android-local"].state, "complete");
  assert.equal(f.calls.filter((call) => call === "launch").length, 1);
});

test("Android local rejects wrong serial, unsigned output and changed artifact before install", async () => {
  const wrong = fixture();
  authorize(wrong);
  wrong.device.observe = async () => ({
    serial: "emulator-5558",
    state: "device",
    booted: true,
    api: 35,
    installed: null,
  });
  await assert.rejects(installAndroidLocal(wrong), {
    code: "android_device_unavailable",
  });
  const unsigned = fixture();
  authorize(unsigned);
  unsigned.receipt.signing = "unsigned-artifact";
  await assert.rejects(installAndroidLocal(unsigned), {
    code: "android_install_prerequisite_unavailable",
  });
  assert.deepEqual(unsigned.calls, []);
  const changed = fixture();
  authorize(changed);
  writeFileSync(path.join(changed.plan.outputRoot, "app.apk"), "modified");
  await assert.rejects(installAndroidLocal(changed), {
    code: "android_artifact_invalid",
  });
  assert.deepEqual(changed.calls, []);
});

test("already installed exact APK skips reinstall and still proves startup readiness", async () => {
  const f = fixture();
  authorize(f);
  f.setInstalled({
    applicationId: "com.clipp.app",
    versionCode: "42",
    versionName: "1.2.3",
    certificateSha256: f.certificate,
    apkSha256: f.receipt.apk.sha256,
  });
  await installAndroidLocal(f);
  assert.equal(f.run.targets["android-local"].state, "complete");
  assert.equal(f.calls.includes("install"), false);
  assert.equal(f.calls.includes("readiness"), true);
});

test("two runs cannot install the same selected device and package concurrently", async () => {
  const first = fixture();
  authorize(first);
  const second = fixture();
  authorize(second);
  let entered;
  const held = new Promise((resolve) => {
    entered = resolve;
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  first.device.install = async () => {
    first.calls.push("install");
    entered();
    await gate;
    first.setInstalled({
      applicationId: "com.clipp.app",
      versionCode: "42",
      versionName: "1.2.3",
      certificateSha256: first.certificate,
      apkSha256: first.receipt.apk.sha256,
    });
  };
  const running = installAndroidLocal(first);
  await held;
  try {
    await assert.rejects(installAndroidLocal(second), {
      code: "resource_owned",
    });
  } finally {
    release();
  }
  await running;
});

test("ADB adapter uses the selected serial and data-preserving install flags", async () => {
  const f = fixture();
  const sdk = path.join(f.plan.outputRoot, "sdk");
  const adb = path.join(sdk, "platform-tools", "adb");
  const aapt2 = path.join(sdk, "build-tools", "35.0.0", "aapt2");
  const apksigner = path.join(sdk, "build-tools", "35.0.0", "apksigner");
  mkdirSync(path.dirname(adb), { recursive: true });
  mkdirSync(path.dirname(aapt2), { recursive: true });
  const log = path.join(f.plan.outputRoot, "adb.log");
  const installed = path.join(f.plan.outputRoot, "installed.flag");
  writeFileSync(
    adb,
    `#!/usr/bin/env node
const fs=require('node:fs'); const a=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');
if(a[0]==='devices') console.log('List of devices attached\\nemulator-5556 device product:test');
else if(a[3]==='getprop') console.log(a[4]==='sys.boot_completed'?'1':'35');
else if(a[3]==='pm') console.log(fs.existsSync(${JSON.stringify(installed)})?'package:/data/app/base.apk':'');
else if(a[2]==='pull') fs.copyFileSync(${JSON.stringify(path.join(f.plan.outputRoot, "app.apk"))},a[4]);
else if(a[2]==='install'){fs.writeFileSync(${JSON.stringify(installed)},'1');console.log('Success');}
else if(a[3]==='am') console.log('Status: ok');
else if(a[3]==='dumpsys') console.log('mCurrentFocus=Window{abc u0 com.clipp.app/com.clipp.app.MainActivity}');
else if(a[3]==='pidof') console.log('123');
`
  );
  writeFileSync(
    aapt2,
    `#!/usr/bin/env node\nconsole.log("package: name='com.clipp.app' versionCode='42' versionName='1.2.3'");`
  );
  writeFileSync(
    apksigner,
    `#!/usr/bin/env node\nconsole.log('Signer #1 certificate SHA-256 digest: ${f.certificate}');`
  );
  for (const file of [adb, aapt2, apksigner]) chmodSync(file, 0o755);
  f.plan.privateReferences.androidSdkRef = `file:${path.join(f.plan.outputRoot, "sdk-ref")}`;
  writeFileSync(path.join(f.plan.outputRoot, "sdk-ref"), sdk);
  const device = createAdbDevice(f.plan);
  assert.equal(
    (await device.observe("emulator-5556", "com.clipp.app")).installed,
    null
  );
  await device.install(
    "emulator-5556",
    path.join(f.plan.outputRoot, "app.apk")
  );
  assert.equal(
    (await device.observe("emulator-5556", "com.clipp.app")).installed
      .apkSha256,
    f.receipt.apk.sha256
  );
  await device.launch(
    "emulator-5556",
    "com.clipp.app/com.clipp.app.MainActivity"
  );
  assert.equal(
    (await device.readiness("emulator-5556", "com.clipp.app")).focused,
    true
  );
  const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(
    calls.every(
      (args) =>
        args[0] === "devices" ||
        (args[0] === "-s" && args[1] === "emulator-5556")
    )
  );
  assert.deepEqual(
    calls.find((args) => args[2] === "install"),
    [
      "-s",
      "emulator-5556",
      "install",
      "-r",
      "--no-incremental",
      path.join(f.plan.outputRoot, "app.apk"),
    ]
  );
  assert.equal(
    calls.some(
      (args) =>
        args.includes("uninstall") ||
        args.includes("clear") ||
        args.includes("-d")
    ),
    false
  );
});
