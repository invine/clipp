import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { beginNativeAttempt } from "../../../scripts/native-acceptance-attempts.mjs";
import {
  classifyShareNowFeedback,
  parseClipboardAcceptanceArgs,
  persistentAttemptDirectory,
  raceAcceptanceOperation,
  verifyPopupHistorySearch,
} from "./clipboard-acceptance.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(scriptDirectory, "..", "dist");
const repositoryRoot = resolve(scriptDirectory, "../../..");
const shareNowHistoryEffectTimeoutMs = 30_000;
const options = parseClipboardAcceptanceArgs(process.argv.slice(2));
if (options.validateOnly) {
  console.log(
    JSON.stringify({
      valid: true,
      authorizationReference: options.authorizationReference,
      attempt: options.attempt,
    })
  );
  process.exit(0);
}
const configuredStateRoot = resolve(persistentAttemptDirectory());
await mkdir(configuredStateRoot, { recursive: true, mode: 0o700 });
const stateRoot = await realpath(configuredStateRoot);
const stateRelative = relative(repositoryRoot, stateRoot);
assert(
  stateRelative === ".." ||
    stateRelative.startsWith(`..${sep}`) ||
    isAbsolute(stateRelative),
  "attempt_history_must_be_outside_checkout"
);
const attemptOutput = join(stateRoot, "chrome-clipboard");
const attempt = await beginNativeAttempt({
  output: attemptOutput,
  scenario: "chrome-clipboard",
  change: options.diagnosticChange,
  expectation: options.expectedObservation,
});
let profilePath;
const probeServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Clipp clipboard probe</title>");
});

