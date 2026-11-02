import assert from "node:assert/strict";

// Consumed observation verdict: controlled renderer evidence, never native evidence.
export function selectCampaign(args) {
  assert.ok(
    args.length <= 1 && (!args.length || args[0] === "--subset=history-retry"),
    "only the fixed history-retry subset is supported"
  );
  return args.length ? "history-retry" : "full";
}
const luminance = (rgb) => {
  assert.match(rgb, /^rgb\(\d+(?:\.\d+)?, \d+(?:\.\d+)?, \d+(?:\.\d+)?\)$/);
  const channels = rgb.match(/[\d.]+/g).map(Number);
  assert.ok(channels.length === 3 && channels.every((v) => v >= 0 && v <= 255));
  const linear = channels
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export function validateRecoveryPalette(colors, mode) {
  assert.ok(mode === "light" || mode === "dark");
  assert.equal(colors.scheme, mode, "actual applied CSS color scheme");
  assert.equal(
    colors.appliedTheme,
    mode,
    "public Appearance selection was applied"
  );
  for (const key of ["active", "focusVisible", "visible", "errorVisible"])
    assert.equal(colors[key], true, key);
  assert.equal(colors.outline, "3px");
  assert.equal(colors.outlineStyle, "solid");
  const result = {
    retryTextContrast: ratio(colors.text, colors.background),
    errorTextContrast: ratio(colors.errorText, colors.surface),
    focusSurfaceContrast: ratio(colors.focus, colors.surface),
    focusAdjacentContrast: ratio(colors.focus, colors.adjacent),
  };
  assert.ok(result.retryTextContrast >= 4.5, "Retry text contrast");
  assert.ok(result.errorTextContrast >= 4.5, "History error text contrast");
  assert.ok(
    result.focusSurfaceContrast >= 3 && result.focusAdjacentContrast >= 3,
    "visible focus against adjacent surfaces"
  );
  return result;
}

export async function navigateDestination(page, destination) {
  assert.ok(destination === "Settings" || destination === "History");
  const button = page
    .getByRole("navigation", { name: "Clipp destinations", exact: true })
    .getByRole("button", { name: destination, exact: true });
  await button.click();
  await button
    .getAttribute("aria-current")
    .then((value) => assert.equal(value, "page"));
}

export async function collectHistoryRecovery(page, mode, screenshotPath) {
  await navigateDestination(page, "Settings");
  const appearance = page.getByLabel("Appearance", { exact: true });
  await appearance.selectOption(mode);
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[aria-label="Appearance"]')?.value === expected &&
      getComputedStyle(document.documentElement).colorScheme === expected,
    mode
  );
  const appliedTheme = await appearance.inputValue();
  await navigateDestination(page, "History");
  const alert = page.locator(".initialization-error");
  await alert.getByText("History unavailable.", { exact: true }).waitFor();
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.focus();
  // A real keyboard round trip establishes keyboard-visible focus without clicking Retry.
  await retry.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const colors = await retry.evaluate((el) => {
    const s = getComputedStyle(el),
      parent = el.parentElement;
    const error = parent.querySelector("span"),
      frame = el.getBoundingClientRect();
    const errorFrame = error.getBoundingClientRect(),
      errorStyle = getComputedStyle(error);
    const paintedBackground = (start) => {
      for (let node = start; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor;
        if (/^rgb\(/.test(value)) return value;
        if (value !== "rgba(0, 0, 0, 0)")
          throw new Error("unsupported_translucent_recovery_surface");
      }
      throw new Error("missing_opaque_recovery_surface");
    };
    return {
      text: s.color,
      background: s.backgroundColor,
      focus: s.outlineColor,
      outline: s.outlineWidth,
      outlineStyle: s.outlineStyle,
      surface: paintedBackground(parent),
      adjacent: paintedBackground(parent.parentElement),
      errorText: errorStyle.color,
      errorVisible:
        errorFrame.width > 0 &&
        errorFrame.height > 0 &&
        errorStyle.visibility === "visible" &&
        errorStyle.display !== "none" &&
        errorStyle.opacity === "1",
      scheme: getComputedStyle(document.documentElement).colorScheme,
      active: document.activeElement === el,
      focusVisible: el.matches(":focus-visible"),
      visible:
        frame.width > 0 &&
        frame.height > 0 &&
        frame.left >= 0 &&
        frame.top >= 0 &&
        frame.right <= innerWidth &&
        frame.bottom <= innerHeight &&
        s.visibility === "visible" &&
        s.display !== "none" &&
        s.opacity === "1",
    };
  });
  colors.appliedTheme = appliedTheme;
  // Keep actual sampled failure and a screenshot before making the verdict.
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { colors, mode, screenshotPath };
}

// Exact fixed file document navigation only; no HTTP(S) or arbitrary local assets.
export function allowFixtureDocument(requestUrl, navigation, documentUrl) {
  const document = new URL(documentUrl);
  assert.ok(
    document.protocol === "file:" &&
      document.hostname === "" &&
      !document.search &&
      !document.hash
  );
  return navigation === true && requestUrl === documentUrl;
}
