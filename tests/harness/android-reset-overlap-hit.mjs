import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.setContent(
    '<!doctype html><html data-host-geometry="android" style="--clipp-content-left:0px;--clipp-content-top:0px;--clipp-content-width:393px;--clipp-content-height:852px"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"><div class="android-host"><div class="app-shell workspace-cramped"></div></div></div></body></html>'
  );
  for (const file of [
    "packages/ui/src/styles.css",
    "packages/ui/src/host.css",
    "apps/android/src/android-host.css",
  ])
    await page.addStyleTag({ content: await readFile(file, "utf8") });
  const original = await page.evaluate(() => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Continue reset overlap";
    document.body.appendChild(button);
    button.scrollIntoView({ block: "center", inline: "nearest" });
    const r = button.getBoundingClientRect(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2,
      hit = document.elementFromPoint(x, y);
    const value = {
      inside: x > 0 && y > 0 && x < innerWidth && y < innerHeight,
      hit: hit === button || button.contains(hit),
    };
    button.remove();
    return value;
  });
  assert.deepEqual(
    original,
    { inside: true, hit: false },
    "the original placement reproduces the hit-test failure"
  );
  const code = await build({
    entryPoints: ["apps/android/src/resetOverlapContinue.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "acceptanceControl",
  });
  await page.addScriptTag({ content: code.outputFiles[0].text });
  await page.evaluate(() => {
    const button = acceptanceControl.createResetOverlapContinue();
    document.body.appendChild(button);
    button.scrollIntoView({ block: "center", inline: "nearest" });
  });
  const result = await page.evaluate(() => {
    const e = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Continue reset overlap"
    );
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2
    );
    return {
      hit: hit === e || e.contains(hit),
      inside:
        r.x + r.width / 2 > 0 &&
        r.y + r.height / 2 > 0 &&
        r.x + r.width / 2 < innerWidth &&
        r.y + r.height / 2 < innerHeight,
    };
  });
  assert.ok(
    result.inside && result.hit,
    "Continue must receive its physical center hit inside the Android viewport"
  );
  await page.evaluate(() => {
    window.__clippHit = false;
    document.querySelector("button").addEventListener("click", () => {
      window.__clippHit = true;
    });
  });
  const bounds = await page.locator("button").boundingBox();
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2
  );
  assert.equal(
    await page.evaluate(() => window.__clippHit),
    true,
    "physical pointer reaches the control"
  );
  console.log("Android overlap Continue receives physical center hit");
} finally {
  await browser.close();
}
