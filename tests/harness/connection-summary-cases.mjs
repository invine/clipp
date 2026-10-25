import assert from "node:assert/strict";
import { join } from "node:path";

// Candidate UI only: ordered public prop publications to the actual ClipboardApp.
// This fixture makes no transport, native-host or delivery qualification claim.
export async function checkConnectionSummary({ page, nav, report, out, host }) {
  await page.setViewportSize({ width: 320, height: 640 });
  if (host === "android") {
    await page.evaluate(() =>
      window.startFixtureGeometry({
        sequence: 1,
        windowPx: { left: 0, top: 0, width: 640, height: 1280 },
        webViewPx: { left: 0, top: 0, width: 640, height: 1280 },
        safeAreaPx: { left: 0, top: 0, width: 640, height: 1280 },
        systemBarsPx: { left: 0, top: 0, right: 0, bottom: 0 },
        cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
        imePx: { left: 0, top: 0, right: 0, bottom: 0 },
        density: 2,
        fontScale: 1,
        textZoomPercent: 100,
        imeVisible: false,
      })
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.hostGeometry === "android"
    );
  }
  const device = { deviceId: "remote", deviceName: "Trusted laptop" };
  const config = {
    key: "relay-a",
    name: "Configured relay",
    kind: "managed",
    discoveryUrl: "https://fixture.invalid/relay",
  };
  const ready = {
    key: "relay-a",
    name: "Configured relay",
    kind: "managed",
    status: "ready",
  };
  const path = (hasDirect, hasRelay, peerId = "remote") => ({
    peerId,
    path: hasDirect ? "direct" : hasRelay ? "relay" : "unknown",
    hasDirect,
    hasRelay,
    addrs: [],
  });
  const base = {
    devices: [device],
    peers: ["remote"],
    peerConnections: [path(true, false)],
    connectionStateKnown: true,
    managedRelayConfigurations: [config],
    managedRelayStates: [ready],
    clipboardHistoryError: null,
  };
  const scenarios = [
    ["direct", {}, "Direct connection available"],
    [
      "mixed",
      {
        devices: [
          device,
          { deviceId: "other", deviceName: "Other trusted device" },
          { deviceId: "offline", deviceName: "Offline device" },
        ],
        peers: ["remote", "other", "pairing-only"],
        peerConnections: [
          path(true, true),
          path(false, true, "other"),
          path(true, false, "pairing-only"),
        ],
      },
      "Direct connection available",
    ],
    [
      "relay-only",
      { peerConnections: [path(false, true)] },
      "Relay connection available",
    ],
    [
      "direct-no-relay",
      { managedRelayConfigurations: [], managedRelayStates: [] },
      "Direct connection available",
    ],
    [
      "relay-ready-no-devices",
      { peers: [], peerConnections: [] },
      "Waiting for Trusted Devices",
    ],
    [
      "offline",
      {
        peers: [],
        peerConnections: [],
        managedRelayConfigurations: [],
        managedRelayStates: [],
      },
      "No device connection available",
    ],
    [
      "first-use",
      {
        devices: [],
        peers: ["pairing-only"],
        peerConnections: [path(true, false, "pairing-only")],
        managedRelayConfigurations: [],
        managedRelayStates: [],
      },
      "No Trusted Devices yet",
    ],
    [
      "unknown-path",
      { peerConnections: [path(false, false)] },
      "Connection status unknown",
    ],
    [
      "unavailable",
      { connectionStateKnown: false },
      "Connection status unknown",
    ],
    [
      "starting-with-usable-path",
      {
        managedRelayConfigurations: [config, { ...config, key: "relay-b" }],
        managedRelayStates: [
          ready,
          { ...ready, key: "relay-b", status: "connecting" },
        ],
      },
      "Direct connection available",
    ],
    [
      "retrying",
      { managedRelayStates: [{ ...ready, status: "retrying" }] },
      "Connections need attention",
    ],
    [
      "sign-in",
      { managedRelayStates: [{ ...ready, status: "login_needed" }] },
      "Connections need attention",
    ],
    [
      "degraded",
      { managedRelayStates: [{ ...ready, status: "degraded" }] },
      "Connections need attention",
    ],
    [
      "ready-warning",
      {
        managedRelayStates: [{ ...ready, warning: "Renewal needs attention" }],
      },
      "Connections need attention",
    ],
    [
      "clipboard-issue-independent",
      { clipboardHistoryError: "pending_capture_failed" },
      "Direct connection available",
    ],
  ];
  const query = page.getByLabel("Search history", { exact: true });
  const status = page.locator(".app-bar .connection-status");
  const dialog = page.getByRole("dialog", { name: "Connections", exact: true });
  const contrast = (a, b) => {
    const luminance = (color) =>
      color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const aa = luminance(a),
      bb = luminance(b);
    return (Math.max(aa, bb) + 0.05) / (Math.min(aa, bb) + 0.05);
  };
  for (const theme of ["system", "light", "dark"]) {
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
    await page.waitForFunction(
      (value) => document.documentElement.dataset.clippTheme === value,
      theme
    );
    const autoSync = page.getByLabel("Auto Sync", { exact: true });
    if ((await autoSync.inputValue()) !== "disabled") {
      await autoSync.selectOption("disabled");
      await page.getByText("Auto Sync saved.", { exact: true }).waitFor();
    }
    await nav.getByRole("button", { name: "History", exact: true }).click();
    await query.fill("retained S2 query");
    for (const [name, patch, label] of scenarios) {
      await page.evaluate((state) => window.publishFixture(state), {
        ...base,
        ...patch,
      });
      await page
        .getByRole("button", { name: `Connections: ${label}`, exact: true })
        .waitFor();
      assert.equal(
        await status.count(),
        1,
        "one connection control in branding"
      );
      await status.scrollIntoViewIfNeeded();
      await status.focus();
      await status.press("ArrowLeft");
      const measurement = await status.evaluate((element) => {
        const rect = element.getBoundingClientRect(),
          css = getComputedStyle(element),
          header = element.closest(".app-bar").getBoundingClientRect();
        return {
          rect: rect.toJSON(),
          header: header.toJSON(),
          color: css.color,
          background: getComputedStyle(element.closest(".app-bar"))
            .backgroundColor,
          focus: css.outlineColor,
          focusWidth: css.outlineWidth,
          svg: element.querySelector("svg").outerHTML,
        };
      });
      assert.ok(
        measurement.rect.width >= (host === "android" ? 48 : 40) &&
          measurement.rect.height >= (host === "android" ? 48 : 40),
        "status target meets host minimum"
      );
      assert.ok(
        measurement.rect.left >= 0 &&
          measurement.rect.right <= 320 &&
          measurement.rect.top >= 0,
        "compact status in viewport"
      );
      assert.ok(
        contrast(measurement.color, measurement.background) >= 3,
        "status semantic color contrast"
      );
      assert.ok(
        parseFloat(measurement.focusWidth) > 0 &&
          contrast(measurement.focus, measurement.background) >= 3,
        "visible status focus contrast"
      );
      await page.screenshot({
        path: join(out, `s2-${theme}-${name}-header.png`),
      });
      await status.press("Enter");
      await dialog.waitFor();
      await page.screenshot({
        path: join(out, `s2-${theme}-${name}-panel-top.png`),
      });
      assert.ok(
        await dialog.getByText("Auto Sync: Off.", { exact: false }).isVisible()
      );
      assert.ok(
        await dialog
          .getByRole("button", { name: "Open Devices", exact: true })
          .isVisible()
      );
      const finalControl = dialog.getByRole("button", {
        name: "Close connections",
        exact: true,
      });
      await finalControl.scrollIntoViewIfNeeded();
      await finalControl.focus();
      const finalBounds = await finalControl.boundingBox();
      assert.ok(
        finalBounds.y >= 0 && finalBounds.y + finalBounds.height <= 640,
        "final panel control reachable in compact viewport"
      );
      await page.screenshot({ path: join(out, `s2-${theme}-${name}.png`) });
      await finalControl.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await status.evaluate((element) => document.activeElement === element),
        true,
        "Escape returns focus to connection button"
      );
      assert.equal(
        await query.inputValue(),
        "retained S2 query",
        "panel retains query"
      );
      await status.tap();
      await dialog.waitFor();
      await finalControl.scrollIntoViewIfNeeded();
      await finalControl.tap();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await status.evaluate((element) => document.activeElement === element),
        true,
        "touch dismissal returns focus"
      );
      report.cases.push({
        label: `${host}/${theme}/S2 ${name}: compact status, keyboard/touch panel, final control, query/focus return`,
        passed: true,
        native: false,
        measurement,
      });
    }
  }
  for (const [index, variation] of [
    {
      name: "intermediate-attention-200",
      width: 800,
      height: 600,
      text: "200%",
      patch: { managedRelayStates: [{ ...ready, status: "degraded" }] },
      label: "Connections need attention",
    },
    {
      name: "intermediate-unknown-150",
      width: 800,
      height: 600,
      text: "150%",
      patch: { connectionStateKnown: false },
      label: "Connection status unknown",
    },
    {
      name: "compact-direct-200",
      width: 320,
      height: 640,
      text: "200%",
      patch: {},
      label: "Direct connection available",
    },
    {
      name: "short-wide-unknown",
      width: 1100,
      height: 350,
      text: "100%",
      patch: { connectionStateKnown: false },
      label: "Connection status unknown",
    },
    {
      name: "restored-direct",
      width: 800,
      height: 800,
      text: "100%",
      patch: {},
      label: "Direct connection available",
    },
  ].entries()) {
    await page.setViewportSize({
      width: variation.width,
      height: variation.height,
    });
    if (host === "android")
      await page.evaluate(
        ({ width, height, sequence }) =>
          window.publishFixtureGeometry({
            sequence,
            windowPx: { left: 0, top: 0, width: width * 2, height: height * 2 },
            webViewPx: {
              left: 0,
              top: 0,
              width: width * 2,
              height: height * 2,
            },
            safeAreaPx: {
              left: 0,
              top: 0,
              width: width * 2,
              height: height * 2,
            },
            systemBarsPx: { left: 0, top: 0, right: 0, bottom: 0 },
            cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
            imePx: { left: 0, top: 0, right: 0, bottom: 0 },
            density: 2,
            fontScale: 1,
            textZoomPercent: 100,
            imeVisible: false,
          }),
        {
          width: variation.width,
          height: variation.height,
          sequence: index + 2,
        }
      );
    await page.evaluate(
      ({ state, text }) => {
        document.documentElement.style.fontSize = text;
        window.publishFixture(state);
      },
      { state: { ...base, ...variation.patch }, text: variation.text }
    );
    await page
      .getByRole("button", {
        name: `Connections: ${variation.label}`,
        exact: true,
      })
      .waitFor();
    await status.scrollIntoViewIfNeeded();
    const bounds = await status.boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= variation.width &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= variation.height,
      "S2 header in bounds after representative reflow"
    );
    assert.equal(await query.inputValue(), "retained S2 query");
    await page.screenshot({
      path: join(out, `s2-${variation.name}-header.png`),
    });
    await query.focus();
    let keyboardReached = false;
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press("Shift+Tab");
      keyboardReached = await status.evaluate(
        (element) => document.activeElement === element
      );
      if (keyboardReached) break;
    }
    assert.equal(
      keyboardReached,
      true,
      "real Shift+Tab from Search reaches connection control"
    );
    await status.press("Enter");
    await dialog.waitFor();
    const finalControl = dialog.getByRole("button", {
      name: "Close connections",
      exact: true,
    });
    await finalControl.scrollIntoViewIfNeeded();
    const finalBounds = await finalControl.boundingBox();
    assert.ok(
      finalBounds.y >= 0 &&
        finalBounds.y + finalBounds.height <= variation.height,
      "final panel control reachable after representative reflow"
    );
    await page.screenshot({ path: join(out, `s2-${variation.name}.png`) });
    await finalControl.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await status.evaluate((element) => document.activeElement === element),
      true
    );
    report.cases.push({
      label: `${host}/S2 ${variation.name}: header, retained query, final panel control and focus return`,
      passed: true,
      native: false,
      bounds,
      finalBounds,
    });
  }
  await page.evaluate((state) => window.publishFixture(state), base);
  await status.click();
  await dialog.waitFor();
  await page.evaluate((state) => window.publishFixture(state), {
    managedRelayStates: [{ ...ready, status: "login_needed" }],
  });
  await dialog
    .getByText("Connections need attention.", { exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByText("1 Trusted Device connected directly.", { exact: true })
      .isVisible(),
    true
  );
  await page.evaluate(() =>
    window.publishFixture({
      connectionStateKnown: false,
      managedRelayStates: [],
    })
  );
  await dialog
    .getByText("Connection status unknown.", { exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByText("1 Trusted Device connected directly.", { exact: true })
      .count(),
    0
  );
  await dialog
    .getByRole("button", { name: "Close connections", exact: true })
    .click();
  report.cases.push({
    label: `${host}/S2 ordered publications update an open panel without inventing a healthy unavailable path`,
    passed: true,
    native: false,
  });
  if (host === "android")
    await page.evaluate(() => window.stopFixtureGeometry());
}
