(async () => {
  globalThis.data = await require(path.join(dir, "fixture.cjs"))(base);
  await fs.writeFile(
    path.join(dir, "fixture-public.json"),
    JSON.stringify(globalThis.data, null, 2)
  );
  await electron.evaluate(
    require(path.join(dir, "mock-bridge.cjs")),
    data.typical
  );
  await page.clock.setFixedTime(new Date(data.clock));
  await inject(data.typical);
  for (const [w, h, label] of [
    [480, 608, "minimum"],
    [520, 728, "default"],
    [800, 728, "ordinary"],
    [1200, 608, "short-wide"],
    [1280, 688, "1280x720-outer"],
    [1440, 868, "1440x900-outer"],
    [599, 728, "599"],
    [600, 728, "600"],
    [601, 728, "601"],
    [899, 728, "899"],
    [900, 728, "900"],
    [901, 728, "901"],
    [1099, 728, "1099"],
    [1100, 728, "1100"],
    [1101, 728, "1101"],
    [800, 759, "height759"],
    [800, 760, "height760"],
    [800, 761, "height761"],
  ]) {
    await size(w, h);
    await snap("sizing-" + label, {
      evidenceClass: "rendered-fixture",
      scenario: "Typical history resize",
      fixture: "typical",
      requestedContent: { w, h },
      fonts: "intercepted upstream",
    });
  }
  await size(1100, 728);
  await page.locator(".app-logo").click();
  out({ exact1100Drawer: await page.locator(".nav-drawer").count() });
  await size(1099, 728);
  await page.locator(".app-logo").click();
  out({ below1100Drawer: await page.locator(".nav-drawer").count() });
  await page.locator(".nav-drawer button").first().click();
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].maximize()
  );
  await sleep(800);
  await snap("native-maximized-typical", {
    evidenceClass: "rendered-fixture",
    scenario: "Native maximized with typical fixture",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(true)
  );
  await sleep(1500);
  await snap("native-fullscreen-typical", {
    evidenceClass: "rendered-fixture",
    scenario: "Native fullscreen with typical fixture",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(false)
  );
  await sleep(1200);
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].unmaximize()
  );
  await size(520, 728);
})();
