/* global chrome */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  lstat,
  realpath,
  rm,
} from "node:fs/promises";
import { hostname, platform, arch } from "node:os";
import { resolve, join, relative, isAbsolute, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  beginNativeAttempt,
  nativeAcceptanceStateRoot,
} from "../../../scripts/native-acceptance-attempts.mjs";
import { raceAcceptanceOperation } from "./clipboard-acceptance.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const known = new Set([
  "effort",
  "history-root",
  "output",
  "candidate-record",
  "extension-record",
  "browser-executable",
  "registered-extension-id",
  "discovery",
  "extension-directory",
  "profile-root",
  "profile-record",
  "timeout-seconds",
  "diagnostic-change",
  "expected-observation",
]);
function optionsFor(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    assert(args[index].startsWith("--"), "option_flag_required");
    const name = args[index].replace(/^--/, "");
    assert(options[name] === undefined, "unique_option_value_required");
    if (
      ["validate-only", "freeze-extension", "verification-only"].includes(name)
    )
      options[name] = true;
    else {
      assert(known.has(name) || name === "scenario", "unknown_argument");
      assert(
        options[name] === undefined &&
          args[index + 1] &&
          !args[index + 1].startsWith("--"),
        "unique_option_value_required"
      );
      options[name] = args[++index];
    }
  }
  assert(
    [
      "toolbar-history",
      "toolbar-relay-pairing",
      "toolbar-relay-account-preparation",
    ].includes(options.scenario),
    "unsupported_toolbar_scenario"
  );
  for (const name of [
    "effort",
    "history-root",
    "output",
    "candidate-record",
    "extension-record",
  ])
    assert(options[name]?.trim(), `${name.replaceAll("-", "_")}_required`);
  for (const name of [
    "history-root",
    "output",
    "candidate-record",
    "extension-record",
  ])
    assert(isAbsolute(options[name]), "absolute_evidence_paths_required");
  assert(
    Boolean(options["diagnostic-change"]) ===
      Boolean(options["expected-observation"]),
    "complete_diagnosis_required"
  );
  return options;
}
async function json(file) {
  const stat = await lstat(file);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1024 * 1024,
    "bounded_regular_metadata_required"
  );
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error("candidate_metadata_invalid");
  }
}
async function artifacts(directory) {
  assert(
    (await lstat(directory)).isDirectory() &&
      (await realpath(directory)) === directory,
    "extension_artifact_alias"
  );
  const files = {};
  let bytes = 0;
  async function visit(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const file = join(dir, name);
      const stat = await lstat(file);
      assert(!stat.isSymbolicLink(), "extension_artifact_alias");
      if (stat.isDirectory()) await visit(file);
      else {
        assert(
          stat.isFile() && stat.size <= 64 * 1024 * 1024,
          "extension_artifact_invalid"
        );
        bytes += stat.size;
        assert(
          bytes <= 128 * 1024 * 1024 && Object.keys(files).length < 10000,
          "extension_artifact_limit"
        );
        files[relative(directory, file)] = hash(await readFile(file));
      }
    }
  }
  await visit(directory);
  assert(
    files["manifest.json"] && files["src/popup.html"],
    "extension_artifact_missing"
  );
  return files;
}
function processIdentity(pid, timeout = 1000) {
  const p = spawnSync(
    "ps",
    ["-p", String(pid), "-o", "ppid=", "-o", "lstart=", "-o", "command="],
    { encoding: "utf8", timeout }
  );
  if (p.status === 1 && !p.stdout.trim()) return { absent: true };
  if (p.status !== 0 || !p.stdout.trim()) return { unknown: true };
  const row =
    /^\s*\d+\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+([\s\S]+)$/.exec(
      p.stdout
    );
  if (!row) return { unknown: true };
  return {
    birth: row[1].replace(/\s+/g, " "),
    fingerprint: hash(p.stdout.trim()),
    command: row[2],
  };
}
export function runnerOwnership(timeout = 1000) {
  const identity = processIdentity(process.pid, timeout);
  return { runnerPid: process.pid, runnerBirth: identity.birth };
}
export function targetGone(
  target,
  deadline = Date.now() + 2000,
  finishedRunner
) {
  if (
    !target ||
    typeof target.profile !== "string" ||
    !isAbsolute(target.profile) ||
    !Number.isSafeInteger(target.runnerPid)
  )
    return false;
  const remaining = () => Math.max(1, Math.min(1000, deadline - Date.now()));
  if (Date.now() >= deadline) return false;
  const runner = processIdentity(target.runnerPid, remaining());
  if (runner.unknown) return false;
  if (!runner.absent) {
    const replaced = Boolean(
      target.runnerBirth && runner.birth && target.runnerBirth !== runner.birth
    );
    const currentFinisher = Boolean(
      finishedRunner?.runnerPid === process.pid &&
      target.runnerPid === process.pid &&
      target.runnerBirth &&
      finishedRunner.runnerBirth === target.runnerBirth &&
      runner.birth === target.runnerBirth
    );
    if (!replaced && !currentFinisher) return false;
  }
  if (Date.now() >= deadline) return false;
  if (target.pid) {
    const child = processIdentity(target.pid, remaining());
    if (child.unknown) return false;
    // A command or parent change does not establish replacement of a known PID.
    if (
      !child.absent &&
      (!target.birth || !child.birth || target.birth === child.birth)
    )
      return false;
  }
  if (Date.now() >= deadline) return false;
  const snapshot = spawnSync("ps", ["-ax", "-o", "pid=,command="], {
    encoding: "utf8",
    timeout: remaining(),
    maxBuffer: 2 * 1024 * 1024,
  });
  return (
    snapshot.status === 0 &&
    !snapshot.stdout
      .split("\n")
      .some((line) => line.includes(`--user-data-dir=${target.profile}`))
  );
}

function errorCode(error, stage) {
  if (
    [
      "acceptance_memory_startup_required",
      "pairing_forced_relay_runtime_required",
      "owned_relay_configuration_unavailable",
      "owned_human_login_required",
      "owned_relay_configuration_conflict",
      "owned_relay_configuration_ambiguous",
      "owned_relay_editor_ambiguous",
      "account_preparation_deadline_exhausted",
    ].includes(error?.message)
  )
    return error.message;
  if (error?.message?.includes("diagnostic_")) return "diagnostic_limit";
  if (error?.message === "toolbar_target_mismatch") return "wrong_target";
  if (error?.message === "extension_inventory_not_ready")
    return "extension_installation_unavailable";
  if (
    error?.message?.includes("candidate") ||
    error?.message?.includes("artifact")
  )
    return "stale_candidate";
  if (error?.message === "acceptance_operation_timeout")
    return stage === "worker" ? "worker_evaluation_timeout" : "command_timeout";
  if (stage === "interaction") return "unavailable_input";
  if (stage === "behavior" && error?.name === "AssertionError")
    return "product_failure";
  return stage === "behavior" ? "unknown_failure" : "prerequisite_failure";
}

