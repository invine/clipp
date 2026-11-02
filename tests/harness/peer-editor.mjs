import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../..", import.meta.url)),
  out = process.argv[2]
    ? resolve(process.argv[2])
    : await mkdtemp(join(tmpdir(), "clipp-peer-editor-")),
  label = "rendered";
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';import{bindHostGeometry}from'${repo}/packages/ui/src/hostGeometry';window.peerFixture={};function Fixture(){const [device,setDevice]=useState({deviceId:'12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv',deviceName:'Alias diagnostic device with a long unbrokennameabcdefghijklmnop'});window.peerFixture.project=setDevice;window.peerFixture.bind=()=>bindHostGeometry({getSnapshot:async()=>window.snapshot,addListener:async cb=>{window.changed=cb;return{remove(){window.changed=null}}}},window,document);return <div className="android-host"><ClipboardApp clips={[]} devices={[device]} pending={[]} peers={[]} pinnedIds={[]} identity={{deviceId:'local',deviceName:'Local device'}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({status:'accepted'})} onReject={async()=>({status:'rejected'})} onPairText={async()=>({status:'invalid-input'})} onCopyPairingText={async()=>({status:'copied'})} onRequestPairingCode={async()=>({text:'fixture'})} onReuseClip={()=>'complete'} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>{}} onRenameDevice={async()=>{if(window.peerFixture.hold)return new Promise((resolve,reject)=>{window.peerFixture.resolve=resolve;window.peerFixture.reject=reject});throw new Error('fixture_alias_rejected')}}/></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: repo,
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  format: "iife",
  outfile: `${out}/peer-editor-${label}.js`,
  target: ["chrome91"],
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const result = {
  environment:
    "Real ClipboardApp/Alias consumer with one controlled device projection and rejection port; headless diagnosis only, controlled text sizes are not native font evidence",
  nativeReference: {
    source: "native63 native-caller-result taps",
    inputCss: { width: 21.5238094329834, height: 65.52381134033203 },
    density: 2.625,
    fontScale: 2,
    cssDocumentWidth: 412.19049072265625,
    aliasUsedFont: "unmeasured",
    nativeAlertRect: "unmeasured",
  },
  cases: [],
};
try {
  for (const width of [412, 320])
    for (const textScale of [1, 1.5, 2]) {
      await page.setViewportSize({ width, height: 732 });
      await page.setContent('<div id="root"></div>');
      for (const css of [
        "packages/ui/src/styles.css",
        "packages/ui/src/host.css",
        "apps/android/src/android-host.css",
      ])
        await page.addStyleTag({
          content: await readFile(`${repo}/${css}`, "utf8"),
        });
      await page.addStyleTag({
        content: `body {font-size:${16 * textScale}px} .text-button,.peer-sub,.content-subtitle,.peer-full-value {font-size:${14 * textScale}px}`,
      });
      await page.addScriptTag({ path: `${out}/peer-editor-${label}.js` });
      await page
        .getByRole("button", { name: "Open management", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit Local Device Alias", exact: true })
        .click();
      const field = page.getByRole("textbox", {
        name: /Local Device Alias for/,
      });
      await field.fill("Retained alias draft");
      await page.evaluate(
        ({ width }) => {
          window.snapshot = {
            sequence: 1,
            windowPx: { left: 0, top: 0, width: width * 2.625, height: 1920 },
            webViewPx: { left: 0, top: 0, width: width * 2.625, height: 1920 },
            safeAreaPx: { left: 0, top: 63, width: width * 2.625, height: 956 },
            systemBarsPx: { left: 0, top: 63, right: 0, bottom: 126 },
            cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
            imePx: { left: 0, top: 0, right: 0, bottom: 901 },
            density: 2.625,
            fontScale: 2,
            imeVisible: true,
          };
          window.stopGeometry = window.peerFixture.bind();
        },
        { width }
      );
      await page.waitForFunction(
        () => document.documentElement.dataset.hostGeometry === "android"
      );
      await page
        .getByRole("button", { name: "Save Local Device Alias", exact: true })
        .click();
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Alias Save was not confirmed" });
      await alert.waitFor({ state: "attached" });
      const metrics = await field.evaluate((e) => {
        const row = e.closest(".peer-item"),
          meta = e.closest(".peer-meta"),
          actions = row.querySelector(".peer-actions"),
          alert = row.querySelector("[role=alert]");
        const measure = (x) => {
          const s = getComputedStyle(x);
          return {
            rect: x.getBoundingClientRect().toJSON(),
            font: s.fontSize,
            lineHeight: s.lineHeight,
            display: s.display,
            visibility: s.visibility,
            overflow: s.overflow,
            scrollWidth: x.scrollWidth,
            clientWidth: x.clientWidth,
            scrollHeight: x.scrollHeight,
            clientHeight: x.clientHeight,
          };
        };
        return {
          row: measure(row),
          meta: measure(meta),
          actions: measure(actions),
          field: measure(e),
          alert: measure(alert),
          buttons: [...row.querySelectorAll("button")].map((b) => ({
            name: b.getAttribute("aria-label") || b.textContent,
            ...measure(b),
          })),
        };
      });
      result.cases.push({
        width,
        controlledText: {
          body: 16 * textScale,
          secondary: 14 * textScale,
          root: 16,
          textScale,
        },
        metrics,
      });
      await page.screenshot({
        path: `${out}/peer-editor-${label}-${width}-${textScale}.png`,
      });
      assert.ok(
        metrics.alert.rect.width > 0 && metrics.alert.rect.height > 0,
        "rejected Alias result must have positive visible dimensions"
      );
      assert.ok(
        metrics.field.rect.width >= 120,
        "Alias field must retain readable width instead of collapsing into its padding"
      );
      await alert.scrollIntoViewIfNeeded();
      const hit = await alert.boundingBox();
      assert.ok(hit.width > 0);
      assert.equal(await field.inputValue(), "Retained alias draft");
      const row = page.locator(".peer-item").filter({ has: field });
      for (const button of await row.getByRole("button").all()) {
        await button.scrollIntoViewIfNeeded();
        const bounds = await button.boundingBox();
        assert.ok(
          bounds.width >= 47.9 && bounds.height >= 47.9,
          "targets retain48dp-equivalent minimum"
        );
        const safeBounds = await page.locator(".nav-overlay").boundingBox();
        assert.ok(
          bounds.x >= safeBounds.x - 0.5 &&
            bounds.y >= safeBounds.y - 0.5 &&
            bounds.x + bounds.width <= safeBounds.x + safeBounds.width + 0.5 &&
            bounds.y + bounds.height <= safeBounds.y + safeBounds.height + 0.5,
          "whole row action stays inside safe bounds after scrolling"
        );
        assert.ok(
          await button.evaluate((e) => {
            const r = e.getBoundingClientRect(),
              h = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2
              );
            return h === e || e.contains(h);
          }),
          "row action remains reachable"
        );
      }
      assert.ok(
        await row
          .locator(".peer-full-value")
          .innerText()
          .then(
            (t) =>
              t.includes(
                "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv"
              ) && t.includes("Alias diagnostic device")
          )
      );
      const close = page.getByRole("button", {
        name: "Close alias editor",
        exact: true,
      });
      assert.equal(
        await close.evaluate((button) => {
          const text = [...button.childNodes].find(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent.trim()
          );
          const range = document.createRange();
          range.setStart(text, 0);
          range.setEnd(text, 5);
          return range.getClientRects().length;
        }),
        1,
        "Close word must not wrap into individual letters"
      );
      await close.focus();
      await page.keyboard.press("Enter");
      await field.waitFor({ state: "detached" });
      await page
        .getByRole("button", { name: "Edit Local Device Alias", exact: true })
        .click();
      assert.equal(await field.inputValue(), "Retained alias draft");
      await page.evaluate(() => {
        window.peerFixture.hold = true;
      });
      await field.fill("Submitted alias");
      await page
        .getByRole("button", { name: "Save Local Device Alias", exact: true })
        .click();
      await page.waitForFunction(
        () => typeof window.peerFixture.resolve === "function"
      );
      await field.fill("Newer alias draft");
      await page.evaluate(() =>
        window.peerFixture.project({
          deviceId: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
          deviceName: "New received Device Name",
        })
      );
      assert.equal(await field.inputValue(), "Newer alias draft");
      await page.evaluate(() =>
        window.peerFixture.resolve({
          deviceId: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
          deviceName: "New received Device Name",
        })
      );
      await page
        .getByRole("button", { name: "Save Local Device Alias", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          document
            .querySelector('input[aria-label^="Local Device Alias"]')
            .getAttribute("aria-busy") === "false"
      );
      assert.equal(await field.inputValue(), "Newer alias draft");
      await page
        .getByRole("button", { name: "Close alias editor", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit Local Device Alias", exact: true })
        .click();
      assert.equal(await field.inputValue(), "Newer alias draft");
      await page
        .getByRole("button", { name: "Cancel alias edit", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit Local Device Alias", exact: true })
        .click();
      assert.equal(await field.inputValue(), "New received Device Name");
      await page
        .getByRole("button", { name: "Cancel alias edit", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit Local Device Alias", exact: true })
        .click();
      await field.fill("Dismissed pending draft");
      await page.evaluate(() => {
        window.peerFixture.reject = null;
        window.peerFixture.resolve = null;
      });
      await page
        .getByRole("button", { name: "Save Local Device Alias", exact: true })
        .click();
      await page.waitForFunction(
        () => typeof window.peerFixture.reject === "function"
      );
      await page
        .getByRole("button", { name: "Close alias editor", exact: true })
        .click();
      await field.waitFor({ state: "detached" });
      await page.evaluate(() =>
        window.peerFixture.reject(new Error("fixture_alias_late_rejected"))
      );
      await page.waitForTimeout(20);
      assert.equal(
        await field.count(),
        0,
        "late rejection does not reopen a dismissed editor"
      );
      await page
        .getByRole("button", { name: "Edit Local Device Alias", exact: true })
        .click();
      assert.equal(await field.inputValue(), "Dismissed pending draft");
      await alert.waitFor({ state: "visible" });
      await page
        .getByRole("button", { name: "Cancel alias edit", exact: true })
        .click();
      result.cases[result.cases.length - 1].result = "passed";
      await page.evaluate(() => window.stopGeometry());
    }
} catch (e) {
  result.failure = String(e);
  throw e;
} finally {
  await writeFile(
    `${out}/peer-editor-${label}.json`,
    JSON.stringify(result, null, 2)
  );
  await browser.close();
}
