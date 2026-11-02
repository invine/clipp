/** Actual Electron acceptance runner. See docs/electron-relay-acceptance.md. */
import assert from "node:assert/strict";
import {
  mkdir,
  open,
  writeFile,
  unlink,
  readFile,
  readdir,
  realpath,
  rm,
  lstat,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { _electron } from "playwright";
import {
  beginNativeAttempt,
  nativeAcceptanceStateRoot,
} from "./native-acceptance-attempts.mjs";
import { sourceIdentity } from "./source-identity.mjs";

export async function runElectronAcceptance(args, relayHooks) {
  const { values, tokens } = parseArgs({
    args,
    tokens: true,
    options: {
      profile: { type: "string" },
      "candidate-record": { type: "string" },
      "pairing-record": { type: "string" },
      scenario: { type: "string" },
      "history-root": { type: "string" },
      effort: { type: "string" },
      environment: { type: "string" },
      renewal: { type: "string" },
      successor: { type: "string" },
      "import-history": { type: "string", multiple: true },
      "command-timeout-ms": { type: "string", default: "30000" },
      "cleanup-timeout-ms": { type: "string", default: "10000" },
      "diagnostic-change": { type: "string" },
      "expected-observation": { type: "string" },
      "preflight-only": { type: "boolean", default: false },
      transport: { type: "string" },
      discovery: { type: "string" },
      "app-name": { type: "string", default: "Clipp Relay Test" },
      output: { type: "string" },
      "expect-clip": { type: "string" },
      "timeout-seconds": { type: "string", default: "600" },
    },
  });
  const scalarOptions = new Set();
  for (const token of tokens) {
    if (token.kind !== "option" || token.name === "import-history") continue;
    assert(!scalarOptions.has(token.name), "duplicate_electron_option");
    scalarOptions.add(token.name);
  }
  let pairingRecord = relayHooks?.pairingRecord;
  if (values["pairing-record"] && !pairingRecord) {
    assert(
      path.isAbsolute(values["pairing-record"]),
      "absolute_pairing_record_required"
    );
    const { raceAcceptanceOperation } =
      await import("../apps/extension/scripts/clipboard-acceptance.mjs");
    pairingRecord = await raceAcceptanceOperation(
      async () => {
        const metadata = await lstat(values["pairing-record"]);
        assert(
          metadata.isFile() &&
            !metadata.isSymbolicLink() &&
            metadata.size <= 16384,
          "bounded_pairing_record_required"
        );
        const handle = await open(values["pairing-record"], "r");
        try {
          const current = await handle.stat();
          assert(
            current.isFile() &&
              current.ino === metadata.ino &&
              current.dev === metadata.dev &&
              current.size <= 16384,
            "bounded_pairing_record_required"
          );
          const buffer = Buffer.alloc(16385);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          assert(bytesRead <= 16384, "bounded_pairing_record_required");
          try {
            return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
          } catch {
            throw new Error("pairing_record_invalid");
          }
        } finally {
          await handle.close();
        }
      },
      15000,
      "read_pairing_record"
    );
    assert(
      pairingRecord?.version === 1 &&
        /^[a-p]{32}$/.test(pairingRecord.registeredExtensionId ?? ""),
      "pairing_registered_extension_required"
    );
  }
  for (const field of ["profile", "output", "history-root"]) {
    assert(
      values[field] && path.isAbsolute(values[field]),
      `absolute_${field}_required`
    );
  }
  assert(
    ["tcp", "wss", "webrtc-direct"].includes(values.transport),
    "supported_transport_required"
  );
  assert(values.effort?.trim(), "stable_effort_required");
  if (values["candidate-record"])
    assert(
      path.isAbsolute(values["candidate-record"]),
      "absolute_candidate_record_required"
    );
  const selectedScenario =
    values.scenario ??
    (values["preflight-only"] ? "readiness" : "relay-transfer");
  assert(
    [
      "readiness",
      "clipboard-history",
      "relay-transfer",
      "relay-pairing",
    ].includes(selectedScenario),
    "supported_scenario_required"
  );
  assert(
    !values.scenario || !values["preflight-only"],
    "select_scenario_or_preflight_only"
  );
  if (selectedScenario !== "readiness")
    assert(values["candidate-record"], "frozen_candidate_record_required");
  const scenarioIdentity = `electron-${selectedScenario === "relay-transfer" ? values.transport : selectedScenario}`;
  let expectedDiscovery;
  if (["relay-transfer", "relay-pairing"].includes(selectedScenario)) {
    if (selectedScenario === "relay-transfer")
      assert(values["expect-clip"], "nonprivate_clip_marker_required");
    expectedDiscovery = new URL(values.discovery);
    assert(
      expectedDiscovery.protocol === "https:" &&
        !expectedDiscovery.username &&
        !expectedDiscovery.password &&
        !expectedDiscovery.search &&
        !expectedDiscovery.hash &&
        expectedDiscovery.pathname === "/v1/relay",
      "canonical_discovery_required"
    );
  }
  const commandTimeout = Number(values["command-timeout-ms"]);
  const cleanupTimeout = Number(values["cleanup-timeout-ms"]);
  assert(
    Number.isSafeInteger(commandTimeout) &&
      commandTimeout >= 50 &&
      commandTimeout <= 30000,
    "bounded_command_timeout_required"
  );
  assert(
    Number.isSafeInteger(cleanupTimeout) &&
      cleanupTimeout >= 50 &&
      cleanupTimeout <= 10000,
    "bounded_cleanup_timeout_required"
  );
  const timeout = Number(values["timeout-seconds"]) * 1_000;
  assert(
    Number.isSafeInteger(timeout) && timeout >= 1_000 && timeout <= 600_000,
    "bounded_timeout_required"
  );
  const toolingRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  let root = toolingRoot;
  let dist = path.join(root, "apps/electron/dist");
  let attempt;
  let candidateRecord;
  let candidateRoot;
  const stateRoot = nativeAcceptanceStateRoot();
  const descriptorDeadline = Date.now() + commandTimeout;
  // Invalid metadata/paths must not create artifacts or profile/history locks
  // inside the selected immutable application. Verification remains charged.
  if (values["candidate-record"]) {
    const bytes = await boundedRegular(
      values["candidate-record"],
      1024 * 1024,
      "bounded_candidate_record_required"
    );
    try {
      candidateRecord = JSON.parse(bytes);
    } catch {
      throw new Error("frozen_candidate_record_invalid");
    }
    assert(
      candidateRecord?.version === 1 &&
        candidateRecord.runtime === "electron" &&
        /^[a-f0-9]{40}$/.test(candidateRecord.source?.revision ?? "") &&
        candidateRecord.artifacts &&
        candidateRecord.runtimeArtifacts &&
        candidateRecord.scenario?.id &&
        /^[a-f0-9]{64}$/.test(candidateRecord.preparer ?? ""),
      "frozen_candidate_record_invalid"
    );
    const checkout = candidateRecord.source.checkout;
    assert(
      typeof checkout === "string" &&
        path.isAbsolute(checkout) &&
        checkout.length <= 4096,
      "frozen_candidate_checkout_mismatch"
    );
    const physical = await command(() => realpath(checkout));
    const metadata = await command(() => lstat(checkout));
    assert(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        physical === checkout,
      "frozen_candidate_checkout_mismatch"
    );
    const plannedPaths = [
      values.output,
      values["history-root"],
      stateRoot,
      values.profile,
      values["candidate-record"],
    ];
    if (selectedScenario === "relay-pairing" && pairingRecord) {
      const chromeArguments = pairingRecord.chromeArguments;
      assert(
        Array.isArray(chromeArguments) &&
          chromeArguments.length <= 64 &&
          chromeArguments.length % 2 === 0 &&
          chromeArguments.every(
            (value) => typeof value === "string" && value.length <= 4096
          ),
        "pairing_chrome_chromeArgumentsrequired"
      );
      const pathOptions = new Set([
        "--output",
        "--history-root",
        "--profile-root",
        "--profile-record",
        "--extension-record",
      ]);
      for (let index = 0; index < chromeArguments.length; index += 2) {
        if (pathOptions.has(chromeArguments[index])) {
          assert(
            path.isAbsolute(chromeArguments[index + 1]),
            "pairing_chrome_chromeArgumentsrequired"
          );
          plannedPaths.push(chromeArguments[index + 1]);
        }
      }
    }
    for (const planned of plannedPaths) {
      const location = await intendedPhysicalPath(planned);
      const relative = path.relative(physical, location);
      assert(
        relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative),
        "durable_evidence_outside_candidate_required"
      );
    }
    candidateRoot = physical;
  }
  if (selectedScenario === "relay-pairing") {
    assert(pairingRecord, "pairing_record_required");
    assert(values.transport === "wss", "pairing_wss_required");
    if (!relayHooks) {
      const { runRelayPairing } =
        await import("./relay-pairing-acceptance.mjs");
      return runRelayPairing(args, pairingRecord, runElectronAcceptance);
    }
  }
  // Evidence must survive disposal of a linked checkout. Primary repositories
  // may keep their established ignored local artifacts directory.
  await mkdir(values.output, { recursive: true, mode: 0o700 });
  await mkdir(values["history-root"], { recursive: true, mode: 0o700 });
  const canonicalOutput = await realpath(values.output);
  const canonicalHistory = await realpath(values["history-root"]);
  if ((await lstat(path.join(root, ".git"))).isFile()) {
    assert(
      path
        .relative(await realpath(root), canonicalOutput)
        .startsWith(`..${path.sep}`),
      "durable_output_outside_checkout_required"
    );
    assert(
      path
        .relative(await realpath(root), canonicalHistory)
        .startsWith(`..${path.sep}`),
      "durable_history_outside_checkout_required"
    );
  }
  async function artifactIdentity() {
    const artifactDeadline = Date.now() + attempt.remainingMs(commandTimeout);
    const artifactOperation = (operation) => {
      const remaining = Math.min(
        artifactDeadline - Date.now(),
        attempt.remainingMs(commandTimeout)
      );
      if (remaining <= 0) throw new Error("owned_command_deadline_exhausted");
      return command(operation, remaining);
    };
    return command(async () => {
      const files = [];
      async function walk(directory) {
        for (const name of (
          await artifactOperation(() => readdir(directory))
        ).sort()) {
          const file = path.join(directory, name);
          const stat = await artifactOperation(() => lstat(file));
          assert(!stat.isSymbolicLink(), "candidate_artifact_alias");
          if (stat.isDirectory()) await walk(file);
          else if (stat.isFile())
            files.push({
              path: path.relative(dist, file),
              sha256: createHash("sha256")
                .update(await artifactOperation(() => readFile(file)))
                .digest("hex"),
            });
        }
      }
      try {
        await walk(dist);
      } catch (error) {
        if (error.code === "ENOENT")
          throw new Error("candidate_artifact_missing");
        throw error;
      }
      for (const required of ["main.cjs", "preload.js", "renderer/index.html"])
        assert(
          files.some((file) => file.path === required),
          "candidate_artifact_missing"
        );
      return {
        sha256: createHash("sha256")
          .update(JSON.stringify(files))
          .digest("hex"),
        files,
      };
    });
  }
  await mkdir(values.output, { recursive: true, mode: 0o700 });
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const canonicalState = await realpath(stateRoot);
  assert(
    path
      .relative(await realpath(root), canonicalState)
      .startsWith(`..${path.sep}`),
    "acceptance_state_outside_checkout_required"
  );
  const registryRoot = path.join(canonicalState, "history-registry");
  try {
    attempt = await beginNativeAttempt({
      output: values.output,
      historyRoot: canonicalHistory,
      registryRoot,
      identity: {
        effort: values.effort.trim(),
        scenario: ["relay-transfer", "relay-pairing"].includes(selectedScenario)
          ? `${scenarioIdentity}:${expectedDiscovery.href}`
          : scenarioIdentity,
        environment: {
          host: os.hostname(),
          platform: process.platform,
          architecture: process.arch,
          runtime: "electron",
        },
      },
      renewal: values.renewal,
      successor: values.successor,
      importHistory: values["import-history"],
      verifyTarget: verifyPreviousTarget,
      scenario: scenarioIdentity,
      change: values["diagnostic-change"],
      expectation: values["expected-observation"],
      // The initial build and normal acceptance are outside diagnostic time. The
      // helper starts the clock when this first attempt records a failure.
      deferDiagnosticClockUntilFailure: true,
    });
  } catch (error) {
    console.error(error.message);
    throw error;
  }
  const evidenceDirectory = attempt.directory;
  let profileLock;
  let log;
  let logFailure;
  const logWrites = [];
  const runner = path.join(evidenceDirectory, "launch.cjs");
  const nativeObservationFile = path.join(
    evidenceDirectory,
    "required-native.json"
  );
  const receipt = {
    startedAt: new Date().toISOString(),
    runtime: "actual-electron",
    enforcedTransport: values.transport,
    clipboard: "isolated-memory-native-boundary",
    clipboardScope: {
      hostUsed: false,
      hostChanged: false,
      restoration: "not-requested",
    },
    stage: values["candidate-record"] ? "frozen-candidate" : "build",
    classification: "prerequisite",
    mode:
      selectedScenario === "readiness" ? "readiness-only" : selectedScenario,
    result: "not-run",
    loginFlow: "not-observed-by-runner",
    environmentLabel: values.environment,
    attemptedObservation:
      values["expected-observation"] ??
      "owned Electron startup and native filter interaction",
    recoveryAction:
      "inspect classified failure and record a changed diagnosis before retry",
  };
  let electron;
  let ownedProcess;
  let launchIntentRecorded = false;
  let frozenCandidate;
  function processIdentity(
    pid,
    timeoutMs = attempt.remainingMs(Math.min(1000, commandTimeout))
  ) {
    if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)
      return null;
    const observation = spawnSync(
      "ps",
      [
        "-p",
        String(pid),
        "-o",
        "ppid=",
        "-o",
        "pgid=",
        "-o",
        "lstart=",
        "-o",
        "command=",
      ],
      { encoding: "utf8", timeout: Math.max(1, timeoutMs) }
    );
    const value = observation.stdout?.trim();
    if (observation.status !== 0 || !value) return null;
    return value;
  }
  // Only an unresolved canonical target needs this bounded current observation.
  // Missing launch identity is unknown until its worker is gone and the unique
  // launch marker is absent now; no historical descendant claim is made.
  function verifyPreviousTarget(target) {
    const deadline = Date.now() + Math.min(commandTimeout, 1000);
    const remaining = () => Math.max(0, deadline - Date.now());
    const absent = (pid) => {
      if (!Number.isSafeInteger(pid) || pid <= 1) return false;
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        return error.code === "ESRCH";
      }
    };
    if (!target.marker || !Number.isSafeInteger(target.runnerPid)) return false;
    if (Number.isSafeInteger(target.childPid)) {
      if (absent(target.childPid)) return true;
      if (remaining() <= 0) return false;
      const state = spawnSync(
        "ps",
        ["-p", String(target.childPid), "-o", "stat="],
        { encoding: "utf8", timeout: remaining(), maxBuffer: 1024 }
      );
      if (state.status === 0 && /^Z/.test(state.stdout.trim())) return true;
      if (remaining() <= 0) return false;
      const current = processIdentity(target.childPid, remaining());
      if (current?.includes(target.marker)) return false;
      if (current && target.identity) {
        const currentStart = current.split(/\s+/).slice(2, 7).join(" ");
        const recordedStart = target.identity
          .split(/\s+/)
          .slice(2, 7)
          .join(" ");
        if (currentStart && recordedStart && currentStart !== recordedStart)
          return true;
      }
      // A changed command/parent alone is not proof of PID replacement.
      return false;
    }
    let workerAbsent = absent(target.runnerPid);
    if (!workerAbsent && target.runnerFingerprint && remaining() > 0) {
      const observed = spawnSync(
        "ps",
        ["-p", String(target.runnerPid), "-o", "lstart=", "-o", "command="],
        { encoding: "utf8", timeout: remaining(), maxBuffer: 1024 * 1024 }
      );
      if (observed.status === 0 && observed.stdout.trim())
        workerAbsent =
          createHash("sha256").update(observed.stdout.trim()).digest("hex") !==
          target.runnerFingerprint;
    }
    if (!workerAbsent || remaining() <= 0) return false;
    const snapshot = spawnSync(
      "ps",
      [
        "-ax",
        "-o",
        "pid=",
        "-o",
        "ppid=",
        "-o",
        "pgid=",
        "-o",
        "lstart=",
        "-o",
        "command=",
      ],
      { encoding: "utf8", timeout: remaining(), maxBuffer: 8 * 1024 * 1024 }
    );
    return (
      snapshot.status === 0 &&
      !snapshot.stdout.split("\n").some((line) => line.includes(target.marker))
    );
  }
  function stillOwned(child, timeoutMs) {
    const current = processIdentity(child.pid, timeoutMs);
    return (
      ownedProcess &&
      current === ownedProcess &&
      Number(current.split(/\s+/)[0]) === process.pid &&
      current.includes(runner) &&
      child.exitCode === null &&
      child.signalCode === null
    );
  }

  async function command(operation, maximum = commandTimeout) {
    const remaining = attempt
      ? attempt.remainingMs(maximum)
      : Math.min(maximum, descriptorDeadline - Date.now());
    assert(remaining > 0, "owned_command_deadline_exhausted");
    let timer;
    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("owned_command_deadline_exhausted")),
            remaining
          );
        }),
      ]);
      attempt?.assertBudget();
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  function boundMethods(target, methods) {
    for (const method of methods) {
      const invoke = target[method].bind(target);
      target[method] = (...args) => command(() => invoke(...args));
    }
    return target;
  }
  async function boundedRegular(file, maximum, reason) {
    const metadata = await command(() => lstat(file));
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.size <= maximum,
      reason
    );
    const handle = await command(() => open(file, "r"));
    try {
      const current = await command(() => handle.stat());
      assert(
        current.isFile() &&
          current.ino === metadata.ino &&
          current.dev === metadata.dev &&
          current.size <= maximum,
        reason
      );
      const bytes = Buffer.alloc(maximum + 1);
      let length = 0;
      for (;;) {
        const result = await command(() =>
          handle.read(bytes, length, bytes.length - length, length)
        );
        length += result.bytesRead;
        assert(length <= maximum, reason);
        if (result.bytesRead === 0) break;
      }
      const after = await command(() => handle.stat());
      assert(
        length === current.size &&
          after.size === current.size &&
          after.ino === current.ino &&
          after.dev === current.dev,
        reason
      );
      return bytes.subarray(0, length);
    } finally {
      await handle.close();
    }
  }
  async function intendedPhysicalPath(target) {
    let prefix = path.resolve(target);
    for (let depth = 0; depth < 128; depth++) {
      try {
        await command(() => lstat(prefix));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        prefix = path.dirname(prefix);
        continue;
      }
      return path.resolve(
        await command(() => realpath(prefix)),
        path.relative(prefix, target)
      );
    }
    throw new Error("candidate_path_unavailable");
  }
  try {
    log = await command(() =>
      open(path.join(evidenceDirectory, "runtime.log"), "a", 0o600)
    );
    if (values["candidate-record"]) {
      const physical = candidateRoot;
      const trustedPath = path.join(
        toolingRoot,
        "scripts/prepare-acceptance-candidate.mjs"
      );
      const applicationVerifier = path.join(
        physical,
        "scripts/prepare-acceptance-candidate.mjs"
      );
      for (const verifier of [trustedPath, applicationVerifier])
        assert(
          (await command(() => realpath(verifier))) === verifier,
          "frozen_candidate_verifier_regular_file_required"
        );
      const trusted = await boundedRegular(
        trustedPath,
        262144,
        "frozen_candidate_verifier_regular_file_required"
      );
      const application = await boundedRegular(
        applicationVerifier,
        262144,
        "frozen_candidate_verifier_regular_file_required"
      );
      const trustedHash = createHash("sha256").update(trusted).digest("hex");
      assert(
        candidateRecord.preparer === trustedHash &&
          createHash("sha256").update(application).digest("hex") ===
            trustedHash,
        "frozen_candidate_verifier_untrusted"
      );
      root = physical;
      dist = path.join(root, "apps/electron/dist");
      receipt.tooling = {
        root: toolingRoot,
        candidate: await sourceIdentity(toolingRoot, {
          remainingMs: (maximum) =>
            attempt.remainingMs(Math.min(commandTimeout, maximum)),
        }),
        scripts: {},
      };
      for (const name of [
        "electron-relay-acceptance.mjs",
        "native-acceptance-attempts.mjs",
        "source-identity.mjs",
        "prepare-acceptance-candidate.mjs",
        ...(selectedScenario === "relay-pairing"
          ? ["relay-pairing-acceptance.mjs"]
          : []),
      ])
        receipt.tooling.scripts[`scripts/${name}`] = createHash("sha256")
          .update(
            await boundedRegular(
              path.join(toolingRoot, "scripts", name),
              262144,
              "bounded_tooling_source_required"
            )
          )
          .digest("hex");
    }
    receipt.candidate = await sourceIdentity(root, {
      remainingMs: (maximum) =>
        attempt.remainingMs(Math.min(commandTimeout, maximum)),
    });
    if (attempt.successorCandidate)
      assert(
        receipt.candidate.revision === attempt.successorCandidate &&
          !receipt.candidate.dirty,
        "successor_candidate_binding_mismatch"
      );
    if (values["candidate-record"]) {
      const record = candidateRecord;
      assert(
        (await command(() => realpath(record.source.checkout))) ===
          (await command(() => realpath(root))),
        "frozen_candidate_checkout_mismatch"
      );
      assert(
        record.source.revision === receipt.candidate.revision &&
          !receipt.candidate.dirty,
        "frozen_candidate_source_mismatch"
      );
      assert(
        record.scenario.id === scenarioIdentity &&
          record.scenario.runner === "scripts/electron-relay-acceptance.mjs",
        "frozen_candidate_scenario_mismatch"
      );
      const verification = spawnSync(
        process.execPath,
        [
          path.join(toolingRoot, "scripts/prepare-acceptance-candidate.mjs"),
          "verify",
          "--record",
          values["candidate-record"],
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: attempt.remainingMs(commandTimeout),
          maxBuffer: 2 * 1024 * 1024,
        }
      );
      if (verification.error?.code === "ETIMEDOUT")
        throw new Error("owned_command_deadline_exhausted");
      assert(
        verification.status === 0,
        `frozen_candidate_invalid: ${verification.stderr ?? ""}`
      );
      frozenCandidate = JSON.parse(verification.stdout.trim());
      const expectedArtifact = createHash("sha256")
        .update(
          JSON.stringify({
            application: record.artifacts,
            runtime: record.runtimeArtifacts,
          })
        )
        .digest("hex");
      assert(
        frozenCandidate.verified === true &&
          frozenCandidate.checkout === root &&
          frozenCandidate.revision === record.source.revision &&
          frozenCandidate.runtime === "electron" &&
          frozenCandidate.scenario === record.scenario.id &&
          frozenCandidate.artifact === expectedArtifact &&
          frozenCandidate.runtimeVersion === record.runtimeVersion,
        "frozen_candidate_verification_invalid"
      );
      const runtimePath = record.runtimeArtifacts?.electron?.path;
      assert(
        typeof runtimePath === "string" &&
          !path.isAbsolute(runtimePath) &&
          runtimePath.length <= 4096,
        "frozen_candidate_verification_invalid"
      );
      const runtimeRoot = path.resolve(root, runtimePath);
      const runtimeDist = path.join(runtimeRoot, "dist");
      const within = (base, target) => {
        const relative = path.relative(base, target);
        return (
          !path.isAbsolute(relative) &&
          relative !== ".." &&
          !relative.startsWith(`..${path.sep}`)
        );
      };
      assert(
        within(root, runtimeRoot) &&
          (await command(() => realpath(runtimeRoot))) === runtimeRoot &&
          (await command(() => realpath(runtimeDist))) === runtimeDist,
        "frozen_candidate_verification_invalid"
      );
      const markerPath = path.join(runtimeRoot, "path.txt");
      const executableName = (
        await boundedRegular(
          markerPath,
          4096,
          "frozen_candidate_verification_invalid"
        )
      )
        .toString("utf8")
        .trim();
      const expectedExecutable = path.resolve(runtimeDist, executableName);
      assert(
        executableName &&
          within(root, expectedExecutable) &&
          within(runtimeDist, expectedExecutable) &&
          expectedExecutable !== runtimeDist &&
          frozenCandidate.executable === expectedExecutable &&
          (await command(() => realpath(expectedExecutable))) ===
            expectedExecutable,
        "frozen_candidate_verification_invalid"
      );
      receipt.frozenCandidate = {
        checkout: root,
        record: values["candidate-record"],
        revision: frozenCandidate.revision,
        artifact: frozenCandidate.artifact,
        scenario: frozenCandidate.scenario,
        runtimeVersion: frozenCandidate.runtimeVersion,
      };
      const files = Object.entries(record.artifacts)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, sha256]) => ({ path: name, sha256 }));
      for (const required of ["main.cjs", "preload.js", "renderer/index.html"])
        assert(
          files.some((file) => file.path === required),
          "candidate_artifact_missing"
        );
      receipt.build = {
        command: "frozen-candidate-no-rebuild",
        artifacts: {
          files,
          sha256: createHash("sha256")
            .update(JSON.stringify(files))
            .digest("hex"),
        },
      };
    } else {
      await command(() => rm(dist, { recursive: true, force: true }));
      attempt.assertBudget();
      const build = spawnSync(
        "npm",
        ["--workspace", "apps/electron", "run", "build"],
        {
          cwd: root,
          timeout: attempt.remainingMs(180_000),
          stdio: ["ignore", log.fd, log.fd],
        }
      );
      assert.equal(build.status, 0, "candidate_build_failed");
      receipt.build = {
        command: "npm --workspace apps/electron run build",
        artifacts: await artifactIdentity(),
      };
      assert.deepEqual(
        await sourceIdentity(root, {
          remainingMs: (maximum) =>
            attempt.remainingMs(Math.min(commandTimeout, maximum)),
        }),
        receipt.candidate,
        "candidate_source_changed_during_build"
      );
    }
    attempt.assertBudget();
    if (relayHooks)
      await command(
        () =>
          relayHooks.beforeNative({
            attempt,
            revision: receipt.candidate.revision,
          }),
        relayHooks.maximumMs
      );
    await command(() =>
      mkdir(values.profile, { recursive: true, mode: 0o700 })
    );
    const profileLockPath = path.join(
      values.profile,
      ".clipp-relay-acceptance.lock"
    );
    const profileAdmissionPath = `${profileLockPath}.admission`;
    const profileAdmission = await command(() =>
      open(profileAdmissionPath, "wx", 0o600)
    );
    try {
      try {
        const prior = JSON.parse(
          await command(() => readFile(profileLockPath, "utf8"))
        );
        const absent = (pid) => {
          try {
            process.kill(pid, 0);
            return false;
          } catch (error) {
            return error.code === "ESRCH";
          }
        };
        const verifiedCanonical =
          prior.marker && attempt.clearedTarget?.marker === prior.marker;
        if (!verifiedCanonical) {
          assert(
            Number.isSafeInteger(prior.runnerPid) && absent(prior.runnerPid),
            "owned_profile_active_or_uncertain"
          );
          assert(
            prior.state === "prepared" || verifyPreviousTarget(prior),
            "owned_profile_active_or_uncertain"
          );
        }
        await command(() => unlink(profileLockPath));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      profileLock = await command(() => open(profileLockPath, "wx", 0o600));
      await command(() =>
        profileLock.writeFile(
          JSON.stringify({
            runnerPid: process.pid,
            state: "prepared",
            marker: runner,
          })
        )
      );
    } finally {
      await command(() => profileAdmission.close());
      await command(() => unlink(profileAdmissionPath));
    }

    const nativePreparation = frozenCandidate
      ? `if (!require(${JSON.stringify(path.join(root, "scripts/electron-required-native.cjs"))})(${JSON.stringify({ root, expected: { runtimeVersion: frozenCandidate.runtimeVersion, moduleAbi: frozenCandidate.moduleAbi, executable: frozenCandidate.executable, platform: process.platform, architecture: process.arch }, output: nativeObservationFile })})) { app.exit(1); } else `
      : "";
    // Replace only the clipboard boundary: never read or write the host clipboard.
    await command(() =>
      writeFile(
        runner,
        `const { app, clipboard } = require('electron');\napp.setName(${JSON.stringify(values["app-name"])});\nlet memoryClipboard = '';\nclipboard.readText = () => memoryClipboard;\nclipboard.writeText = (text) => { memoryClipboard = text; };\n${nativePreparation}require(${JSON.stringify(path.join(root, "apps/electron/dist/main.cjs"))});\n`,
        { mode: 0o600 }
      )
    );
    receipt.stage = frozenCandidate ? "required-native" : "launch";
    receipt.classification = frozenCandidate ? "prerequisite" : "runner";
    const targetOwnership = {
      runnerPid: process.pid,
      profile: await command(() => realpath(values.profile)),
      marker: runner,
    };
    await command(() =>
      attempt.recordTarget({ ...targetOwnership, state: "launch-intent" })
    );
    launchIntentRecorded = true;
    await command(() => profileLock.truncate(0));
    await command(() =>
      profileLock.write(
        JSON.stringify({ ...targetOwnership, state: "launch-intent" }),
        0,
        "utf8"
      )
    );
    electron = await _electron.launch({
      ...(frozenCandidate
        ? { executablePath: frozenCandidate.executable }
        : {}),
      args: [runner],
      cwd: root,
      env: {
        ...process.env,
        CLIPP_LOG_LEVEL: "error",
        CLIPP_RELAY_ACCEPTANCE_TRANSPORT: values.transport,
        CLIPP_RELAY_ACCEPTANCE_PROFILE: await command(() =>
          realpath(values.profile)
        ),
        VITE_DEV_SERVER_URL: "",
      },
      timeout: attempt.remainingMs(Math.min(30_000, commandTimeout)),
    });
    const launchedTarget = {
      ...targetOwnership,
      state: "launched",
      childPid: electron.process().pid,
    };
    await command(() => attempt.recordTarget(launchedTarget));
    if (frozenCandidate) {
      receipt.requiredNative = JSON.parse(
        await command(() => readFile(nativeObservationFile, "utf8"))
      );
      assert(
        receipt.requiredNative.result === "passed",
        receipt.requiredNative.reason ?? "required_native_module_load_failed"
      );
    }
    receipt.classification = "runner";
    ownedProcess = processIdentity(electron.process().pid);
    await command(() =>
      attempt.recordTarget({ ...launchedTarget, identity: ownedProcess })
    );
    await command(() => profileLock.truncate(0));
    await command(() =>
      profileLock.write(
        JSON.stringify({
          runnerPid: process.pid,
          childPid: electron.process().pid,
          state: "launched",
          identity: ownedProcess,
          marker: runner,
        }),
        0,
        "utf8"
      )
    );
    receipt.processOwnership = {
      pid: electron.process().pid,
      identityObserved: Boolean(ownedProcess),
      groupId: ownedProcess ? Number(ownedProcess.split(/\s+/)[1]) : null,
      isolatedGroup: ownedProcess
        ? Number(ownedProcess.split(/\s+/)[1]) === electron.process().pid
        : null,
      scope: "direct-child-handle; detached descendants not proven absent",
    };
    boundMethods(electron, ["evaluate", "firstWindow", "browserWindow"]);
    electron.process().stdout?.on("data", (chunk) => {
      logWrites.push(
        log.write(chunk).catch((error) => {
          logFailure = error;
        })
      );
    });
    electron.process().stderr?.on("data", (chunk) => {
      logWrites.push(
        log.write(chunk).catch((error) => {
          logFailure = error;
        })
      );
    });
    receipt.stage = frozenCandidate ? "product-startup" : "target";
    if (frozenCandidate) receipt.classification = "unknown";
    const page = await electron.firstWindow({
      timeout: attempt.remainingMs(Math.min(30_000, commandTimeout)),
    });
    page.setDefaultTimeout(
      attempt.remainingMs(Math.min(10_000, commandTimeout))
    );
    boundMethods(page, ["evaluate", "waitForFunction"]);
    const window = await electron.browserWindow(page);
    boundMethods(window, ["evaluate"]);
    const target = await electron.evaluate(
      ({ app }, expected) => ({
        pid: process.pid,
        executable: process.execPath,
        profile: app.getPath("userData"),
        launchArgumentMatches: process.argv.includes(expected.runner),
      }),
      { runner }
    );
    const ownedWindow = await window.evaluate((win) => ({
      windowId: win.id,
      webContentsId: win.webContents.id,
      rendererPid: win.webContents.getOSProcessId(),
      url: win.webContents.getURL(),
    }));
    receipt.target = { ...target, ...ownedWindow };
    if (frozenCandidate)
      assert(
        path.resolve(target.executable) ===
          (await command(() => realpath(frozenCandidate.executable))),
        "frozen_candidate_runtime_mismatch"
      );
    assert(
      target.pid === electron.process().pid &&
        target.launchArgumentMatches &&
        path.resolve(target.profile) ===
          (await command(() => realpath(values.profile))) &&
        ownedWindow.url ===
          pathToFileURL(
            path.join(root, "apps/electron/dist/renderer/index.html")
          ).href,
      "owned_target_mismatch"
    );
    receipt.platform = await electron.evaluate(({ safeStorage }) => ({
      os: process.platform,
      osVersion: process.getSystemVersion(),
      architecture: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      osEncryptionAvailable: safeStorage.isEncryptionAvailable(),
      storageProvider:
        typeof safeStorage.getSelectedStorageBackend === "function"
          ? safeStorage.getSelectedStorageBackend()
          : "not-exposed",
    }));
    receipt.stage = "interaction";
    await page.waitForFunction(
      () => typeof window.clipp?.getState === "function",
      null,
      { timeout: attempt.remainingMs(10_000) }
    );
    if (frozenCandidate)
      receipt.productStartup = {
        entry: "apps/electron/dist/main.cjs",
        ownedWindowObserved: true,
        publicBridgeUsable: true,
      };
    receipt.classification = "runner";
    await electron.evaluate(async ({ app }) => {
      if (process.platform === "darwin") await app.dock?.show();
      app.focus({ steal: true });
    });
    await window.evaluate((win) => {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.focus();
    });
    const checkFocus = async () => {
      const focused = await window.evaluate(
        (win) =>
          !win.isDestroyed() &&
          win.isVisible() &&
          !win.isMinimized() &&
          win.isFocused()
      );
      const focusedId = await electron.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id
      );
      assert(
        focused &&
          focusedId === ownedWindow.windowId &&
          (await page.evaluate(() => document.hasFocus())),
        "owned_window_not_focused"
      );
    };
    // Activation is asynchronous on native desktops. Wait for its observable
    // result, then require ownership again before and after each input event.
    const focusDeadline = Date.now() + attempt.remainingMs(5_000);
    for (;;) {
      try {
        await checkFocus();
        break;
      } catch (error) {
        if (Date.now() >= focusDeadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const nativeClick = async (locator) => {
      const box = await command(() =>
        locator.boundingBox({
          timeout: attempt.remainingMs(Math.min(10_000, commandTimeout)),
        })
      );
      assert(box, "interaction_control_unavailable");
      await checkFocus();
      await window.evaluate(
        (win, point) => {
          win.webContents.sendInputEvent({ type: "mouseMove", ...point });
          win.webContents.sendInputEvent({
            type: "mouseDown",
            button: "left",
            clickCount: 1,
            ...point,
          });
          win.webContents.sendInputEvent({
            type: "mouseUp",
            button: "left",
            clickCount: 1,
            ...point,
          });
        },
        {
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        }
      );
      await checkFocus();
    };
    // The preload bridge can be ready before React mounts its History shell.
    // Distinguish that transient absence from a mounted legacy layout.
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-session-focus="history-filters"], [data-session-scroll="history"]'
        ) ||
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent?.trim() === "Pinned" &&
            button.getClientRects().length > 0
        ),
      null,
      { timeout: attempt.remainingMs(10_000) }
    );
    // The persisted workspace may open on another destination. Use its public
    // navigation before looking for History controls; legacy layouts need no step.
    const historyNavigation = page.locator(
      '[data-session-focus="destination:history"]'
    );
    if (await command(() => historyNavigation.count())) {
      if (
        (await command(() =>
          historyNavigation.getAttribute("aria-current")
        )) !== "page"
      )
        await nativeClick(historyNavigation);
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-session-focus="destination:history"]')
            ?.getAttribute("aria-current") === "page",
        null,
        { timeout: attempt.remainingMs(10_000) }
      );
      await checkFocus();
    }
    // Short native windows collapse Filters. Opening the ordinary toggle keeps
    // the same native-input and ownership proof used by the Pinned/All checks.
    const filtersToggle = page.locator(
      '[data-session-focus="history-filters"]'
    );
    if (await command(() => filtersToggle.count())) {
      const expanded = await command(() =>
        filtersToggle.getAttribute("aria-expanded")
      );
      assert(
        ["true", "false"].includes(expanded),
        "history_filters_state_unavailable"
      );
      if (expanded === "false") await nativeClick(filtersToggle);
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-session-focus="history-filters"]')
            ?.getAttribute("aria-expanded") === "true",
        null,
        { timeout: attempt.remainingMs(10_000) }
      );
      await checkFocus();
    }
    for (const label of ["Pinned", "All"]) {
      await nativeClick(page.getByRole("button", { name: label, exact: true }));
      await page.waitForFunction(
        (text) =>
          [...document.querySelectorAll("button")].some(
            (button) =>
              button.textContent?.trim() === text &&
              button.classList.contains("active")
          ),
        label,
        { timeout: attempt.remainingMs(10_000) }
      );
      await checkFocus();
    }
    assert.equal(
      (await artifactIdentity()).sha256,
      receipt.build.artifacts.sha256,
      "candidate_build_changed_during_run"
    );
    assert.deepEqual(
      await sourceIdentity(root, {
        remainingMs: (maximum) =>
          attempt.remainingMs(Math.min(commandTimeout, maximum)),
      }),
      receipt.candidate,
      "candidate_source_changed_during_run"
    );
    receipt.readiness = {
      ownedWindowFocused: true,
      interaction: "native-history-filter-pinned-and-all",
      passed: true,
    };
    attempt.assertBudget();
    if (selectedScenario === "readiness") {
      receipt.result = "passed";
      receipt.classification = "none";
    } else if (
      ["clipboard-history", "relay-pairing"].includes(selectedScenario)
    ) {
      receipt.stage = "clipboard-history";
      receipt.classification = "product";
      const initial = await page.evaluate(() => window.clipp.getState());
      const baseline = new Set(initial.clips.map((clip) => clip.id));
      const marker = `clipp-native-local-${randomUUID()}`;
      await electron.evaluate(
        ({ clipboard }, text) => clipboard.writeText(text),
        marker
      );
      const observePublicState = async (select, reason) => {
        const deadline =
          Date.now() + attempt.remainingMs(Math.min(timeout, 10_000));
        while (Date.now() < deadline) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          const state = await command(
            () => page.evaluate(() => window.clipp.getState()),
            Math.min(commandTimeout, remaining)
          );
          if (Date.now() > deadline) break;
          const observation = select(state);
          if (observation) return observation;
          const pause = Math.min(50, deadline - Date.now());
          if (pause > 0)
            await new Promise((resolve) => setTimeout(resolve, pause));
        }
        throw new Error(reason);
      };
      const captured = await observePublicState(
        (state) =>
          state.clips.find(
            (clip) =>
              !baseline.has(clip.id) &&
              clip.content === marker &&
              clip.originPeerId === state.identity.deviceId
          ),
        "local_clip_capture_failed"
      );
      const card = page
        .locator("article.history-card")
        .filter({ hasText: marker });
      await nativeClick(card.getByTitle(/^Pin(?: Clip)?$/, { exact: true }));
      await observePublicState(
        (state) => (state.pinnedIds.includes(captured.id) ? state : null),
        "local_pin_state_failed"
      );
      await nativeClick(
        page.getByRole("button", { name: "Pinned", exact: true })
      );
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("button")].some(
            (button) =>
              button.textContent?.trim() === "Pinned" &&
              button.classList.contains("active")
          ),
        null,
        { timeout: attempt.remainingMs(10_000) }
      );
      await command(() =>
        card.waitFor({ state: "visible", timeout: attempt.remainingMs(10_000) })
      );
      const persisted = await page.evaluate(() => window.clipp.getState());
      assert(
        persisted.identity.deviceId === initial.identity.deviceId &&
          persisted.pinnedIds.includes(captured.id) &&
          persisted.clips.some((clip) => clip.id === captured.id),
        "local_pin_state_failed"
      );
      receipt.behavior = {
        scenario: "clipboard-history",
        localClipCaptured: true,
        nativePinObserved: true,
        pinnedFilterVisible: true,
        persistedPublicState: true,
        passed: true,
      };
      if (selectedScenario === "relay-pairing") {
        receipt.stage = "relay-pairing";
        receipt.classification = "unknown";
        receipt.pairing = await command(
          () =>
            relayHooks.onReady({
              attempt,
              bounded: command,
              readState: () => page.evaluate(() => window.clipp.getState()),
              copyTarget: () =>
                electron.evaluate(({ clipboard }) => clipboard.readText()),
              async click(name, selector, { ifPresent = false } = {}) {
                await electron.evaluate(({ app }) => {
                  app.focus({ steal: true });
                });
                await window.evaluate((win) => {
                  win.show();
                  win.restore();
                  win.focus();
                  win.webContents.focus();
                });
                const end = Date.now() + attempt.remainingMs(5000);
                for (;;) {
                  try {
                    await checkFocus();
                    break;
                  } catch (error) {
                    if (Date.now() >= end) throw error;
                    await new Promise((done) => setTimeout(done, 50));
                  }
                }
                const control = selector
                  ? page
                      .locator(selector)
                      .getByRole("button", { name, exact: true })
                  : page.getByRole("button", {
                      name:
                        name === "Requests"
                          ? /^Requests(?:\s*(?:\((?:\d+|loading|unavailable)\)|active requests))?$/
                          : name,
                      exact: true,
                    });
                if (ifPresent) {
                  const count = await command(() => control.count());
                  assert(count <= 1, "pairing_close_control_ambiguous");
                  if (count === 0) return;
                }
                await nativeClick(control);
              },
            }),
          relayHooks.maximumMs
        );
      }
      receipt.result = "passed";
      receipt.classification = "none";
    } else {
      receipt.stage = "relay-transfer";
      receipt.classification = "unknown";
      const initial = await page.evaluate(() => window.clipp.getState());
      const baseline = new Set(initial.clips.map((clip) => clip.id));
      const originalIdentity = initial.identity.deviceId;
      console.log(
        "Electron acceptance ready. Sign in through the visible UI if required, then send the specified marker from a paired peer."
      );
      const deadline = Date.now() + attempt.remainingMs(timeout);
      let previousStatuses;
      while (Date.now() < deadline) {
        attempt.assertBudget();
        const state = await page.evaluate(() => window.clipp.getState());
        assert.equal(
          state.identity.deviceId,
          originalIdentity,
          "identity_changed"
        );
        const states = state.managedRelayStates;
        const statuses = JSON.stringify(states.map((relay) => relay.status));
        if (statuses !== previousStatuses) {
          console.log(`Managed relay states: ${statuses}`);
          previousStatuses = statuses;
          receipt.lastRelayStatuses = states.map((relay) => relay.status);
        }
        const relayPeers = new Set(
          states.map((relay) => relay.peerId).filter(Boolean)
        );
        // The current public bridge includes managed server connections in its
        // peer summaries. Server connections are expected to be direct; only
        // device connections must all be circuits.
        assert(
          !state.peerConnections.some(
            (connection) =>
              !relayPeers.has(connection.peerId) && connection.hasDirect
          ),
          "direct_peer_connection_detected"
        );
        const received = state.clips.find(
          (clip) =>
            !baseline.has(clip.id) &&
            clip.content === values["expect-clip"] &&
            clip.originPeerId !== originalIdentity
        );
        const applied = await electron.evaluate(
          ({ clipboard }, marker) => clipboard.readText() === marker,
          values["expect-clip"]
        );
        if (received && applied) {
          const expectedKeys = new Set(
            state.managedRelayConfigurations
              .filter(
                (config) =>
                  config.kind === "managed" &&
                  config.discoveryUrl === expectedDiscovery.href
              )
              .map((config) => config.key)
          );
          const ready = states.filter(
            (relay) =>
              relay.kind === "managed" &&
              relay.status === "ready" &&
              expectedKeys.has(relay.key)
          );
          assert(ready.length > 0, "managed_relay_not_ready");
          const source = state.peerConnections.find(
            (connection) => connection.peerId === received.originPeerId
          );
          assert(
            source?.hasRelay && !source.hasDirect,
            "source_circuit_path_not_observed"
          );
          const carryingRelay = ready.find((relay) =>
            source.addrs.some((address) =>
              address.includes(`/p2p/${relay.peerId}/p2p-circuit/`)
            )
          );
          assert(carryingRelay, "managed_circuit_path_not_observed");
          const server = state.peerConnections.find(
            (connection) => connection.peerId === carryingRelay.peerId
          );
          assert(
            server?.addrs.some((address) => {
              if (values.transport === "wss")
                return /\/(?:wss|tls\/ws)\//.test(address);
              if (values.transport === "webrtc-direct")
                return address.includes("/webrtc-direct/");
              return /\/tcp\/\d+\/p2p\//.test(address);
            }),
            "selected_relay_server_transport_not_observed"
          );
          receipt.result = "passed";
          receipt.classification = "none";
          receipt.newRemoteClipReceived = true;
          receipt.liveClipboardApplied = true;
          receipt.circuitConnectionObserved = true;
          receipt.selectedRelayServerTransportObserved = true;
          receipt.authenticatedReservationAndRendezvousReady = true;
          receipt.directPeerConnections = 0;
          receipt.deviceIdentityPreserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      assert.equal(receipt.result, "passed", "relay_clip_receipt_timeout");
      console.log(
        "Clip checks passed; waiting for the owned Electron process to close."
      );
    }
  } catch (caughtError) {
    let error = caughtError;
    let nativeObservationUnavailable = false;
    if (frozenCandidate && receipt.stage === "required-native") {
      try {
        const observation = JSON.parse(
          await command(() => readFile(nativeObservationFile, "utf8"))
        );
        assert(
          observation?.runtime &&
            Array.isArray(observation.required) &&
            ["passed", "failed"].includes(observation.result),
          "native_observation_invalid"
        );
        if (observation.result === "failed") {
          assert(
            [
              "required_native_module_missing",
              "required_native_abi_mismatch",
              "required_native_module_load_failed",
              "required_native_wrong_candidate",
              "frozen_candidate_runtime_mismatch",
            ].includes(observation.reason),
            "native_observation_invalid"
          );
          receipt.stage = "required-native";
          receipt.classification = "prerequisite";
          error = new Error(observation.reason);
        } else {
          receipt.stage = "product-startup";
          receipt.classification = "unknown";
        }
        receipt.requiredNative = observation;
      } catch {
        delete receipt.requiredNative;
        nativeObservationUnavailable = true;
        receipt.stage = "launch";
        receipt.classification = "runner";
        receipt.recoveryAction =
          "check GUI access and owned Electron launch diagnostics before a changed retry; preserve this failed attempt";
      }
    }
    receipt.result = "failed";
    if (receipt.stage === "frozen-candidate")
      receipt.recoveryAction =
        "prepare a successor from committed source with the maintained candidate command; preserve this failed record";
    if (receipt.stage === "required-native")
      receipt.recoveryAction =
        "inspect the owning-runtime loader failure, fix reproducible setup and prepare a successor; preserve this failed record";
    const safeReasons = [
      "local_clip_capture_failed",
      "local_pin_state_failed",
      "required_native_module_missing",
      "required_native_abi_mismatch",
      "required_native_module_load_failed",
      "required_native_wrong_candidate",
      "bounded_candidate_record_required",
      "frozen_candidate_record_invalid",
      "frozen_candidate_verifier_regular_file_required",
      "frozen_candidate_verifier_untrusted",
      "frozen_candidate_verification_invalid",
      "durable_evidence_outside_candidate_required",
      "candidate_path_unavailable",
      "frozen_candidate_checkout_mismatch",
      "frozen_candidate_source_mismatch",
      "frozen_candidate_scenario_mismatch",
      "frozen_candidate_invalid",
      "frozen_candidate_runtime_mismatch",
      "owned_target_active_or_uncertain",
      "owned_profile_active_or_uncertain",
      "owned_command_deadline_exhausted",
      "successor_candidate_binding_mismatch",
      "candidate_build_failed",
      "candidate_artifact_missing",
      "candidate_artifact_alias",
      "candidate_source_unavailable",
      "candidate_source_changed_during_build",
      "candidate_source_changed_during_run",
      "candidate_build_changed_during_run",
      "owned_target_mismatch",
      "owned_window_not_focused",
      "interaction_control_unavailable",
      "diagnostic_time_budget_exhausted",
      "identity_changed",
      "direct_peer_connection_detected",
      "managed_relay_not_ready",
      "source_circuit_path_not_observed",
      "managed_circuit_path_not_observed",
      "selected_relay_server_transport_not_observed",
      "relay_clip_receipt_timeout",
    ];
    receipt.reason = nativeObservationUnavailable
      ? "native_observation_unavailable"
      : (safeReasons.find(
          (reason) =>
            typeof error?.message === "string" &&
            error.message.startsWith(reason)
        ) ??
        (receipt.stage === "interaction"
          ? "readiness_interaction_failed"
          : receipt.stage === "product-startup"
            ? "product_startup_unavailable"
            : "runtime_or_receipt_gate_failed"));
    if (
      [
        "identity_changed",
        "direct_peer_connection_detected",
        "managed_relay_not_ready",
        "source_circuit_path_not_observed",
        "managed_circuit_path_not_observed",
        "selected_relay_server_transport_not_observed",
      ].includes(receipt.reason)
    )
      receipt.classification = "product";
    if (
      [
        "owned_target_mismatch",
        "owned_window_not_focused",
        "interaction_control_unavailable",
        "owned_command_deadline_exhausted",
      ].includes(receipt.reason)
    )
      receipt.classification = "runner";
    if (receipt.reason === "diagnostic_time_budget_exhausted")
      receipt.classification = "runner";
    const safeClasses = [
      "Error",
      "AssertionError",
      "TypeError",
      "ReferenceError",
      "TimeoutError",
    ];
    receipt.errorClass = safeClasses.includes(error?.name)
      ? error.name
      : "UnknownError";
    // Exception detail is diagnostic evidence, never part of the public receipt.
    // It can contain native/runtime context; preserve it only in private artifacts.
    const failure = await open(
      path.join(evidenceDirectory, "failure.private.json"),
      "w",
      0o600
    );
    try {
      await failure.chmod(0o600);
      await failure.writeFile(
        JSON.stringify(
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : { name: "NonErrorThrown" },
          null,
          2
        ) + "\n"
      );
    } finally {
      await failure.close();
    }
    console.error(
      "Electron acceptance failed; inspect the private runtime log and receipt."
    );
    process.exitCode = 1;
  } finally {
    receipt.cleanupStartedAt = new Date().toISOString();
    const cleanupDeadline = Date.now() + cleanupTimeout;
    let exitObserved = !launchIntentRecorded;
    const cleanupRemaining = () => Math.max(0, cleanupDeadline - Date.now());
    const cleanupStep = async (operation, maximum = cleanupRemaining()) => {
      const remaining = Math.min(maximum, cleanupRemaining());
      if (remaining <= 0)
        throw new Error("owned_test_cleanup_deadline_exhausted");
      let timer;
      try {
        return await Promise.race([
          operation(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("owned_test_cleanup_deadline_exhausted")),
              remaining
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const failCleanup = (reason) => {
      receipt.cleanup = {
        ...receipt.cleanup,
        result: "failed",
        classification: "runner",
        reason,
      };
      if (receipt.result === "passed") {
        receipt.stage = "cleanup";
        receipt.classification = "runner";
        receipt.reason = reason;
      }
      receipt.result = "failed";
      process.exitCode = 1;
    };
    try {
      if (electron) {
        const child = electron.process();
        const exited = new Promise((resolve) => {
          const observe = (code, signal) => {
            exitObserved = true;
            resolve(code === 0 && signal === null);
          };
          if (child.exitCode !== null || child.signalCode !== null)
            observe(child.exitCode, child.signalCode);
          else child.once("exit", observe);
        });
        let closed = false;
        try {
          closed = await cleanupStep(
            () =>
              Promise.race([
                Promise.resolve()
                  .then(() => electron.close())
                  .then(
                    () => exited,
                    () => exited
                  ),
                exited,
              ]),
            Math.max(1, Math.floor(cleanupTimeout * 0.6))
          );
        } catch {
          closed = false;
        }
        receipt.shutdown = closed
          ? "graceful"
          : exitObserved
            ? "failed-owned-process"
            : "uncertain-owned-process";
        if (!closed) {
          failCleanup(
            exitObserved
              ? "owned_test_shutdown_failed"
              : "owned_test_shutdown_timeout"
          );
          if (!exitObserved) {
            if (
              cleanupRemaining() > 0 &&
              stillOwned(child, Math.min(1000, cleanupRemaining()))
            ) {
              const accepted = child.kill("SIGKILL");
              receipt.cleanup.termination = accepted
                ? "verified-owned-child-signalled"
                : "verified-owned-child-signal-rejected";
              if (accepted && cleanupRemaining() > 0) {
                try {
                  await cleanupStep(
                    () => exited,
                    Math.max(1, Math.floor(cleanupRemaining() * 0.6))
                  );
                } catch {
                  /* Retain uncertainty if exit was not observed. */
                }
              }
            } else
              receipt.cleanup.termination = "ownership_uncertain_no_signal";
            receipt.shutdown = exitObserved
              ? "forced-owned-process"
              : "uncertain-owned-process";
          }
        }
      } else {
        receipt.shutdown = launchIntentRecorded
          ? "uncertain-owned-process"
          : "not-launched";
        if (launchIntentRecorded)
          failCleanup("owned_test_launch_ownership_unknown");
      }
      await cleanupStep(() => Promise.all(logWrites));
      await cleanupStep(() => log?.close());
      assert(!logFailure, "owned_test_log_write_failed");
      if (exitObserved) await cleanupStep(() => attempt.clearTarget());
      if (profileLock) {
        await cleanupStep(() => profileLock.close());
        if (exitObserved)
          await cleanupStep(() =>
            unlink(path.join(values.profile, ".clipp-relay-acceptance.lock"))
          );
      }
    } catch (error) {
      failCleanup(
        error.message === "owned_test_cleanup_deadline_exhausted"
          ? error.message
          : "owned_test_cleanup_failed"
      );
      if (electron && !exitObserved)
        receipt.shutdown = "uncertain-owned-process";
    }
    if (electron && !exitObserved) {
      // Stop retaining local observation handles at the cleanup deadline. Keep the
      // profile ownership record; a successor must inspect that current child.
      const child = electron.process();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.channel?.unref();
      child.unref?.();
    }
    receipt.finishedAt = new Date().toISOString();
    if (relayHooks) {
      try {
        await relayHooks.afterCleanup(receipt, { deadline: cleanupDeadline });
      } catch {
        receipt.jointCleanup = "unconfirmed";
        if (receipt.result === "passed") {
          receipt.result = "failed";
          receipt.classification = "runner";
          receipt.reason = "joint_cleanup_unconfirmed";
        }
        process.exitCode = 1;
      }
    }
    await attempt.finish(receipt);
  }

  if (receipt.result === "passed") {
    console.log(
      selectedScenario === "readiness"
        ? "Passed: owned Electron readiness, native interaction and shutdown; relay transfer not tested."
        : selectedScenario === "clipboard-history"
          ? "Passed: frozen Electron local capture, native pinning and owned shutdown; Pairing and relay transfer not tested."
          : selectedScenario === "relay-pairing"
            ? "Passed: joint Chrome–Electron relay Accept, reciprocal Membership and both owned cleanups; broader Pairing matrix untested."
            : "Passed: selected relay transfer and owned Electron shutdown."
    );
  }

  return receipt;
}

if (
  process.argv[1] &&
  pathToFileURL(await realpath(process.argv[1])).href === import.meta.url
) {
  try {
    await runElectronAcceptance(process.argv.slice(2));
  } catch (error) {
    console.error(
      /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "acceptance_input_failed"
    );
    process.exitCode = 1;
  }
}
