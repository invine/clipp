import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import {
  measurePopupControl,
  assertPopupControl,
} from "./popup-target-contract.mjs";

// Controlled viewport support only. Actual Chrome intrinsic sizing is qualified
// through the already-owned action target contract, never this page fixture.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "clipp-popup-sizing-"));
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';createRoot(document.getElementById('root')).render(<ClipboardApp clips={[]} devices={[]} pending={[]} peers={[]} pinnedIds={[]} identity={{deviceId:'popup-fixture',deviceName:'Popup fixture'}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({status:'accepted'})} onReject={async()=>({status:'rejected'})} onPairText={async()=>({status:'invalid-input'})} onCopyPairingText={async()=>({status:'copied'})} onRequestPairingCode={async()=>({text:'fixture'})} onReuseClip={()=>'complete'} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>{}} onMutateManagedRelay={async()=>({status:'rejected',error:'fixture-only'})}/>);`,
    resolveDir: repo,
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  format: "iife",
  outfile: `${out}/popup-sizing.js`,
  target: ["chrome91"],
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const result = {
  actualHost: false,
  environment:
    "Controlled ClipboardApp + popup host entry; no runtime ports, clipboard or native sizing qualification",
  cases: [],
};
try {
  // Independently requesting a popup size must not depend on Chrome's initial
  // 25px viewport. This measures the owning host, not stylesheet text.
  await page.setViewportSize({ width: 25, height: 25 });
  await page.setContent('<div id="root"></div>');
  for (const css of [
    "packages/ui/src/styles.css",
    "packages/ui/src/host.css",
    "apps/extension/src/popup-host.css",
  ])
    await page.addStyleTag({
      content: await readFile(`${repo}/${css}`, "utf8"),
    });
  const requested = await page
    .locator("html")
    .evaluate((e) => e.getBoundingClientRect().toJSON());
  result.requested = requested;
  assert.equal(
    requested.width,
    480,
    "popup intrinsically requests width despite initial25 viewport"
  );
  assert.equal(
    requested.height,
    600,
    "popup intrinsically requests height despite initial25 viewport"
  );
  for (const viewport of [
    { width: 480, height: 600 },
    { width: 320, height: 600 },
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
    await page.addScriptTag({ path: `${out}/popup-sizing.js` });
    const management = page.getByRole("button", {
      name: "Open management",
      exact: true,
    });
    await management.waitFor();
    const initial = await page.evaluate(measurePopupControl, "Open management");
    assertPopupControl(initial);
    await management.click();
    await page.getByRole("button", { name: "Add relay", exact: true }).click();
    await page
      .locator('.drawer-pane [data-session-focus="relay:name"]')
      .fill("popup retained draft");
    const cancel = await page.evaluate(measurePopupControl, {
      name: "Cancel",
      scope: ".drawer-pane .managed-relay-editor",
    });
    assertPopupControl(cancel);
    const cancelButton = page
      .locator(".drawer-pane .managed-relay-editor")
      .getByRole("button", { name: "Cancel", exact: true });
    await cancelButton.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator('.drawer-pane [data-session-focus="relay:name"]')
        .count(),
      0
    );
    await page.screenshot({
      path: `${out}/popup-${viewport.width}-${viewport.height}.png`,
    });
    result.cases.push({ viewport, initial, cancel, result: "passed" });
  }
} catch (error) {
  result.failure = String(error);
  throw error;
} finally {
  await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
