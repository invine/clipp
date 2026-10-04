import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { relayAcceptanceFixture } from "./relay-acceptance-fixture.mjs";

const { extensionPath, transport } = relayAcceptanceFixture(
  resolve(dirname(fileURLToPath(import.meta.url)), "..")
);
const profilePath = await mkdtemp(
  join(tmpdir(), "clipp-managed-relay-profile-")
);
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end("<!doctype html><title>Content script probe</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("test_server_unavailable");

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
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  const extensionId = await worker.evaluate(() => chrome.runtime.id);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options.html`);

  const initial = await options.evaluate(
    async () => await chrome.runtime.sendMessage({ type: "managedRelayGet" })
  );
  assert.equal(initial.ok, true);
  assert.deepEqual(
    initial.configurations,
    [],
    "first adoption has no inherited relay list"
  );
  const runtimeState = await options.evaluate(
    async () => await chrome.runtime.sendMessage({ type: "getRuntimeState" })
  );
  assert.ok(runtimeState.state, "background and offscreen start together");
  const hostStatus = await worker.evaluate(
    async () =>
      await chrome.runtime.sendMessage({
        target: "offscreen",
        action: "getStatus",
      })
  );
  assert.equal(hostStatus.relayAcceptanceTransport, transport);
  if (transport) {
    // A valid WSS address belonging to a device rather than a configured relay
    // must be rejected by the compiled host's shared connection gate.
    const denied = await worker.evaluate(
      async () =>
        await chrome.runtime.sendMessage({
          target: "offscreen",
          action: "runtimeConnect",
          peerTarget:
            "/ip4/127.0.0.1/tcp/9/wss/p2p/12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex",
        })
    );
    assert.equal(denied.ok, false);
    assert.match(
      denied.error,
      /denied|gater/i,
      "direct device dial is denied before reaching the network"
    );
  }
  const unauthorizedShutdown = await options.evaluate(
    async () =>
      await chrome.runtime.sendMessage({
        target: "offscreen",
        action: "shutdown",
      })
  );
  assert.equal(
    unauthorizedShutdown.error,
    "managed_relay_control_unauthorized",
    "options cannot control the offscreen host"
  );
  const credentialKey =
    "managedRelayCredentialV1:https://relay.example/v1/relay";
  await worker.evaluate(
    async (key) =>
      await chrome.storage.local.set({
        [key]: { status: "ready", refreshToken: "probe-secret" },
      }),
    credentialKey
  );
  const webPage = await context.newPage();
  await webPage.goto(`http://127.0.0.1:${address.port}/`);
  const tabId = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    return tabs[0]?.id;
  }, webPage.url());
  assert.equal(typeof tabId, "number");
  const [{ result: contentResult }] = await worker.evaluate(
    async ({ tabId, key }) => {
      return await chrome.scripting.executeScript({
        target: { tabId },
        func: async (probeKey) => {
          let stored;
          try {
            stored = await chrome.storage?.local?.get(probeKey);
          } catch {
            stored = undefined;
          }
          return {
            credential: stored?.[probeKey],
            ui: await chrome.runtime.sendMessage({ type: "managedRelayGet" }),
          };
        },
        args: [key],
      });
    },
    { tabId, key: credentialKey }
  );
  assert.equal(
    contentResult.credential,
    undefined,
    "content script cannot read local credential storage"
  );
  assert.equal(contentResult.ui.error, "relay_ui_unauthorized");

  await worker.evaluate(
    async (key) => await chrome.storage.local.remove(key),
    credentialKey
  );
  await worker.evaluate(async () => await chrome.offscreen.closeDocument());
  await options.evaluate(
    async () => await chrome.runtime.sendMessage({ type: "getRuntimeState" })
  );
  const recreated = await worker.evaluate(
    async () =>
      await chrome.runtime.sendMessage({
        target: "offscreen",
        action: "getStatus",
      })
  );
  assert.equal(
    recreated.started,
    true,
    "recreated offscreen document initializes its host"
  );
  assert.equal(
    recreated.relayAcceptanceTransport,
    transport,
    "offscreen recreation retains the build selection"
  );
  const afterRecreation = await options.evaluate(
    async () => await chrome.runtime.sendMessage({ type: "getRuntimeState" })
  );
  assert.equal(
    afterRecreation.state.identity.deviceId,
    runtimeState.state.identity.deviceId,
    "offscreen recreation preserves Device Identity"
  );

  console.log(
    `Chrome ${context.browser()?.version() ?? "unknown"} MV3 managed-relay boundary passed; fixture transport ${transport ?? "default"}; disposable extension; synthetic credential canary only; no registered relay service used.`
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
  await new Promise((resolve) => server.close(resolve));
}
