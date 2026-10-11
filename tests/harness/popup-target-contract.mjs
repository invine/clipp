import assert from "node:assert/strict";

// Root supplies an already opened, owned action target. This never opens a
// browser/profile, reads a clipboard, changes a setting or creates a tab.
export async function measurePopupControl(request) {
  const { name, scope = "body" } =
    typeof request === "string" ? { name: request } : request;
  const region = document.querySelector(scope);
  if (!region) throw new Error(`Missing popup region: ${scope}`);
  const control = [...region.querySelectorAll("button")].find(
    (element) =>
      (element.getAttribute("aria-label") || element.textContent.trim()) ===
      name
  );
  if (!control) throw new Error(`Missing named popup control: ${name}`);
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const earlier = control.getBoundingClientRect();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const rect = control.getBoundingClientRect();
  const hit = document.elementFromPoint(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2
  );
  return {
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    documentWidth: document.documentElement.scrollWidth,
    targetMin: parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--clipp-target-min"
      )
    ),
    control: {
      name,
      rect: rect.toJSON(),
      stable: ["x", "y", "width", "height"].every(
        (key) => Math.abs(earlier[key] - rect[key]) < 0.5
      ),
      hitOwned: control.contains(hit),
    },
    hosts: ["html", "body", "#root", ".app-shell"].map((selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      return {
        selector,
        rect: element.getBoundingClientRect().toJSON(),
        width: style.width,
        height: style.height,
        maxWidth: style.maxWidth,
        overflow: style.overflow,
      };
    }),
  };
}

export function assertPopupControl(measurement) {
  const { viewport, control, targetMin, documentWidth } = measurement;
  assert.ok(Number.isFinite(targetMin) && targetMin >= 40);
  assert.ok(
    viewport.width >= targetMin && viewport.height >= targetMin,
    "popup native viewport must accommodate a complete control"
  );
  assert.ok(
    documentWidth <= viewport.width + 1,
    "no horizontal document overflow"
  );
  const rect = control.rect;
  assert.ok(rect.width >= targetMin && rect.height >= targetMin);
  assert.ok(
    rect.left >= -1 &&
      rect.top >= -1 &&
      rect.right <= viewport.width + 1 &&
      rect.bottom <= viewport.height + 1,
    "entire named control must be within viewport after scrolling"
  );
  assert.ok(control.hitOwned, "viewport hit must belong to the named control");
  assert.ok(
    control.stable,
    "named control geometry must settle before invocation"
  );
}

export async function checkActualPopupControl({
  evaluate,
  evidence,
  name,
  scope,
}) {
  assert.equal(evidence.actualHost, true);
  assert.equal(evidence.actualToolbarOpenedViaAction, true);
  assert.equal(evidence.ownedContext, true);
  assert.ok(evidence.sourceRevision && evidence.buildHashes);
  const initial = await evaluate(measurePopupControl, { name, scope });
  await evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));
  const measurement = await evaluate(measurePopupControl, { name, scope });
  assert.match(
    measurement.url,
    /^chrome-extension:\/\/[^/]+\/(?:src\/)?popup\.html$/
  );
  assertPopupControl(measurement);
  return { actualHost: true, evidence, initial, measurement };
}
