import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import {
  measurePopupControl,
  assertPopupControl,
} from "./popup-target-contract.mjs";

// Owning shared UI with production popup host styles. Profile preferences enlarge
// browser text independently; no stylesheet override, clipboard or runtime store.
// This controlled viewport is preparation, never actual toolbar qualification.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "clipp-history-reachability-"));
await mkdir(out, { recursive: true });
const fontControl = join(out, "font-control");
await mkdir(fontControl, { recursive: true });
await writeFile(
  join(fontControl, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Isolated History font fixture",
    version: "1.0.0",
    permissions: ["fontSettings"],
    background: { service_worker: "background.js" },
  })
);
await writeFile(
  join(fontControl, "background.js"),
  "chrome.runtime.onInstalled.addListener(() => {});"
);
await writeFile(
  join(fontControl, "control.html"),
  '<!doctype html><meta charset="utf-8"><script src="control.js"></script>'
);
await writeFile(
  join(fontControl, "control.js"),
  `globalThis.fixtureFontSettings = {
  async read() { return { default: await chrome.fontSettings.getDefaultFontSize({}), minimum: await chrome.fontSettings.getMinimumFontSize({}) }; },
  async set(pixelSize) { await chrome.fontSettings.setDefaultFontSize({pixelSize}); await chrome.fontSettings.setMinimumFontSize({pixelSize}); return this.read(); },
  async clear() { await chrome.fontSettings.clearDefaultFontSize({}); await chrome.fontSettings.clearMinimumFontSize({}); return this.read(); }
};`
);
const content = "Known local Clip for the Copy action";
await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';import{createUiSession}from'${repo}/packages/ui/src/uiSession';window.historySession=createUiSession();window.copyCalls=[];createRoot(document.getElementById('root')).render(<ClipboardApp session={window.historySession} clips={[{id:'known-clip',type:'text',content:${JSON.stringify(content)},originPeerId:'fixture-local',capturedAt:1700000000000,expiresAt:1900000000000}]} devices={[]} pending={[]} peers={[]} pinnedIds={[]} identity={{deviceId:'fixture-local',deviceName:'Local fixture'}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({status:'accepted'})} onReject={async()=>({status:'rejected'})} onPairText={async()=>({status:'invalid-input'})} onCopyPairingText={async()=>({status:'copied'})} onRequestPairingCode={async()=>({text:'fixture'})} onReuseClip={id=>{window.copyCalls.push(id);return 'complete'}} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>{}} onMutateManagedRelay={async()=>({status:'rejected',error:'fixture-only'})}/>);`,
    resolveDir: repo,
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  format: "iife",
  outfile: `${out}/consumer.js`,
  target: ["chrome91"],
});
const result = {
  actualHost: false,
  seam: "ClipboardApp History with production popup host styles",
  cases: [],
};
try {
  for (const font of [16, 24, 32]) {
    const profile = await mkdtemp(join(tmpdir(), "clipp-history-profile-"));
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      viewport: { width: 480, height: 600 },
      args: [
        `--disable-extensions-except=${fontControl}`,
        `--load-extension=${fontControl}`,
      ],
    });
    let helper;
    try {
      await context.route("**/*", (route) =>
        route.request().url().startsWith("chrome-extension://")
          ? route.continue()
          : route.abort()
      );
      const worker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent("serviceworker"));
      const helperId = new URL(worker.url()).host;
      helper = await context.newPage();
      await helper.goto(`chrome-extension://${helperId}/control.html`);
      if (font !== 16)
        await helper.evaluate((value) => fixtureFontSettings.set(value), font);
      const fontSettings = await helper.evaluate(() =>
        fixtureFontSettings.read()
      );
      assert.equal(fontSettings.default.pixelSize, font);
      assert.equal(fontSettings.minimum.pixelSize, font === 16 ? 0 : font);
      const page = context.pages()[0];
      for (const viewport of [
        { width: 480, height: 600 },
        { width: 340, height: 350 },
      ]) {
        await page.setViewportSize(viewport);
        await page.setContent('<div id="root"></div>');
        for (const css of [
          "packages/ui/src/styles.css",
          "packages/ui/src/host.css",
          "apps/extension/src/popup-host.css",
        ])
          await page.addStyleTag({
            content: await readFile(`${repo}/${css}`, "utf8"),
          });
        await page.addScriptTag({ path: `${out}/consumer.js` });
        await page
          .getByRole("button", { name: "Copy Clip", exact: true })
          .waitFor();
        await page.evaluate(
          () => new Promise((resolve) => setTimeout(resolve, 800))
        );
        assert.equal(
          await page.evaluate(() =>
            parseFloat(getComputedStyle(document.documentElement).fontSize)
          ),
          font,
          "independent browser default font preference is applied"
        );
        const measurement = await page.evaluate(measurePopupControl, {
          name: "Copy Clip",
          associatedContent: ".history-text",
        });
        result.cases.push({ font, viewport, measurement });
        await page.screenshot({
          path: `${out}/history-${font}-${viewport.width}-${viewport.height}.png`,
        });
        assert.equal(measurement.content.text, content);
        assertPopupControl(measurement);
        if (font === 32 && viewport.height === 600) {
          const scroll = await page.evaluate(() => ({
            actual: document.querySelector(".app-shell").scrollTop,
            retained: window.historySession.getSnapshot().scroll.workspace,
          }));
          assert.ok(
            scroll.actual > 0,
            "enlarged History uses the outer app scroll owner"
          );
          assert.equal(
            scroll.retained,
            scroll.actual,
            "the document-lived UI session retains the outer scroll position"
          );
        }
        await page
          .getByRole("button", { name: "Copy Clip", exact: true })
          .click();
        assert.deepEqual(
          await page.evaluate(() => window.copyCalls),
          ["known-clip"],
          "visible Copy acts on its associated Clip exactly once"
        );
      }
    } finally {
      try {
        if (helper) {
          const restored = await helper.evaluate(() =>
            fixtureFontSettings.clear()
          );
          assert.equal(restored.default.pixelSize, 16);
          assert.equal(restored.minimum.pixelSize, 0);
        }
      } finally {
        await context.close();
        await rm(profile, { recursive: true, force: true });
      }
    }
  }
  result.result = "pass";
} catch (error) {
  result.failure = String(error);
  throw error;
} finally {
  await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
}
