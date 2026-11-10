/** Install one verified product APK on one explicitly selected Android device. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireOwnership } from "./ownership.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const fail = (code, message = code) => {
  throw Object.assign(new Error(message), { code });
};
const activity = "com.clipp.app/com.clipp.app.MainActivity";

function privateValue(ref) {
  if (typeof ref !== "string") return null;
  if (ref.startsWith("env:")) return process.env[ref.slice(4)] || null;
  if (ref.startsWith("file:")) {
    try {
      return readFileSync(ref.slice(5), "utf8").trim();
    } catch {
      return null;
    }
  }
  if (ref.startsWith("keychain:") && process.platform === "darwin") {
    const result = spawnSync(
      "security",
      ["find-generic-password", "-w", "-s", ref.slice(9)],
      { encoding: "utf8", timeout: 10_000 }
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }
  return null;
}

function candidate(plan, run) {
  const receipt = run.stages.androidPackage?.receipt;
  const target = plan.targets["android-local"];
  if (
    !target?.destinationIdentity ||
    /\s/.test(target.destinationIdentity) ||
    !["debug", "upload"].includes(target.signing) ||
    run.stages.androidPackage?.state !== "passed" ||
    run.stages.androidPackage?.integrityError ||
    run.androidQualification?.state !== "passed" ||
    receipt?.source !== plan.source.commit ||
    receipt.signing !== target.signing ||
    receipt.signature?.state !== target.signing ||
    receipt.qualification?.appSha256 !==
      run.androidQualification.pair?.appSha256 ||
    receipt.qualification?.testSha256 !==
      run.androidQualification.pair?.testSha256 ||
    receipt.version?.applicationId !==
      plan.profile.androidPackage.applicationId ||
    !Number.isSafeInteger(Number(receipt.version?.versionCode)) ||
    !/^[a-f0-9]{64}$/.test(receipt.signature?.certificateSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(receipt.apk?.sha256 || "")
  )
    fail(
      "android_install_prerequisite_unavailable",
      "Verified compatible product APK and native qualification are required"
    );
  const apk = path.resolve(plan.outputRoot, receipt.apk.path || "");
  try {
    if (
      !apk.startsWith(`${path.resolve(plan.outputRoot)}${path.sep}`) ||
      !lstatSync(apk).isFile() ||
      !realpathSync(apk).startsWith(
        `${realpathSync(plan.outputRoot)}${path.sep}`
      ) ||
      sha(readFileSync(apk)) !== receipt.apk.sha256
    )
      fail(
        "android_artifact_invalid",
        "Recorded Android APK changed after verification"
      );
  } catch (error) {
    if (error.code === "android_artifact_invalid") throw error;
    fail("android_artifact_missing", "Verified Android APK is unavailable");
  }
  return {
    receipt,
    apk,
    serial: target.destinationIdentity,
    app: receipt.version.applicationId,
  };
}

function authorization(plan, receipt, serial, app) {
  const raw = privateValue(
    plan.privateReferences?.androidInstallAuthorizationRef
  );
  let grant;
  try {
    grant = JSON.parse(raw);
  } catch {
    /* absent */
  }
  if (
    grant?.schema !== 1 ||
    grant.scope !== "local-android-installation" ||
    grant.sourceRevision !== plan.source.commit ||
    grant.buildIdentity !== receipt.buildIdentity ||
    grant.serial !== serial ||
    grant.applicationId !== app ||
    grant.apkSha256 !== receipt.apk.sha256 ||
    grant.signing !== receipt.signing ||
    typeof grant.authorizedBy !== "string" ||
    !grant.authorizedBy.trim() ||
    !Number.isFinite(Date.parse(grant.authorizedAt))
  )
    fail(
      "android_install_unauthorized",
      "Matching private Android installation authorization is required"
    );
  return {
    scope: grant.scope,
    source: grant.authorizedBy,
    authorizedAt: grant.authorizedAt,
    sha256: sha(raw),
  };
}

function checkDevice(observation, serial, minSdk) {
  if (
    observation?.serial !== serial ||
    observation.state !== "device" ||
    observation.booted !== true ||
    !Number.isInteger(observation.api) ||
    observation.api < Number(minSdk)
  )
    fail(
      "android_device_unavailable",
      "Selected Android device is disconnected, unauthorized, unbooted or incompatible"
    );
}

function checkCompatibility(installed, receipt, app) {
  if (!installed) return false;
  if (
    installed.applicationId !== app ||
    !/^[a-f0-9]{64}$/.test(installed.certificateSha256 || "")
  )
    fail(
      "android_installed_identity_unknown",
      "Installed package identity cannot be verified"
    );
  if (installed.certificateSha256 !== receipt.signature.certificateSha256)
    fail(
      "android_signature_conflict",
      "Installed package uses a different signing certificate"
    );
  if (!Number.isSafeInteger(Number(installed.versionCode)))
    fail(
      "android_installed_identity_unknown",
      "Installed package version cannot be verified"
    );
  if (Number(installed.versionCode) > Number(receipt.version.versionCode))
    fail(
      "android_downgrade_required",
      "Selected device has a newer package; downgrade is not allowed"
    );
  return (
    installed.apkSha256 === receipt.apk.sha256 &&
    String(installed.versionCode) === String(receipt.version.versionCode) &&
    installed.versionName === receipt.version.versionName
  );
}

