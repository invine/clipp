import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
// Controlled native geometry fixture; no operator profile, clipboard or camera access.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "clipp-host-geometry-"));
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ClipboardApp} from '${repo}/packages/ui/src/ClipboardApp';import {bindHostGeometry} from '${repo}/packages/ui/src/hostGeometry';import {createPairingScannerOverlay} from '${repo}/apps/android/src/qrCameraScanner';window.fixture={bind(){return bindHostGeometry({getSnapshot:async()=>window.snapshot,addListener:async callback=>{window.geometryChanged=callback;return {remove(){window.geometryChanged=undefined}}}},window,document)},scanner:createPairingScannerOverlay};createRoot(document.getElementById('root')).render(<div className="android-host"><ClipboardApp clips={[]} devices={[]} pending={[]} peers={[]} pinnedIds={[]} identity={{deviceId:'geometry-owned',deviceName:'Geometry'}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({status:'accepted'})} onReject={async()=>({status:'rejected'})} onPairText={async()=>({status:'invalid-input'})} onCopyPairingText={async()=>({status:'copied'})} onRequestPairingCode={async()=>({text:'fixture-only',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" />'})} onReuseClip={()=>({status:'complete'})} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>{}} onMutateManagedRelay={async()=>({status:'rejected',error:'fixture-only'})}/></div>);`,
    resolveDir: repo,
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  format: "iife",
  outfile: `${out}/host-geometry-fixture.js`,
  target: ["chrome91"],
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];
await page.route("https://fonts.googleapis.com/**", (route) =>
  route.fulfill({ status: 200, body: "" })
);
try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 1200, height: 900 },
    { width: 412, height: 732 },
    { width: 340, height: 350 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.setContent(
      '<html><head></head><body><div id="root"></div></body></html>'
    );
    await page.addStyleTag({
      content: await readFile(`${repo}/packages/ui/src/styles.css`, "utf8"),
    });
    await page.addScriptTag({ path: `${out}/host-geometry-fixture.js` });
    await page.locator(".app-logo").waitFor();
    if (viewport.width === 1280) {
      assert.equal(
        await page
          .locator(".app-shell")
          .evaluate((e) => e.getBoundingClientRect().height),
        900
      );
      results.push({
        name: "desktop/full-page browser fixture without native geometry retains viewport shell",
        viewport,
        result: "passed",
      });
      continue;
    }
    await page.evaluate(({ width, height }) => {
      window.snapshot = {
        sequence: 1,
        windowPx: { left: 0, top: 0, width: width * 3, height: height * 3 },
        webViewPx: { left: 0, top: 0, width: width * 3, height: height * 3 },
        safeAreaPx: {
          left: 24,
          top: 72,
          width: width === 1200 ? 3180 : width * 3 - 48,
          height: height * 3 - 150,
        },
        systemBarsPx: { left: 0, top: 72, right: 0, bottom: 78 },
        cutoutPx: { left: 24, top: 0, right: 24, bottom: 0 },
        imePx: { left: 0, top: 0, right: 0, bottom: 0 },
        density: 2,
        fontScale: 1,
        imeVisible: false,
      };
      window.disposeGeometry = window.fixture.bind();
    }, viewport);
    await page.waitForFunction(
      () => document.documentElement.dataset.hostGeometry === "android"
    );
    const safe = await page.evaluate(() =>
      Object.fromEntries(
        ["left", "top", "width", "height"].map((key) => [
          key,
          parseFloat(
            document.documentElement.style.getPropertyValue(
              "--clipp-content-" + key
            )
          ),
        ])
      )
    );
    await page.locator(".app-logo").click();
    await page.locator(".drawer-pane").waitFor();
    assert.equal(
      await page
        .locator(".drawer-pane")
        .evaluate(
          (e) =>
            e.clientHeight <=
            parseFloat(
              document.documentElement.style.getPropertyValue(
                "--clipp-content-height"
              )
            )
        ),
      true,
      "task scroller must fit effective content height even when native cutout narrows a wide viewport"
    );
    await page
      .locator(".drawer-pane")
      .getByRole("button", { name: "Add relay", exact: true })
      .click();
    await page
      .locator('.drawer-pane [data-session-focus="relay:name"]')
      .fill("retained-through-safe-geometry");
    await page.evaluate(() => {
      window.snapshot = {
        ...window.snapshot,
        sequence: 2,
        safeAreaPx: { ...window.snapshot.safeAreaPx, height: 495 },
        imeVisible: true,
        imePx: { left: 0, top: 0, right: 0, bottom: 700 },
      };
      window.geometryChanged(window.snapshot);
    });
    await page.waitForTimeout(60);
    assert.equal(
      await page
        .locator(".drawer-pane")
        .evaluate(
          (e) =>
            e.clientHeight <=
            parseFloat(
              document.documentElement.style.getPropertyValue(
                "--clipp-content-height"
              )
            )
        ),
      true,
      "task scroller remains within the effective IME content height"
    );
    await page
      .locator(".drawer-pane .managed-relay-editor")
      .getByRole("button", { name: "Save", exact: true })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() =>
      window.geometryChanged({ ...window.snapshot, sequence: 3 })
    );
    await page.waitForTimeout(60);
    const action = await page
      .locator(".drawer-pane .managed-relay-editor")
      .getByRole("button", { name: "Save", exact: true })
      .boundingBox();
    assert.ok(action.y >= 24 && action.y + action.height <= 189);
    assert.equal(
      await page
        .locator('.drawer-pane [data-session-focus="relay:name"]')
        .inputValue(),
      "retained-through-safe-geometry"
    );
    await page
      .locator(".drawer-pane .managed-relay-editor")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.evaluate(() => {
      window.snapshot = {
        ...window.snapshot,
        sequence: 4,
        safeAreaPx: {
          ...window.snapshot.safeAreaPx,
          height: window.snapshot.windowPx.height - 150,
        },
        imeVisible: false,
      };
      window.geometryChanged(window.snapshot);
    });
    await page
      .locator(".drawer-pane")
      .getByRole("button", { name: "Show my QR" })
      .click();
    await page.locator(".qr-modal-image").waitFor();
    await page
      .locator(".qr-modal")
      .getByRole("button", { name: "Close QR dialog", exact: true })
      .scrollIntoViewIfNeeded();
    const close = await page
      .locator(".qr-modal")
      .getByRole("button", { name: "Close QR dialog", exact: true })
      .boundingBox();
    assert.ok(
      close.y >= safe.top && close.y + close.height <= safe.top + safe.height
    );
    await page
      .locator(".qr-modal")
      .getByRole("button", { name: "Close QR dialog", exact: true })
      .click();
    await page
      .locator(".drawer-pane")
      .getByRole("button", { name: "Add relay", exact: true })
      .click();
    await page
      .locator('.drawer-pane [data-session-focus="relay:name"]')
      .waitFor();
    await page
      .locator(".drawer-pane .managed-relay-editor")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.evaluate(() => (window.scan = window.fixture.scanner()));
    const scanner = await page
      .locator("#clipp-android-qr-scanner")
      .boundingBox();
    assert.ok(
      Math.abs(scanner.y - safe.top) < 1 &&
        Math.abs(scanner.height - safe.height) < 1
    );
    await page.evaluate(() => window.scan.dispose());
    assert.equal(await page.locator("#clipp-android-qr-scanner").count(), 0);
    await page.evaluate(() => window.disposeGeometry());
    results.push({
      name: "rendered owning shell/drawer/task/QR/scanner responds to controlled nonzero bars/cutout/IME; draft and final actions reachable",
      viewport,
      result: "passed",
      safe,
      action,
      close,
      scanner,
    });
  }
} finally {
  await writeFile(
    `${out}/host-geometry-result.json`,
    JSON.stringify(results, null, 2)
  );
  await browser.close();
}
