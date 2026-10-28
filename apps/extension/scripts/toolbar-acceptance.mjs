/* global chrome */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import {
  raceAcceptanceOperation,
  verifyPopupHistorySearch,
} from "./clipboard-acceptance.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const known = new Set([
  "effort",
  "history-root",
  "output",
  "candidate-record",
  "extension-record",
  "browser-executable",
  "diagnostic-change",
  "expected-observation",
]);
function optionsFor(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    assert(args[index].startsWith("--"), "option_flag_required");
    const name = args[index].replace(/^--/, "");
    assert(options[name] === undefined, "unique_option_value_required");
    if (["validate-only", "freeze-extension"].includes(name))
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
    options.scenario === "toolbar-history",
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
  if (error?.message?.includes("diagnostic_")) return "diagnostic_limit";
  if (error?.message === "toolbar_target_mismatch") return "wrong_target";
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

export async function runToolbarAcceptance(args) {
  const options = optionsFor(args);
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
  const attempt = await beginNativeAttempt({
    output: options.output,
    historyRoot: options["history-root"],
    registryRoot: nativeAcceptanceStateRoot(),
    identity: {
      effort: options.effort,
      scenario: "chrome-toolbar-history",
      environment: {
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        runtime: "chromium",
      },
    },
    scenario: "chrome-toolbar-history",
    change: options["diagnostic-change"],
    expectation: options["expected-observation"],
    deferDiagnosticClockUntilFailure: true,
    verifyTarget: targetGone,
  });
  let stage = "candidate";
  let operation = "verify_frozen_candidate";
  let child,
    browser,
    context,
    profile,
    identity,
    candidate,
    targetOwnership,
    workerOwnership;
  let targetWritePending = false;
  let exitObserved = false;
  const receipt = {
    result: "failed",
    classification: "prerequisite",
    stage,
    scenario: "toolbar-history",
    clipboard: {
      hostUsed: false,
      hostChanged: false,
      boundary: "popup-memory-read-empty-write-rejected",
    },
    debugger: { attached: false, unaffectedWorkerLifecycleQualified: false },
    shutdown: "not-launched",
  };
  async function bounded(task, maximum = 15000) {
    attempt.assertBudget();
    const result = await raceAcceptanceOperation(
      task,
      attempt.remainingMs(maximum),
      operation
    );
    attempt.assertBudget();
    return result;
  }
  async function recordOwnership(update) {
    targetOwnership = { ...targetOwnership, ...update };
    await bounded(async () => {
      targetWritePending = true;
      await attempt.recordTarget(targetOwnership);
      targetWritePending = false;
    });
  }
  function command(bin, argv, maximum = 60000) {
    attempt.assertBudget();
    try {
      return execFileSync(bin, argv, {
        cwd: root,
        encoding: "utf8",
        timeout: attempt.remainingMs(maximum),
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error("candidate_command_failed");
    }
  }
  async function verifyBase() {
    const base = await bounded(() => json(options["candidate-record"]));
    assert(
      (await bounded(() => realpath(base.source.checkout))) === root,
      "candidate_wrong_checkout"
    );
    const verified = JSON.parse(
      command(process.execPath, [
        join(root, "scripts/prepare-acceptance-candidate.mjs"),
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
    const base = await verifyBase();
    const extension = join(root, "apps/extension/dist");
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
    receipt.candidate = {
      revision: candidate.sourceRevision,
      baseArtifact: candidate.baseArtifact,
      extensionSha256: hash(JSON.stringify(candidate.artifacts)),
      browser: browserIdentity,
    };
    profile = await bounded(() => mkdtemp(join(attempt.directory, "profile-")));
    workerOwnership = runnerOwnership(attempt.remainingMs(1000));
    targetOwnership = { ...workerOwnership, profile };
    stage = "launch";
    operation = "launch_owned_browser";
    await recordOwnership({ phase: "launch-intent" });
    child = spawn(
      executable,
      [
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
        "--enable-unsafe-extension-debugging",
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        "about:blank",
      ],
      { stdio: "ignore", detached: true }
    );
    child.on("error", () => {});
    child.once("exit", () => {
      exitObserved = true;
    });
    assert(child.pid, "browser_launch_failed");
    await recordOwnership({ pid: child.pid, phase: "pid-recorded" });
    identity = processIdentity(child.pid, attempt.remainingMs(1000));
    assert(
      identity.birth &&
        identity.fingerprint &&
        identity.command.includes(`--user-data-dir=${profile}`),
      "browser_identity_unavailable"
    );
    await recordOwnership({
      pid: child.pid,
      birth: identity.birth,
      fingerprint: identity.fingerprint,
      phase: "identity-observed",
    });
    const port = await waitFor(async () => {
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
      context.addInitScript(() => {
        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: false,
            value: Object.freeze({
              readText: async () => "",
              writeText: async () => {
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
      })
    );
    stage = "worker";
    operation = "observe_extension_identity";
    const session = await bounded(() => browser.newBrowserCDPSession());
    let extensions = await bounded(() =>
      session.send("Extensions.getExtensions")
    );
    let loaded;
    for (const item of extensions.extensions) {
      if (item.path && (await bounded(() => realpath(item.path))) === extension)
        loaded = item;
    }
    if (!loaded) {
      operation = "load_owned_unpacked_extension";
      await bounded(() =>
        session.send("Extensions.loadUnpacked", { path: extension })
      );
      extensions = await bounded(() =>
        session.send("Extensions.getExtensions")
      );
      for (const item of extensions.extensions) {
        if (
          item.path &&
          (await bounded(() => realpath(item.path))) === extension
        )
          loaded = item;
      }
    }
    assert(loaded?.id && loaded.enabled === true, "toolbar_target_mismatch");
    const extensionId = loaded.id;
    const worker = await waitFor(async () =>
      context
        .serviceWorkers()
        .find((item) => new URL(item.url()).host === extensionId)
    );
    assert(
      new URL(worker.url()).host === extensionId,
      "toolbar_target_mismatch"
    );
    receipt.extension = { id: extensionId, pathMatches: true };
    const tab = context.pages()[0] ?? (await bounded(() => context.newPage()));
    await bounded(() => tab.bringToFront());
    const tabSession = await bounded(() => context.newCDPSession(tab));
    const { targetInfo: tabTarget } = await bounded(() =>
      tabSession.send("Target.getTargetInfo")
    );
    operation = "trigger_actual_toolbar_action";
    await bounded(() =>
      session.send("Extensions.triggerAction", {
        id: extensionId,
        targetId: tabTarget.targetId,
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
        isPopup: chrome.extension.getViews({ type: "popup" }).includes(window),
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
    const text = "clipp-toolbar-local-history-fixture";
    const capture = await message({ type: "clipboardUpdate", text });
    assert(capture?.ok !== false, "local_fixture_capture_failed");
    await bounded(() =>
      verifyPopupHistorySearch(
        popup,
        text,
        (task) => bounded(task),
        (max) => attempt.remainingMs(max)
      )
    );
    operation = "pin_visible_clip";
    await bounded(() =>
      popup
        .getByTitle("Pin", { exact: true })
        .first()
        .click({ timeout: attempt.remainingMs(5000) })
    );
    await waitFor(
      async () =>
        (await message({ type: "getRuntimeState" }))?.state?.pinnedIds
          ?.length === 1
    );
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
    };
    operation = "verify_candidate_after_interaction";
    await verifyBase();
    assert.deepEqual(
      await bounded(() => artifacts(extension)),
      candidate.artifacts,
      "candidate_extension_artifacts_changed"
    );
    receipt.result = "passed";
    receipt.classification = "none";
    receipt.stage = "complete";
  } catch (error) {
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
    try {
      if (browser) await cleanup(() => browser.close());
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
            current.fingerprint === identity?.fingerprint,
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
      if (profile)
        assert(
          targetGone(targetOwnership, cleanupDeadline, workerOwnership),
          "browser_cleanup_unobserved"
        );
      if (profile)
        await cleanup(() => rm(profile, { recursive: true, force: true }));
      await cleanup(() => attempt.clearTarget());
      receipt.shutdown = child
        ? "verified-owned-browser-closed"
        : "not-launched";
    } catch {
      receipt.cleanupFailure = "owned_browser_cleanup_uncertain";
      receipt.shutdown = "unknown";
      receipt.result = "failed";
      receipt.classification = "cleanup";
      process.exitCode = 1;
    }
    await attempt.finish(receipt);
    console.log(JSON.stringify(receipt));
  }
}
