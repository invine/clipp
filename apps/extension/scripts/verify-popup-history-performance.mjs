import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Production popup and worker, isolated profile, synthetic History at the UI
// message boundary. This measures rendering, not actual toolbar/clipboard I/O.
const extension = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../dist")
);
const output = process.env.CLIPP_POPUP_TIMING_OUTPUT;
const profile = await mkdtemp(
  join(tmpdir(), "clipp-popup-history-performance-")
);
const results = [];
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 480, height: 600 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const installFixture = ({ count, sourceName }) => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: async () => "",
        writeText: async () => {
          throw Error("fixture_clipboard_blocked");
        },
      },
    });
    const now = Date.now();
    globalThis.__popupExpectedSource =
      sourceName ?? "12D3KooW" + "A".repeat(44);
    const clips = Array.from({ length: count }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      content: `Synthetic history clip ${index + 1}`,
      type: "text",
      originPeerId: "12D3KooW" + "A".repeat(44),
      capturedAt: now - (sourceName ? 8 * 86_400_000 : 0) - index * 1000,
      shareExpiresAt: now + 3_600_000,
    }));
    const timing = (globalThis.__popupTiming = {
      replies: [],
      labelWidthReads: 0,
      labelLayoutMs: 0,
    });
    const descriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollWidth"
    );
    Object.defineProperty(Element.prototype, "scrollWidth", {
      ...descriptor,
      get() {
        const start = performance.now();
        const value = descriptor.get.call(this);
        if (this.classList.contains("middle-ellipsis-measure")) {
          timing.labelWidthReads++;
          timing.labelLayoutMs += performance.now() - start;
        }
        return value;
      },
    });
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message, callback) => {
      if (typeof callback !== "function") return send(message);
      const start = performance.now();
      return send(message, (response) => {
        if (
          message.type === "getRuntimeState" &&
          response?.state &&
          sourceName
        ) {
          response = {
            ...response,
            state: {
              ...response.state,
              devices: [
                {
                  deviceId: "12D3KooW" + "A".repeat(44),
                  deviceName: sourceName,
                  displayName: sourceName,
                },
              ],
            },
          };
        }
        if (message.type === "getClipHistory" && response?.snapshot) {
          response = {
            ...response,
            clips,
            snapshot: { ...response.snapshot, clips, pinnedIds: [] },
          };
          timing.replies.push(Math.round(performance.now() - start));
        }
        callback(response);
      });
    };
  };
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const id = new URL(worker.url()).host;
  for (const [surface, width, count, sourceName] of [
    ["popup", 480, 0],
    ["popup", 480, 1],
    ["popup", 480, 43],
    ["popup", 480, 43],
    ["popup", 480, 43],
    ["popup", 320, 43],
    ["options", 1440, 43],
    ["popup", 480, 43, "Extension"],
    ["popup", 320, 43, "Extension"],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize({
      width,
      height: surface === "popup" ? 600 : 900,
    });
    await page.addInitScript(installFixture, { count, sourceName });
    const start = performance.now();
    await page.goto(`chrome-extension://${id}/src/${surface}.html`);
    await page.waitForFunction(
      (expected) =>
        globalThis.__popupTiming.replies.length > 0 &&
        document.querySelectorAll("[data-clip-id]").length === expected &&
        !document.body.textContent.includes("Loading History"),
      count
    );
    if (sourceName)
      await page.waitForFunction(
        (name) =>
          [...document.querySelectorAll(".history-source-label")].every(
            (label) => label.title === name
          ),
        sourceName
      );
    // Include the initial ResizeObserver notification and the resulting commit.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 8;
          const next = () =>
            --frames ? requestAnimationFrame(next) : resolve();
          requestAnimationFrame(next);
        })
    );
    const elapsedMs = Math.round(performance.now() - start);
    const result = await page.evaluate(() => ({
      ...globalThis.__popupTiming,
      currentHistoryRows: document.querySelectorAll(
        "[data-clip-id] time[datetime]"
      ).length,
      labels: [...document.querySelectorAll(".history-source-label")].map(
        (label) => ({
          truncated: label.textContent.includes("…"),
          display: label.textContent,
          visible: label.clientWidth > 0,
          fullTitle: label.title === globalThis.__popupExpectedSource,
          fits: label.scrollWidth <= label.clientWidth + 1,
        })
      ),
    }));
    results.push({ surface, width, count, sourceName, elapsedMs, ...result });
    console.log(
      JSON.stringify({
        ...results.at(-1),
        labels: undefined,
        truncatedLabels: result.labels.filter((label) => label.truncated)
          .length,
      })
    );
    if (count === 43 && output) {
      await mkdir(output, { recursive: true });
      await page.screenshot({
        path: join(
          output,
          `${surface}-${width}${sourceName ? "-named" : ""}.png`
        ),
        animations: "disabled",
      });
    }
    await page.close();
  }
  if (output)
    await writeFile(
      join(output, "timings.json"),
      JSON.stringify(results, null, 2)
    );
  assert.ok(
    results.every((result) => result.currentHistoryRows === result.count),
    "the latest History UI must remain mounted"
  );
  assert.ok(
    results.every((result) => result.labelWidthReads === 0),
    "label fitting must not force synchronous DOM layout for every candidate"
  );
  assert.ok(
    results.every((result) => result.elapsedMs < 1000),
    "popup history must render within 1000 ms"
  );
  assert.ok(
    results
      .filter((result) => result.count === 43)
      .every(
        (result) =>
          result.labels.length === 43 &&
          result.labels.every(
            (label) =>
              (!label.visible ||
                (result.sourceName
                  ? label.display === result.sourceName
                  : label.truncated)) &&
              label.fullTitle &&
              label.fits
          )
      ),
    "long source labels must fit with middle truncation and full tooltips"
  );
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
