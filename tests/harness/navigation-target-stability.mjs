import assert from "node:assert/strict";

/** A browser-rendered public-props transition, not a native input qualification. */
export async function checkNavigationTargetStability({
  page,
  nav,
  report,
  host,
}) {
  assert.equal(host, "android");
  await page.setViewportSize({ width: 422, height: 340 });
  // Match the independently measured native navigation text size while leaving
  // production rem spacing/layout untouched. This is a typography surrogate.
  await page.addStyleTag({
    content: ".workspace-navigation { font-size: 24.5px; }",
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
    window.publishFixture({
      pending: [],
      requestsLoading: false,
      requestsUnavailable: true,
    });
    window.startFixtureGeometry({
      sequence: 1,
      windowPx: { left: 0, top: 0, width: 1107, height: 892 },
      webViewPx: { left: 0, top: 0, width: 1107, height: 892 },
      safeAreaPx: { left: 0, top: 63, width: 981, height: 829 },
      systemBarsPx: { left: 0, top: 63, right: 126, bottom: 0 },
      cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
      imePx: { left: 0, top: 0, right: 0, bottom: 0 },
      density: 2.625,
      fontScale: 2,
      textZoomPercent: 175,
      imeVisible: false,
    });
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.hostGeometry === "android"
  );
  await nav.getByRole("button", { name: "Devices", exact: true }).waitFor();
  const query = page.getByLabel("Search history", { exact: true });
  await query.fill("retained target query");
  const devices = nav.getByRole("button", { name: "Devices", exact: true });
  await devices.scrollIntoViewIfNeeded();
  const before = await devices.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const navigation = element.closest("nav");
    return {
      point,
      ownsCenter: element.contains(document.elementFromPoint(point.x, point.y)),
      nav: [...navigation.querySelectorAll("button")].map((button) => ({
        label: button.textContent.trim(),
        rect: button.getBoundingClientRect().toJSON(),
      })),
      font: getComputedStyle(element).fontSize,
      typography: {
        rootFont: getComputedStyle(document.documentElement).fontSize,
        navFont: getComputedStyle(navigation).fontSize,
        buttonLineHeight: getComputedStyle(element).lineHeight,
        navPadding: getComputedStyle(navigation).padding,
        navGap: getComputedStyle(navigation).gap,
      },
      viewport: { width: innerWidth, height: innerHeight },
      shell: document
        .querySelector(".app-shell")
        .getBoundingClientRect()
        .toJSON(),
      scroll: document.querySelector(".app-shell").scrollTop,
    };
  });
  assert.equal(
    before.ownsCenter,
    true,
    "initial Devices center owns its target"
  );
  await page.evaluate(() =>
    window.publishFixture({ requestsUnavailable: false })
  );
  await nav.getByRole("button", { name: "Devices", exact: true }).waitFor();
  const after = await nav.evaluate((navigation, point) => {
    const hit = document.elementFromPoint(point.x, point.y)?.closest("button");
    return {
      originalPointOwner: hit?.textContent.trim() ?? null,
      nav: [...navigation.querySelectorAll("button")].map((button) => ({
        label: button.textContent.trim(),
        rect: button.getBoundingClientRect().toJSON(),
      })),
      viewport: { width: innerWidth, height: innerHeight },
      scroll: document.querySelector(".app-shell").scrollTop,
    };
  }, before.point);
  // Preserve the original semantic center rather than locator.click's fresh geometry.
  await page.mouse.click(before.point.x, before.point.y);
  const result = await page.evaluate(() => ({
    destination: document
      .querySelector(
        'nav[aria-label="Clipp destinations"] [aria-current="page"]'
      )
      ?.textContent.trim(),
    heading: [...document.querySelectorAll("h1")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.textContent.trim()),
    query: document.querySelector('input[aria-label="Search history"]')?.value,
  }));
  const observation = {
    label:
      "Devices original center remains Devices across Requests availability",
    native: false,
    profile: {
      viewport: "422x340",
      rendererRootFontPercent: 100,
      measuredNavigationFontPx: 24.5,
      limitation:
        "Measured navigation typography surrogate with synthetic public HostGeometry. Not whole-OS scaling, Android textZoom or native input evidence.",
    },
    before,
    after,
    result,
    passed: false,
  };
  report.cases.push(observation);
  assert.equal(
    after.originalPointOwner,
    "Devices",
    "Requests availability must not substitute a different navigation action at Devices' original center"
  );
  assert.equal(result.destination, "Devices");
  assert.ok(result.heading.includes("Devices"));
  assert.equal(await query.inputValue(), "retained target query");
  observation.passed = true;
}