let context;
let probe;
let stage = "prerequisite";
let operationLabel = "create_owned_profile";
let extensionId;
let candidate;
let browserVersion;
let shareNowDialogObserved = false;
let shareNowDialogDismissalError;
let shareNowObservation;
let clipboardUsed = false;
let clipboardChanged = false;
let outcome = "runner_failure";
try {
  profilePath = await withinBudget(() =>
    mkdtemp(join(tmpdir(), "clipp-clipboard-io-"))
  );
  operationLabel = "identify_built_candidate";
  candidate = await withinBudget(() =>
    identifyCandidate(extensionPath, repositoryRoot)
  );
  attempt.assertBudget();
  stage = "runner_setup";
  operationLabel = "listen_local_probe";
  const probeOrigin = await withinBudget(() => listen(probeServer));
  attempt.assertBudget();
  operationLabel = "launch_owned_chromium";
  context = await withinBudget(() =>
    chromium.launchPersistentContext(profilePath, {
      headless: false,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    })
  );
  browserVersion = context.browser()?.version() ?? "unknown";
  attempt.assertBudget();

  stage = "prerequisite";
  operationLabel = "discover_extension_service_worker";
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker)
    serviceWorker = await withinBudget(
      () =>
        context.waitForEvent("serviceworker", {
          timeout: remainingMs(15_000),
        }),
      15_000
    );
  attempt.assertBudget();
  extensionId = new URL(serviceWorker.url()).host;
  operationLabel = "grant_probe_clipboard_permissions";
  await withinBudget(() =>
    context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: probeOrigin,
    })
  );
  attempt.assertBudget();
  probe = await withinBudget(() => context.newPage());
  operationLabel = "load_probe_page";
  await withinBudget(() => probe.goto(probeOrigin));
  await withinBudget(() => probe.bringToFront());
  // D4 authorizes this effort to overwrite the clipboard. We neither read nor retain
  // clipboard contents and do not attempt restoration.

  stage = "interaction_preflight";
  operationLabel = "open_readiness_popup";
  const popup = await withinBudget(() => context.newPage());
  await withinBudget(() =>
    popup.goto(`chrome-extension://${extensionId}/src/popup.html`)
  );
  assert.equal(
    await withinBudget(() => popup.evaluate(() => chrome.runtime.id)),
    extensionId
  );
  candidate.loadedExtensionId = extensionId;
  assert.deepEqual(await extensionMessage(popup, { type: "clearHistory" }), {
    ok: true,
  });
  operationLabel = "capture_readiness_fixture";
  const readinessText = "clipp-readiness-search-interaction";
  await captureFixture(popup, readinessText);
  const interactionPreflight = await verifyPopupHistorySearch(
    popup,
    readinessText,
    withinBudget,
    remainingMs
  );
  operationLabel = "close_readiness_popup";
  attempt.assertBudget();
  await withinBudget(() => popup.close());

  stage = "clipboard_acceptance";
  operationLabel = "write_offscreen_clipboard_fixture";
  const offscreenText = "clipp-offscreen-writer-verification";
  clipboardUsed = true;
  const offscreenResponse = await sendToOffscreen(serviceWorker, {
    action: "clipboardWrite",
    text: offscreenText,
  });
  assert.deepEqual(offscreenResponse, { ok: true });
  clipboardChanged = true;
  operationLabel = "confirm_offscreen_clipboard_write";
  assert.equal(await readClipboard(probe), offscreenText);

  operationLabel = "open_acceptance_popup";
  const acceptancePopup = await withinBudget(() => context.newPage());
  await withinBudget(() =>
    acceptancePopup.goto(`chrome-extension://${extensionId}/src/popup.html`)
  );

  const retainedText = "clipp-retained-copy-verification";
  operationLabel = "capture_retained_copy_fixture";
  const retainedClip = await captureFixture(acceptancePopup, retainedText);
  clipboardChanged = true;
  operationLabel = "write_copy_sentinel";
  await writeClipboard(probe, "clipp-copy-sentinel");
  await withinBudget(() => acceptancePopup.bringToFront());
  await withinBudget(() => acceptancePopup.reload());
  const retainedCard = acceptancePopup
    .locator("article")
    .filter({ hasText: retainedText })
    .first();
  operationLabel = "click_retained_copy_action";
  await withinBudget(() =>
    retainedCard.locator("button").filter({ hasText: "Copy" }).click()
  );
  operationLabel = "confirm_retained_clipboard_copy";
  await waitForClipboard(probe, retainedText);
  await withinBudget(() => acceptancePopup.bringToFront());
  assert.equal(
    await withinBudget(() =>
      acceptancePopup
        .getByText(
          "Could not copy this Clip. Your clipboard and history were not changed.",
          { exact: true }
        )
        .isVisible()
        .catch(() => false)
    ),
    false
  );
  operationLabel = "verify_retained_history_reuse";
  const reusedHistory = await waitForHistory(
    acceptancePopup,
    (clips) =>
      clips.filter(
        (clip) => clip.content === retainedText && clip.id !== retainedClip.id
      ).length > 0
  );
  assert.ok(
    reusedHistory.some(
      (clip) => clip.content === retainedText && clip.id !== retainedClip.id
    )
  );

  const shareNowText = "  clipp-share-now\r\nverification  ";
  clipboardChanged = true;
  operationLabel = "write_share_fixture";
  await writeClipboard(probe, shareNowText);
  await withinBudget(() => acceptancePopup.bringToFront());
  await withinBudget(() => acceptancePopup.waitForTimeout(500));
  const historyBeforeShare = await extensionMessage(acceptancePopup, {
    type: "getClipHistory",
  });
  const observedIds = new Set(
    (historyBeforeShare?.clips ?? []).map((clip) => clip.id)
  );
  const existingShareNowAlertVisible = await withinBudget(() =>
    acceptancePopup.getByRole("alert").isVisible().catch(() => false)
  );
  const observeShareNowDialog = async (dialog) => {
    shareNowDialogObserved = true;
    shareNowObservation = {
      ...shareNowObservation,
      nativeDialogObserved: true,
    };
    try {
      await dialog.dismiss();
    } catch (error) {
      shareNowDialogDismissalError = error;
    }
  };
  acceptancePopup.on("dialog", observeShareNowDialog);
  operationLabel = "observe_share_now_response";
  await installShareNowResponseObserver(acceptancePopup);
  operationLabel = "click_share_now_action";
  await withinBudget(() =>
    acceptancePopup.locator("button").filter({ hasText: "Share Now" }).click()
  );
  operationLabel = "verify_share_history_effect";
  const sharedHistory = await waitForHistory(
    acceptancePopup,
    (clips) =>
      clips.some(
        (clip) => clip.content === shareNowText && !observedIds.has(clip.id)
      ),
    shareNowHistoryEffectTimeoutMs,
    async () => {
      const responseObservation = await withinBudget(() =>
        acceptancePopup.evaluate(
          () => window.__clippShareNowResponse ?? undefined
        )
      );
      if (responseObservation) {
        shareNowObservation = {
          ...shareNowObservation,
          response: responseObservation,
        };
      }
      if (responseObservation?.ok === false) {
        const error = new Error("share_now_failure_feedback");
        error.code = "share_now_failure_feedback";
        throw error;
      }
      const feedbackCode = await visibleShareNowFeedbackCode(acceptancePopup);
      if (feedbackCode) {
        shareNowObservation = {
          ...shareNowObservation,
          feedbackCode,
        };
        const error = new Error("share_now_failure_feedback");
        error.code = "share_now_failure_feedback";
        throw error;
      }
      if (shareNowDialogDismissalError) throw shareNowDialogDismissalError;
      if (shareNowDialogObserved) return true;
      const alertVisible = await withinBudget(() =>
        acceptancePopup.getByRole("alert").isVisible().catch(() => false)
      );
      return alertVisible && !existingShareNowAlertVisible;
    }
  );
  assert.ok(
    sharedHistory.some(
      (clip) => clip.content === shareNowText && !observedIds.has(clip.id)
    )
  );

  operationLabel = "close_acceptance_popup";
  await withinBudget(() => acceptancePopup.close());
  outcome = "passed";
  console.log(
    JSON.stringify({
      status: outcome,
      stage: "complete",
      authorizationReference: options.authorizationReference,
      candidate,
      profileOwned: true,
      processOwnership: "runner-launched Chromium context",
      browserVersion,
      profilePath,
      extensionId,
      shareNowObservation,
      interactionPreflight,
      clipboard: {
        hostClipboardUsed: clipboardUsed,
        changed: clipboardChanged,
        restoration: "not_requested_by_authorization",
      },
      acceptance: "extension-page-and-offscreen; toolbar-popup-not-qualified",
    })
  );
} catch (error) {
  outcome = classifyFailure(stage, error);
  console.error(
    JSON.stringify({
      status: outcome,
      stage,
      operation: error?.operation ?? operationLabel,
      authorizationReference: options.authorizationReference,
      candidate,
      extensionId,
      shareNowObservation,
      clipboard: {
        hostClipboardUsed: clipboardUsed,
        changed: clipboardChanged,
        restoration: "not_requested_by_authorization",
      },
      errorName: error?.name ?? "UnknownError",
      errorCode: error?.code ?? null,
    })
  );
  throw error;
} finally {
  const cleanupErrors = [];
  try {
    await context?.close();
  } catch (error) {
    cleanupErrors.push(`browser_close:${error.message}`);
  }
  try {
    await close(probeServer);
  } catch (error) {
    cleanupErrors.push(`probe_server_close:${error.message}`);
  }
  try {
    if (profilePath) await rm(profilePath, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(`owned_profile_remove:${error.message}`);
  }
  const finalStatus =
    cleanupErrors.length && outcome === "passed" ? "cleanup_failure" : outcome;
  await attempt.finish({
    result: finalStatus,
    stage: outcome === "passed" ? "complete" : stage,
    operation: outcome === "passed" ? "complete" : operationLabel,
    classification: outcome === "passed" ? "none" : outcome,
    authorizationReference: options.authorizationReference,
    candidate,
    profileOwned: true,
    processOwnership: "runner-launched Chromium context",
    browserVersion,
    profilePath,
    extensionId,
    shareNowObservation,
    clipboard: {
      hostClipboardUsed: clipboardUsed,
      changed: clipboardChanged,
      restoration: "not_requested_by_authorization",
    },
    ...(cleanupErrors.length ? { cleanupFailures: cleanupErrors } : {}),
  });
  if (cleanupErrors.length)
    throw new Error(`acceptance_cleanup_failed:${cleanupErrors.join(",")}`);
}

async function identifyCandidate(extensionDirectory, root) {
  const manifest = JSON.parse(
    await readFile(join(extensionDirectory, "manifest.json"), "utf8")
  );
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const sourceDirty =
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim().length > 0;
  const files = await listFiles(extensionDirectory);
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file.slice(extensionDirectory.length));
    digest.update(await readFile(file));
  }
  return {
    sourceRevision,
    sourceDirty,
    buildSha256: digest.digest("hex"),
    manifestVersion: manifest.version,
    candidatePath: extensionDirectory,
  };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function classifyFailure(currentStage, error) {
  if (error?.code === "share_now_failure_feedback") return "product_failure";
  if (
    error?.message === "diagnostic_time_budget_exhausted" ||
    error?.message === "acceptance_operation_timeout"
  )
    return "runner_failure";
  if (
    currentStage === "prerequisite" ||
    currentStage === "interaction_preflight"
  )
    return "prerequisite_failure";
  if (currentStage === "runner_setup") return "runner_failure";
  if (error?.name === "AssertionError") return "product_failure";
  if (error?.name === "TimeoutError" || error?.name === "TargetClosedError")
    return "runner_failure";
  return "unknown_failure";
}

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function pollUntil(timeoutMs, probe) {
  const deadline = Date.now() + remainingMs(timeoutMs);
  while (Date.now() < deadline) {
    attempt.assertBudget();
    const result = await withinBudget(
      probe,
      Math.max(1, deadline - Date.now())
    );
    if (result !== undefined) return result;
    await withinBudget(
      () => new Promise((resolveDelay) => setTimeout(resolveDelay, 100)),
      Math.min(100, deadline - Date.now())
    );
  }
  attempt.assertBudget();
  return undefined;
}

