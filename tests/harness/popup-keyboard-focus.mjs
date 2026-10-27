// Owning production popup composition at a controlled available height.
// This is rendered regression evidence, never native toolbar qualification.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = await realpath(root);
// Match the hosts' absolute source-alias pattern, never the primary workspace's
// node_modules/@clipp/ui symlink when this harness runs in an isolated checkout.
const aliases = {
  "@clipp/ui": join(sourceRoot, "packages/ui"),
  "@ui": join(sourceRoot, "packages/ui/src"),
  "@core": join(sourceRoot, "packages/core"),
};
assert.equal(
  process.argv.length,
  4,
  "fresh output and prepare-only or expected-artifacts flag required"
);
const prepareOnly = process.argv[3] === "--prepare-only";
if (!prepareOnly) assert.match(process.argv[3], /^--expected-artifacts=.+$/);
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: false });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Exact bytes from native17's closed synthetic clipboard interval. The earlier
// observations called this103 characters; the recorded ASCII marker is105.
const knownMarker =
  "clipp native17 short toolbar known synthetic marker wraps through enlarged readable preview final actions";
const originalClipId = "9f572b60-3875-42db-af54-01aac283b001";
const copiedClipId = "9f572b60-3875-42db-af54-01aac283b002";
const knownClips = [
  {
    id: copiedClipId,
    type: "text",
    content: knownMarker,
    originPeerId: "synthetic-popup-local",
    capturedAt: Date.parse("2026-10-21T05:27:41Z"),
    shareExpiresAt: Date.parse("2026-10-22T05:27:41Z"),
  },
  {
    id: originalClipId,
    type: "text",
    content: knownMarker,
    originPeerId: "synthetic-popup-local",
    capturedAt: Date.parse("2026-10-21T05:26:12Z"),
    shareExpiresAt: Date.parse("2026-10-22T05:26:12Z"),
  },
];
assert.equal(knownMarker.length, 105);
const sourceFiles = [
  "tests/harness/popup-keyboard-focus.mjs",
  "apps/extension/src/popup.html",
  "apps/extension/src/popup.tsx",
  "apps/extension/src/ExtensionApp.tsx",
  "apps/extension/src/ManagementNavigation.tsx",
  "apps/extension/src/styles/tailwind-built.css",
  "apps/extension/src/popup-host.css",
  "apps/extension/src/management-host.css",
  "packages/ui/src/ClipboardApp.tsx",
  "packages/ui/src/styles.css",
  "packages/ui/src/host.css",
  "packages/ui/src/sessionFocus.ts",
  "packages/ui/src/uiSession.ts",
];
const report = {
  nativeHost: false,
  seam: "production popup.tsx/ExtensionApp surface=popup; public Chrome ports simulated",
  viewport: { width: 480, height: 556 },
  additionalShortHeightsCss: [519, 520, 521],
  shortHeightBasis:
    "approximate native image/source mapping only; native CSS viewport and DPR were not inspected",
  clipboard: "in-memory before production entry; no host clipboard",
  actualToolbarQualification: false,
  historyFixture: {
    clips: knownClips,
    pinnedIds: [originalClipId],
    note: "public snapshots only; no native Copy/capture/Pin claim",
  },
  cases: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  blockedRequests: 0,
  closed: false,
  profileRemoved: false,
  fontsRestored: false,
  sourceHashes: Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        digest(await readFile(join(root, file))),
      ])
    )
  ),
};
const helperRoot = join(out, "font-helper");
await mkdir(helperRoot);
await writeFile(
  join(helperRoot, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Owned popup font fixture",
    version: "1.0.0",
    permissions: ["fontSettings"],
    background: { service_worker: "worker.js" },
  })
);
await writeFile(
  join(helperRoot, "worker.js"),
  "chrome.runtime.onInstalled.addListener(() => {});"
);
await writeFile(
  join(helperRoot, "control.html"),
  '<!doctype html><meta charset="utf-8"><script src="control.js"></script>'
);
await writeFile(
  join(helperRoot, "control.js"),
  `globalThis.ownedFontFixture={
  async read(){return {default:await chrome.fontSettings.getDefaultFontSize({}),minimum:await chrome.fontSettings.getMinimumFontSize({})}},
  async set(value){await chrome.fontSettings.setDefaultFontSize({pixelSize:value.default});await chrome.fontSettings.setMinimumFontSize({pixelSize:value.minimum});return this.read()},
  async clear(){await chrome.fontSettings.clearDefaultFontSize({});await chrome.fontSettings.clearMinimumFontSize({});return this.read()}
};`
);