export async function runToolbarAcceptance(args, relayHooks) {
  const options = optionsFor(args);
  const pairing = options.scenario === "toolbar-relay-pairing";
  const preparation = options.scenario === "toolbar-relay-account-preparation";
  const ownedRelay = pairing || preparation;
  const verificationOnly = options["verification-only"] === true;
  assert(
    !verificationOnly || preparation,
    "verification_only_preparation_required"
  );
  let applicationRoot = root;
  let verifiedApplicationRoot;
  const setupMaximum = Number(options["timeout-seconds"] ?? 600) * 1000;
  assert(
    Number.isSafeInteger(setupMaximum) &&
      setupMaximum >= 1000 &&
      setupMaximum <= 600000,
    "bounded_account_preparation_timeout_required"
  );
  if (ownedRelay) {
    if (pairing) assert(relayHooks, "joint_pairing_runner_required");
    const discovery = new URL(options.discovery);
    assert(
      discovery.protocol === "https:" &&
        !discovery.username &&
        !discovery.password &&
        !discovery.search &&
        !discovery.hash &&
        discovery.pathname === "/v1/relay" &&
        discovery.href === options.discovery,
      "canonical_discovery_required"
    );
    assert(
      /^[a-p]{32}$/.test(options["registered-extension-id"] ?? ""),
      "pairing_registered_extension_required"
    );
    assert(!options["freeze-extension"], "pairing_frozen_extension_required");
  } else
    assert(
      !options["extension-directory"] &&
        !options["profile-root"] &&
        !options["profile-record"],
      "external_extension_requires_pairing"
    );
  if (options["validate-only"]) {
    console.log(
      JSON.stringify({
        valid: true,
        scenario: "toolbar-history",
        clipboard: "isolated-memory",
        authorization: "host-clipboard-not-used",
      })
    );
    return;
  }
  // Before admission, only path setup is permitted. Its finite cap precedes
  // the persisted diagnostic-time check; no native launch can bypass that check.
  const setup = (task) =>
    raceAcceptanceOperation(task, 15000, "prepare_durable_paths");
  for (const name of ["history-root", "output"]) {
    await setup(() => mkdir(options[name], { recursive: true, mode: 0o700 }));
    options[name] = await setup(() => realpath(options[name]));
    const rel = relative(root, options[name]);
    assert(
      rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel),
      "durable_evidence_outside_checkout_required"
    );
  }
  const recordLocation = join(
    await setup(() => realpath(dirname(options["extension-record"]))),
    options["extension-record"].split(sep).at(-1)
  );
  const recordRelative = relative(root, recordLocation);
  assert(
    recordRelative === ".." ||
      recordRelative.startsWith(`..${sep}`) ||
      isAbsolute(recordRelative),
    "durable_extension_record_outside_checkout_required"
  );
  const profileLease =
    relayHooks?.profileLease ??
    (preparation
      ? await (
          await import("./owned-relay-profile.mjs")
        ).acquireOwnedRelayProfile(options, {
          preparation: true,
          verificationOnly,
          verifyClosed: targetGone,
        })
      : undefined);
  if (pairing) assert(profileLease, "owned_relay_profile_preparation_required");
  const phaseDeadline = preparation ? Date.now() + setupMaximum : Infinity;
  let attempt;
  try {
    attempt = await beginNativeAttempt({
      output: options.output,
      historyRoot: options["history-root"],
      registryRoot: nativeAcceptanceStateRoot(),
      identity: {
        effort: options.effort,
        scenario: ownedRelay
          ? `chrome-${options.scenario}:${options.discovery}`
          : "chrome-toolbar-history",
        environment: {
          hostname: hostname(),
          platform: platform(),
          arch: arch(),
          runtime: "chromium",
        },
      },
      scenario: ownedRelay
        ? `chrome-${options.scenario}:${options.discovery}`
        : "chrome-toolbar-history",
      change: options["diagnostic-change"],
      expectation: options["expected-observation"],
      deferDiagnosticClockUntilFailure: true,
      verifyTarget: targetGone,
    });
  } catch (error) {
    await profileLease?.releaseUnlaunched();
    throw error;
  }
  let stage = "candidate";
  let operation = "verify_frozen_candidate";
  let child,
    browser,
    context,
    browserSession,
    profile,
    identity,
    candidate,
    targetOwnership,
    workerOwnership;
  let targetWritePending = false;
  let privateFailure;
  let preparedObservation;
  const protocol = {
    expectedRegisteredId: ownedRelay
      ? options["registered-extension-id"]
      : null,
    acknowledgedId: null,
    installedObservedId: null,
    inventoryObservations: 0,
    lastInventories: [],
  };
  let exitObserved = false;
  if (profileLease) profile = profileLease.profile;
  const receipt = {
    result: "failed",
    classification: "prerequisite",
    stage,
    scenario: options.scenario,
    clipboard: {
      ...(preparation
        ? {
            sourceAssertion: { hostUsed: false, hostChanged: false },
            observationScope: "controlled-verification-only",
            humanRuntimeObserved: false,
            controlledRuntimeObserved: false,
          }
        : { hostUsed: false, hostChanged: false }),
      boundary: ownedRelay
        ? "per-context-private-memory-before-product-startup"
        : "popup-memory-read-empty-write-rejected",
    },
    debugger: { attached: false, unaffectedWorkerLifecycleQualified: false },
    shutdown: "not-launched",
  };
  async function bounded(task, maximum = 15000) {
    attempt.assertBudget();
    assert(
      Date.now() < phaseDeadline,
      "account_preparation_deadline_exhausted"
    );
    const result = await raceAcceptanceOperation(
      task,
      Math.min(attempt.remainingMs(maximum), phaseDeadline - Date.now()),
      operation
    );
    attempt.assertBudget();
    assert(
      Date.now() < phaseDeadline,
      "account_preparation_deadline_exhausted"
    );
    return result;
  }
  async function recordOwnership(update) {
    targetOwnership = { ...targetOwnership, ...update };
    await bounded(async () => {
      targetWritePending = true;
      await attempt.recordTarget(targetOwnership);
      if (profileLease) await profileLease.recordTarget(targetOwnership);
      targetWritePending = false;
    });
  }
  function command(bin, argv, maximum = 60000) {
    attempt.assertBudget();
    try {
      return execFileSync(bin, argv, {
        cwd: applicationRoot,
        encoding: "utf8",
        timeout: Math.min(
          attempt.remainingMs(maximum),
          phaseDeadline - Date.now()
        ),
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error("candidate_command_failed");
    }
  }
  async function verifyBase() {
    const base = await bounded(() => json(options["candidate-record"]));
    const checkout = base.source?.checkout;
    assert(
      typeof checkout === "string" &&
        isAbsolute(checkout) &&
        checkout.length <= 4096,
      "candidate_wrong_checkout"
    );
    const physical = await bounded(() => realpath(checkout));
    assert(
      !verifiedApplicationRoot || physical === verifiedApplicationRoot,
      "candidate_wrong_checkout"
    );
    if (verificationOnly) {
      const stat = await bounded(() => lstat(checkout));
      assert(
        stat.isDirectory() && !stat.isSymbolicLink() && physical === checkout,
        "candidate_wrong_checkout"
      );
      for (const evidence of [
        options.output,
        options["history-root"],
        recordLocation,
        options["profile-root"],
        options["profile-record"],
      ]) {
        const rel = relative(checkout, evidence);
        assert(
          rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel),
          "durable_evidence_outside_candidate_required"
        );
      }
      const verifier = join(
        checkout,
        "scripts/prepare-acceptance-candidate.mjs"
      );
      const verifierStat = await bounded(() => lstat(verifier));
      assert(
        verifierStat.isFile() &&
          !verifierStat.isSymbolicLink() &&
          verifierStat.size <= 262144 &&
          (await bounded(() => realpath(verifier))) === verifier,
        "candidate_verifier_regular_file_required"
      );
      const trusted = hash(
        await bounded(() =>
          readFile(join(root, "scripts/prepare-acceptance-candidate.mjs"))
        )
      );
      assert(
        base.preparer === trusted &&
          hash(await bounded(() => readFile(verifier))) === trusted,
        "candidate_verifier_untrusted"
      );
      applicationRoot = checkout;
    } else assert(physical === root, "candidate_wrong_checkout");
    const verified = JSON.parse(
      command(process.execPath, [
        join(applicationRoot, "scripts/prepare-acceptance-candidate.mjs"),
        "verify",
        "--record",
        options["candidate-record"],
      ])
    );
    assert(
      verified.verified === true &&
        verified.revision === base.source.revision &&
        verified.artifact,
      "candidate_verification_invalid"
    );
    verifiedApplicationRoot = applicationRoot;
    return { ...base, artifact: verified.artifact };
  }
  async function waitFor(probe, maximum = 15000) {
    const deadline = Date.now() + attempt.remainingMs(maximum);
    while (Date.now() < deadline) {
      const result = await bounded(probe, Math.max(1, deadline - Date.now()));
      if (result) return result;
      await new Promise((done) => setTimeout(done, 50));
    }
    throw new Error("acceptance_operation_timeout");
  }
  try {
    if (verificationOnly) {
      receipt.verificationOnly = true;
      receipt.tooling = { root, scripts: {} };
      for (const file of [
        "apps/extension/scripts/toolbar-acceptance.mjs",
        "apps/extension/scripts/owned-relay-profile.mjs",
        "apps/extension/scripts/verify-clipboard-io.mjs",
        "apps/extension/scripts/clipboard-acceptance.mjs",
        "scripts/native-acceptance-attempts.mjs",
        "scripts/prepare-acceptance-candidate.mjs",
      ])
        receipt.tooling.scripts[file] = hash(
          await bounded(() => readFile(join(root, file)))
        );
    }
    const base = await verifyBase();
    const stagedExtension = join(
      applicationRoot,
      ownedRelay
        ? "apps/extension/.local/relay-acceptance/wss"
        : "apps/extension/dist"
    );
    const loadPath = options["extension-directory"] ?? stagedExtension;
    assert(isAbsolute(loadPath), "absolute_extension_load_path_required");
    const extension = ownedRelay
      ? await bounded(() => realpath(loadPath))
      : stagedExtension;
    const executable = await bounded(() =>
      realpath(options["browser-executable"] ?? chromium.executablePath())
    );
    const browserIdentity = {
      path: executable,
      sha256: hash(await bounded(() => readFile(executable))),
      version: command(executable, ["--version"], 5000).trim(),
    };
    if (options["freeze-extension"]) {
      try {
        await bounded(() => lstat(options["extension-record"]));
        throw new Error("candidate_extension_record_already_exists");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      try {
        assert(
          !(await bounded(() => lstat(extension))).isSymbolicLink(),
          "extension_artifact_alias"
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      operation = "build_frozen_extension";
      command("npm", ["--workspace", "apps/extension", "run", "build"], 180000);
      const frozen = {
        version: 1,
        sourceRevision: base.source.revision,
        baseArtifact: base.artifact,
        baseRecord: options["candidate-record"],
        extensionPath: extension,
        artifacts: await bounded(() => artifacts(extension)),
        browser: browserIdentity,
      };
      await bounded(() =>
        writeFile(
          options["extension-record"],
          JSON.stringify(frozen, null, 2) + "\n",
          { flag: "wx", mode: 0o600 }
        )
      );
    }
    candidate = await bounded(() => json(options["extension-record"]));
    assert(
      candidate.version === 1 &&
        candidate.sourceRevision === base.source.revision &&
        candidate.baseArtifact === base.artifact &&
        candidate.baseRecord === options["candidate-record"] &&
        candidate.extensionPath === extension,
      "candidate_record_mismatch"
    );
    assert.deepEqual(
      candidate.browser,
      browserIdentity,
      "candidate_browser_changed"
    );
    assert.deepEqual(
      await bounded(() => artifacts(extension)),
      candidate.artifacts,
      "candidate_extension_artifacts_changed"
    );
    if (ownedRelay) {
      assert(
        candidate.registeredExtensionId ===
          options["registered-extension-id"] &&
          candidate.stagedExtensionPath === stagedExtension &&
          candidate.relayAcceptanceTransport === "wss" &&
          candidate.acceptanceMemoryClipboard === true &&
          candidate.rawLoadPath === loadPath &&
          candidate.realLoadPath === extension,
        "pairing_registration_mapping_mismatch"
      );
      assert.deepEqual(
        await bounded(() => artifacts(stagedExtension)),
        candidate.artifacts,
        "candidate_staged_extension_changed"
      );
      await bounded(() =>
        profileLease.bind({
          sourceRevision: candidate.sourceRevision,
          baseArtifact: candidate.baseArtifact,
          browser: browserIdentity,
          rawLoadPath: loadPath,
          realLoadPath: extension,
          registeredExtensionId: options["registered-extension-id"],
          bundleSha256: hash(JSON.stringify(candidate.artifacts)),
          relayAcceptanceTransport: "wss",
          acceptanceMemoryClipboard: true,
        })
      );
      if (pairing)
        await bounded(
          () =>
            relayHooks.beforeNative({
              attempt,
              revision: candidate.sourceRevision,
            }),
          relayHooks.maximumMs
        );
    }
    receipt.candidate = {
      ...(verificationOnly ? { checkout: applicationRoot } : {}),
      revision: candidate.sourceRevision,
      baseArtifact: candidate.baseArtifact,
      extensionSha256: hash(JSON.stringify(candidate.artifacts)),
      browser: browserIdentity,
    };
    if (!profileLease)
      profile = await bounded(() =>
        mkdtemp(join(attempt.directory, "profile-"))
      );
    async function verifyLaunchInputs() {
      const current = await verifyBase();
      assert(
        current.artifact === base.artifact &&
          current.source.revision === base.source.revision,
        "candidate_record_mismatch"
      );
      assert(
        (await bounded(() => realpath(loadPath))) === extension,
        "candidate_extension_artifacts_changed"
      );
      assert.deepEqual(
        await bounded(() => artifacts(extension)),
        candidate.artifacts,
        "candidate_extension_artifacts_changed"
      );
      assert.deepEqual(
        await bounded(() => artifacts(stagedExtension)),
        candidate.artifacts,
        "candidate_staged_extension_changed"
      );
      assert.deepEqual(
        {
          path: await bounded(() => realpath(executable)),
          sha256: hash(await bounded(() => readFile(executable))),
          version: command(executable, ["--version"], 5000).trim(),
        },
        browserIdentity,
        "candidate_browser_changed"
      );
    }
    async function launchOwnedBrowser(human = false) {
      if (child)
        assert(
          exitObserved &&
            targetGone(
              targetOwnership,
              Date.now() + Math.min(2000, attempt.remainingMs(2000)),
              workerOwnership
            ),
          "owned_browser_previous_closure_unconfirmed"
        );
      if (ownedRelay) {
        stage = "candidate";
        operation = human
          ? "verify_human_launch_inputs"
          : "verify_controlled_launch_inputs";
        await verifyLaunchInputs();
      }
      child = undefined;
      if (profileLease) await bounded(() => profileLease.prepareLaunch());
      workerOwnership ??= runnerOwnership(attempt.remainingMs(1000));
      exitObserved = false;
      identity = undefined;
      targetOwnership = {
        ...workerOwnership,
        profile,
        launchPhase: human ? "human" : "controlled",
      };
      stage = human ? "human-account-preparation" : "launch";
      operation = human ? "launch_human_browser" : "launch_owned_browser";
      await recordOwnership({ phase: "launch-intent" });
      child = spawn(
        executable,
        [
          `--user-data-dir=${profile}`,
          ...(human
            ? []
            : [
                "--remote-debugging-port=0",
                "--enable-unsafe-extension-debugging",
              ]),
          "--no-first-run",
          "--no-default-browser-check",
          human ? "chrome://extensions/" : "about:blank",
        ],
        { stdio: "ignore", detached: true }
      );
      const launched = child;
      launched.on("error", () => {});
      launched.once("exit", () => {
        if (child === launched) exitObserved = true;
      });
      assert(child.pid, "browser_launch_failed");
      await recordOwnership({ pid: child.pid, phase: "pid-recorded" });
      identity = processIdentity(child.pid, attempt.remainingMs(1000));
      assert(
        identity.birth &&
          identity.fingerprint &&
          identity.command.includes(executable) &&
          identity.command.includes(`--user-data-dir=${profile}`),
        "browser_identity_unavailable"
      );
      identity.executable = executable;
      await recordOwnership({
        pid: child.pid,
        executable: identity.executable,
        birth: identity.birth,
        fingerprint: identity.fingerprint,
        phase: "identity-observed",
      });
    }
    if (preparation && !verificationOnly) {
      stage = "human-account-preparation";
      operation = "launch_human_browser";
      receipt.humanPreparation = {
        debuggerAttached: false,
        runtimeIsolationObserved: false,
        clipboardBoundary: "frozen-build-only",
        shutdown: "not-launched",
      };
      console.log(
        `Owned Chrome human preparation: in chrome://extensions enable Developer mode and Load unpacked ONLY ${loadPath}; verify extension ID ${options["registered-extension-id"]}. Open its normal options, Settings / Connections, add only relay ${options.discovery} if absent, and use its normal Log in control. Complete Google authorization yourself, then Quit this owned Chrome. Do not open DevTools. Your statement of readiness is not verification; the next controlled launch independently checks public Ready. No Pairing is qualified here.`
      );
      await launchOwnedBrowser(true);
      receipt.humanPreparation.shutdown = "unconfirmed";
      operation = "wait_for_human_browser_exit";
      await waitFor(() => exitObserved, setupMaximum);
      assert(
        child.exitCode === 0 && child.signalCode === null,
        "human_browser_exit_unexpected"
      );
      operation = "verify_human_browser_closed";
      await waitFor(() =>
        targetGone(
          targetOwnership,
          Date.now() + Math.min(2000, attempt.remainingMs(2000)),
          workerOwnership
        )
      );
      const closureProof = join(
        attempt.directory,
        "human-browser-closure.json"
      );
      await bounded(() =>
        writeFile(
          closureProof,
          JSON.stringify({
            ...targetOwnership,
            shutdown: "verified-owned-browser-closed",
          }),
          { flag: "wx", mode: 0o600 }
        )
      );
      receipt.humanPreparation.shutdown = "verified-owned-browser-closed";
      receipt.humanPreparation.closureProof = closureProof;
      await recordOwnership({ phase: "human-closure-verified", closureProof });
    }
    await launchOwnedBrowser();
    const port = await waitFor(async () => {
      if (ownedRelay)
        assert(
          !exitObserved && child.exitCode === null && child.signalCode === null,
          "owned_profile_launcher_exited"
        );
      try {
        return (
          await readFile(join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n");
      } catch (error) {
        if (error.code === "ENOENT") return undefined;
        throw error;
      }
    });
    assert(
      /^\d+$/.test(port[0]) && port[1]?.startsWith("/devtools/browser/"),
      "owned_debug_endpoint_invalid"
    );
    if (ownedRelay) {
      const current = processIdentity(child.pid, attempt.remainingMs(1000));
      assert(
        !exitObserved &&
          current.birth === identity.birth &&
          current.fingerprint === identity.fingerprint,
        "owned_profile_launcher_exited"
      );
    }
    browser = await bounded(() =>
      chromium.connectOverCDP(`http://127.0.0.1:${port[0]}`, {
        timeout: attempt.remainingMs(15000),
      })
    );
    receipt.debugger.attached = true;
    context = browser.contexts()[0];
    assert(context, "owned_browser_context_missing");
    receipt.process = {
      pid: child.pid,
      identityObserved: true,
      profileOwned: true,
      scope:
        "direct owned child; historical detached descendants not proven absent",
    };
    // Init scripts run before the popup's own focus listener. On installation
    // failure, stop navigation before application code can read the host clipboard.
    await bounded(() =>
      context.addInitScript((privateMemory) => {
        let memoryText = "";
        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: false,
            value: Object.freeze({
              readText: async () => (privateMemory ? memoryText : ""),
              writeText: async (text) => {
                if (privateMemory) memoryText = text;
                else
                  throw new Error("acceptance_memory_clipboard_write_refused");
              },
            }),
          });
          Object.defineProperty(window, "__clippAcceptanceMemoryClipboard", {
            value: true,
          });
        } catch {
          window.stop();
          location.replace("about:blank#clipboard-boundary-unavailable");
        }
      }, ownedRelay)
    );
    stage = "worker";
    operation = "observe_extension_identity";
    const session = await bounded(() => browser.newBrowserCDPSession());
    browserSession = session;
    const inventory = async () => {
      const result = await bounded(() =>
        session.send("Extensions.getExtensions")
      );
      assert(
        Array.isArray(result.extensions) && result.extensions.length <= 500,
        "extension_inventory_invalid"
      );
      protocol.inventoryObservations++;
      protocol.lastInventories.push({
        count: result.extensions.length,
        selected: result.extensions
          .filter(
            (item) =>
              item.id === protocol.acknowledgedId || item.path === extension
          )
          .slice(0, 4)
          .map((item) => ({
            id: ownedRelay
              ? item.id === options["registered-extension-id"]
                ? options["registered-extension-id"]
                : "unmatched-extension"
              : String(item.id).slice(0, 128),
            ...(ownedRelay
              ? { pathMatches: item.path === extension }
              : { path: String(item.path).slice(0, 4096) }),
            enabled: item.enabled === true,
          })),
      });
      if (protocol.lastInventories.length > 20)
        protocol.lastInventories.shift();
      return result.extensions;
    };
    await inventory();
    let expectedId = options["registered-extension-id"];
    if (!ownedRelay) {
      operation = "load_owned_unpacked_extension";
      const acknowledgement = await bounded(() =>
        session.send("Extensions.loadUnpacked", { path: loadPath })
      );
      assert(
        typeof acknowledgement.id === "string" &&
          acknowledgement.id.length > 0 &&
          acknowledgement.id.length <= 128,
        "extension_load_acknowledgement_invalid"
      );
      protocol.acknowledgedId = acknowledgement.id;
      expectedId = acknowledgement.id;
    }
    operation = "observe_loaded_extension_inventory";
    let loaded;
    try {
      loaded = await waitFor(async () => {
        const entries = await inventory();
        const matches = entries.filter((item) => item.id === expectedId);
        assert(matches.length <= 1, "toolbar_target_mismatch");
        const selected = matches[0];
        if (!selected) {
          assert(
            !entries.some((item) => item.path === extension),
            "toolbar_target_mismatch"
          );
          return undefined;
        }
        assert(
          selected.enabled === true && typeof selected.path === "string",
          "toolbar_target_mismatch"
        );
        if (ownedRelay)
          assert(
            selected.path === extension || selected.path === loadPath,
            "toolbar_target_mismatch"
          );
        assert(
          (await bounded(() => realpath(selected.path))) === extension,
          "toolbar_target_mismatch"
        );
        return selected;
      });
    } catch (error) {
      if (error.message === "acceptance_operation_timeout")
        throw new Error("extension_inventory_not_ready");
      throw error;
    }
    const extensionId = loaded.id;
    if (ownedRelay)
      assert(
        extensionId === options["registered-extension-id"],
        "pairing_registration_mapping_mismatch"
      );
    protocol.installedObservedId = extensionId;
    const openManagement = async () => {
      operation = "open_owned_management";
      const page = await bounded(() => context.newPage());
      await bounded(() =>
        page.goto(`chrome-extension://${extensionId}/src/options.html`)
      );
      assert(
        page.url() === `chrome-extension://${extensionId}/src/options.html`,
        "toolbar_target_mismatch"
      );
      operation = "verify_management_early_memory";
      const mapping = await bounded(() =>
        page.evaluate(() => ({
          id: chrome.runtime.id,
          earlyMemory: window.__clippAcceptanceEarlyMemoryClipboard === true,
        }))
      );
      if (preparation)
        receipt.preparation = {
          managementIdentityMatches: mapping.id === extensionId,
          earlyMemory: mapping.earlyMemory === true,
        };
      assert(mapping.id === extensionId, "toolbar_target_mismatch");
      assert(
        mapping.earlyMemory === true,
        "acceptance_memory_startup_required"
      );
      const request = (value) =>
        bounded(() =>
          page.evaluate(
            (message) =>
              new Promise((done) => chrome.runtime.sendMessage(message, done)),
            value
          )
        );
      const readState = () =>
        request({ type: "getRuntimeState" }).then((reply) => reply?.state);
      const configurationShape = (state) => {
        const configurations = state?.managedRelayConfigurations;
        if (!Array.isArray(configurations)) return "unavailable";
        if (configurations.length === 0) return "empty";
        return configurations.length === 1 &&
          configurations[0].kind === "managed" &&
          configurations[0].discoveryUrl === options.discovery
          ? "approved-single"
          : "conflict";
      };
      return {
        configurationShape,
        readState,
        readTransportStatus: () => request({ type: "getStatus" }),
      };
    };
    const openPopup = async () => {
      const tab = ownedRelay
        ? await bounded(() => context.newPage())
        : (context.pages()[0] ?? (await bounded(() => context.newPage())));
      if (ownedRelay) await bounded(() => tab.goto("about:blank"));
      await bounded(() => tab.bringToFront());
      const tabSession = await bounded(() => context.newCDPSession(tab));
      operation = "identify_owned_browser_tab";
      const { targetInfo: pageTarget } = await bounded(() =>
        tabSession.send("Target.getTargetInfo")
      );
      const pageUrl = tab.url();
      assert(
        pageTarget.type === "page" &&
          typeof pageTarget.targetId === "string" &&
          pageTarget.url === pageUrl,
        "toolbar_target_mismatch"
      );
      const pageWindow = await bounded(() =>
        session.send("Browser.getWindowForTarget", {
          targetId: pageTarget.targetId,
        })
      );
      assert(
        Number.isSafeInteger(pageWindow.windowId) && pageWindow.windowId >= 0,
        "toolbar_target_mismatch"
      );
      const { targetInfos } = await bounded(() =>
        session.send("Target.getTargets", {
          filter: [{ type: "tab", exclude: false }, { exclude: true }],
        })
      );
      assert(
        Array.isArray(targetInfos) && targetInfos.length <= 500,
        "toolbar_target_mismatch"
      );
      const matchingTabs = [];
      protocol.tabMapping = {
        pageTargetId: pageTarget.targetId,
        pageType: pageTarget.type,
        pageUrl: pageUrl.slice(0, 4096),
        pageWindowId: pageWindow.windowId,
        tabCount: targetInfos.filter((item) => item.type === "tab").length,
        candidates: [],
      };
      for (const item of targetInfos) {
        if (
          item.type !== "tab" ||
          item.url !== pageUrl ||
          item.browserContextId !== pageTarget.browserContextId
        )
          continue;
        if (
          pageTarget.browserContextId === undefined &&
          browser.contexts().length !== 1
        )
          continue;
        assert(
          typeof item.targetId === "string" &&
            item.targetId !== pageTarget.targetId,
          "toolbar_target_mismatch"
        );
        const tabWindow = await bounded(() =>
          session.send("Browser.getWindowForTarget", {
            targetId: item.targetId,
          })
        );
        if (protocol.tabMapping.candidates.length < 10)
          protocol.tabMapping.candidates.push({
            targetId: item.targetId.slice(0, 128),
            windowId: tabWindow.windowId,
            contextMatched: true,
            urlMatched: true,
          });
        if (tabWindow.windowId === pageWindow.windowId) matchingTabs.push(item);
      }
      assert(matchingTabs.length === 1, "toolbar_target_mismatch");
      const actionTab = matchingTabs[0];
      receipt.actionTarget = {
        pageTargetId: pageTarget.targetId,
        tabTargetId: actionTab.targetId,
        windowId: pageWindow.windowId,
        urlMatched: true,
        contextMatched: true,
      };
      operation = "trigger_actual_toolbar_action";
      await bounded(() =>
        session.send("Extensions.triggerAction", {
          id: extensionId,
          targetId: actionTab.targetId,
        })
      );
      const popup = await waitFor(async () =>
        context
          .pages()
          .find(
            (page) =>
              page.url() === `chrome-extension://${extensionId}/src/popup.html`
          )
      );
      const mapping = await bounded(() =>
        popup.evaluate(() => ({
          id: chrome.runtime.id,
          tabId: undefined,
          memory: window.__clippAcceptanceMemoryClipboard === true,
          isPopup: chrome.extension
            .getViews({ type: "popup" })
            .includes(window),
          focused: document.hasFocus(),
          href: location.href,
        }))
      );
      assert(
        mapping.id === extensionId &&
          mapping.isPopup === true &&
          mapping.memory === true &&
          mapping.focused === true,
        "toolbar_target_mismatch"
      );
      receipt.surface = {
        kind: "actual-toolbar-popup",
        viewType: "popup",
        trigger: "Extensions.triggerAction",
        idMatches: true,
        focused: true,
        clipboardBoundaryInstalled: true,
      };
      return popup;
    };
    // An installed MV3 worker can be dormant after the owned browser restarts.
    // Open only its normal isolated management surface before waiting for it.
    const management = ownedRelay ? await openManagement() : undefined;
    operation = "observe_extension_service_worker";
    const worker = await waitFor(async () =>
      context
        .serviceWorkers()
        .find((item) => new URL(item.url()).host === extensionId)
    );
    assert(
      new URL(worker.url()).host === extensionId,
      "toolbar_target_mismatch"
    );
    receipt.extension = {
      id: extensionId,
      pathMatches: true,
      ...(pairing
        ? {
            rawLoadPath: loadPath,
            realLoadPath: extension,
            expectedId: options["registered-extension-id"],
            bundleSha256: hash(JSON.stringify(candidate.artifacts)),
          }
        : {}),
    };
    if (preparation) {
      stage = "account-preparation";
      const runtime = management;
      operation = "read_owned_transport_status";
      const status = await runtime.readTransportStatus();
      receipt.preparation.transport = {
        started: status?.started === true,
        transport: ["wss", "webrtc-direct"].includes(
          status?.relayAcceptanceTransport
        )
          ? status.relayAcceptanceTransport
          : "unavailable",
        memory: status?.acceptanceMemoryClipboard === true,
      };
      assert(
        status?.started === true &&
          status.relayAcceptanceTransport === "wss" &&
          status.acceptanceMemoryClipboard === true,
        "pairing_forced_relay_runtime_required"
      );
      operation = "record_owned_startup_isolation";
      Object.assign(receipt.clipboard, {
        hostUsed: false,
        hostChanged: false,
        controlledRuntimeObserved: true,
      });
      await bounded(() => profileLease.confirmStartupIsolation());
      operation = "read_owned_relay_configuration";
      const initial = await runtime.readState();
      receipt.preparation.configurationShape =
        runtime.configurationShape(initial);
      receipt.preparation.configurationResult = "not-requested";
      assert(
        Array.isArray(initial?.managedRelayConfigurations),
        "owned_relay_configuration_unavailable"
      );
      receipt.preparation.configurationResult =
        runtime.configurationShape(initial) === "approved-single"
          ? "applied-observed"
          : "not-confirmed";
      assert(
        runtime.configurationShape(initial) === "approved-single",
        "owned_relay_configuration_conflict"
      );
      operation = "observe_owned_relay_ready";
      const state = await waitFor(async () => {
        const state = await runtime.readState();
        const configurations =
          state?.managedRelayConfigurations?.filter(
            (config) =>
              config.kind === "managed" &&
              config.discoveryUrl === options.discovery
          ) ?? [];
        assert(
          configurations.length <= 1,
          "owned_relay_configuration_ambiguous"
        );
        const selected =
          configurations.length === 1
            ? state.managedRelayStates?.find(
                (value) =>
                  value.key === configurations[0].key &&
                  value.kind === "managed"
              )
            : undefined;
        assert(
          selected?.status !== "login_needed",
          "owned_human_login_required"
        );
        const ready =
          configurations.length === 1 &&
          state.managedRelayStates?.find(
            (value) =>
              value.kind === "managed" &&
              value.key === configurations[0].key &&
              value.status === "ready"
          );
        return ready ? state : null;
      }, setupMaximum);
      const id = state.identity?.deviceId;
      assert(
        typeof id === "string" &&
          /^[A-Za-z0-9]{20,128}$/.test(id) &&
          (!profileLease.publicDeviceId || profileLease.publicDeviceId === id),
        "owned_profile_identity_changed"
      );
      preparedObservation = { publicDeviceId: id };
      receipt.accountPreparation = {
        readyObserved: true,
        prepared: false,
        qualification: "account-preparation-only",
        profileRecord: options["profile-record"],
      };
      receipt.surface = {
        kind: "owned-normal-extension-options",
        clipboardBoundaryInstalledBeforeStartup: true,
      };
    } else {
      let popup = await openPopup();
      const message = async (msg) => {
        return bounded(() =>
          popup.evaluate(
            (value) =>
              new Promise((done) => chrome.runtime.sendMessage(value, done)),
            msg
          )
        );
      };
      stage = "interaction";
      operation = "toolbar_readiness_filter";
      await bounded(() =>
        popup
          .getByRole("button", { name: "Pinned", exact: true })
          .click({ timeout: attempt.remainingMs(5000) })
      );
      assert(
        await bounded(() =>
          popup
            .getByRole("button", { name: "Pinned", exact: true })
            .evaluate((el) => el.classList.contains("active"))
        ),
        "toolbar_input_not_observed"
      );
      await bounded(() =>
        popup
          .getByRole("button", { name: "All", exact: true })
          .click({ timeout: attempt.remainingMs(5000) })
      );
      receipt.readiness = {
        passed: true,
        interaction: "native-popup-pinned-and-all-filter",
      };
      stage = "behavior";
      operation = "capture_local_synthetic_clip";
      const baseline = pairing
        ? (await message({ type: "getRuntimeState" }))?.state
        : undefined;
      if (pairing)
        assert(
          baseline?.identity?.deviceId === profileLease.publicDeviceId &&
            Array.isArray(baseline.clips) &&
            Array.isArray(baseline.pinnedIds),
          "owned_profile_identity_changed"
        );
      const oldIds = new Set(baseline?.clips?.map((clip) => clip.id) ?? []);
      const text = pairing
        ? `clipp-toolbar-local-${randomUUID()}`
        : "clipp-toolbar-local-history-fixture";
      const capture = await message({ type: "clipboardUpdate", text });
      assert(capture?.ok !== false, "local_fixture_capture_failed");
      await bounded(() =>
        popup
          .getByText(text, { exact: true })
          .waitFor({ state: "visible", timeout: attempt.remainingMs(5000) })
      );
      let captured;
      if (pairing)
        captured = await waitFor(async () => {
          const state = (await message({ type: "getRuntimeState" }))?.state;
          return state?.clips?.find(
            (clip) =>
              !oldIds.has(clip.id) &&
              clip.content === text &&
              clip.originPeerId === baseline.identity.deviceId
          );
        });
      operation = "pin_visible_clip";
      await bounded(() =>
        pairing
          ? popup
              .locator("article.history-card")
              .filter({ hasText: text })
              .getByTitle(/^Pin(?: Clip)?$/, { exact: true })
              .click({ timeout: attempt.remainingMs(5000) })
          : popup
              .getByTitle(/^Pin(?: Clip)?$/, { exact: true })
              .first()
              .click({ timeout: attempt.remainingMs(5000) })
      );
      await waitFor(async () => {
        const state = (await message({ type: "getRuntimeState" }))?.state;
        return pairing
          ? state?.pinnedIds?.includes(captured.id)
          : state?.pinnedIds?.length === 1;
      });
      await bounded(() =>
        popup
          .getByRole("button", { name: "Pinned", exact: true })
          .click({ timeout: attempt.remainingMs(5000) })
      );
      assert(
        await bounded(() => popup.getByText(text, { exact: true }).isVisible()),
        "pinned_clip_not_visible"
      );
      receipt.behavior = {
        passed: true,
        syntheticClipVisible: true,
        pinPersisted: true,
        pinnedFilterVisible: true,
        ...(pairing
          ? {
              freshClip: true,
              exactNewPin: true,
              priorPinnedCount: baseline.pinnedIds.length,
            }
          : {}),
      };
      if (pairing) {
        stage = "relay-pairing";
        operation = "joint_relay_pairing";
        const { readState, readTransportStatus } = await openManagement();
        const focusedInput = (operation) =>
          bounded(async () => {
            const focus = () => popup.evaluate(() => document.hasFocus());
            assert((await focus()) === true, "toolbar_target_mismatch");
            const result = await operation();
            assert((await focus()) === true, "toolbar_target_mismatch");
            return result;
          });
        receipt.pairing = await bounded(
          () =>
            relayHooks.onReady({
              attempt,
              bounded,
              readState,
              readTransportStatus,
              expectedDeviceId: profileLease.publicDeviceId,
              async open() {
                popup = await openPopup();
              },
              async click(name, { ifPresent = false } = {}) {
                const control = popup.getByRole("button", {
                  name:
                    name === "Requests"
                      ? /^Requests(?:\s*(?:\((?:\d+|loading|unavailable)\)|active requests))?$/
                      : name,
                  exact: true,
                });
                if (ifPresent) {
                  const count = await bounded(() => control.count());
                  assert(count <= 1, "pairing_close_control_ambiguous");
                  if (count === 0) return;
                }
                await focusedInput(() =>
                  control.click({ timeout: attempt.remainingMs(5000) })
                );
              },
              async typeTarget(text) {
                await focusedInput(() =>
                  popup
                    .getByLabel("Pairing text", { exact: true })
                    .click({ timeout: attempt.remainingMs(5000) })
                );
                await focusedInput(() => popup.keyboard.insertText(text));
              },
              observeAcceptance: (peerId) =>
                focusedInput(() =>
                  popup
                    .locator(`[data-pairing-target="${peerId}"]`)
                    .getByText("Acceptance response received.", {
                      exact: false,
                    })
                    .waitFor({
                      state: "visible",
                      timeout: attempt.remainingMs(5000),
                    })
                ),
            }),
          relayHooks.maximumMs
        );
      }
    }
    operation = "verify_candidate_after_interaction";
    await verifyBase();
    assert.deepEqual(
      await bounded(() => artifacts(extension)),
      candidate.artifacts,
      "candidate_extension_artifacts_changed"
    );
    if (ownedRelay) {
      assert.equal(
        await bounded(() => realpath(loadPath)),
        extension,
        "pairing_registration_mapping_mismatch"
      );
      assert.deepEqual(
        await bounded(() => artifacts(stagedExtension)),
        candidate.artifacts,
        "candidate_staged_extension_changed"
      );
    }
    receipt.result = "passed";
    receipt.classification = "none";
    receipt.stage = "complete";
  } catch (error) {
    const guardReason =
      typeof error?.message === "string"
        ? error.message.split("\n", 1)[0]
        : undefined;
    privateFailure = {
      stage,
      operation,
      protocol,
      error: ownedRelay
        ? {
            name: "OwnedRelayOperationError",
            code: errorCode(error, stage),
            ...(verificationOnly &&
            new Set([
              "candidate_metadata_invalid",
              "candidate_command_failed",
              "candidate_wrong_checkout",
              "bounded_regular_metadata_required",
              "candidate_verifier_regular_file_required",
              "candidate_verifier_untrusted",
              "durable_evidence_outside_candidate_required",
              "candidate_verification_invalid",
              "candidate_record_mismatch",
              "candidate_browser_changed",
              "candidate_extension_artifacts_changed",
              "candidate_staged_extension_changed",
              "pairing_registration_mapping_mismatch",
              "owned_profile_candidate_binding_changed",
              "owned_profile_chrome_lock_present",
              "owned_profile_preparation_proof_invalid",
              "owned_relay_profile_preparation_required",
              "owned_human_login_required",
              "acceptance_memory_startup_required",
              "pairing_forced_relay_runtime_required",
            ]).has(guardReason)
              ? { guard: guardReason }
              : {}),
          }
        : {
            name: String(error?.name ?? "UnknownError").slice(0, 128),
            message: String(error?.message ?? "unknown").slice(0, 4096),
          },
    };
    receipt.stage = stage;
    receipt.operation = operation;
    receipt.failure = errorCode(error, stage);
    receipt.classification = [
      "worker_evaluation_timeout",
      "command_timeout",
    ].includes(receipt.failure)
      ? "runner"
      : receipt.failure === "unknown_failure"
        ? "unknown"
        : receipt.failure === "product_failure"
          ? "product"
          : "prerequisite";
    receipt.recoveryAction =
      "preserve receipt; record changed hypothesis and distinguishing observation before retry";
    process.exitCode = 1;
  } finally {
    const cleanupDeadline = Date.now() + 10000;
    const cleanup = async (task) => {
      return raceAcceptanceOperation(
        task,
        Math.max(1, cleanupDeadline - Date.now()),
        "owned_browser_cleanup"
      );
    };
    if (privateFailure) {
      try {
        await cleanup(() =>
          writeFile(
            join(attempt.directory, "failure.private.json"),
            JSON.stringify(privateFailure, null, 2) + "\n",
            { flag: "wx", mode: 0o600 }
          )
        );
        receipt.privateDiagnostics = "failure.private.json";
      } catch {
        receipt.privateDiagnostics = "unavailable";
      }
    }
    try {
      if (ownedRelay && browserSession)
        await cleanup(() => browserSession.send("Browser.close")).catch(
          () => {}
        );
      if (browser) {
        try {
          await cleanup(() => browser.close());
        } catch (error) {
          if (!ownedRelay || !exitObserved) throw error;
        }
      }
      if (child?.pid && !exitObserved) {
        await cleanup(
          () =>
            new Promise((done) => {
              const poll = setInterval(() => {
                if (exitObserved) {
                  clearInterval(poll);
                  done();
                }
              }, 25);
              setTimeout(() => {
                clearInterval(poll);
                done();
              }, 500);
            })
        );
        if (!exitObserved) {
          assert(Date.now() < cleanupDeadline, "browser_cleanup_timeout");
          const current = processIdentity(
            child.pid,
            Math.max(1, Math.min(1000, cleanupDeadline - Date.now()))
          );
          assert(
            identity?.fingerprint &&
              identity?.birth &&
              identity?.executable &&
              current.fingerprint &&
              current.birth &&
              current.command &&
              current.birth === identity.birth &&
              current.fingerprint === identity.fingerprint &&
              current.command.includes(identity.executable) &&
              current.command.includes(`--user-data-dir=${profile}`),
            "browser_cleanup_identity_uncertain"
          );
          child.kill("SIGTERM");
          await cleanup(
            () =>
              new Promise((done, reject) => {
                child.once("exit", done);
                setTimeout(
                  () => reject(new Error("browser_cleanup_timeout")),
                  2000
                );
              })
          );
        }
      }
      assert(!targetWritePending, "ownership_write_pending");
      if (profile && targetOwnership)
        assert(
          targetGone(targetOwnership, cleanupDeadline, workerOwnership),
          "browser_cleanup_unobserved"
        );
      if (profileLease) {
        if (targetOwnership)
          await cleanup(() =>
            profileLease.closed({
              observation: preparedObservation,
              receiptPath: join(attempt.directory, "receipt.json"),
              proofPath: join(attempt.directory, "profile-preparation.json"),
            })
          );
        else await cleanup(() => profileLease.releaseUnlaunched());
        receipt.profileRetained = true;
        if (preparedObservation) receipt.accountPreparation.prepared = true;
      } else if (profile)
        await cleanup(() => rm(profile, { recursive: true, force: true }));
      await cleanup(() => attempt.clearTarget());
      receipt.shutdown = child
        ? "verified-owned-browser-closed"
        : "not-launched";
    } catch {
      if (profileLease)
        await cleanup(() => profileLease.uncertain()).catch(() => {});
      receipt.cleanupFailure = "owned_browser_cleanup_uncertain";
      receipt.shutdown = "unknown";
      receipt.result = "failed";
      receipt.classification = "cleanup";
      process.exitCode = 1;
    }
    if (relayHooks) {
      try {
        await relayHooks.afterCleanup(receipt, { deadline: cleanupDeadline });
      } catch {
        receipt.jointCleanup = "unconfirmed";
        if (receipt.result === "passed") {
          receipt.result = "failed";
          receipt.classification = "runner";
          receipt.failure = "joint_cleanup_unconfirmed";
        }
        process.exitCode = 1;
      }
    }
    await attempt.finish(receipt);
    console.log(JSON.stringify(receipt));
  }
  return receipt;
}
