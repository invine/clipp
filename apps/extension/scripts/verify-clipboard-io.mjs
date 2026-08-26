import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(scriptDirectory, "..", "dist");
const profilePath = await mkdtemp(join(tmpdir(), "clipp-clipboard-io-"));
const probeServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Clipp clipboard probe</title>");
});

let context;
let probe;
let originalClipboardText;
let canRestoreClipboard = false;
try {
  const probeOrigin = await listen(probeServer);
  context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: probeOrigin });
  probe = await context.newPage();
  await probe.goto(probeOrigin);
  await probe.bringToFront();
  try {
    originalClipboardText = await readClipboard(probe);
    canRestoreClipboard = true;
  } catch {
    // The regression still runs when the host cannot expose the previous text value.
  }

  const offscreenText = "clipp-offscreen-writer-verification";
  const offscreenResponse = await sendToOffscreen(serviceWorker, {
    action: "clipboardWrite",
    text: offscreenText,
  });
  assert.deepEqual(offscreenResponse, { ok: true });
  assert.equal(await readClipboard(probe), offscreenText);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await extensionMessage(popup, { type: "clearHistory" });

  const retainedText = "clipp-retained-copy-verification";
  const retainedClip = await captureFixture(popup, retainedText);
  await writeClipboard(probe, "clipp-copy-sentinel");
  await popup.bringToFront();
  await popup.reload();
  const retainedCard = popup.locator("article").filter({ hasText: retainedText }).first();
  await retainedCard.locator("button").filter({ hasText: "Copy" }).click();
  await waitForClipboard(probe, retainedText);
  await popup.bringToFront();
  assert.equal(await popup.getByText(
    "Could not copy this Clip. Your clipboard and history were not changed.",
    { exact: true },
  ).isVisible().catch(() => false), false);
  const reusedHistory = await waitForHistory(popup, (clips) =>
    clips.filter((clip) => clip.content === retainedText && clip.id !== retainedClip.id).length > 0);
  assert.ok(reusedHistory.some((clip) => clip.content === retainedText && clip.id !== retainedClip.id));

  const shareNowText = "  clipp-share-now\r\nverification  ";
  await writeClipboard(probe, shareNowText);
  await popup.bringToFront();
  await popup.waitForTimeout(500);
  const historyBeforeShare = await extensionMessage(popup, { type: "getClipHistory" });
  const observedIds = new Set((historyBeforeShare?.clips ?? []).map((clip) => clip.id));
  await popup.locator("button").filter({ hasText: "Share Now" }).click();
  const sharedHistory = await waitForHistory(
    popup,
    (clips) => clips.some((clip) => clip.content === shareNowText && !observedIds.has(clip.id)),
  );
  assert.ok(sharedHistory.some((clip) => clip.content === shareNowText && !observedIds.has(clip.id)));

  await popup.close();
  console.log("MV3 extension clipboard I/O verified in real Chromium.");
} finally {
  if (probe && canRestoreClipboard) {
    try { await writeClipboard(probe, originalClipboardText); } catch { /* best-effort cleanup */ }
  }
  await context?.close();
  await close(probeServer);
  await rm(profilePath, { recursive: true, force: true });
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
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function readClipboard(page) {
  await page.bringToFront();
  return await page.evaluate(async () => await navigator.clipboard.readText());
}

async function writeClipboard(page, text) {
  await page.bringToFront();
  await page.evaluate(async (value) => await navigator.clipboard.writeText(value), text);
}

async function waitForClipboard(page, expected) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await readClipboard(page) === expected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  assert.equal(await readClipboard(page), expected);
}

async function extensionMessage(page, message) {
  return await page.evaluate(async (payload) => await chrome.runtime.sendMessage(payload), message);
}

async function sendToOffscreen(serviceWorker, message) {
  const deadline = Date.now() + 15_000;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await serviceWorker.evaluate(
        async (payload) => await chrome.runtime.sendMessage({ target: "offscreen", ...payload }),
        message,
      );
      if (latest?.ok === true) return latest;
    } catch {
      // The background may still be creating the offscreen document.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return latest;
}

async function captureFixture(popup, text) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await extensionMessage(popup, { type: "clipboardUpdate", text });
    const history = await extensionMessage(popup, { type: "getClipHistory" });
    const clip = history?.clips?.find((candidate) => candidate.content === text);
    if (clip) return clip;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("clipboard_fixture_capture_timeout");
}

async function waitForHistory(popup, predicate) {
  const deadline = Date.now() + 10_000;
  let clips = [];
  while (Date.now() < deadline) {
    const response = await extensionMessage(popup, { type: "getClipHistory" });
    clips = response?.clips ?? [];
    if (predicate(clips)) return clips;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("clipboard_history_condition_timeout");
}
