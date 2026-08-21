import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(scriptDirectory, "..", "dist");
const profilePath = await mkdtemp(join(tmpdir(), "clipp-offscreen-storage-profile-"));

let context;
try {
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

  const initialStatus = await waitForStartedOffscreen(serviceWorker);
  assert.equal(initialStatus.started, true, "the offscreen runtime should initialize");

  // Recreate the document so its identity manager cannot satisfy init from its
  // module-level cache; both identity and peer-record state must use the proxy.
  assert.deepEqual(await sendToOffscreen(serviceWorker, { action: "shutdown" }), { ok: true });
  await recreateOffscreenDocument(serviceWorker);
  assert.deepEqual(await waitForOffscreenPing(serviceWorker), { ok: true });
  assert.deepEqual(
    await sendToOffscreen(serviceWorker, { action: "init", relays: [] }),
    { ok: true },
    "offscreen initialization should load durable state through the service worker",
  );
  assert.equal(
    (await sendToOffscreen(serviceWorker, { action: "getStatus" })).started,
    true,
    "the offscreen runtime should be started after proxied storage initialization",
  );
  assert.deepEqual(await sendToOffscreen(serviceWorker, { action: "shutdown" }), { ok: true });

  console.log("MV3 offscreen storage proxy verified.");
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}

async function waitForStartedOffscreen(serviceWorker) {
  const deadline = Date.now() + 15_000;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await sendToOffscreen(serviceWorker, { action: "getStatus" });
      if (latest?.started) return latest;
    } catch {
      // The background may still be creating and initializing the document.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return latest ?? {};
}

async function recreateOffscreenDocument(serviceWorker) {
  await serviceWorker.evaluate(async () => {
    await chrome.offscreen.closeDocument();
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL("offscreen.html"),
      reasons: ["WEB_RTC", "CLIPBOARD"],
      justification: "Verify offscreen storage-proxy initialization",
    });
  });
}

async function waitForOffscreenPing(serviceWorker) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      return await sendToOffscreen(serviceWorker, { action: "ping" });
    } catch {
      // The recreated document may not have registered its listener yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("offscreen_ping_timeout");
}

async function sendToOffscreen(serviceWorker, message) {
  return await serviceWorker.evaluate(
    async (payload) => await chrome.runtime.sendMessage({ target: "offscreen", ...payload }),
    message,
  );
}
