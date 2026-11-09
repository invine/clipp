/** Native acceptance for a frozen Android candidate. No product package is installed here. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { acquireOwnership } from "./ownership.mjs";

const sha256 = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
function invalid(code) {
  throw new Error(code);
}

function reference(value) {
  if (typeof value !== "string") return null;
  if (value.startsWith("env:")) return process.env[value.slice(4)] || null;
  if (value.startsWith("file:")) {
    try {
      return readFileSync(value.slice(5), "utf8").trim();
    } catch {
      return null;
    }
  }
  return null;
}
function tool(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0 && !result.error
    ? `${result.stdout || ""}${result.stderr || ""}`.trim()
    : null;
}
function nativePreflight(plan, run) {
  const refs = plan.privateReferences || {};
  const javaHome = reference(refs.javaHomeRef);
  const sdkHome = reference(refs.androidSdkRef);
  const stateRoot = reference(refs.androidAcceptanceStateRootRef);
  if (!javaHome || !sdkHome || !stateRoot)
    return {
      reason:
        "JDK, Android SDK or durable native acceptance state root is unavailable",
    };
  if (![javaHome, sdkHome, stateRoot].every(path.isAbsolute))
    return {
      reason:
        "JDK, Android SDK and native acceptance state root must be absolute paths",
    };
  const java = path.join(javaHome, "bin", "java");
  const aapt2 = path.join(
    sdkHome,
    "build-tools",
    plan.profile.androidQualification.sdkBuildTools,
    "aapt2"
  );
  const apksigner = path.join(
    sdkHome,
    "build-tools",
    plan.profile.androidQualification.sdkBuildTools,
    "apksigner"
  );
  const adb = path.join(sdkHome, "platform-tools", "adb");
  const version = tool(java, ["-version"]);
  if (!version || !/version "21(?:[.\"])/i.test(version))
    return { reason: "JDK 21 is required for Android qualification" };
  if (
    !tool(aapt2, ["version"])?.includes(
      plan.profile.androidQualification.aapt2Version
    ) ||
    !tool(apksigner, ["--version"]) ||
    !tool(adb, ["version"])
  )
    return {
      reason: "Android SDK build-tools and platform-tools are unavailable",
    };
  const wrapper = path.join(
    run.checkout,
    "apps",
    "android",
    "android",
    "gradle",
    "wrapper",
    "gradle-wrapper.properties"
  );
  const expected = `gradle-${plan.profile.androidQualification.gradleVersion}-all.zip`;
  if (!existsSync(wrapper) || !readFileSync(wrapper, "utf8").includes(expected))
    return {
      reason: `Gradle wrapper ${plan.profile.androidQualification.gradleVersion} is required`,
    };
  let ancestor = stateRoot;
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor)
      return { reason: "Native acceptance state root is unavailable" };
    ancestor = parent;
  }
  const physical = path.resolve(
    realpathSync(ancestor),
    path.relative(ancestor, stateRoot)
  );
  if (
    physical === run.checkout ||
    physical.startsWith(`${run.checkout}${path.sep}`)
  )
    return {
      reason: "Native acceptance state root must be outside candidate checkout",
    };
  if (process.env.VITE_DEV_SERVER_URL)
    return {
      reason: "Development-server URL is unsupported for Android qualification",
    };
  return { javaHome, sdkHome, stateRoot, java, aapt2, apksigner, adb };
}
export function validateAcceptancePair(directory, plan, run) {
  const app = path.join(directory, "app-acceptance.apk");
  const test = path.join(directory, "app-acceptance-androidTest.apk");
  const provenancePath = `${app}.provenance.json`;
  for (const file of [app, test, provenancePath])
    if (!existsSync(file) || !lstatSync(file).isFile())
      invalid("acceptance_artifact_missing");
  let provenance;
  try {
    provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  } catch {
    invalid("acceptance_provenance_invalid");
  }
  if (
    provenance.schemaVersion !== 2 ||
    provenance.dirty !== false ||
    provenance.revision !== plan.source.commit ||
    provenance.source?.checkout !== run.checkout ||
    provenance.lockfileSha256 !== plan.source.lockfileSha256 ||
    provenance.installationSha256 !== run.installationSha256
  )
    invalid("acceptance_source_mismatch");
  if (
    provenance.artifact !== path.basename(app) ||
    provenance.applicationId !== "com.clipp.app.acceptance" ||
    provenance.testArtifact?.file !== path.basename(test) ||
    provenance.testArtifact?.applicationId !==
      "com.clipp.app.acceptance.test" ||
    provenance.testArtifact?.targetPackage !== "com.clipp.app.acceptance"
  )
    invalid("acceptance_package_mismatch");
  if (
    provenance.callbackScheme !== "clipp-relay-acceptance" ||
    !/^[a-f0-9]{64}$/.test(provenance.signatures?.appCertificateSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(
      provenance.signatures?.testCertificateSha256 || ""
    ) ||
    !/version "21[.\"]/.test(provenance.toolchain?.java || "") ||
    !provenance.toolchain?.aapt2
  )
    invalid("acceptance_signature_or_callback_missing");
  if (
    sha256(app) !== provenance.artifactSha256 ||
    sha256(test) !== provenance.testArtifact.sha256
  )
    invalid("acceptance_artifact_changed");
  return {
    app,
    test,
    appSha256: provenance.artifactSha256,
    testSha256: provenance.testArtifact.sha256,
    revision: provenance.revision,
    provenancePath,
    provenanceSha256: sha256(provenancePath),
  };
}
function validateStoredPair(pair, plan, run) {
  const base = path.join(plan.outputRoot, "android-qualification");
  const directory = path.dirname(pair?.app || "");
  if (
    !path.isAbsolute(directory) ||
    path.dirname(directory) !== base ||
    !/^candidate-[0-9a-f-]{36}$/.test(path.basename(directory)) ||
    pair.app !== path.join(directory, "app-acceptance.apk") ||
    pair.test !== path.join(directory, "app-acceptance-androidTest.apk") ||
    pair.provenancePath !== `${pair.app}.provenance.json` ||
    !existsSync(directory) ||
    realpathSync(directory) !== directory
  )
    invalid("native_evidence_changed");
  const verified = validateAcceptancePair(directory, plan, run);
  if (JSON.stringify(verified) !== JSON.stringify(pair))
    invalid("native_evidence_changed");
  return verified;
}
export function validateNativeUnit(directory) {
  if (!existsSync(directory)) invalid("native_unit_coverage_missing");
  const reports = readdirSync(directory).filter((name) =>
    /^TEST-.+\.xml$/.test(name)
  );
  if (!reports.length) invalid("native_unit_coverage_missing");
  let cases = 0;
  const evidence = {};
  for (const name of reports) {
    const file = path.join(directory, name);
    if (!lstatSync(file).isFile()) invalid("native_unit_coverage_missing");
    const xml = readFileSync(file, "utf8");
    const opening = xml.match(/<testsuite\b[^>]*>/)?.[0];
    const field = (key) =>
      Number(new RegExp(`\\b${key}="(\\d+)"`).exec(opening || "")?.[1]);
    const count = field("tests");
    if (
      !Number.isInteger(count) ||
      count <= 0 ||
      field("skipped") !== 0 ||
      field("failures") !== 0 ||
      field("errors") !== 0
    )
      invalid("native_unit_coverage_missing");
    cases += count;
    evidence[name] = sha256(file);
  }
  return { cases, reports: evidence };
}
export function validateNativeReceipt(receipt, profile, { api, serial, pair }) {
  if (
    receipt?.result !== "passed" ||
    receipt.serial !== serial ||
    receipt.androidApi !== String(api) ||
    receipt.isEmulator !== "1" ||
    !["passed", "not-required"].includes(receipt.cleanup) ||
    receipt.appCleanup !== "passed"
  )
    throw new Error("native_matrix_result_invalid");
  if (
    !receipt.candidate?.frozen ||
    receipt.candidate.revision !== pair.revision ||
    receipt.candidate.sha256 !== pair.appSha256 ||
    receipt.candidate.testArtifact?.sha256 !== pair.testSha256
  )
    throw new Error("native_candidate_mismatch");
  const expected = profile.matrixCases;
  const observed = receipt.behavior?.observedPassedTests;
  if (
    receipt.behavior?.suite !== "matrix" ||
    receipt.behavior.passed !== true ||
    receipt.behavior.requiredTests !== expected.length ||
    !Array.isArray(observed) ||
    expected.some((name) => !observed.includes(name)) ||
    !Array.isArray(receipt.verifiedCoverage) ||
    !receipt.verifiedCoverage.includes("android-owned-readiness") ||
    expected.some((name) => !receipt.verifiedCoverage.includes(name))
  )
    throw new Error("native_behavior_coverage_missing");
}
function resultFor(run, names, state, nextAction, save) {
  run.androidQualification.state = state;
  run.androidQualification.nextAction = nextAction;
  run.androidQualification.updatedAt = new Date().toISOString();
  for (const name of names) run.targets[name] = { state, nextAction };
  save();
}
function readAuthorization(ref, plan, target, pair) {
  const raw = reference(ref);
  if (!raw) return false;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return false;
  }
  const serials = target.qualification.serials;
  return (
    record.schema === 1 &&
    record.scope === "isolated-android-acceptance" &&
    record.sourceRevision === plan.source.commit &&
    record.effort === target.qualification.effort &&
    JSON.stringify(record.serials) === JSON.stringify(serials) &&
    record.appPackage === "com.clipp.app.acceptance" &&
    record.testPackage === "com.clipp.app.acceptance.test" &&
    (record.appSha256 === undefined || record.appSha256 === pair.appSha256) &&
    (record.testSha256 === undefined || record.testSha256 === pair.testSha256)
  );
}
function parseReceipt(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    invalid("native_receipt_invalid");
  }
}
function storedLog(record, root) {
  const file = path.resolve(root, record.log || "");
  if (
    !file.startsWith(`${root}${path.sep}`) ||
    !existsSync(file) ||
    sha256(file) !== record.logSha256
  )
    invalid("native_evidence_changed");
  return file;
}
function nativeHistory(receipt, stateRoot) {
  const history = receipt.history?.path;
  if (
    typeof history !== "string" ||
    !path.isAbsolute(history) ||
    !history.startsWith(`${stateRoot}${path.sep}`) ||
    !existsSync(history) ||
    !lstatSync(history).isFile()
  )
    invalid("native_history_unavailable");
  const record = parseReceipt(history);
  if (
    record.version !== 1 ||
    record.scenario !== "android-native-acceptance" ||
    !Array.isArray(record.attempts) ||
    record.attempts.at(-1)?.result !== "passed"
  )
    invalid("native_history_invalid");
  return { path: history, sha256: sha256(history) };
}
async function execute(
  { run, plan, save, invoke },
  id,
  bin,
  args,
  cwd,
  env,
  timeout,
  retry = false
) {
  const stage = run.androidQualification;
  const prior = stage.attempts.findLast(
    (item) => item.id === id && item.state === "passed"
  );
  if (prior) {
    storedLog(prior, plan.outputRoot);
    return prior;
  }
  if (
    !retry &&
    stage.attempts.some((item) => item.id === id && item.state !== "passed")
  )
    invalid("native_retry_requires_existing_policy_decision");
  const number = stage.attempts.length + 1;
  const log = path.join(
    plan.outputRoot,
    "logs",
    `android-qualification-${number}.log`
  );
  mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
  const attempt = {
    number,
    id,
    command: [bin, ...args],
    cwd,
    log: path.relative(plan.outputRoot, log),
    state: "running",
    pid: null,
    startedAt: new Date().toISOString(),
  };
  stage.attempts.push(attempt);
  stage.state = "running";
  stage.nextAction = id;
  stage.updatedAt = new Date().toISOString();
  save();
  const observation = await invoke(bin, args, cwd, env, timeout, log, (pid) => {
    attempt.pid = pid;
    save();
  });
  Object.assign(attempt, observation, {
    state: observation.passed ? "passed" : "failed",
    logSha256: sha256(log),
  });
  save();
  if (!observation.passed) invalid("native_command_failed");
  return attempt;
}
function observedEmulator(adb, serial, api) {
  if (!/^emulator-\d+$/.test(serial)) invalid("native_emulator_serial_invalid");
  const invokeAdb = (...args) => tool(adb, ["-s", serial, ...args]);
  if (
    invokeAdb("get-state")?.trim() !== "device" ||
    invokeAdb("shell", "getprop", "ro.kernel.qemu")?.trim() !== "1" ||
    invokeAdb("shell", "getprop", "ro.build.version.sdk")?.trim() !==
      String(api) ||
    invokeAdb("shell", "getprop", "sys.boot_completed")?.trim() !== "1"
  )
    invalid("native_emulator_unavailable");
}
export async function qualifyAndroid({
  plan,
  run,
  save,
  invoke,
  diagnostic = {},
}) {
  const selected = Object.keys(plan.targets).filter((target) =>
    target.startsWith("android")
  );
  if (!selected.length) return;
  const frozen = plan.profile.androidQualification;
  if (
    !frozen ||
    JSON.stringify(frozen.apis) !== JSON.stringify([31, 33, 34, 35, 36]) ||
    frozen.matrixCases?.length !== 28 ||
    frozen.requiredCases !== 28
  )
    throw Object.assign(
      new Error("Unsupported Android qualification profile"),
      { code: "invalid_profile" }
    );
  const target = plan.targets[selected[0]];
  const qualificationRequirements = new Set([
    "reference:androidSdkRef",
    "reference:javaHomeRef",
    "reference:androidAcceptanceStateRootRef",
    "reference:androidAcceptanceAuthorizationRef",
    "destination:androidAcceptanceEffort",
    ...frozen.apis.map((api) => `destination:androidAcceptanceSerialApi${api}`),
  ]);
  const missing = (target.prerequisites || []).filter((item) =>
    qualificationRequirements.has(item)
  );
  const preflight = missing.length ? null : nativePreflight(plan, run);
  if (missing.length || preflight?.reason) {
    const action = missing.some((item) =>
      item.includes("androidAcceptanceSerial")
    )
      ? `Select owned API ${frozen.apis.join(", ")} emulators before Android qualification: ${missing.join(", ")}`
      : `Complete Android qualification prerequisites: ${preflight?.reason || missing.join(", ")}`;
    resultFor(run, selected, "blocked", action, save);
    return;
  }
  const stage = run.androidQualification;
  stage.attempts ||= [];
  stage.matrix ||= {};
  if (stage.state === "passed") {
    try {
      if (
        !stage.pair ||
        Object.keys(stage.matrix).length !== frozen.apis.length
      )
        invalid("native_evidence_changed");
      if (
        !stage.unit ||
        JSON.stringify(
          validateNativeUnit(
            path.join(
              run.checkout,
              "apps",
              "android",
              "android",
              "app",
              "build",
              "test-results",
              "testDebugUnitTest"
            )
          )
        ) !==
          JSON.stringify({
            cases: stage.unit.cases,
            reports: stage.unit.reports,
          })
      )
        invalid("native_evidence_changed");
      for (const attempt of stage.attempts)
        if (attempt.state === "passed") storedLog(attempt, plan.outputRoot);
      validateStoredPair(stage.pair, plan, run);
      for (const [api, record] of Object.entries(stage.matrix)) {
        const receiptFile = path.resolve(plan.outputRoot, record.receipt);
        if (
          !receiptFile.startsWith(`${plan.outputRoot}${path.sep}`) ||
          sha256(receiptFile) !== record.receiptSha256
        )
          invalid("native_evidence_changed");
        validateNativeReceipt(parseReceipt(receiptFile), frozen, {
          api: Number(api),
          serial: target.qualification.serials[api],
          pair: stage.pair,
        });
        const history = nativeHistory(
          parseReceipt(receiptFile),
          preflight.stateRoot
        );
        if (record.historySha256 !== history.sha256)
          invalid("native_evidence_changed");
      }
    } catch (error) {
      resultFor(
        run,
        selected,
        "failed",
        error.message || "native_evidence_changed",
        save
      );
    }
    return;
  }
  if (stage.attempts.some((item) => item.state === "running")) {
    resultFor(
      run,
      selected,
      "uncertain",
      "Inspect prior native process and destination before recovery",
      save
    );
    return;
  }
  if (["failed", "blocked", "uncertain"].includes(stage.state)) {
    const failedNative = stage.attempts.findLast(
      (item) =>
        /^android-(?:install|native-matrix)/.test(item.id) &&
        item.state !== "passed"
    );
    const unrecordedMatrix = stage.attempts.some((item) => {
      const api = /^android-native-matrix-api(\d+)$/.exec(item.id)?.[1];
      return api && item.state === "passed" && !stage.matrix[api];
    });
    if (
      unrecordedMatrix ||
      (failedNative &&
        (failedNative.id.startsWith("android-install") ||
          !diagnostic.change ||
          !diagnostic.expectation))
    ) {
      resultFor(
        run,
        selected,
        "blocked",
        "Review the retained native attempt history and supply a policy-approved diagnostic or successor decision before retrying",
        save
      );
      return;
    }
  }
  let releaseBuild;
  try {
    releaseBuild = acquireOwnership(
      `android-native-build:${preflight.stateRoot}`,
      { canRecover: () => false }
    );
    const env = {
      JAVA_HOME: preflight.javaHome,
      ANDROID_HOME: preflight.sdkHome,
      CLIPP_ANDROID_AAPT2: preflight.aapt2,
      CLIPP_ANDROID_APKSIGNER: preflight.apksigner,
      CLIPP_ACCEPTANCE_STATE_ROOT: preflight.stateRoot,
    };
    const unit = await execute(
      { run, plan, save, invoke },
      "android-native-unit",
      "npm",
      ["--workspace", "apps/android", "run", "test:native:unit"],
      run.checkout,
      env,
      frozen.timeoutMs.unit,
      true
    );
    const reports = path.join(
      run.checkout,
      "apps",
      "android",
      "android",
      "app",
      "build",
      "test-results",
      "testDebugUnitTest"
    );
    const unitEvidence = validateNativeUnit(reports);
    if (
      stage.unit &&
      JSON.stringify(unitEvidence) !==
        JSON.stringify({ cases: stage.unit.cases, reports: stage.unit.reports })
    )
      invalid("native_evidence_changed");
    stage.unit = { ...unitEvidence, log: unit.log, logSha256: unit.logSha256 };
    save();
    let pair = stage.pair;
    if (pair) pair = validateStoredPair(pair, plan, run);
    else {
      const previous = stage.attempts.findLast(
        (item) =>
          item.id === "android-acceptance-build" && item.state === "passed"
      );
      const directory =
        previous?.command?.at(-1) ||
        path.join(
          plan.outputRoot,
          "android-qualification",
          `candidate-${randomUUID()}`
        );
      mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
      await execute(
        { run, plan, save, invoke },
        "android-acceptance-build",
        "npm",
        [
          "--workspace",
          "apps/android",
          "run",
          "build:native:acceptance-candidate",
          "--",
          "--output",
          directory,
        ],
        run.checkout,
        env,
        frozen.timeoutMs.candidate,
        true
      );
      pair = validateAcceptancePair(directory, plan, run);
      validateStoredPair(pair, plan, run);
      stage.pair = pair;
      save();
    }
    releaseBuild();
    releaseBuild = null;
    if (
      !readAuthorization(
        plan.privateReferences?.androidAcceptanceAuthorizationRef,
        plan,
        target,
        pair
      )
    ) {
      resultFor(
        run,
        selected,
        "blocked",
        "Matching isolated Android acceptance authorization is required before emulator installation",
        save
      );
      return;
    }
    for (const api of frozen.apis) {
      const serial = target.qualification.serials[api];
      const old = stage.matrix[api];
      if (old) {
        const receiptFile = path.resolve(plan.outputRoot, old.receipt);
        if (
          !receiptFile.startsWith(`${plan.outputRoot}${path.sep}`) ||
          sha256(receiptFile) !== old.receiptSha256
        )
          invalid("native_evidence_changed");
        validateNativeReceipt(parseReceipt(receiptFile), frozen, {
          api,
          serial,
          pair,
        });
        const history = nativeHistory(
          parseReceipt(receiptFile),
          preflight.stateRoot
        );
        if (old.historySha256 !== history.sha256)
          invalid("native_evidence_changed");
        continue;
      }
      observedEmulator(preflight.adb, serial, api);
      const releaseEmulator = acquireOwnership(`android-emulator:${serial}`, {
        canRecover: () => false,
      });
      try {
        const work = { run, plan, save, invoke };
        await execute(
          work,
          `android-install-app-api${api}`,
          preflight.adb,
          ["-s", serial, "install", pair.app],
          run.checkout,
          env,
          120_000
        );
        await execute(
          work,
          `android-install-test-api${api}`,
          preflight.adb,
          ["-s", serial, "install", pair.test],
          run.checkout,
          env,
          120_000
        );
        const output = path.join(
          plan.outputRoot,
          "android-qualification",
          `matrix-api${api}-${randomUUID()}`
        );
        mkdirSync(output, { recursive: true, mode: 0o700 });
        const matrixArgs = [
          "apps/android/scripts/android-readiness.mjs",
          "--serial",
          serial,
          "--candidate-apk",
          pair.app,
          "--output",
          output,
          "--suite",
          "matrix",
          "--expected-api",
          String(api),
          "--effort",
          `${target.qualification.effort}-api${api}`,
          "--history-root",
          path.join(preflight.stateRoot, `api${api}`, "history"),
        ];
        const retry = stage.attempts.some(
          (item) =>
            item.id === `android-native-matrix-api${api}` &&
            item.state === "failed"
        );
        if (retry) {
          matrixArgs.push(
            "--diagnostic-change",
            diagnostic.change,
            "--expected-observation",
            diagnostic.expectation
          );
          if (diagnostic.renewal)
            matrixArgs.push("--renewal", diagnostic.renewal);
          if (diagnostic.successor)
            matrixArgs.push("--successor", diagnostic.successor);
        }
        await execute(
          work,
          `android-native-matrix-api${api}`,
          "node",
          matrixArgs,
          run.checkout,
          env,
          frozen.timeoutMs.matrix,
          retry
        );
        const receiptFile = path.join(output, "receipt.json");
        const receipt = parseReceipt(receiptFile);
        validateNativeReceipt(receipt, frozen, { api, serial, pair });
        const history = nativeHistory(receipt, preflight.stateRoot);
        stage.matrix[api] = {
          serial,
          receipt: path.relative(plan.outputRoot, receiptFile),
          receiptSha256: sha256(receiptFile),
          history: history.path,
          historySha256: history.sha256,
          observedAt: new Date().toISOString(),
        };
        save();
      } finally {
        releaseEmulator();
      }
    }
    resultFor(
      run,
      selected,
      "passed",
      "Native qualification passed; prepare the Android package or delivery target",
      save
    );
    for (const name of selected)
      run.targets[name] = {
        state: "pending",
        nextAction: "prepare verified Android package or delivery target",
      };
    save();
  } catch (error) {
    const code = error.message || error.code || "native_qualification_failed";
    const blocked =
      /unavailable|authorization|resource_owned|ownership_uncertain|retry_requires/.test(
        code
      );
    resultFor(run, selected, blocked ? "blocked" : "failed", code, save);
  } finally {
    releaseBuild?.();
  }
}
