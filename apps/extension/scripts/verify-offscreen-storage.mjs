import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { relayAcceptanceFixture } from "./relay-acceptance-fixture.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const { extensionPath, transport } = relayAcceptanceFixture(
  resolve(scriptDirectory, ".."),
  process.argv[2]
);
const profilePath = await mkdtemp(
  join(tmpdir(), "clipp-offscreen-storage-profile-")
);

let context;
let statusPage;
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
    serviceWorker = await context.waitForEvent("serviceworker", {
      timeout: 15_000,
    });
  }
  const extensionId = await serviceWorker.evaluate(() => chrome.runtime.id);
  statusPage = await context.newPage();
  await statusPage.goto(`chrome-extension://${extensionId}/src/options.html`);

  const initialStatus = await waitForStartedOffscreen(statusPage);
  assert.equal(
    initialStatus.started,
    true,
    "the offscreen runtime should initialize"
  );
  assert.equal(initialStatus.relayAcceptanceTransport, transport);

  // Recreate the document through the supported background request. The
  // background owns the runtime generation and offscreen initialization.
  await serviceWorker.evaluate(() => {
    globalThis.__clippOffscreenStorageRequests = 0;
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message?.target === "background" &&
        message?.action === "offscreenStorage"
      )
        globalThis.__clippOffscreenStorageRequests++;
    });
  });
  await serviceWorker.evaluate(
    async () => await chrome.offscreen.closeDocument()
  );
  const recreatedStatus = await waitForStartedOffscreen(statusPage);
  assert.equal(
    recreatedStatus.started,
    true,
    "the offscreen runtime should be started after proxied storage initialization"
  );
  assert.equal(recreatedStatus.relayAcceptanceTransport, transport);
  assert.ok(
    await serviceWorker.evaluate(
      () => globalThis.__clippOffscreenStorageRequests
    ),
    "recreated offscreen document should load durable state through the storage proxy"
  );

  console.log("MV3 offscreen storage proxy verified.");
} finally {
  await statusPage?.close();
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}

async function waitForStartedOffscreen(statusPage) {
  const deadline = Date.now() + 15_000;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await statusPage.evaluate(
        async () => await chrome.runtime.sendMessage({ type: "getStatus" })
      );
      if (latest?.started) return latest;
    } catch {
      // The background may still be creating and initializing the document.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return latest ?? {};
}