export async function installAndroidLocal({ plan, run, save, device }) {
  const target = run.targets["android-local"];
  if (!target) return;
  const stage = run.stages.androidLocal;
  const { receipt, apk, serial, app } = candidate(plan, run);
  if (target.state === "complete" && stage.state === "passed") return;
  const auth = authorization(plan, receipt, serial, app);
  device ||= createAdbDevice(plan);
  if (stage.authorization?.sha256 && stage.authorization.sha256 !== auth.sha256)
    fail(
      "android_install_unauthorized",
      "Android installation authorization changed during this run"
    );
  stage.authorization = auth;
  const persist = () => {
    stage.updatedAt = now();
    run.updatedAt = stage.updatedAt;
    save();
  };
  const begin = (kind) => {
    const attempt = {
      number: stage.attempts.length + 1,
      kind,
      state: "running",
      startedAt: now(),
    };
    stage.attempts.push(attempt);
    stage.pending = { kind, number: attempt.number };
    stage.state = "running";
    persist();
  };
  const finish = (state) => {
    const attempt = stage.attempts.find(
      (item) => item.number === stage.pending?.number
    );
    if (attempt) Object.assign(attempt, { state, finishedAt: now() });
    if (state === "uncertain") stage.state = "uncertain";
    else stage.pending = null;
    persist();
  };
  const first = await device.observe(serial, app);
  checkDevice(first, serial, receipt.version.minSdk);
  // An abandoned owner may have sent an install before dying. A missing or
  // different payload cannot distinguish "never sent" from "sent, unresolved".
  const recoverable = checkCompatibility(first.installed, receipt, app);
  const unlock = acquireOwnership(`android-device:${serial}:${app}`, {
    canRecover: () => recoverable,
  });
  try {
    const observed = await device.observe(serial, app);
    checkDevice(observed, serial, receipt.version.minSdk);
    let matching = checkCompatibility(observed.installed, receipt, app);
    if (stage.pending?.kind === "install") {
      if (!matching)
        fail(
          "android_install_uncertain",
          "Prior Android install is unresolved on the selected device"
        );
      finish("reconciled");
    }
    if (!matching) {
      candidate(plan, run);
      authorization(plan, receipt, serial, app);
      begin("install");
      try {
        await device.install(serial, apk);
      } catch {
        finish("uncertain");
        fail(
          "android_install_uncertain",
          "Android installation response is uncertain"
        );
      }
      let installed;
      try {
        installed = await device.observe(serial, app);
      } catch {
        finish("uncertain");
        fail(
          "android_install_uncertain",
          "Installed Android package cannot be read back"
        );
      }
      checkDevice(installed, serial, receipt.version.minSdk);
      matching = checkCompatibility(installed.installed, receipt, app);
      if (!matching) {
        finish("uncertain");
        fail(
          "android_install_uncertain",
          "Installed APK does not match the verified candidate"
        );
      }
      finish("accepted");
    }
    stage.installed = {
      serial,
      applicationId: app,
      apkSha256: receipt.apk.sha256,
      certificateSha256: receipt.signature.certificateSha256,
      versionCode: receipt.version.versionCode,
      versionName: receipt.version.versionName,
      buildIdentity: receipt.buildIdentity,
      observedAt: now(),
    };
    persist();
    let ready;
    if (stage.pending?.kind === "launch") {
      try {
        ready = await device.readiness(serial, app);
        if (ready?.activity === activity && ready.process && ready.focused)
          finish("reconciled");
      } catch {
        /* launch outcome remains uncertain */
      }
    }
    if (stage.pending?.kind === "launch")
      fail(
        "android_launch_uncertain",
        "Prior Android launch is not yet confirmed"
      );
    if (!ready?.process || !ready.focused || ready.activity !== activity) {
      begin("launch");
      try {
        await device.launch(serial, activity);
      } catch {
        finish("uncertain");
        fail(
          "android_launch_uncertain",
          "Selected Android app launch response is uncertain"
        );
      }
      try {
        ready = await device.readiness(serial, app);
      } catch {
        finish("uncertain");
        fail(
          "android_launch_uncertain",
          "Selected Android app readiness cannot be observed"
        );
      }
      if (ready?.activity !== activity || !ready.process || !ready.focused) {
        finish("uncertain");
        fail(
          "android_launch_uncertain",
          "Selected Android app did not reach foreground readiness"
        );
      }
      finish("accepted");
    }
    stage.readiness = {
      activity,
      process: true,
      focused: true,
      observedAt: now(),
    };
    stage.state = "passed";
    Object.assign(target, {
      state: "complete",
      nextAction: null,
      installed: stage.installed,
      updatedAt: now(),
    });
    persist();
  } finally {
    unlock();
  }
}

