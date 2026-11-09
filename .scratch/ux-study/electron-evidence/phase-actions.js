(async () => {
  await inject(data.typical);
  await page.reload();
  await page.waitForSelector(".history-card");
  await size(800, 728);
  await page
    .getByPlaceholder("Search history: text, URL, device…")
    .fill("shopping");
  await page.locator(".content-filter-toggle button").click();
  await snap("filtered-before-clear", {
    evidenceClass: "rendered-fixture",
    scenario: "Clear filtered history",
  });
  const before = await page.locator(".history-card").count();
  await page
    .locator(".content-filters")
    .getByRole("button", { name: "Clear", exact: false })
    .click();
  out({
    clearVisibleBefore: before,
    allHistoryAfter: (await page.evaluate(() => window.clipp.getState())).clips
      .length,
  });
  await snap("filtered-after-clear", {
    evidenceClass: "rendered-fixture",
    scenario: "Clear filtered history",
    actual: "All fixture Clips removed without confirmation; query remains",
    outcome: "fail",
  });
  await inject(data.typical);
  await page.reload();
  await page.waitForSelector(".history-card");
  await size(520, 728);
  await page.locator(".app-logo").click();
  await electron.evaluate(
    () =>
      (globalThis.__uxFailures["rename-identity"] = "study_name_save_failed")
  );
  await page
    .locator(".drawer-pane")
    .getByTitle("Rename this device", { exact: true })
    .first()
    .click();
  await page.locator(".drawer-pane .peer-name-input").fill("N".repeat(65));
  await page.locator(".drawer-pane .peer-name-input").press("Enter");
  await snap("rename-save-failure", {
    evidenceClass: "rendered-fixture",
    scenario: "Name save rejected",
    actual: "Editor closes, old name returns, no explanation",
    outcome: "fail",
  });
  out({
    nameEditorAfterReject: await page
      .locator(".peer-name-input:visible")
      .count(),
  });
  await electron.evaluate(() => (globalThis.__uxFailures = {}));
  await page.locator(".nav-drawer button").first().click();
  await electron.evaluate(
    () => (globalThis.__uxFailures["reuse-clip"] = "study_reuse_failed")
  );
  await page
    .locator(".history-card")
    .first()
    .getByRole("button", { name: "Copy", exact: false })
    .click();
  await snap("copy-failure-banner", {
    evidenceClass: "rendered-fixture",
    scenario: "Retained Copy failure feedback",
  });
  await electron.evaluate(({ ipcMain }) => {
    globalThis.__uxFailures = {};
    ipcMain.removeHandler("clipp:reuse-clip");
    ipcMain.handle("clipp:reuse-clip", () => ({
      outcome: "copied-without-clip",
    }));
  });
  await page
    .locator(".history-card")
    .first()
    .getByRole("button", { name: "Copy", exact: false })
    .click();
  await snap("copy-partial-success-banner", {
    evidenceClass: "rendered-fixture",
    scenario: "Copied without storing a new Clip",
  });
  await page.reload();
  await page.waitForSelector(".history-card");
  await page
    .locator(".history-grid")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page
    .locator(".history-card")
    .last()
    .getByTitle("More", { exact: true })
    .click();
  await snap("last-card-menu", {
    evidenceClass: "rendered-fixture",
    scenario: "Bottom-row overflow menu",
  });
  await page.reload();
  await page.waitForSelector(".history-card");
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("clipp:open-qr-window");
    ipcMain.handle("clipp:open-qr-window", () => ({
      image: null,
      text: "Synthetic rendering-only pairing payload",
    }));
  });
  await page.locator(".app-logo").click();
  await page
    .locator(".drawer-pane")
    .getByRole("button", { name: "Show my QR" })
    .click();
  await page.waitForSelector(".qr-modal-status");
  await snap("qr-copy-fallback", {
    evidenceClass: "rendered-fixture",
    scenario: "Pairing target too large for QR",
  });
  await page.getByRole("button", { name: "Close QR dialog" }).click();
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("clipp:open-qr-window");
    ipcMain.handle("clipp:open-qr-window", () => {
      throw Error("study_qr_failure");
    });
  });
  await page.locator(".app-logo").click();
  await page
    .locator(".drawer-pane")
    .getByRole("button", { name: "Show my QR" })
    .click();
  await page.waitForSelector(".qr-modal-error");
  await snap("qr-generation-error", {
    evidenceClass: "rendered-fixture",
    scenario: "Pairing QR generation fails",
  });
  await page.getByRole("button", { name: "Close QR dialog" }).click();
  await size(1101, 728);
  await snap("sidebar-ordinary-labels", {
    evidenceClass: "rendered-fixture",
    scenario: "Label truncation at sidebar boundary",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].maximize()
  );
  await sleep(600);
  await snap("measured-maximized", {
    evidenceClass: "rendered-fixture",
    scenario: "Ancestor-clipped visibility in maximized mode",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(true)
  );
  await sleep(1400);
  await snap("measured-fullscreen", {
    evidenceClass: "rendered-fixture",
    scenario: "Fullscreen space use",
  });
  await inject({ ...data.typical, clips: data.typical.clips.slice(0, 1) });
  await snap("fullscreen-one-clip", {
    evidenceClass: "rendered-fixture",
    scenario: "Fullscreen sparse history",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(false)
  );
  await sleep(1000);
})();
