/** Readiness gate for the exact Android candidate and serial used by acceptance. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  mkdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { sourceIdentity } from "./android-candidate-provenance.mjs";
import {
  beginNativeAttempt,
  nativeAcceptanceStateRoot,
} from "../../../scripts/native-acceptance-attempts.mjs";

const { values } = parseArgs({
  options: {
    serial: { type: "string" },
    effort: {
      type: "string",
      default:
        process.env.CLIPP_ACCEPTANCE_EFFORT || "clipp-android-acceptance",
    },
    "history-root": { type: "string" },
    "import-history": { type: "string", multiple: true },
    renewal: { type: "string" },
    successor: { type: "string" },
    suite: { type: "string", default: "readiness" },
    "expected-api": { type: "string" },
    "candidate-apk": { type: "string" },
    output: { type: "string" },
    "diagnostic-change": { type: "string" },
    "expected-observation": { type: "string" },
    timeout: { type: "string", default: "20" },
    "cleanup-timeout": { type: "string", default: "10" },
  },
});
for (const field of ["serial", "candidate-apk", "output"]) {
  assert(values[field], `${field.replaceAll("-", "_")}_required`);
}
assert(
  path.isAbsolute(values["candidate-apk"]),
  "absolute_candidate_apk_required"
);
assert(path.isAbsolute(values.output), "absolute_output_required");
const timeout = Number(values.timeout) * 1_000;
assert(
  Number.isInteger(timeout) && timeout > 0 && timeout <= 60_000,
  "bounded_timeout_required"
);

const cleanupTimeout = Number(values["cleanup-timeout"]) * 1000;
assert(
  Number.isSafeInteger(cleanupTimeout) &&
    cleanupTimeout > 0 &&
    cleanupTimeout <= 30000,
  "bounded_cleanup_timeout_required"
);
let cleanupSpent = 0;
const cleanupRemaining = () => Math.max(0, cleanupTimeout - cleanupSpent);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const serial = values.serial.trim();
assert(serial.length > 0 && !/[\s;]/.test(serial), "valid_serial_required");
const adb = process.env.CLIPP_ANDROID_ADB || "adb";
const appPackage = "com.clipp.app.acceptance";
const testPackage = "com.clipp.app.acceptance.test";
const activity = `${appPackage}/com.clipp.app.MainActivity`;
const nativeCases = {
  ManagedRelayCredentialStoreTest: [
    "fixturesRejectTheOperatorApplication",
    "onlyExactPrivateCallbackResolvesToClipp",
    "nativeCredentialKeyCannotBeExported",
    "recreatedNativeStoreRetainsOnlyEndpointScopedRenewableCredentials",
    "ciphertextIsAuthenticatedAndCorruptionRequiresLogin",
    "missingKeystoreKeyErasesRestoredCiphertext",
    "ciphertextFileIsExcludedFromCloudBackupAndDeviceTransfer",
  ],
  BackgroundContinuityLifecycleTest: [
    "serviceStartupPublishesPrivacySafeStatusAndNotificationActions",
    "pauseResumeAndStopRemainUserControlledBoundaries",
    "serviceHoldsPartialWakeLockUntilUserStops",
    "heartbeatLossStopsTheEmptyServiceAndRecordsAnObservedFailure",
    "removingTheApplicationTaskStopsBackgroundContinuity",
    "rebootOffersReconnectWithoutStartingTheService",
    "blockedNotificationAvailabilityDoesNotCountAsARuntimeFailure",
    "ingressAndPendingApplicationDiagnosticsNeverContainTheirPayloadsOrIdentifiers",
  ],
  BackgroundContinuityManifestTest: [
    "backgroundContinuityDeclaresPartialWakeLockPermission",
    "taskRemovalIsDeliveredToBackgroundContinuityService",
    "androidDiscoversProcessTextAndSharesheetIngress",
    "explicitTextQueueSurvivesRestartAndPreservesRepeatedEventIdentity",
    "persistenceFailureNeverReportsAnActionAsQueued",
    "actionQueueUpdatesAreAtomicAcrossStoreInstances",
    "coldProcessTextIntentReachesTheDurableQueueBeforeRuntimeLaunch",
    "warmSharesheetIntentReachesTheDurableQueue",
  ],
  BackgroundContinuityDiagnosticsTest: [
    "exportIsBoundedAndUsesOnlyThePrivacyReviewedSchema",
    "repeatedObservedFailuresMarkTheConfigurationLimitedAndEnableGuidance",
    "diagnosticExportReusesOneBoundedCacheFile",
    "reconnectDurationDoesNotSpanStoppedSessions",
  ],
};
const focusedCase =
  "com.clipp.app.BackgroundContinuityManifestTest#explicitTextQueueSurvivesRestartAndPreservesRepeatedEventIdentity";
const matrixCases = Object.entries(nativeCases).flatMap(([name, methods]) =>
  methods.map((method) => `com.clipp.app.${name}#${method}`)
);
const nativeCoverage =
  values.suite === "focused"
    ? [focusedCase]
    : values.suite === "matrix"
      ? matrixCases
      : [];
const requestedCoverage = ["android-owned-readiness", ...nativeCoverage];
let launched = false;
let attempt;
let uiHierarchyCleanup = "not-required";

function assertWithinBudget(stage) {
  try {
    attempt?.assertBudget();
  } catch (error) {
    error.stage = stage;
    error.classification = "runner";
    throw error;
  }
}

function remainingTimeout(stage) {
  assertWithinBudget(stage);
  try {
    return attempt ? attempt.remainingMs(timeout) : timeout;
  } catch (error) {
    error.stage = stage;
    error.classification = "runner";
    throw error;
  }
}

function invoke(args, stage, classification = "prerequisite") {
  const result = spawnSync(adb, ["-s", serial, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: remainingTimeout(stage),
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error || result.status !== 0) {
    const error = new Error(
      `${stage}: ${output || result.error?.message || `exit ${result.status}`}`
    );
    error.stage = stage;
    error.classification =
      result.error?.code === "ETIMEDOUT" ? "runner" : classification;
    throw error;
  }
  assertWithinBudget(stage);
  return output;
}

async function cleanupStep(operation) {
  const remaining = cleanupRemaining();
  assert(remaining > 0, "android_cleanup_deadline_exhausted");
  const started = performance.now();
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("android_cleanup_deadline_exhausted")),
          remaining
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    cleanupSpent += performance.now() - started;
  }
}
function cleanupAdb(args) {
  const remaining = cleanupRemaining();
  assert(remaining > 0, "android_cleanup_deadline_exhausted");
  const started = performance.now();
  try {
    const result = spawnSync(adb, ["-s", serial, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: Math.max(1, Math.floor(remaining)),
      maxBuffer: 1024 * 1024,
    });
    assert(
      !result.error && result.status === 0,
      "owned_android_cleanup_failed"
    );
  } finally {
    cleanupSpent += performance.now() - started;
  }
}
function candidateFingerprint(provenance) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        revision: provenance.revision,
        sourceSha256: provenance.sourceSha256,
        app: provenance.artifactSha256,
        test: provenance.testArtifact.sha256,
      })
    )
    .digest("hex");
}
async function candidateIdentity() {
  const apk = await readFile(values["candidate-apk"], {
    signal: AbortSignal.timeout(remainingTimeout("candidate")),
  });
  const provenance = JSON.parse(
    await readFile(`${values["candidate-apk"]}.provenance.json`, {
      encoding: "utf8",
      signal: AbortSignal.timeout(remainingTimeout("candidate")),
    })
  );
  const currentSource = await sourceIdentity(root, {
    remainingMs: (maximum) => attempt.remainingMs(Math.min(timeout, maximum)),
  });
  assert.equal(path.basename(values["candidate-apk"]), "app-acceptance.apk");
  if (values.suite !== "readiness")
    assert(
      provenance.schemaVersion === 2 && provenance.testArtifact,
      "frozen_android_candidate_required"
    );
  assert(
    [1, 2].includes(provenance.schemaVersion),
    "candidate_provenance_invalid"
  );
  if (provenance.schemaVersion === 2) {
    assert(
      (await realpath(provenance.source.checkout)) === (await realpath(root)),
      "candidate_checkout_mismatch"
    );
    assert(!provenance.dirty, "frozen_candidate_must_be_committed");
  }
  assert.equal(
    provenance.applicationId,
    appPackage,
    "candidate_package_mismatch"
  );
  assert.equal(
    provenance.artifactSha256,
    createHash("sha256").update(apk).digest("hex"),
    "candidate_artifact_changed_after_build"
  );
  assert.deepEqual(
    {
      revision: provenance.revision,
      dirty: provenance.dirty,
      sourceSha256: provenance.sourceSha256,
    },
    currentSource,
    "candidate_source_changed_after_build"
  );
  let testArtifact;
  if (provenance.schemaVersion === 2) {
    const test = provenance.testArtifact;
    assert(
      test?.file === "app-acceptance-androidTest.apk" &&
        test.applicationId === testPackage &&
        test.targetPackage === appPackage,
      "candidate_test_package_mismatch"
    );
    const testPath = path.join(
      path.dirname(values["candidate-apk"]),
      test.file
    );
    assert.equal(
      await sha256File(testPath),
      test.sha256,
      "candidate_test_artifact_changed_after_build"
    );
    testArtifact = {
      path: testPath,
      sha256: test.sha256,
      appPackage: testPackage,
    };
  }
  return {
    frozen: provenance.schemaVersion === 2,
    testArtifact,
    fingerprint:
      provenance.schemaVersion === 2
        ? candidateFingerprint(provenance)
        : undefined,
    path: path.basename(values["candidate-apk"]),
    sha256: provenance.artifactSha256,
    revision: provenance.revision,
    dirty: provenance.dirty,
    sourceSha256: provenance.sourceSha256,
    appPackage,
  };
}

async function sha256File(file, stage = "candidate") {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, {
    signal: AbortSignal.timeout(remainingTimeout(stage)),
  })) {
    assertWithinBudget(stage);
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function verifyInstalledCandidate(
  packagePaths,
  candidateHash,
  selectedPackage = appPackage
) {
  const paths = packagePaths
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^package:(\/\S+)$/);
      assert(match, "installed_package_path_unparseable");
      return match[1];
    });
  assert.equal(paths.length, 1, "installed_package_split_apks_unsupported");
  assert.equal(
    path.basename(paths[0]),
    "base.apk",
    "installed_package_base_apk_missing"
  );

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "clipp-android-installed-apk-")
  );
  const localApk = path.join(temporaryDirectory, "installed-base.apk");
  let failure;
  let installedSha256;
  try {
    invoke(["pull", paths[0], localApk], "installed-candidate");
    assertWithinBudget("installed-candidate");
    const details = await stat(localApk);
    assert(
      details.isFile() && details.size > 0,
      "installed_candidate_pull_empty"
    );
    installedSha256 = await sha256File(localApk, "installed-candidate");
    assertWithinBudget("installed-candidate");
  } catch (error) {
    failure = error;
  }
  try {
    await cleanupStep(() =>
      rm(temporaryDirectory, { recursive: true, force: false })
    );
  } catch (error) {
    if (failure) failure.cleanupFailure = error.message;
    else
      failure = Object.assign(
        new Error("installed_candidate_temp_cleanup_failed"),
        {
          stage: "cleanup",
          classification: "runner",
          cleanupFailure: error.message,
        }
      );
  }
  if (failure) throw failure;
  return {
    package: selectedPackage,
    devicePath: paths[0],
    sha256: installedSha256,
    matchesCandidate: installedSha256 === candidateHash,
    temporaryArtifactCleanup: "passed",
  };
}

function focusedActivity(windowDump) {
  const match = windowDump.match(
    /(?:mCurrentFocus|mFocusedApp)=Window\{[^}]*\s([^\s}]+\/[^\s}]+)\}/
  );
  return match?.[1] ?? null;
}

function focusedNodeFingerprint(hierarchy) {
  const nodes = hierarchy.match(/<node\b[^>]*>/g) ?? [];
  const focused = nodes.find((node) => {
    const packageName = node.match(/\bpackage="([^"]*)"/)?.[1];
    return packageName === appPackage && /\bfocused="true"/.test(node);
  });
  if (!focused) return null;

  // Avoid retaining user-visible text or content descriptions from the UI tree.
  const attribute = (name) =>
    focused.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";
  const descriptor = [
    attribute("class"),
    attribute("resource-id"),
    attribute("bounds"),
    attribute("clickable"),
    attribute("focusable"),
  ].join("\n");
  return createHash("sha256").update(descriptor).digest("hex");
}

function readUiHierarchy() {
  const devicePath = `/data/local/tmp/clipp-readiness-${process.pid}-${attempt.number}.xml`;
  let hierarchy;
  let failure;
  try {
    const dumped = invoke(
      ["shell", "uiautomator", "dump", devicePath],
      "interaction",
      "runner"
    );
    assert.match(
      dumped,
      /(?:hierarchy|hierchary) dumped to/i,
      "ui_hierarchy_dump_failed"
    );
    hierarchy = invoke(
      ["exec-out", "cat", devicePath],
      "interaction",
      "runner"
    );
    assert.match(hierarchy, /^<?xml|<hierarchy\b/i, "ui_hierarchy_unreadable");
  } catch (error) {
    failure = error;
  }
  try {
    cleanupAdb(["shell", "rm", "-f", devicePath]);
    uiHierarchyCleanup = "passed";
  } catch (error) {
    uiHierarchyCleanup = "failed";
    if (failure) failure.cleanupFailure = "ui_hierarchy_cleanup_failed";
    else
      failure = Object.assign(error, {
        cleanupFailure: "ui_hierarchy_cleanup_failed",
        stage: "cleanup",
        classification: "runner",
      });
  }
  if (failure) throw failure;
  return hierarchy;
}

const stateRoot = nativeAcceptanceStateRoot();
await mkdir(stateRoot, { recursive: true, mode: 0o700 });
const historyRoot = values["history-root"] || path.join(stateRoot, "history");
assert(path.isAbsolute(historyRoot), "absolute_history_root_required");
await mkdir(historyRoot, { recursive: true, mode: 0o700 });
for (const directory of [values.output, stateRoot, historyRoot]) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  assert(
    path
      .relative(await realpath(root), await realpath(directory))
      .startsWith(`..${path.sep}`),
    "durable_android_history_outside_checkout_required"
  );
}
assert(
  ["readiness", "focused", "matrix"].includes(values.suite),
  "supported_suite_required"
);
let ordinaryScope;
if (requestedCoverage.length) {
  try {
    const declared = JSON.parse(
      await readFile(`${values["candidate-apk"]}.provenance.json`, {
        encoding: "utf8",
        signal: AbortSignal.timeout(timeout),
      })
    );
    if (declared.schemaVersion === 2 && declared.testArtifact)
      ordinaryScope = {
        candidate: candidateFingerprint(declared),
        units: requestedCoverage,
      };
  } catch {
    /* The candidate stage records absent or invalid provenance after admission. */
  }
}
try {
  attempt = await beginNativeAttempt({
    ordinaryScope,
    output: values.output,
    historyRoot: await realpath(historyRoot),
    registryRoot: path.join(await realpath(stateRoot), "history-registry"),
    identity: {
      effort: values.effort,
      scenario: "android-native-acceptance",
      environment: {
        host: os.hostname(),
        platform: process.platform,
        architecture: process.arch,
        runtime: "android",
        targetFamily: "acceptance-emulator-api31+",
      },
    },
    scenario: "android-native-acceptance",
    change: values["diagnostic-change"],
    expectation: values["expected-observation"],
    importHistory: values["import-history"],
    renewal: values.renewal,
    successor: values.successor,
    deferDiagnosticClockUntilFailure: true,
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const receipt = {
  schemaVersion: 1,
  result: "failed",
  stage: "candidate",
  classification: "prerequisite",
  cleanup: "not-required",
  uiHierarchyCleanup,
  serial,
  attempt: attempt.number,
  startedAt: new Date().toISOString(),
};

try {
  receipt.candidate = await candidateIdentity();
  if (attempt.successorCandidate)
    assert(
      receipt.candidate.revision === attempt.successorCandidate &&
        !receipt.candidate.dirty,
      "successor_candidate_binding_mismatch"
    );
  assertWithinBudget("candidate");
  assert.equal(receipt.candidate.appPackage, appPackage);
  receipt.stage = "device";
  const state = invoke(["get-state"], "device", "prerequisite");
  assert.equal(state, "device", "selected_device_not_ready");
  receipt.bootCompleted = invoke(
    ["shell", "getprop", "sys.boot_completed"],
    "boot"
  );
  assert.equal(receipt.bootCompleted, "1", "device_boot_incomplete");
  receipt.androidApi = invoke(
    ["shell", "getprop", "ro.build.version.sdk"],
    "device"
  );
  assert(Number(receipt.androidApi) >= 31, "android_api_31_required");
  receipt.isEmulator = invoke(["shell", "getprop", "ro.kernel.qemu"], "device");
  assert.equal(receipt.isEmulator, "1", "android_emulator_required");
  if (values["expected-api"])
    assert.equal(
      receipt.androidApi,
      values["expected-api"],
      "selected_android_api_mismatch"
    );
  receipt.deviceFacts = {
    api: receipt.androidApi,
    fingerprint: invoke(["shell", "getprop", "ro.build.fingerprint"], "device"),
    model: invoke(["shell", "getprop", "ro.product.model"], "device"),
    hardware: invoke(["shell", "getprop", "ro.hardware"], "device"),
  };

  receipt.stage = "installed-candidate";
  receipt.installedPackage = invoke(
    ["shell", "pm", "path", appPackage],
    "installed-candidate"
  );
  assert(
    receipt.installedPackage.startsWith("package:"),
    "acceptance_candidate_not_installed"
  );
  receipt.installedCandidate = await verifyInstalledCandidate(
    receipt.installedPackage,
    receipt.candidate.sha256
  );
  receipt.cleanup = receipt.installedCandidate.temporaryArtifactCleanup;
  assert(
    receipt.installedCandidate.matchesCandidate,
    "installed_candidate_differs_from_supplied_apk"
  );
  if (receipt.candidate.testArtifact) {
    receipt.stage = "installed-test-candidate";
    const testPaths = invoke(
      ["shell", "pm", "path", testPackage],
      "installed-test-candidate"
    );
    receipt.installedTestCandidate = await verifyInstalledCandidate(
      testPaths,
      receipt.candidate.testArtifact.sha256,
      testPackage
    );
    assert(
      receipt.installedTestCandidate.matchesCandidate,
      "installed_test_candidate_differs"
    );
  }
  receipt.stage = "webview";
  receipt.webViewDiagnostic = invoke(
    ["shell", "dumpsys", "webviewupdate"],
    "webview"
  );
  const webViewProvider = receipt.webViewDiagnostic.match(
    /Current WebView package \(name, version\):\s*\(([^,]+),\s*([^)]+)\)/i
  );
  assert(webViewProvider, "active_webview_provider_unavailable");
  receipt.webViewProvider = webViewProvider[1].trim();
  receipt.webViewProviderVersion = webViewProvider[2].trim();
  assert(
    receipt.webViewProvider !== "null" &&
      receipt.webViewProviderVersion !== "null",
    "active_webview_provider_unavailable"
  );

  receipt.stage = "instrumentation";
  receipt.instrumentation = invoke(
    ["shell", "pm", "list", "instrumentation", appPackage],
    "instrumentation"
  );
  assert(
    receipt.instrumentation
      .split(/\r?\n/)
      .some((line) =>
        new RegExp(
          `^instrumentation:${testPackage}/[^\\s]+ \\(target=${appPackage}\\)$`
        ).test(line)
      ),
    "acceptance_instrumentation_unavailable"
  );
  launched = true;
  receipt.instrumentationProbe = invoke(
    [
      "shell",
      "am",
      "instrument",
      "-w",
      "-e",
      "class",
      receipt.candidate.frozen
        ? "com.clipp.app.AcceptanceReadinessTest#bundledWebViewStarts"
        : "com.getcapacitor.myapp.ExampleInstrumentedTest#useAppContext",
      `${testPackage}/androidx.test.runner.AndroidJUnitRunner`,
    ],
    "instrumentation",
    "runner"
  );
  if (!/OK \(1 test\)/.test(receipt.instrumentationProbe)) {
    const error = new Error("instrumentation_probe_failed");
    error.stage = "instrumentation";
    error.classification = "runner";
    throw error;
  }

  if (receipt.candidate.frozen) {
    const observed = receipt.instrumentationProbe.match(
      /^INSTRUMENTATION_STATUS: clipp_bundled_url=(\S+)$/m
    )?.[1];
    const parsed = observed ? new URL(observed) : null;
    assert(
      parsed?.origin === "https://localhost" &&
        ["/", "/index.html"].includes(parsed.pathname) &&
        !parsed.search &&
        !parsed.hash,
      "bundled_webview_url_required"
    );
    receipt.bundledWebViewUrl = observed;
  }
  receipt.stage = "interaction";
  receipt.classification = "runner";
  receipt.launch = invoke(
    ["shell", "am", "start", "-W", "-n", activity],
    "interaction",
    "runner"
  );
  assert(/Status: ok/.test(receipt.launch), "candidate_launch_failed");
  receipt.focusBeforeActivity = focusedActivity(
    invoke(["shell", "dumpsys", "window"], "interaction", "runner")
  );
  assert(
    receipt.focusBeforeActivity === activity,
    "candidate_window_not_owned"
  );
  const hierarchyBefore = readUiHierarchy();
  receipt.focusBefore = focusedNodeFingerprint(hierarchyBefore);
  receipt.input = invoke(
    ["shell", "input", "keyevent", "KEYCODE_TAB"],
    "interaction",
    "runner"
  );
  receipt.focusAfterActivity = focusedActivity(
    invoke(["shell", "dumpsys", "window"], "interaction", "runner")
  );
  assert(
    receipt.focusAfterActivity === activity,
    "candidate_lost_window_focus"
  );
  receipt.focusAfter = focusedNodeFingerprint(readUiHierarchy());
  assert(
    receipt.focusAfter && receipt.focusAfter !== receipt.focusBefore,
    "candidate_ui_interaction_no_effect"
  );
  receipt.interaction = "tab_changed_focused_accessible_control";

  receipt.verifiedCoverage = ["android-owned-readiness"];
  if (values.suite !== "readiness") {
    receipt.stage = "behavior";
    receipt.classification = "unknown";
    const classes =
      values.suite === "focused"
        ? focusedCase
        : Object.keys(nativeCases)
            .map((name) => `com.clipp.app.${name}`)
            .join(",");
    const output = invoke(
      [
        "shell",
        "am",
        "instrument",
        "-w",
        "-r",
        "-e",
        "class",
        classes,
        `${testPackage}/androidx.test.runner.AndroidJUnitRunner`,
      ],
      "behavior",
      "unknown"
    );
    const passed = new Set();
    let current = {};
    let failed = false;
    for (const line of output.split(/\r?\n/)) {
      const field = line.match(/^INSTRUMENTATION_STATUS: (class|test)=(.*)$/);
      if (field) current[field[1]] = field[2].trim();
      const status = line.match(/^INSTRUMENTATION_STATUS_CODE: (-?\d+)$/);
      if (status) {
        if (status[1] === "0" && current.class && current.test)
          passed.add(`${current.class}#${current.test}`);
        if (["-1", "-2"].includes(status[1])) failed = true;
        current = {};
      }
    }
    await writeFile(
      path.join(attempt.directory, "native-behavior.private.log"),
      output,
      { mode: 0o600 }
    );
    if (failed)
      throw Object.assign(new Error("native_behavior_failed"), {
        classification: "product",
      });
    if (
      !/OK \([1-9]\d* tests?\)/.test(output) ||
      !nativeCoverage.every((unit) => passed.has(unit))
    )
      throw Object.assign(new Error("native_behavior_coverage_missing"), {
        classification: "runner",
      });
    receipt.verifiedCoverage = requestedCoverage;
    receipt.behavior = {
      suite: values.suite,
      observedPassedTests: [...passed].sort(),
      requiredTests: nativeCoverage.length,
      passed: true,
    };
  }
  receipt.result = "passed";
  receipt.classification = "none";
} catch (error) {
  receipt.stage = error.stage || receipt.stage;
  receipt.classification =
    error.classification ||
    (/deadline|budget_exhausted|AbortError/i.test(error.message)
      ? "runner"
      : receipt.classification);
  receipt.failure = error.message;
  if (error.cleanupFailure) {
    receipt.cleanup = "failed";
    receipt.cleanupFailure = error.cleanupFailure;
  }
} finally {
  if (launched) {
    try {
      cleanupAdb(["shell", "am", "force-stop", appPackage]);
      receipt.appCleanup = "passed";
    } catch (error) {
      receipt.appCleanup = "failed";
      receipt.cleanup = "failed";
      receipt.cleanupFailure = error.message;
      if (receipt.result === "passed") {
        receipt.stage = "cleanup";
        receipt.classification = "runner";
        receipt.failure = error.message;
      }
      receipt.result = "failed";
    }
  }
  receipt.cleanupScope = {
    package: appPackage,
    emulatorLifecycle: "externally-owned",
    normalPackagesChanged: false,
  };
  receipt.uiHierarchyCleanup = uiHierarchyCleanup;
  receipt.finishedAt = new Date().toISOString();
  await attempt.finish(receipt);
}

console.log(JSON.stringify(receipt, null, 2));
if (receipt.result !== "passed") process.exitCode = 1;
