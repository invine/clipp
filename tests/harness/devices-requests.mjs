import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "clipp-devices-requests-"));
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { ClipboardApp } from "${repo}/packages/ui/src/ClipboardApp";
      const firstDevice = {
        deviceId: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
        deviceName: "Reported device name",
        displayName: "Local alias",
        localAlias: "Local alias",
      };
      const longPrefix = "Prefix 🌿 Café 東京 ".repeat(2);
      const unicodeNameA = longPrefix + "👨‍👩‍👧‍👦 é Alpha";
      const unicodeNameB = longPrefix + "👨‍👩‍👧‍👦 é Beta";
      const initialDevices = [
        firstDevice,
        { deviceId: "direct-peer", deviceName: "Direct device", displayName: "Direct device" },
        { deviceId: "relay-peer", deviceName: "Relay device", displayName: "Relay device" },
        { deviceId: "offline-peer", deviceName: "Offline device", displayName: "Offline device" },
        { deviceId: "unknown-path-peer", deviceName: "Unknown path device", displayName: "Unknown path device" },
        { deviceId: "unicode-peer-a", deviceName: unicodeNameA, displayName: unicodeNameA },
        { deviceId: "unicode-peer-b", deviceName: unicodeNameB, displayName: unicodeNameB },
        ...Array.from({ length: 13 }, (_, index) => ({
          deviceId: "trusted-" + (index + 8),
          deviceName: "Trusted device " + (index + 8),
          displayName: "Trusted device " + (index + 8),
        })),
      ];
      const initialPending = Array.from({ length: 4 }, (_, index) => ({
        deviceId: "pending-peer-" + (index + 1),
        deviceName: "Waiting device " + (index + 1),
        requestVersion: "version-" + (index + 1),
      }));
      const singleDevice = { deviceId: "single-peer", deviceName: "Single device", displayName: "Single device" };
      window.fixture = { calls: [], fail: true, holdNext: false, unicodeNameA, unicodeNameB, singleDevice };
      function Fixture() {
        const [devices, setDevices] = useState(initialDevices);
        const [pending, setPending] = useState(initialPending);
        window.fixture.getDevices = () => devices;
        window.fixture.setDevices = setDevices;
        window.fixture.setPending = setPending;
        return <ClipboardApp
          clips={[]}
          devices={devices}
          pending={pending}
          peers={["direct-peer", "relay-peer", "unknown-path-peer"]}
          connectionStateKnown={true}
          peerConnections={[
            { peerId: "direct-peer", path: "direct", hasDirect: true, hasRelay: false, addrs: [] },
            { peerId: "relay-peer", path: "relay", hasDirect: false, hasRelay: true, addrs: [] },
          ]}
          pinnedIds={[]}
          identity={{ deviceId: "local", deviceName: "This installation" }}
          onDeleteClip={() => {}}
          onUnpair={() => {}}
          onAccept={async () => ({ status: "accepted" })}
          onReject={async () => ({ status: "rejected" })}
          onPairText={async () => ({ status: "invalid-input" })}
          onCopyPairingText={async () => ({ status: "copied" })}
          onRequestPairingCode={async () => ({ text: "fixture" })}
          onReuseClip={() => "complete"}
          onShareNow={() => {}}
          onSetPinned={() => {}}
          onClearAll={() => {}}
          onRenameDevice={async (id, name) => {
            window.fixture.calls.push({ id, name });
            if (window.fixture.holdNext) {
              window.fixture.holdNext = false;
              return new Promise((resolve) => {
                window.fixture.resolveClear = () => {
                  setDevices((old) => old.map((device) => device.deviceId === id
                    ? { ...device, displayName: name || device.deviceName, localAlias: name || undefined }
                    : device));
                  const device = devices.find((candidate) => candidate.deviceId === id);
                  resolve({ ...device, displayName: name || device.deviceName, localAlias: name || undefined });
                };
              });
            }
            if (window.fixture.fail) throw new Error("fixture_clear_failed");
            setDevices((old) => old.map((device) => device.deviceId === id
              ? { ...device, displayName: name || device.deviceName, localAlias: name || undefined }
              : device));
            const device = devices.find((candidate) => candidate.deviceId === id);
            return { ...device, displayName: name || device.deviceName, localAlias: name || undefined };
          }}
        />;
      }
      createRoot(document.getElementById("root")).render(<Fixture />);
    `,
    resolveDir: repo,
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  format: "iife",
  outfile: `${out}/devices-requests.js`,
  target: ["chrome91"],
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const sharedUnicodePrefix = "Prefix 🌿 Café 東京 ".repeat(2);
const fullUnicodeNameA = `${sharedUnicodePrefix}👨‍👩‍👧‍👦 é Alpha`;
const fullUnicodeNameB = `${sharedUnicodePrefix}👨‍👩‍👧‍👦 é Beta`;
assert(
  [...fullUnicodeNameA].length <= 64 && [...fullUnicodeNameB].length <= 64
);
try {
  await page.setContent('<div id="root"></div>');
  for (const css of ["packages/ui/src/styles.css", "packages/ui/src/host.css"])
    await page.addStyleTag({
      content: await readFile(`${repo}/${css}`, "utf8"),
    });
  await page.addScriptTag({ path: `${out}/devices-requests.js` });
  const devicesNav = page.getByRole("button", { name: /^Devices/ });
  const requestsNav = page.getByRole("button", { name: /^Requests/ });
  await devicesNav.click();
  const trustedRows = page.locator(".peer-item:not(.active)");
  assert.equal(await trustedRows.count(), 20, "all 20 Trusted Devices render");
  const firstTrustedDevice = trustedRows.filter({
    hasText: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value) => (window.fixture.copied = value) },
    });
  });
  for (const [peerId, status] of [
    ["direct-peer", "Connected · direct"],
    ["relay-peer", "Connected · relay"],
    ["offline-peer", "Offline"],
    ["unknown-path-peer", "Connected · path unknown"],
  ]) {
    const row = trustedRows.filter({ hasText: peerId });
    assert.equal(await row.getByText(status, { exact: true }).count(), 1);
  }
  for (const [peerId, fullName] of [
    ["unicode-peer-a", fullUnicodeNameA],
    ["unicode-peer-b", fullUnicodeNameB],
  ]) {
    const row = trustedRows.filter({ hasText: peerId });
    assert.equal(
      await row.locator(".peer-name").getAttribute("title"),
      fullName
    );
    await row.scrollIntoViewIfNeeded();
    await row
      .getByRole("button", { name: "Edit Local Device Alias", exact: true })
      .click();
    assert.ok(
      (await page.locator(".peer-full-value").innerText()).includes(fullName)
    );
    await page
      .getByRole("button", { name: "Copy Device Name", exact: true })
      .click();
    assert.equal(await page.evaluate(() => window.fixture.copied), fullName);
    await page
      .getByRole("button", { name: "Cancel alias edit", exact: true })
      .click();
  }
  const lastTrustedDevice = trustedRows.filter({
    hasText: "Trusted device 20",
  });
  await lastTrustedDevice.scrollIntoViewIfNeeded();
  const lastDeviceBounds = await lastTrustedDevice.boundingBox();
  assert(
    lastDeviceBounds &&
      lastDeviceBounds.y >= 0 &&
      lastDeviceBounds.y + lastDeviceBounds.height <= 844,
    "the last Trusted Device can be scrolled fully into view"
  );
  assert.equal(await requestsNav.isVisible(), true);
  assert.match(
    await requestsNav.innerText(),
    /\(4\)/,
    "Requests count remains visible"
  );
  await requestsNav.click();
  const pendingCards = page.locator(".pending-card");
  assert.equal(
    await pendingCards.count(),
    4,
    "all four pending Requests render"
  );
  const lastPendingRequest = pendingCards.filter({
    hasText: "Waiting device 4",
  });
  await lastPendingRequest.scrollIntoViewIfNeeded();
  const lastRequestBounds = await lastPendingRequest.boundingBox();
  assert(
    lastRequestBounds &&
      lastRequestBounds.y >= 0 &&
      lastRequestBounds.y + lastRequestBounds.height <= 844,
    "the last pending Request can be scrolled fully into view"
  );
  assert.equal(await devicesNav.isVisible(), true);
  await devicesNav.click();
  await firstTrustedDevice
    .getByRole("button", { name: "Edit Local Device Alias", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy Peer ID", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.fixture.copied),
    "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv"
  );
  const alias = page.getByRole("textbox", { name: "Local Device Alias" });
  await alias.fill("Keep alias on failure");
  await page
    .getByRole("button", { name: "Use device name", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Alias Save was not confirmed" })
    .waitFor();
  assert.equal(await alias.inputValue(), "Keep alias on failure");
  await page.evaluate(() => {
    window.fixture.fail = false;
  });
  await page
    .getByRole("button", { name: "Use device name", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Local Device Alias"]') === null
  );
  assert.deepEqual(
    await page.evaluate(() => window.fixture.calls),
    [
      { id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv", name: "" },
      { id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv", name: "" },
    ],
    "Use device name clears only the local alias through the existing alias action"
  );
  await firstTrustedDevice
    .getByRole("button", { name: "Edit Local Device Alias", exact: true })
    .click();
  await alias.fill("Submitted before clear");
  await page.evaluate(() => {
    window.fixture.holdNext = true;
  });
  await page
    .getByRole("button", { name: "Use device name", exact: true })
    .click();
  await page.waitForFunction(
    () => typeof window.fixture.resolveClear === "function"
  );
  await alias.fill("Newer alias typed while clear is pending");
  await page.evaluate(() => window.fixture.resolveClear());
  await page.waitForFunction(() => {
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save Local Device Alias"
    );
    return Boolean(save && !save.disabled);
  });
  assert.equal(
    await alias.inputValue(),
    "Newer alias typed while clear is pending"
  );
  await page
    .getByRole("button", { name: "Save Local Device Alias", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Local Device Alias"]') === null
  );
  assert.deepEqual(
    await page.evaluate(() => window.fixture.calls.slice(-2)),
    [
      { id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv", name: "" },
      {
        id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
        name: "Newer alias typed while clear is pending",
      },
    ],
    "a later Save applies the newer alias draft after the clear completes"
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const device = window.fixture.getDevices()[0];
      return { deviceName: device.deviceName, displayName: device.displayName };
    }),
    {
      deviceName: "Reported device name",
      displayName: "Newer alias typed while clear is pending",
    },
    "saving the newer alias leaves the reported Device Name unchanged"
  );
  await page.getByRole("button", { name: /^Devices/ }).click();
  assert.equal(
    await page.getByText("Trusted Devices", { exact: true }).count(),
    1
  );
  assert.equal(await page.getByText("This device", { exact: true }).count(), 1);
  assert.equal(
    await page.getByText("Connected · path unknown", { exact: true }).count(),
    1
  );
  await requestsNav.click();
  await page
    .locator(".pending-card")
    .filter({ hasText: "Waiting device" })
    .waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.fixture.setDevices([]);
    window.fixture.setPending([]);
  });
  await page.getByText("No pending requests.", { exact: true }).waitFor();
  assert.equal(await requestsNav.innerText(), "Requests");
  await devicesNav.click();
  await page.getByText("No devices yet.", { exact: true }).waitFor();
  assert.equal(await trustedRows.count(), 0, "zero Trusted Devices render");

  await page.evaluate(() => {
    window.fixture.setDevices([window.fixture.singleDevice]);
    window.fixture.setPending([
      {
        deviceId: "single-request",
        deviceName: "Single incoming Request",
        requestVersion: "single-version",
      },
    ]);
  });
  await trustedRows
    .filter({ hasText: "single-peer" })
    .waitFor({ state: "visible" });
  assert.equal(await trustedRows.count(), 1, "one Trusted Device renders");
  assert.match(await requestsNav.innerText(), /\(1\)/);
  await requestsNav.click();
  assert.equal(await pendingCards.count(), 1, "one pending Request renders");
  await pendingCards
    .filter({ hasText: "Single incoming Request" })
    .waitFor({ state: "visible" });
} finally {
  await browser.close();
}
