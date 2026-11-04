import assert from "node:assert/strict";

// Controlled UI state only; no real device connections or Clip sends.
export async function checkConnectionSummary({ page, nav, report }) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForFunction(() =>
    document.querySelector(".app-shell")?.classList.contains("workspace-wide")
  );
  const relay = {
    key: "relay-a",
    name: "Test relay",
    kind: "managed",
    discoveryUrl: "https://fixture.invalid/relay",
  };
  await page.evaluate(
    (config) =>
      window.publishFixture({
        devices: [{ deviceId: "remote", deviceName: "Trusted laptop" }],
        peers: ["remote"],
        connectionStateKnown: true,
        peerConnections: [
          {
            peerId: "remote",
            path: "direct",
            hasDirect: true,
            hasRelay: false,
            addrs: [],
          },
        ],
        managedRelayConfigurations: [config],
        managedRelayStates: [
          {
            key: config.key,
            name: config.name,
            kind: "managed",
            status: "degraded",
            warning: "Renewal needs attention",
          },
        ],
      }),
    relay
  );
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByLabel("Search history", { exact: true })
    .fill("retained query");
  const status = page.locator(".workspace-topbar .connection-status");
  await status.waitFor();
  await status.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Devices", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("dialog", { name: "Connections" }).count(),
    0
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".trusted-device-section")
      ?.textContent?.includes("Trusted laptop")
  );
  assert.equal(
    await page.evaluate(() => window.fixtureSession.getSnapshot().search),
    "retained query"
  );
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  const relayRow = page.locator("details.managed-relay-card").first();
  await relayRow
    .getByText("Degraded: Rendezvous unavailable", { exact: true })
    .waitFor();
  assert.equal(
    await relayRow
      .getByText("Renewal needs attention", { exact: true })
      .isVisible(),
    true
  );
  assert.equal(
    await relayRow.getAttribute("open"),
    null,
    "relay health is visible without expanding the row"
  );
  report.cases.push({
    label:
      "Connection icon opens Devices; relay health remains visible in Connections settings",
    passed: true,
  });
}
