import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "clipp-scanner-controls-"));
await mkdir(out, { recursive: true });
if (process.argv.includes("--consumer")) {
  // Source-only mounted consumer: fresh headless context, every network request
  // blocked and clipboard/media/provider boundaries inert in the fixture.
  await build({
    entryPoints: [join(repo, "tests/fixtures/pairingScanConsumer.tsx")],
    define: {
      PUBLIC_SIGNED_TARGET: await readFile(
        join(repo, "tests/core/pairing/fixtures/signed-qr-target.json"),
        "utf8"
      ),
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["chrome91"],
    loader: { ".png": "dataurl" },
    outfile: join(out, "consumer.js"),
  });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => route.abort());
  try {
    await page.setContent('<!doctype html><div id="root"></div>');
    await page.addScriptTag({ path: join(out, "consumer.js") });
    await page.getByRole("button", { name: "Scan QR", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Camera permission is required" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Paste pairing text", exact: true })
        .count(),
      1
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Scan QR", exact: true })
        .isEnabled(),
      true
    );
    await page.evaluate(() => scannerConsumer.permissionReturn("unknown"));
    await page
      .getByRole("alert")
      .filter({ hasText: "Camera permission could not be confirmed" })
      .waitFor();
    await page.evaluate(() => scannerConsumer.permissionReturn());
    await page
      .getByRole("alert")
      .filter({ hasText: "Camera permission is now allowed" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => scannerConsumer.stats().requests),
      1,
      "permission return only rechecks, never captures"
    );
    await page.evaluate(() => scannerConsumer.pending());
    await page.getByRole("button", { name: "Scan QR", exact: true }).click();
    await page.locator("#clipp-android-qr-scanner").waitFor();
    await page.evaluate(() => scannerConsumer.closeTask());
    await page
      .locator("#clipp-android-qr-scanner")
      .waitFor({ state: "detached" });
    await page.evaluate(() => scannerConsumer.acquire());
    await page.waitForFunction(() => scannerConsumer.stats().stops === 1);
    await page.evaluate(() => scannerConsumer.reopen());
    await page.getByRole("button", { name: "Scan QR", exact: true }).waitFor();
    const stats = await page.evaluate(() => scannerConsumer.stats());
    assert.deepEqual(stats, {
      requests: 2,
      stops: 1,
      query: "retained query",
      draft: "retained draft",
    });
    assert.deepEqual(await page.evaluate(() => scannerConsumer.attempts), []);
    await page.evaluate(() => scannerConsumer.decode());
    await page.getByRole("button", { name: "Scan QR", exact: true }).click();
    await page.waitForFunction(() => scannerConsumer.attempts.length === 1);
    await page
      .locator("#clipp-android-qr-scanner")
      .waitFor({ state: "detached" });
    await page.evaluate(() => scannerConsumer.closeTask());
    assert.equal(
      await page.evaluate(() => scannerConsumer.pairing().pending),
      true
    );
    await page.evaluate(() => scannerConsumer.finishSubmission());
    await page.waitForFunction(() => !scannerConsumer.pairing().pending);
    assert.equal(
      await page.evaluate(() => scannerConsumer.pairing().result.error),
      "outcome_unconfirmed"
    );
    assert.equal(await page.evaluate(() => scannerConsumer.attempts.length), 1);
    assert.deepEqual(errors, []);
    await page.evaluate(() => scannerConsumer.dispose());
    await writeFile(
      join(out, "consumer-result.json"),
      JSON.stringify({ pass: true, sourceOnly: true, stats })
    );
  } finally {
    await browser.close();
  }
  process.exit(0);
}
const label = "rendered";
await build({
  stdin: {
    contents: `import {createPairingScannerOverlay} from '${repo}/apps/android/src/qrCameraScanner';import {bindHostGeometry} from '${repo}/packages/ui/src/hostGeometry';window.controlsFixture={create:createPairingScannerOverlay,bind:()=>bindHostGeometry({getSnapshot:async()=>window.snapshot,addListener:async callback=>{window.nativeGeometry=callback;return {remove(){window.nativeGeometry=null}}}},window,document)};`,
    resolveDir: repo,
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  outfile: `${out}/scanner-controls-${label}.js`,
  target: ["chrome91"],
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = {
  environment:
    "Geometry-only owning scanner overlay in isolated headless Chromium; controlled native geometry/text fixture, no provider/media/native host",
  cases: [],
  requests: [],
};
page.on("request", (r) => results.requests.push(r.url()));
try {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 640, height: 360 },
    { width: 340, height: 350 },
  ])
    for (const textScale of [1, 1.5, 2]) {
      await page.setViewportSize(viewport);
      await page.setContent("<html><head></head><body></body></html>");
      for (const css of [
        "packages/ui/src/styles.css",
        "packages/ui/src/host.css",
        "apps/android/src/android-host.css",
      ])
        await page.addStyleTag({
          content: await readFile(`${repo}/${css}`, "utf8"),
        });
      await page.addStyleTag({
        content: `html {font-size:${16 * textScale}px}`,
      });
      await page.evaluate(() => {
        window.providerCalls = 0;
        window.mediaCalls = 0;
        Object.defineProperty(window, "BarcodeDetector", {
          configurable: true,
          value: class {
            constructor() {
              window.providerCalls++;
              throw new Error("provider_forbidden");
            }
          },
        });
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia() {
              window.mediaCalls++;
              throw new Error("media_forbidden");
            },
          },
        });
        window.cancelCalls = 0;
        window.scanCalls = 0;
      });
      await page.addScriptTag({ path: `${out}/scanner-controls-${label}.js` });
      await page.evaluate(({ width, height }) => {
        window.snapshot = {
          sequence: 1,
          windowPx: { left: 0, top: 0, width: width * 2, height: height * 2 },
          webViewPx: { left: 0, top: 0, width: width * 2, height: height * 2 },
          safeAreaPx: {
            left: 16,
            top: 24,
            width: width * 2 - 32,
            height: height * 2 - 48,
          },
          systemBarsPx: { left: 0, top: 24, right: 0, bottom: 24 },
          cutoutPx: { left: 16, top: 0, right: 16, bottom: 0 },
          imePx: { left: 0, top: 0, right: 0, bottom: 0 },
          density: 3,
          fontScale: 1,
          imeVisible: false,
        };
        window.stopGeometry = window.controlsFixture.bind();
      }, viewport);
      await page.waitForFunction(
        () => document.documentElement.dataset.hostGeometry === "android"
      );
      await page.evaluate(() => {
        window.scanSurface = window.controlsFixture.create();
        window.scanSurface.cancel.addEventListener(
          "click",
          () => window.cancelCalls++
        );
        window.scanSurface.scanNow.addEventListener(
          "click",
          () => window.scanCalls++
        );
      });
      const overlay = page.locator("#clipp-android-qr-scanner"),
        scan = overlay.getByRole("button", { name: "Scan now", exact: true }),
        cancel = overlay.getByRole("button", { name: "Cancel", exact: true });
      const targets = await overlay.getByRole("button").evaluateAll((es) =>
        es.map((e) => ({
          name: e.textContent,
          disabled: e.disabled,
          rect: e.getBoundingClientRect().toJSON(),
          color: getComputedStyle(e).color,
          background: getComputedStyle(e).backgroundColor,
        }))
      );
      for (const target of targets) {
        assert.ok(
          target.rect.width >= 71.9 && target.rect.height >= 71.9,
          `${target.name} must consume measured72CSS=48dp target`
        );
      }
      assert.equal(await scan.isDisabled(), true);
      await scan.evaluate((e) => e.click());
      assert.equal(await page.evaluate(() => window.scanCalls), 0);
      await cancel.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await cancel.focus();
      assert.equal(
        await cancel.evaluate(
          (e) =>
            e.matches(":focus-visible") &&
            getComputedStyle(e).outlineStyle === "solid"
        ),
        true
      );
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => window.cancelCalls), 1);
      await page.evaluate(() => {
        window.scanSurface.scanNow.disabled = false;
      });
      await scan.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => window.scanCalls), 1);
      await page.evaluate(() =>
        window.nativeGeometry({
          ...window.snapshot,
          sequence: 2,
          safeAreaPx: { ...window.snapshot.safeAreaPx, height: 330 },
          imeVisible: true,
          imePx: { left: 0, top: 0, right: 0, bottom: 500 },
        })
      );
      await cancel.scrollIntoViewIfNeeded();
      const safe = await overlay.boundingBox(),
        close = await cancel.boundingBox();
      assert.ok(
        close.x >= safe.x && close.x + close.width <= safe.x + safe.width + 0.5
      );
      assert.ok(
        close.y >= safe.y &&
          close.y + close.height <= safe.y + safe.height + 0.5,
        "last scanner action stays within measured short safe bounds"
      );
      const hit = await cancel.evaluate((e) => {
        const r = e.getBoundingClientRect(),
          h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return h === e || e.contains(h);
      });
      assert.equal(hit, true);
      assert.equal(await page.evaluate(() => window.providerCalls), 0);
      assert.equal(await page.evaluate(() => window.mediaCalls), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      results.cases.push({
        viewport,
        textScale,
        result: "passed",
        density: 3,
        pxPerCssPixel: 2,
        targets: targets.map((t) => ({
          ...t,
          widthDp: (t.rect.width * 2) / 3,
          heightDp: (t.rect.height * 2) / 3,
        })),
        shortSafe: safe,
        cancel: close,
      });
      await page.screenshot({
        path: `${out}/scanner-${label}-${viewport.width}x${viewport.height}-${textScale}.png`,
      });
      await page.evaluate(() => {
        window.scanSurface.dispose();
        window.stopGeometry();
      });
      assert.equal(await overlay.count(), 0);
      assert.equal(await page.evaluate(() => window.nativeGeometry), null);
    }
  assert.deepEqual(results.requests, []);
} catch (e) {
  results.failure = String(e);
  await page.screenshot({ path: `${out}/scanner-${label}-failure.png` });
  throw e;
} finally {
  await writeFile(
    `${out}/scanner-controls-${label}.json`,
    JSON.stringify(results, null, 2)
  );
  await browser.close();
}
