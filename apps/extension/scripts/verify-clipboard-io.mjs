import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  loadAttemptState,
  parseClipboardAcceptanceArgs,
  recordDiagnosticAttempt,
  saveAttemptState,
} from "./clipboard-acceptance.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(scriptDirectory, "..", "dist");
const repositoryRoot = resolve(scriptDirectory, "../../..");
const attemptStatePath = resolve(
  scriptDirectory,
  "../.local/native-acceptance/chrome-clipboard.json"
);
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
const previousAttempt = await loadAttemptState(
  attemptStatePath,
  options.scenario
);
const attemptState = recordDiagnosticAttempt(previousAttempt, {
  kind: options.attempt,
  startedAt: new Date().toISOString(),
  hypothesis:
    options.attempt === "initial"
      ? "initial acceptance run"
      : process.env.CLIPP_DIAGNOSTIC_HYPOTHESIS,
});
await saveAttemptState(attemptStatePath, options.scenario, attemptState, {
  status: "running",
});
const profilePath = await mkdtemp(join(tmpdir(), "clipp-clipboard-io-"));
const probeServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Clipp clipboard probe</title>");
});

let context;
let probe;
let stage = "prerequisite";
let extensionId;
let candidate;
let browserVersion;
let clipboardUsed = false;
let clipboardChanged = false;
let outcome = "runner_failure";
try {
  candidate = await identifyCandidate(extensionPath, repositoryRoot);
  stage = "runner_setup";
  const probeOrigin = await listen(probeServer);
  context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  browserVersion = context.browser()?.version() ?? "unknown";

  stage = "prerequisite";
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker)
    serviceWorker = await context.waitForEvent("serviceworker", {
      timeout: 15_000,
    });
  extensionId = new URL(serviceWorker.url()).host;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: probeOrigin,
  });
  probe = await context.newPage();
  await probe.goto(probeOrigin);
  await probe.bringToFront();
  // D4 authorizes this effort to overwrite the clipboard. We neither read nor retain
  // clipboard contents and do not attempt restoration.

  stage = "interaction_preflight";
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  assert.equal(await popup.evaluate(() => chrome.runtime.id), extensionId);
  candidate.loadedExtensionId = extensionId;
  assert.deepEqual(await extensionMessage(popup, { type: "clearHistory" }), {
    ok: true,
  });
  await popup.close();

  stage = "clipboard_acceptance";
  const offscreenText = "clipp-offscreen-writer-verification";
  clipboardUsed = true;
  const offscreenResponse = await sendToOffscreen(serviceWorker, {
    action: "clipboardWrite",
    text: offscreenText,
  });
  assert.deepEqual(offscreenResponse, { ok: true });
  clipboardChanged = true;
  assert.equal(await readClipboard(probe), offscreenText);

  const acceptancePopup = await context.newPage();
  await acceptancePopup.goto(
    `chrome-extension://${extensionId}/src/popup.html`
  );

  const retainedText = "clipp-retained-copy-verification";
  const retainedClip = await captureFixture(acceptancePopup, retainedText);
  clipboardChanged = true;
  await writeClipboard(probe, "clipp-copy-sentinel");
  await acceptancePopup.bringToFront();
  await acceptancePopup.reload();
  const retainedCard = acceptancePopup
    .locator("article")
    .filter({ hasText: retainedText })
    .first();
  await retainedCard.locator("button").filter({ hasText: "Copy" }).click();
  await waitForClipboard(probe, retainedText);
  await acceptancePopup.bringToFront();
  assert.equal(
    await acceptancePopup
      .getByText(
        "Could not copy this Clip. Your clipboard and history were not changed.",
        { exact: true }
      )
      .isVisible()
      .catch(() => false),
    false
  );
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
  await writeClipboard(probe, shareNowText);
  await acceptancePopup.bringToFront();
  await acceptancePopup.waitForTimeout(500);
  const historyBeforeShare = await extensionMessage(acceptancePopup, {
    type: "getClipHistory",
  });
  const observedIds = new Set(
    (historyBeforeShare?.clips ?? []).map((clip) => clip.id)
  );
  await acceptancePopup
    .locator("button")
    .filter({ hasText: "Share Now" })
    .click();
  const sharedHistory = await waitForHistory(acceptancePopup, (clips) =>
    clips.some(
      (clip) => clip.content === shareNowText && !observedIds.has(clip.id)
    )
  );
  assert.ok(
    sharedHistory.some(
      (clip) => clip.content === shareNowText && !observedIds.has(clip.id)
    )
  );

  await acceptancePopup.close();
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
      interactionPreflight: "passed",
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
      authorizationReference: options.authorizationReference,
      candidate,
      extensionId,
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
    await rm(profilePath, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(`owned_profile_remove:${error.message}`);
  }
  const finalStatus =
    cleanupErrors.length && outcome === "passed" ? "cleanup_failure" : outcome;
  await saveAttemptState(attemptStatePath, options.scenario, attemptState, {
    status: finalStatus,
    stage: outcome === "passed" ? "complete" : stage,
    authorizationReference: options.authorizationReference,
    candidate,
    profileOwned: true,
    processOwnership: "runner-launched Chromium context",
    browserVersion,
    profilePath,
    extensionId,
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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result !== undefined) return result;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return undefined;
}

async function readClipboard(page) {
  await page.bringToFront();
  return await page.evaluate(async () => await navigator.clipboard.readText());
}

async function writeClipboard(page, text) {
  await page.bringToFront();
  await page.evaluate(
    async (value) => await navigator.clipboard.writeText(value),
    text
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
  return await page.evaluate(
    async (payload) => await chrome.runtime.sendMessage(payload),
    message
  );
}

async function sendToOffscreen(serviceWorker, message) {
  let latest;
  const successful = await pollUntil(15_000, async () => {
    try {
      latest = await serviceWorker.evaluate(
        async (payload) =>
          await chrome.runtime.sendMessage({ target: "offscreen", ...payload }),
        message
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

async function waitForHistory(popup, predicate) {
  let clips = [];
  const matched = await pollUntil(10_000, async () => {
    const response = await extensionMessage(popup, { type: "getClipHistory" });
    clips = response?.clips ?? [];
    return predicate(clips) ? clips : undefined;
  });
  if (matched) return matched;
  throw new Error("clipboard_history_condition_timeout");
}
