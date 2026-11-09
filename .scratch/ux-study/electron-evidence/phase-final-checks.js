(async () => {
  globalThis.oldGeometry = geometry;
  geometry = async () => {
    const g = await oldGeometry();
    g.visibility = await page.evaluate(() => {
      const visibleRect = (e) => {
        let r = e.getBoundingClientRect(),
          l = Math.max(0, r.left),
          t = Math.max(0, r.top),
          rr = Math.min(innerWidth, r.right),
          b = Math.min(innerHeight, r.bottom);
        for (let p = e.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p),
            q = p.getBoundingClientRect();
          if (/hidden|auto|scroll|clip/.test(s.overflowX)) {
            l = Math.max(l, q.left);
            rr = Math.min(rr, q.right);
          }
          if (/hidden|auto|scroll|clip/.test(s.overflowY)) {
            t = Math.max(t, q.top);
            b = Math.min(b, q.bottom);
          }
        }
        return {
          area: Math.max(0, rr - l) * Math.max(0, b - t),
          full:
            l <= r.left + 0.5 &&
            t <= r.top + 0.5 &&
            rr >= r.right - 0.5 &&
            b >= r.bottom - 0.5,
          rect: r.toJSON(),
        };
      };
      const cards = [...document.querySelectorAll(".history-card")].map(
          visibleRect
        ),
        grid = document.querySelector(".history-grid");
      return {
        fullCards: cards.filter((c) => c.full).length,
        partialCards: cards.filter((c) => c.area > 0 && !c.full).length,
        firstCards: cards.slice(0, 8),
        gridRows: grid ? getComputedStyle(grid).gridTemplateRows : null,
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
        gridGap: grid ? getComputedStyle(grid).gap : null,
        visibleControls: [
          ...document.querySelectorAll("button,input,select,textarea"),
        ]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => ({
            text:
              e.innerText ||
              e.getAttribute("aria-label") ||
              e.getAttribute("placeholder"),
            ...visibleRect(e),
          })),
      };
    });
    return g;
  };
  await inject(data.typical);
  await page.reload();
  await page.waitForSelector(".history-card");
  for (const [w, h, name] of [
    [480, 608, "minimum"],
    [520, 728, "default"],
    [601, 728, "search-start"],
    [800, 728, "ordinary"],
    [1101, 728, "sidebar-start"],
    [1440, 868, "wide"],
  ]) {
    await size(w, h);
    await snap("measured-" + name, {
      evidenceClass: "rendered-fixture",
      scenario: "Ancestor-clipped card visibility",
    });
  }
  for (const zoom of [1.25, 1.5, 2]) {
    await electron.evaluate(
      ({ BrowserWindow }, z) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z),
      zoom
    );
    await sleep(250);
    await snap("wide-zoom-" + zoom, {
      evidenceClass: "rendered-fixture",
      scenario: "Wider window with page zoom",
    });
  }
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  );
  await size(640, 728);
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2)
  );
  await sleep(250);
  await snap("reflow-320-css", {
    evidenceClass: "rendered-fixture",
    scenario: "320 CSS px at 200 percent zoom",
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  );
  await size(520, 728);
  await page.reload();
  await page.waitForSelector(".history-card");
  await inject({
    ...data.typical,
    historyPolicyError: "history_cleanup_failed",
  });
  await snap("measured-cleanup-banner", {
    evidenceClass: "rendered-fixture",
    scenario: "Notice geometry and hit targets",
  });
  out({
    bannerHitTargets: await page
      .locator(".initialization-error button")
      .evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            rect: r.toJSON(),
            centerHit: document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.outerHTML.slice(0, 180),
          };
        })
      ),
  });
  await inject(data.typical);
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("clipp:get-initialization-error");
    ipcMain.handle("clipp:get-initialization-error", () => ({
      code: "identity_initialization_failed",
    }));
    globalThis.__uxFailures["get-state"] =
      "study_identity_initialization_failed";
  });
  await page.reload();
  await page.waitForSelector(".initialization-error");
  await snap("initialization-error-fixture", {
    evidenceClass: "rendered-fixture",
    scenario: "Identity initialization failure",
    limitations: ["Renderer seam only; bootstrap recovery window not induced"],
  });
  await electron.evaluate(() => {
    globalThis.__uxFailures = {};
  });
  await page.reload();
  await page.waitForSelector(".history-card");
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize()
  );
  await sleep(400);
  out({
    beforeTray: await electron.evaluate(({ BrowserWindow }) => ({
      minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
      visible: BrowserWindow.getAllWindows()[0].isVisible(),
    })),
  });
  await electron.evaluate(() =>
    globalThis.__uxMenus
      .flatMap((m) => m.items)
      .find((i) => i.label === "Open Clipp")
      .click()
  );
  await sleep(500);
  out({
    afterTray: await electron.evaluate(({ BrowserWindow }) => ({
      minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
      visible: BrowserWindow.getAllWindows()[0].isVisible(),
    })),
  });
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close()
  );
  out({
    afterWindowClose: await electron.evaluate(({ app, BrowserWindow }) => ({
      visible: BrowserWindow.getAllWindows()[0].isVisible(),
      dock: app.dock.isVisible(),
    })),
  });
  await electron.evaluate(() =>
    globalThis.__uxMenus
      .flatMap((m) => m.items)
      .find((i) => i.label === "Configure Relays")
      .click()
  );
  await sleep(400);
  out({
    afterConfigureReopen: await electron.evaluate(({ app, BrowserWindow }) => ({
      visible: BrowserWindow.getAllWindows()[0].isVisible(),
      dock: app.dock.isVisible(),
    })),
    drawerOpen: await page.locator(".nav-drawer").count(),
  });
})();
