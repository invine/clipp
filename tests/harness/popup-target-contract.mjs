import assert from "node:assert/strict";

// Root supplies an already opened, owned action target. This never opens a
// browser/profile, reads a clipboard, changes a setting or creates a tab.
export async function measurePopupControl(request) {
  const {
    name,
    scope = "body",
    associatedContent,
  } = typeof request === "string" ? { name: request } : request;
  const region = document.querySelector(scope);
  if (!region) throw new Error(`Missing popup region: ${scope}`);
  const control = [...region.querySelectorAll("button")].find(
    (element) =>
      (element.getAttribute("aria-label") || element.textContent.trim()) ===
      name
  );
  if (!control) throw new Error(`Missing named popup control: ${name}`);
  const card = associatedContent && control.closest(".history-card");
  (card || control).scrollIntoView({ block: "center", inline: "nearest" });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const earlier = control.getBoundingClientRect();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const rect = control.getBoundingClientRect();
  const hit = document.elementFromPoint(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2
  );
  const clipping = (element) => {
    const bounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const ancestors = [];
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const clipsX = /hidden|clip|auto|scroll/.test(style.overflowX);
      const clipsY = /hidden|clip|auto|scroll/.test(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const inside = {
        left: box.left + parent.clientLeft,
        top: box.top + parent.clientTop,
        right: box.left + parent.clientLeft + parent.clientWidth,
        bottom: box.top + parent.clientTop + parent.clientHeight,
      };
      if (clipsX) {
        bounds.left = Math.max(bounds.left, inside.left);
        bounds.right = Math.min(bounds.right, inside.right);
      }
      if (clipsY) {
        bounds.top = Math.max(bounds.top, inside.top);
        bounds.bottom = Math.min(bounds.bottom, inside.bottom);
      }
      ancestors.push({ className: parent.className, inside, clipsX, clipsY });
    }
    return { bounds, ancestors };
  };
  const cornerHits = (element, box) =>
    [
      [box.left + 8, box.top + 8],
      [box.right - 8, box.top + 8],
      [box.left + 8, box.bottom - 8],
      [box.right - 8, box.bottom - 8],
    ].every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
  let content;
  if (associatedContent) {
    const preview = card?.querySelector(associatedContent);
    if (!preview) throw new Error("Missing associated Clip preview");
    const range = document.createRange();
    range.selectNodeContents(preview);
    const textRects = [...range.getClientRects()].map((box) => box.toJSON());
    const previewBox = preview.getBoundingClientRect();
    content = {
      text: preview.textContent,
      rect: previewBox.toJSON(),
      textRects,
      clipping: clipping(preview),
      hitOwned: cornerHits(preview, previewBox),
      sameCard: card.contains(control) && card.contains(preview),
    };
  }
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
      cornerHitsOwned: cornerHits(control, rect),
      clipping: clipping(control),
    },
    content,
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
  const wholeInside = (box, bounds) =>
    box.left >= bounds.left - 1 &&
    box.top >= bounds.top - 1 &&
    box.right <= bounds.right + 1 &&
    box.bottom <= bounds.bottom + 1;
  assert.ok(
    wholeInside(rect, control.clipping.bounds),
    "entire named control must survive every clipping ancestor"
  );
  assert.ok(
    control.cornerHitsOwned,
    "all control corner hits must belong to the control"
  );
  if (measurement.content) {
    const content = measurement.content;
    assert.ok(
      content.sameCard && content.text.trim(),
      "Copy must remain associated with its Clip preview"
    );
    assert.ok(
      content.textRects.length > 0 &&
        wholeInside(content.rect, content.clipping.bounds) &&
        content.textRects.every((box) =>
          wholeInside(box, content.clipping.bounds)
        ),
      "associated Clip preview must survive every clipping ancestor"
    );
    assert.ok(
      content.hitOwned,
      "associated Clip preview must be visible with its action"
    );
  }
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
  associatedContent,
}) {
  assert.equal(evidence.actualHost, true);
  assert.equal(evidence.actualToolbarOpenedViaAction, true);
  assert.equal(evidence.ownedContext, true);
  assert.ok(evidence.sourceRevision && evidence.buildHashes);
  const initial = await evaluate(measurePopupControl, {
    name,
    scope,
    associatedContent,
  });
  await evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));
  const measurement = await evaluate(measurePopupControl, {
    name,
    scope,
    associatedContent,
  });
  assert.match(
    measurement.url,
    /^chrome-extension:\/\/[^/]+\/(?:src\/)?popup\.html$/
  );
  assertPopupControl(measurement);
  return { actualHost: true, evidence, initial, measurement };
}
