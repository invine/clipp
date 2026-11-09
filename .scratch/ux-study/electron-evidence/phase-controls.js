(async () => {
  await size(800, 728);
  await page.reload();
  await page.waitForSelector(".history-card");
  await page
    .getByPlaceholder("Search history: text, URL, device…")
    .fill("NO_MATCH_9f69e62");
  await snap("search-no-results", {
    evidenceClass: "rendered-fixture",
    scenario: "Search with no results",
  });
  await size(520, 728);
  await snap("search-hidden-active", {
    evidenceClass: "rendered-fixture",
    scenario: "Resize with active search",
    expected: "Query remains visible or removable",
    actual:
      "Search vanishes; history remains filtered; empty message says No clips yet",
    outcome: "fail",
  });
  await size(800, 728);
  await page.getByPlaceholder("Search history: text, URL, device…").fill("");
  await size(520, 728);
  const before = await page
    .locator(".app-shell")
    .evaluate((e) => ({ css: getComputedStyle(e).cssText, html: e.outerHTML }));
  await page.getByTitle("Toggle theme").click();
  const after = await page
    .locator(".app-shell")
    .evaluate((e) => ({ css: getComputedStyle(e).cssText, html: e.outerHTML }));
  out({ themeChanged: before.html !== after.html || before.css !== after.css });
  await page.evaluate(() => document.activeElement.blur());
  const tabOrder = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    tabOrder.push(
      await page.evaluate(() => ({
        tag: document.activeElement.tagName,
        title: document.activeElement.title,
        text: document.activeElement.textContent,
      }))
    );
  }
  out({
    tabOrder,
    logo: await page
      .locator(".app-logo")
      .evaluate((e) => ({
        role: e.getAttribute("role"),
        tabIndex: e.tabIndex,
      })),
  });
  await page.locator(".app-logo").click();
  await page
    .locator(".nav-drawer")
    .getByRole("button", { name: "Add relay", exact: true })
    .click();
  await page
    .locator(".nav-drawer")
    .getByLabel("Name", { exact: true })
    .fill("Unsaved study relay");
  await page
    .locator(".nav-drawer")
    .getByLabel("HTTPS discovery URL")
    .fill("https://relay.example.invalid/v1/relay");
  await snap("relay-draft-before-resize", {
    evidenceClass: "rendered-fixture",
    scenario: "Resize during relay editing",
  });
  await size(1101, 728);
  out({
    visibleEditorsAfterResize: await page
      .locator(".managed-relay-editor:visible")
      .count(),
    draftValue: await page
      .locator(".managed-relay-editor input")
      .evaluateAll((es) => es.map((e) => e.value)),
  });
  await snap("relay-draft-after-resize", {
    evidenceClass: "rendered-fixture",
    scenario: "Resize during relay editing",
    actual: "Drawer editor unmounts and unsaved relay draft disappears",
    outcome: "fail",
  });
  await inject({ ...data.typical, autoSync: false });
  await snap("auto-sync-off-synced", {
    evidenceClass: "rendered-fixture",
    scenario: "Auto Sync off with connected peer",
  });
  await size(520, 728);
  await page.locator(".app-logo").click();
  await page
    .locator(".nav-drawer")
    .getByRole("button", { name: "Show my QR" })
    .click();
  await page.waitForSelector(".qr-modal-image");
  const qrFocus = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    qrFocus.push(
      await page.evaluate(() => ({
        insideDialog: !!document.activeElement.closest(".qr-modal"),
        title: document.activeElement.title,
        text: document.activeElement.textContent,
      }))
    );
  }
  out({ qrFocus });
  await page.keyboard.press("Escape");
  out({ qrEscapeStillOpen: await page.locator(".qr-modal").count() });
  await size(480, 608);
  await snap("qr-minimum", {
    evidenceClass: "rendered-fixture",
    scenario: "Resize open QR dialog to native minimum",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2)
  );
  await sleep(300);
  await snap("qr-200-percent", {
    evidenceClass: "rendered-fixture",
    scenario: "Open QR dialog at 200 percent zoom",
  });
  await page.getByRole("button", { name: "Close QR dialog" }).click();
  await snap("history-200-percent", {
    evidenceClass: "rendered-fixture",
    scenario: "Minimum native window at 200 percent zoom",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  );
  await size(520, 728);
  for (const [name, props] of [
    ["pending-capture", { clipboardHistoryError: "pending_capture_failed" }],
    ["cleanup", { historyPolicyError: "history_cleanup_failed" }],
    ["recovery", { identityRotationRecovery: true }],
    ["notice", { identityRotationNotice: "revoked" }],
    [
      "stacked",
      {
        clipboardHistoryError: "pending_capture_failed",
        historyPolicyError: "history_cleanup_failed",
        identityRotationRecovery: true,
      },
    ],
  ]) {
    await inject({ ...data.typical, ...props });
    await snap("banner-" + name, {
      evidenceClass: "rendered-fixture",
      scenario: "Recovery and failure banners",
      fixture: name,
    });
  }
  await inject(data.typical);
  await page.reload();
  await page.waitForSelector(".history-card");
})();