function remainingMs(maximum) {
  return attempt.remainingMs(maximum);
}

async function withinBudget(run, maximum = 30_000) {
  attempt.assertBudget();
  const timeout = remainingMs(maximum);
  try {
    const result = await raceAcceptanceOperation(run, timeout, operationLabel);
    attempt.assertBudget();
    return result;
  } catch (error) {
    if (error?.message === "acceptance_operation_timeout")
      error.operation ??= operationLabel;
    throw error;
  }
}

async function readClipboard(page) {
  await withinBudget(() => page.bringToFront());
  return await withinBudget(() =>
    page.evaluate(async () => await navigator.clipboard.readText())
  );
}

async function writeClipboard(page, text) {
  await withinBudget(() => page.bringToFront());
  await withinBudget(() =>
    page.evaluate(
      async (value) => await navigator.clipboard.writeText(value),
      text
    )
  );
}

async function waitForClipboard(page, expected) {
  const matched = await pollUntil(10_000, async () =>
    (await readClipboard(page)) === expected ? true : undefined
  );
  if (matched) return;
  assert.equal(await readClipboard(page), expected);
}

async function extensionMessage(page, message) {
  return await withinBudget(() =>
    page.evaluate(
      async (payload) => await chrome.runtime.sendMessage(payload),
      message
    )
  );
}

