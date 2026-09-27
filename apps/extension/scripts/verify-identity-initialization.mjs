import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(scriptDirectory, "..", "dist");
const profilePath = await mkdtemp(join(tmpdir(), "clipp-extension-profile-"));

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    // Playwright disables extensions by default; remove only that default flag.
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

  const deadline = Date.now() + 15_000;
  let storage = {};
  while (Date.now() < deadline) {
    storage = await serviceWorker.evaluate(() =>
      chrome.storage.local.get([
        "localDeviceIdentity",
        "localDeviceIdentity:initializationError",
      ]),
    );
    if (storage.localDeviceIdentity || storage["localDeviceIdentity:initializationError"]) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  assert.ok(storage.localDeviceIdentity, "the extension should persist a Device Identity on first run");
  assert.equal(
    storage["localDeviceIdentity:initializationError"],
    undefined,
    "the extension should not persist an identity initialization failure",
  );
  console.log("MV3 identity initialization verified.");
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