export function createAdbDevice(plan) {
  const sdk = privateValue(plan.privateReferences?.androidSdkRef);
  if (!sdk || !path.isAbsolute(sdk))
    fail("android_device_unavailable", "Android SDK reference is unavailable");
  const adb = path.join(sdk, "platform-tools", "adb");
  const tools = path.join(
    sdk,
    "build-tools",
    plan.profile.androidQualification.sdkBuildTools
  );
  const aapt2 = path.join(tools, "aapt2");
  const apksigner = path.join(tools, "apksigner");
  for (const file of [adb, aapt2, apksigner])
    if (!existsSync(file) || !lstatSync(file).isFile())
      fail("android_device_unavailable", "Android SDK tools are unavailable");
  function invoke(serial, args, timeout = 30_000) {
    const result = spawnSync(adb, ["-s", serial, ...args], {
      encoding: "utf8",
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0 || result.error)
      fail(
        "android_device_unavailable",
        "Selected Android device command failed"
      );
    return result.stdout.trim();
  }
  function local(bin, args) {
    const result = spawnSync(bin, args, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0 || result.error)
      fail(
        "android_installed_identity_unknown",
        "Installed Android APK cannot be inspected"
      );
    return result.stdout;
  }
  return {
    async observe(serial, app) {
      const devices = spawnSync(adb, ["devices", "-l"], {
        encoding: "utf8",
        timeout: 15_000,
      });
      if (devices.status !== 0 || devices.error)
        fail("android_device_unavailable", "Cannot list Android devices");
      const selected = devices.stdout
        .split(/\r?\n/)
        .find((line) => line.split(/\s+/)[0] === serial);
      const state = selected?.trim().split(/\s+/)[1] || "missing";
      if (state !== "device")
        return { serial, state, booted: false, api: null, installed: null };
      const booted =
        invoke(serial, ["shell", "getprop", "sys.boot_completed"]) === "1";
      const api = Number(
        invoke(serial, ["shell", "getprop", "ro.build.version.sdk"])
      );
      const listing = invoke(serial, ["shell", "pm", "path", app]);
      const paths = listing
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => /^package:(\/[^\s]+)$/.exec(line)?.[1]);
      if (!listing) return { serial, state, booted, api, installed: null };
      if (paths.length !== 1 || !paths[0])
        fail(
          "android_installed_identity_unknown",
          "Installed package has unsupported APK paths"
        );
      const temporary = mkdtempSync(
        path.join(os.tmpdir(), "clipp-android-installed-")
      );
      try {
        const copy = path.join(temporary, "base.apk");
        invoke(serial, ["pull", paths[0], copy], 120_000);
        const badging = local(aapt2, ["dump", "badging", copy]);
        const signatures = local(apksigner, ["verify", "--print-certs", copy]);
        const installed = {
          applicationId: /package:\s+name='([^']+)'/.exec(badging)?.[1],
          versionCode: /versionCode='([^']+)'/.exec(badging)?.[1],
          versionName: /versionName='([^']+)'/.exec(badging)?.[1],
          certificateSha256: /certificate SHA-256 digest:\s*([a-f0-9:]{64,95})/i
            .exec(signatures)?.[1]
            ?.replaceAll(":", "")
            .toLowerCase(),
          apkSha256: sha(readFileSync(copy)),
        };
        return { serial, state, booted, api, installed };
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    },
    async install(serial, apk) {
      const result = invoke(
        serial,
        ["install", "-r", "--no-incremental", apk],
        300_000
      );
      if (!/Success/.test(result))
        fail(
          "android_install_uncertain",
          "Android install acknowledgement is missing"
        );
      return { accepted: true };
    },
    async launch(serial, component) {
      const result = invoke(
        serial,
        ["shell", "am", "start", "-W", "-n", component],
        45_000
      );
      if (!/Status:\s*ok/.test(result))
        fail(
          "android_launch_uncertain",
          "Android launch acknowledgement is missing"
        );
      return { started: true };
    },
    async readiness(serial) {
      const window = invoke(serial, ["shell", "dumpsys", "window"]);
      const owner =
        /(?:mCurrentFocus|mFocusedApp)=Window\{[^}]*\s([^\s}]+\/[^\s}]+)\}/.exec(
          window
        )?.[1];
      const pid = invoke(serial, ["shell", "pidof", "com.clipp.app"]);
      return {
        activity: owner,
        process: /^\d+(?:\s+\d+)*$/.test(pid),
        focused: owner === activity,
      };
    },
  };
}
