(async () => {
  const s = structuredClone(data.dense);
  s.pending = data.ids
    .slice(20)
    .map((id, i) => ({
      deviceId: id,
      deviceName: "Incoming study device " + i + " " + "N".repeat(i ? 20 : 60),
    }));
  s.waiting = data.ids
    .slice(16, 20)
    .map((targetPeerId) => ({
      targetPeerId,
      expiresAtUnixMs: data.clock + 300000,
    }));
  s.pairingErrors = [
    { targetPeerId: data.ids[18], code: "membership_persistence_failed" },
  ];
  s.managedRelayConfigurations = [
    "login_needed",
    "ready",
    "degraded",
    "refused",
    "retrying",
    "conflict",
    "connecting",
  ].map((status, i) => ({
    key: "study-relay-" + i,
    name:
      i === 0
        ? "Very long relay name " + "N".repeat(236)
        : "Study relay " + status,
    kind: "managed",
    discoveryUrl:
      "https://" + "long-hostname-".repeat(8) + "example.invalid/v1/relay",
  }));
  s.managedRelayStates = s.managedRelayConfigurations.map((c, i) => ({
    key: c.key,
    kind: c.kind,
    status: [
      "login_needed",
      "ready",
      "degraded",
      "refused",
      "retrying",
      "conflict",
      "connecting",
    ][i],
    reason: i === 3 ? "concurrent_session_limit" : undefined,
    warning: i === 2 ? "Synthetic diagnostic warning. ".repeat(10) : undefined,
  }));
  globalThis.denseState = s;
  await inject(s);
  await size(520, 728);
  await page.reload();
  await page.waitForSelector(".history-card");
  await page.locator(".app-logo").click();
  await snap("dense-drawer-top", {
    evidenceClass: "rendered-fixture",
    scenario: "Concurrent pending requests and dense settings",
  });
  out({
    drawerMetrics: await page
      .locator(".drawer-pane")
      .evaluate((e) => ({
        height: e.clientHeight,
        scrollHeight: e.scrollHeight,
      })),
    buttons: await page.locator(".drawer-pane button").allTextContents(),
  });
  await page
    .locator(".drawer-pane .managed-relay-card")
    .first()
    .scrollIntoViewIfNeeded();
  await snap("dense-relay-long-name", {
    evidenceClass: "rendered-fixture",
    scenario: "Long relay name and endpoint",
  });
  await page
    .locator(".drawer-pane")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await snap("dense-drawer-bottom", {
    evidenceClass: "rendered-fixture",
    scenario: "Reach final relay and everyday settings",
  });
  await size(1101, 728);
  await page
    .locator(".nav-pane")
    .first()
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await snap("dense-sidebar-bottom", {
    evidenceClass: "rendered-fixture",
    scenario: "Long relay actions in 260px sidebar",
  });
  out({
    relayActionGeometry: await page
      .locator(".nav-pane")
      .first()
      .locator(".managed-relay-card")
      .evaluateAll((es) =>
        es.map((e) => ({
          card: e.getBoundingClientRect().toJSON(),
          actions: e
            .querySelector(".peer-actions")
            .getBoundingClientRect()
            .toJSON(),
          buttons: [...e.querySelectorAll("button")].map((b) => ({
            text: b.innerText,
            rect: b.getBoundingClientRect().toJSON(),
          })),
        }))
      ),
  });
  await size(520, 728);
  await inject({ ...data.typical, pending: s.pending.slice(0, 2) });
  await page.reload();
  await page.waitForSelector(".history-card");
  await snap("pending-main-no-indicator", {
    evidenceClass: "rendered-fixture",
    scenario: "Incoming approval while drawer closed",
  });
  await page.locator(".app-logo").click();
  out({ approvalText: await page.locator(".drawer-pane").innerText() });
  await electron.evaluate(() => {
    globalThis.__uxFailures["respond-trust"] = "study_storage_failure";
  });
  await page
    .locator(".drawer-pane")
    .getByRole("button", { name: "Accept", exact: true })
    .first()
    .click();
  await sleep(250);
  await snap("pending-accept-failure", {
    evidenceClass: "rendered-fixture",
    scenario: "Accept request fails",
    actual: "No visible error/retry explanation after bridge rejection",
  });
  await electron.evaluate(() => {
    globalThis.__uxFailures = {};
  });
  await page.locator(".nav-drawer button").first().click();
  await inject(data.typical);
  await size(800, 728);
  await page.reload();
  await page.waitForSelector(".history-card");
  await page
    .getByRole("button", { name: "More", exact: false })
    .filter({ hasText: "More" })
    .first()
    .click();
  await page.locator(".source-filter-wrap button").first().click();
  await snap("source-menu-long-names", {
    evidenceClass: "rendered-fixture",
    scenario: "Source filter with long device names",
  });
  await page.keyboard.press("Escape");
  out({
    sourceMenuEscapeStillOpen: await page.locator(".source-menu").count(),
  });
})();