async function installShareNowResponseObserver(page) {
  const installed = await withinBudget(() =>
    page.evaluate(() => {
      const runtime = chrome.runtime;
      const original = runtime.sendMessage.bind(runtime);
      runtime.sendMessage = (...args) => {
        const message = args[0];
        const callback = args.at(-1);
        if (message?.type === "shareNow" && typeof callback === "function") {
          args[args.length - 1] = (response) => {
            const rawError = response?.error;
            window.__clippShareNowResponse = {
              ok: response?.ok === true,
              errorCode:
                typeof rawError === "string" && /^[a-z0-9_]{1,80}$/.test(rawError)
                  ? rawError
                  : rawError
                    ? "unclassified"
                    : null,
            };
            callback(response);
          };
        }
        return original(...args);
      };
      return true;
    })
  );
  assert.equal(installed, true);
}

async function visibleShareNowFeedbackCode(page) {
  const clipboardReadFailed = await withinBudget(() =>
    page
      .getByText(
        "Could not read the current clipboard. Keep Clipp open and try again.",
        { exact: true }
      )
      .isVisible()
      .catch(() => false)
  );
  const shareNowFailed = await withinBudget(() =>
    page
      .getByText("Could not save or share the current clipboard.", {
        exact: true,
      })
      .isVisible()
      .catch(() => false)
  );
  return classifyShareNowFeedback({ clipboardReadFailed, shareNowFailed });
}

async function sendToOffscreen(serviceWorker, message) {
  let latest;
  const successful = await pollUntil(15_000, async () => {
    try {
      latest = await withinBudget(() =>
        serviceWorker.evaluate(
          async (payload) =>
            await chrome.runtime.sendMessage({
              target: "offscreen",
              ...payload,
            }),
          message
        )
      );
      if (latest?.ok === true) return latest;
    } catch {
      // The background may still be creating the offscreen document.
    }
    return undefined;
  });
  return successful ?? latest;
}

async function captureFixture(popup, text) {
  const captured = await pollUntil(15_000, async () => {
    await extensionMessage(popup, { type: "clipboardUpdate", text });
    const history = await extensionMessage(popup, { type: "getClipHistory" });
    return history?.clips?.find((candidate) => candidate.content === text);
  });
  if (captured) return captured;
  throw new Error("clipboard_fixture_capture_timeout");
}

async function waitForHistory(
  popup,
  predicate,
  timeoutMs = 10_000,
  detectShareNowFailure
) {
  let clips = [];
  const matched = await pollUntil(timeoutMs, async () => {
    if (detectShareNowFailure && (await detectShareNowFailure())) {
      const error = new Error("share_now_failure_feedback");
      error.code = "share_now_failure_feedback";
      throw error;
    }
    const response = await extensionMessage(popup, { type: "getClipHistory" });
    clips = response?.clips ?? [];
    return predicate(clips) ? clips : undefined;
  });
  if (matched) return matched;
  throw new Error("clipboard_history_condition_timeout");
}