// Only external public runtime/clipboard boundaries are simulated. Import the
// actual entry after installing them; no UI state/store/test hook is injected.
const built = await build({
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
const diagnostics={messages:[],clipboardReads:0,clipboardWrites:0,unknown:[]};
globalThis.popupFixtureDiagnostics=diagnostics;
Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{diagnostics.clipboardReads++;return ''},writeText:async()=>{diagnostics.clipboardWrites++}}});
const listeners=new Set();
const state={identity:{deviceId:'synthetic-popup-local',deviceName:'Local fixture'},devices:[],pending:[],waiting:[],pairingErrors:[],pairingState:{sessionId:'synthetic-runtime',revision:0,outcomes:[]},peers:[],peerConnections:[],managedRelayConfigurations:[],managedRelayStates:[]};
const history={sessionId:'synthetic-history',revision:0,clips:${JSON.stringify(knownClips)},pinnedIds:[${JSON.stringify(originalClipId)}]};
const settings={sessionId:'synthetic-settings',revision:0,state:{theme:'system',logLevel:'info',localRetentionMs:2592000000,sharingLifetimeMs:86400000,autoSync:true}};
globalThis.chrome={runtime:{onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage(message,done){
  diagnostics.messages.push(message.type);let reply;
  switch(message.type){
    case 'getRuntimeAuthority':reply={sessionId:'synthetic-runtime'};break;
    case 'getRuntimeState':reply={state};break;
    case 'getInitializationError':reply={error:null};break;
    case 'getClipHistory':reply={ok:true,snapshot:history};break;
    case 'getSettings':reply={ok:true,snapshot:settings};break;
    case 'getNotificationAvailability':reply={ok:true,state:{app:'allowed',channel:'not-applicable',displayError:null}};break;
    case 'managementStatus':reply={ok:true,records:[]};break;
    case 'clipboardUpdate':reply={ok:true};break;
    case 'renameLocalIdentity':
      if(message.expectedDeviceId==='synthetic-popup-local'&&message.name===' '.repeat(64)){
        reply={ok:false,error:'invalid_device_name'};break;
      }
      diagnostics.unknown.push(message.type);throw Error('Unexpected Rename request outside exact invalid-name fixture');
    default:diagnostics.unknown.push(message.type);throw Error('Unexpected public fixture request: '+message.type);
  }
  const copy=structuredClone(reply);if(done)queueMicrotask(()=>done(copy));return Promise.resolve(copy);
}}};
import('./apps/extension/src/popup');`,
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  metafile: true,
  absWorkingDir: sourceRoot,
  alias: aliases,
  loader: { ".png": "dataurl" },
  outfile: join(out, "consumer.js"),
});
await writeFile(
  join(out, "esbuild-metafile.json"),
  JSON.stringify(built.metafile, null, 2) + "\n"
);
const ownedInputs = {},
  inputOwners = new Map(),
  virtualInputs = [];
let dependencyInputCount = 0;
for (const input of Object.keys(built.metafile.inputs)) {
  if (input.startsWith("<") || input.startsWith("(disabled):")) {
    virtualInputs.push(input);
    continue;
  }
  const actual = await realpath(resolve(sourceRoot, input));
  if (actual.includes("/node_modules/")) {
    dependencyInputCount++;
    continue;
  }
  assert.ok(
    actual.startsWith(sourceRoot + "/"),
    `project input escaped candidate worktree: ${actual}`
  );
  const name = relative(sourceRoot, actual);
  ownedInputs[name] = {
    realpath: actual,
    sha256: digest(await readFile(actual)),
  };
  inputOwners.set(input, name);
}
for (const required of [
  "apps/extension/src/popup.tsx",
  "apps/extension/src/ExtensionApp.tsx",
  "packages/ui/src/ClipboardApp.tsx",
  "packages/ui/src/uiSession.ts",
  "packages/ui/src/sessionFocus.ts",
])
  assert.ok(
    ownedInputs[required],
    `actual candidate module must contribute: ${required}`
  );
const cssOutputs = Object.entries(built.metafile.outputs).filter(
  ([file]) => file.endsWith("/consumer.css") || file === "consumer.css"
);
assert.equal(cssOutputs.length, 1);
const cssContributions = Object.fromEntries(
  Object.entries(cssOutputs[0][1].inputs)
    .filter(([input]) => inputOwners.has(input))
    .map(([input, value]) => [inputOwners.get(input), value.bytesInOutput])
);
for (const required of [
  "packages/ui/src/styles.css",
  "packages/ui/src/host.css",
  "apps/extension/src/popup-host.css",
  "apps/extension/src/management-host.css",
  "apps/extension/src/styles/tailwind-built.css",
])
  assert.ok(
    ownedInputs[required] && cssContributions[required] > 0,
    `actual candidate CSS must contribute: ${required}`
  );
report.moduleOwnership = {
  sourceRoot,
  aliases,
  ownedInputs: Object.fromEntries(Object.entries(ownedInputs).sort()),
  cssContributions: Object.fromEntries(Object.entries(cssContributions).sort()),
  dependencyInputCount,
  virtualInputs: virtualInputs.sort(),
};
report.esbuildMetafileSha256 = digest(
  await readFile(join(out, "esbuild-metafile.json"))
);
report.buildHashes = Object.fromEntries(
  await Promise.all(
    ["consumer.js", "consumer.css"].map(async (file) => [
      file,
      digest(await readFile(join(out, file))),
    ])
  )
);
const html = (
  await readFile(join(root, "apps/extension/src/popup.html"), "utf8")
)
  .replace(/<script\b[^>]*\bsrc="\.\/popup\.tsx"[^>]*><\/script>/, "")
  .replace(/<link\b[^>]*>/g, "");
const extensionHtml = html
  .replace("</head>", '<link rel="stylesheet" href="consumer.css"></head>')
  .replace("</body>", '<script src="consumer.js"></script></body>');
for (const file of ["consumer.js", "consumer.css"])
  await writeFile(join(helperRoot, file), await readFile(join(out, file)));
await writeFile(join(helperRoot, "app.html"), extensionHtml);
const artifactFiles = [
  "consumer.js",
  "consumer.css",
  ...[
    "manifest.json",
    "worker.js",
    "control.html",
    "control.js",
    "app.html",
    "consumer.js",
    "consumer.css",
  ].map((file) => "font-helper/" + file),
];
const prepared = {
  sourceHashes: report.sourceHashes,
  moduleOwnership: report.moduleOwnership,
  artifactHashes: Object.fromEntries(
    await Promise.all(
      artifactFiles.map(async (file) => [
        file,
        digest(await readFile(join(out, file))),
      ])
    )
  ),
  originLoaders: {
    aboutblank:
      "newPage + setContent production HTML; local addStyleTag/addScriptTag; ordinary aboutblank policy",
    extension:
      "genuine owned chrome-extension://id/app.html; same bundle/CSS as packaged self resources; default MV3 extension CSP retained",
    differences:
      "Only document scheme/origin and its necessary normal packaged-resource loader/CSP differ; no CSP weakening, font override or new permission",
  },
};
const preparedBytes = JSON.stringify(prepared, null, 2) + "\n";
await writeFile(join(out, "prepared-artifacts.json"), preparedBytes);
if (prepareOnly) {
  console.log(
    JSON.stringify({
      preparedOnly: true,
      preparedArtifacts: join(out, "prepared-artifacts.json"),
      sha256: digest(preparedBytes),
    })
  );
  process.exit(0);
}
const expectedFile = resolve(
  process.argv[3].slice("--expected-artifacts=".length)
);
const expectedBytes = await readFile(expectedFile);
assert.ok(
  expectedBytes.length <= 262144,
  "bounded own prepared-artifact freeze required"
);
assert.deepEqual(
  prepared,
  JSON.parse(expectedBytes.toString("utf8")),
  "prepared source/bundle/loader bytes must match before browser launch"
);
report.preparedArtifacts = {
  expectedFile,
  expectedSha256: digest(expectedBytes),
  actualSha256: digest(preparedBytes),
  ...prepared,
};
const profile = await mkdtemp(join(tmpdir(), "clipp-popup-keyboard-"));
report.profile = profile;
let context, helper, primaryFailure;
const bounded = (promise, milliseconds = 5000) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error("bounded rendered observation expired")),
        milliseconds
      );
    }),
  ]).finally(() => clearTimeout(timer));
};
const sampleFocus = () => {
  const target = document.activeElement;
  const style = getComputedStyle(target);
  const rect = target.getBoundingClientRect().toJSON();
  const extension = Math.max(
    0,
    parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
  );
  const outline = {
    left: rect.left - extension,
    top: rect.top - extension,
    right: rect.right + extension,
    bottom: rect.bottom + extension,
  };
  const bounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const ancestors = [];
  for (
    let parent = target.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const css = getComputedStyle(parent),
      box = parent.getBoundingClientRect();
    const clipsX = /hidden|clip|auto|scroll/.test(css.overflowX),
      clipsY = /hidden|clip|auto|scroll/.test(css.overflowY);
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
    ancestors.push({
      tag: parent.tagName,
      className: parent.className,
      rect: box.toJSON(),
      inside,
      clipsX,
      clipsY,
      overflowX: css.overflowX,
      overflowY: css.overflowY,
      scrollPaddingBlockStart: css.scrollPaddingBlockStart,
      scrollPaddingBlockEnd: css.scrollPaddingBlockEnd,
      fontSize: css.fontSize,
      sessionScroll: parent.getAttribute("data-session-scroll"),
      scrollTop: parent.scrollTop,
      scrollLeft: parent.scrollLeft,
      scrollHeight: parent.scrollHeight,
      clientHeight: parent.clientHeight,
    });
  }
  const inside = (box) =>
    box.left >= bounds.left - 0.5 &&
    box.top >= bounds.top - 0.5 &&
    box.right <= bounds.right + 0.5 &&
    box.bottom <= bounds.bottom + 0.5;
  const name = document.querySelector('[aria-label="Device Name"]');
  const task = document.querySelector("[data-task-dialog]");
  const textMetrics = (element) => {
    if (!element) return null;
    const css = getComputedStyle(element);
    return {
      rect: element.getBoundingClientRect().toJSON(),
      fontSize: css.fontSize,
      fontFamily: css.fontFamily,
      lineHeight: css.lineHeight,
      glyphs: [...element.childNodes]
        .filter(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        )
        .map((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return {
            text: node.textContent,
            rects: [...range.getClientRects()].map((rect) => rect.toJSON()),
          };
        }),
    };
  };
  const openFull = [...document.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === "Open full-page Clipp"
  );
  const log = document.querySelector('[aria-label="Log level"]');
  return {
    active: {
      tag: target.tagName,
      name: target.getAttribute("aria-label") || target.textContent.trim(),
      value: target.value,
      focusVisible: target.matches(":focus-visible"),
    },
    rect,
    outline,
    bounds,
    ancestors,
    controlInside: inside(rect),
    outlineInside: inside(outline),
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    rootFont: getComputedStyle(document.documentElement).fontSize,
    document: {
      url: location.href,
      origin: location.origin,
      protocol: location.protocol,
      secureContext: isSecureContext,
    },
    visualViewport: visualViewport
      ? {
          width: visualViewport.width,
          height: visualViewport.height,
          scale: visualViewport.scale,
          offsetLeft: visualViewport.offsetLeft,
          offsetTop: visualViewport.offsetTop,
        }
      : null,
    dpr: devicePixelRatio,
    cssZoom: {
      root: getComputedStyle(document.documentElement).zoom,
      body: getComputedStyle(document.body).zoom,
    },
    textMetrics: {
      openFull: textMetrics(openFull),
      logLabel: textMetrics(log?.closest("label")),
      logControl: textMetrics(log),
    },
    controlFont: style.fontSize,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineOffset: style.outlineOffset,
    classes: document.querySelector(".app-shell").className,
    clips: [...document.querySelectorAll("[data-clip-id]")].map((card) => ({
      id: card.dataset.clipId,
      rect: card.getBoundingClientRect().toJSON(),
      preview: card.querySelector(".history-text")?.textContent,
      previewRect: card
        .querySelector(".history-text")
        ?.getBoundingClientRect()
        .toJSON(),
      pinned: card
        .querySelector('[aria-label="Pin Clip"]')
        ?.getAttribute("aria-pressed"),
      pinRect: card
        .querySelector('[aria-label="Pin Clip"]')
        ?.getBoundingClientRect()
        .toJSON(),
      copyRect: card
        .querySelector('[aria-label="Copy Clip"]')
        ?.getBoundingClientRect()
        .toJSON(),
      time: card.querySelector(".meta-time")?.textContent,
    })),
    name: name
      ? {
          value: name.value,
          selectionStart: name.selectionStart,
          selectionEnd: name.selectionEnd,
          scrollLeft: name.scrollLeft,
          rect: name.getBoundingClientRect().toJSON(),
        }
      : null,
    task: task
      ? {
          rect: task.getBoundingClientRect().toJSON(),
          scrollTop: task.scrollTop,
          scrollHeight: task.scrollHeight,
          clientHeight: task.clientHeight,
          alerts: [...task.querySelectorAll('[role="alert"]')].map(
            (alert) => alert.textContent
          ),
        }
      : null,
    diagnostics: structuredClone(globalThis.popupFixtureDiagnostics),
  };
};
let overallExpired = false;
const overall = setTimeout(() => {
  overallExpired = true;
  void context?.close();
}, 120000);
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    timeout: 15000,
    viewport: report.viewport,
    args: [
      `--disable-extensions-except=${helperRoot}`,
      `--load-extension=${helperRoot}`,
    ],
  });
  context.setDefaultTimeout(3000);
  context.setDefaultNavigationTimeout(3000);
  report.browser = context.browser()?.version();
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 5000 }));
  assert.equal(
    new URL(worker.url()).pathname,
    "/worker.js",
    "only owned font fixture worker admitted"
  );
  const fixtureOrigin = `chrome-extension://${new URL(worker.url()).host}`;
  report.fixtureOrigin = fixtureOrigin;
  await context.route("**/*", (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(fixtureOrigin + "/")
    )
      return route.continue();
    report.blockedRequests++;
    return route.abort();
  });
  helper = await context.newPage();
  await helper.goto(`${fixtureOrigin}/control.html`);
  for (const page of context.pages()) if (page !== helper) await page.close();
  const profiles = [
    { default: 16, minimum: 0 },
    { default: 24, minimum: 0 },
    { default: 32, minimum: 24 },
    { default: 16, minimum: 0 },
  ];
  for (const [index, font] of profiles.entries()) {
    const scenarios = [
      { origin: "aboutblank", height: 556 },
      { origin: "extension", height: 556 },
      ...(index === 0
        ? [519, 520, 521].map((height) => ({ origin: "extension", height }))
        : index === 3
          ? [{ origin: "extension", height: 520 }]
          : []),
    ];
    for (const { origin, height } of scenarios) {
      const viewport = { width: 480, height };
      const caseSuffix = height === 556 ? "" : `-h${height}`;
      assert.equal(overallExpired, false);
      const prefs = await bounded(
        helper.evaluate((value) => ownedFontFixture.set(value), font)
      );
      assert.equal(prefs.default.pixelSize, font.default);
      assert.equal(prefs.minimum.pixelSize, font.minimum);
      // A reopened production popup owns a fresh document. setContent alone keeps
      // the old navigator and React effects, so never reuse a previous fixture page.
      const page = await context.newPage();
      if (height !== report.viewport.height)
        await bounded(page.setViewportSize(viewport));
      page.on("pageerror", (error) => report.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error")
          report.consoleErrors.push({ origin, font, text: message.text() });
      });
      page.on("requestfailed", (request) =>
        report.failedRequests.push({
          origin,
          font,
          url: request.url(),
          error: request.failure()?.errorText,
        })
      );
      await page.bringToFront();
      if (origin === "aboutblank") {
        await page.setContent(html);
        await page.addStyleTag({ path: join(out, "consumer.css") });
        await page.addScriptTag({ path: join(out, "consumer.js") });
      } else await page.goto(`${fixtureOrigin}/app.html`);
      const observation = {
        origin,
        font,
        viewport,
        fontPhase: index === 3 ? "restored" : "initial",
        actualPreferences: prefs,
        journey: [],
      };
      report.cases.push(observation);
      if (font.default === 32 && font.minimum === 24) {
        const recordJourney = async (stage) => {
          const frames = [];
          for (let frame = 0; frame < 3; frame++) {
            await bounded(
              page.evaluate(
                () => new Promise((resolve) => requestAnimationFrame(resolve))
              )
            );
            frames.push(await bounded(page.evaluate(sampleFocus)));
          }
          observation.journey.push({ stage, frames });
          return frames.at(-1);
        };
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              ".content-pane:not([hidden]) [data-clip-id]"
            ).length === 2 &&
            document
              .querySelector(".app-shell")
              .classList.contains("workspace-cramped")
        );
        const initial = await recordJourney("two-known-clips-before-scroll");
        assert.deepEqual(
          initial.clips.map((clip) => clip.id).sort(),
          [originalClipId, copiedClipId].sort()
        );
        for (const clip of initial.clips) {
          assert.equal(clip.preview, knownMarker);
          assert.equal(
            clip.pinned,
            clip.id === originalClipId ? "true" : "false"
          );
        }
        // Observe the real browser scroll boundary; never set a product scroll offset.
        await page.evaluate(() => {
          globalThis.popupFixtureDiagnostics.historyScrollEnded = false;
          document.querySelector(".app-shell").addEventListener(
            "scrollend",
            () => {
              globalThis.popupFixtureDiagnostics.historyScrollEnded = true;
            },
            { once: true }
          );
        });
        await page.mouse.move(240, 500);
        await page.mouse.wheel(0, 600);
        await page.waitForFunction(
          () =>
            globalThis.popupFixtureDiagnostics.historyScrollEnded === true &&
            document.querySelector(".app-shell").scrollTop > 0
        );
        await recordJourney("history-after-ordinary-scroll");
        await page
          .getByRole("button", { name: "Devices", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Rename this device", exact: true })
          .click();
        const name = page.getByRole("textbox", {
          name: "Device Name",
          exact: true,
        });
        await name.fill(" ".repeat(64));
        await page.keyboard.press("Enter");
        await page
          .getByRole("dialog", { name: "Device Name", exact: true })
          .getByRole("alert")
          .waitFor();
        const invalid = await recordJourney(
          "64-spaces-return-visible-validation"
        );
        assert.equal(invalid.name.value, " ".repeat(64));
        assert.deepEqual(invalid.task.alerts, [
          "Device Name must contain 1–64 characters without control or line breaks. Edit and Save again.",
        ]);
        const draft =
          "native17abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123";
        assert.equal(draft.length, 64);
        await name.fill(draft);
        await page.keyboard.press("Meta+ArrowLeft");
        const start = await recordJourney("exact64-name-logical-home");
        assert.equal(start.name.value, draft);
        assert.equal(start.name.selectionStart, 0);
        assert.equal(start.name.selectionEnd, 0);
        await page.screenshot({
          path: join(out, `journey-name-home-${origin}.png`),
        });
        await page.keyboard.press("Meta+ArrowRight");
        const end = await recordJourney("exact64-name-logical-end");
        assert.equal(end.name.value, draft);
        assert.equal(end.name.selectionStart, 64);
        assert.equal(end.name.selectionEnd, 64);
        await page.screenshot({
          path: join(out, `journey-name-end-${origin}.png`),
        });
        for (const expected of [
          "Save Device Name",
          "Cancel name edit",
          "Close name editor",
        ]) {
          await page.keyboard.press("Tab");
          const step = await recordJourney("Tab-to-" + expected);
          assert.equal(step.active.tag, "BUTTON");
          assert.equal(step.active.name, expected);
          assert.equal(step.name.value, draft);
        }
        await page.keyboard.press("Shift+Tab");
        const cancel = await recordJourney("ShiftTab-to-Cancel");
        assert.equal(cancel.active.name, "Cancel name edit");
        await page.keyboard.press("Enter");
        await page
          .getByRole("dialog", { name: "Device Name", exact: true })
          .waitFor({ state: "detached" });
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute("aria-label") ===
            "Rename this device"
        );
        const returned = await recordJourney("Cancel-Return-to-Rename-trigger");
        assert.equal(returned.active.name, "Rename this device");
        assert.equal(returned.task, null);
      }
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("navigation", { name: "Settings categories" })
        .getByRole("button", { name: "Advanced", exact: true })
        .click();
      const log = page.getByLabel("Log level", { exact: true });
      await log.waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Log level"]')?.disabled === false
      );
      const traversal = [];
      observation.traversal = traversal;
      for (let tab = 0; tab < 24; tab++) {
        await page.keyboard.press("Tab");
        const active = await page.evaluate(() => ({
          tag: document.activeElement.tagName,
          name:
            document.activeElement.getAttribute("aria-label") ||
            document.activeElement.textContent.trim(),
        }));
        traversal.push(active);
        if (active.tag === "SELECT" && active.name === "Log level") break;
      }
      assert.equal(
        traversal.at(-1)?.name,
        "Log level",
        "keyboard must reach actual final select"
      );
      const frames = [];
      for (let frame = 0; frame < 3; frame++) {
        await bounded(
          page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(resolve))
          )
        );
        frames.push(await bounded(page.evaluate(sampleFocus)));
      }
      const before = frames.at(-1);
      await page.screenshot({
        path: join(
          out,
          `focus-${origin}-${index}-${font.default}-${font.minimum}${caseSuffix}.png`
        ),
      });
      Object.assign(observation, { frames, before });
      // Scoped pointer recovery follows evidence; it cannot erase keyboard failure.
      if (!before.controlInside || !before.outlineInside) {
        await page.mouse.move(
          240,
          Math.min(
            height - 10,
            Math.max(10, before.rect.top + before.rect.height / 2)
          )
        );
        await page.mouse.wheel(0, 120);
        await bounded(
          page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
              )
          )
        );
        observation.afterOneWheel = await bounded(page.evaluate(sampleFocus));
        await page.screenshot({
          path: join(out, `recovered-${origin}-${index}${caseSuffix}.png`),
        });
      }
      await page.close();
    }
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.equal(
    report.cases.length,
    12,
    "eight original and four short cases required"
  );
  for (const observation of report.cases) {
    const m = observation.before;
    assert.equal(m.viewport.width, 480);
    assert.equal(m.viewport.height, observation.viewport.height);
    assert.equal(
      observation.traversal.length,
      8,
      "unchanged final-control Tab route"
    );
    if (observation.viewport.height !== 556) {
      assert.equal(observation.origin, "extension");
      for (const frame of observation.frames) {
        assert.match(frame.classes, /\bworkspace-narrow\b/);
        assert.doesNotMatch(frame.classes, /\bworkspace-cramped\b/);
        const owner = frame.ancestors.find(
          (ancestor) => ancestor.sessionScroll === "settings"
        );
        assert.ok(owner, "actual Settings scroll ancestor required");
        assert.match(owner.className, /\bdestination-pane\b/);
        assert.equal(owner.overflowY, "auto");
        assert.ok(owner.scrollHeight > owner.clientHeight);
        assert.ok(
          Math.abs(owner.inside.bottom - frame.bounds.bottom) <= 0.5,
          "Settings destination pane must be the limiting vertical clip owner"
        );
      }
    }
    if (observation.origin === "aboutblank") {
      assert.equal(m.document.url, "about:blank");
      assert.equal(parseFloat(m.rootFont), observation.font.default);
    } else {
      assert.equal(m.document.origin, report.fixtureOrigin);
      assert.equal(m.document.protocol, "chrome-extension:");
      assert.ok(
        Number.isFinite(parseFloat(m.rootFont)) && parseFloat(m.rootFont) > 0,
        "actual extension CSS font metric remains independent of assigned browser preference"
      );
    }
    assert.equal(m.active.tag, "SELECT");
    assert.equal(m.active.name, "Log level");
    assert.equal(m.active.value, "info");
    assert.equal(m.active.focusVisible, true);
    assert.notEqual(m.outlineStyle, "none");
    assert.equal(m.diagnostics.clipboardWrites, 0);
    assert.deepEqual(m.diagnostics.unknown, []);
    assert.ok(m.documentWidth <= 481, "no horizontal document hunting");
    assert.ok(
      m.controlInside,
      `${observation.font.default}/${observation.font.minimum}: full final control visible after keyboard arrival`
    );
    assert.ok(
      m.outlineInside,
      `${observation.font.default}/${observation.font.minimum}: complete final focus outline visible after keyboard arrival`
    );
  }
  report.status = "PASS_RENDERED_POPUP_KEYBOARD_ONLY";
} catch (error) {
  primaryFailure = error;
  report.status = "FAILED_OR_UNQUALIFIED";
  report.failure = String(error);
  throw error;
} finally {
  clearTimeout(overall);
  let cleanupFailure;
  try {
    if (helper && !helper.isClosed()) {
      const restored = await bounded(
        helper.evaluate(() => ownedFontFixture.clear())
      );
      report.restoredPreferences = restored;
      report.fontsRestored =
        restored.default.pixelSize === 16 && restored.minimum.pixelSize === 0;
    }
  } catch (error) {
    cleanupFailure = error;
  }
  try {
    if (context) {
      await bounded(context.close(), 15000);
      report.closed = true;
    }
    if (report.closed) {
      await rm(profile, { recursive: true, force: true });
      report.profileRemoved = true;
    }
  } catch (error) {
    cleanupFailure ??= error;
  }
  if (!report.closed || !report.profileRemoved || !report.fontsRestored)
    cleanupFailure ??= Error("owned browser/font/profile closure incomplete");
  if (cleanupFailure) {
    report.cleanupFailure = String(cleanupFailure);
    report.status = "FAILED_OR_UNQUALIFIED";
  }
  report.overallExpired = overallExpired;
  await writeFile(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  if (cleanupFailure && !primaryFailure) throw cleanupFailure;
}
