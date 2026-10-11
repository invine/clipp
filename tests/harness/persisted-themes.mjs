import { build } from "esbuild";
import { chromium } from "@playwright/test";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// Isolated browser acceptance through production Electron/Chrome entries and
// the shared Android-facing consumer. OS/native appearance is not qualified.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
await build({
  entryPoints: [join(repo, "packages/core/runtime/settingsAuthority.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(out, "authority.mjs"),
});
const { createSettingsHandler } = await import(join(out, "authority.mjs"));
const values = new Map();
const pages = new Set();
const writes = [];
let failWrite = false,
  loseReply = false;
const owner = createSettingsHandler({
  sessionId: "theme-fixture",
  storage: {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      if (failWrite) throw new Error("fixture_storage_denied");
      values.set(key, value);
      writes.push({ key, value });
    },
  },
  applyAutoSync: () => {},
  applyLogLevel: () => {},
  publish: async (snapshot) => {
    await Promise.all(
      [...pages].map((page) =>
        page.evaluate(
          (snapshot) =>
            window.fixtureNotify?.({ type: "settingsState", snapshot }),
          snapshot
        )
      )
    );
  },
});
const runtime = {
  clips: [],
  devices: [],
  pending: [],
  waiting: [],
  pairingErrors: [],
  peers: [],
  identity: { deviceId: "fixture-device", deviceName: "Fixture installation" },
  pinnedIds: [],
  relayAddresses: [],
  managedRelayConfigurations: [],
  managedRelayStates: [],
  pairingState: {
    sessionId: "runtime-fixture",
    revision: 1,
    waiting: [],
    errors: [],
    outcomes: [],
  },
};
const request = async (message) => {
  if (message.type === "getSettings")
    return { ok: true, snapshot: await owner.read() };
  if (message.type === "setSettings") {
    const result = await owner.write(message.settings);
    if (loseReply) throw new Error("fixture_reply_lost");
    return result;
  }
  if (message.type === "getRuntimeState") return { state: runtime };
  if (message.type === "getRuntimeAuthority")
    return { sessionId: "runtime-fixture" };
  if (message.type === "getInitializationError") return { error: null };
  if (message.type === "getClipHistory")
    return {
      ok: true,
      snapshot: {
        sessionId: "history-fixture",
        revision: 1,
        clips: [],
        pinnedIds: [],
      },
    };
  if (message.type === "getTrustedDevices") return { devices: [] };
  if (message.type === "getPendingRequests") return { pending: [] };
  if (message.type === "getConnectedPeers")
    return { peers: [], peerConnections: [] };
  if (message.type === "getIdentity") return { identity: runtime.identity };
  return { ok: true };
};
const shim = `
window.fixtureMessages=[];window.fixtureClipboard=[];window.fixtureListeners=new Set();
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>{window.fixtureClipboard.push('memory-read');return '';},writeText:async value=>{window.fixtureClipboard.push({memoryWrite:value});}}});
window.fixtureNotify=message=>{for(const listener of window.fixtureListeners)listener(message);};
window.chrome={runtime:{id:'fixture',getURL:value=>'chrome-extension://fixture/'+value,onMessage:{addListener:listener=>window.fixtureListeners.add(listener),removeListener:listener=>window.fixtureListeners.delete(listener)},sendMessage:(message,callback)=>{window.fixtureMessages.push(message);const result=window.fixtureRequest(message);if(callback)result.then(callback,()=>callback(undefined));return result;}},tabs:{create:()=>{}}};
window.fixturePort={send:message=>window.fixtureRequest(message),subscribe:listener=>{window.fixtureListeners.add(listener);return()=>window.fixtureListeners.delete(listener);}};
window.clipp={getSettings:()=>window.fixtureRequest({type:'getSettings'}),setTheme:theme=>window.fixtureRequest({type:'setSettings',settings:{theme}}),onSettingsUpdate:listener=>{const wrapped=message=>{if(message.type==='settingsState')listener(message.snapshot);};window.fixtureListeners.add(wrapped);return()=>window.fixtureListeners.delete(wrapped);},getState:async()=>({...${JSON.stringify(runtime)},...(window.fixtureHistoryUnavailable?{historyUnavailable:true}:{})}),getRuntimeAuthority:async()=>'runtime-fixture',getInitializationError:async()=>null,onUpdate:()=>()=>{},onLog:()=>()=>{},refreshManagedRelays:async()=>[],setAutoSync:async()=>({status:'applied'}),refreshAutoSync:async()=>true};
`;
const entries = {
  electron: "apps/electron/src/renderer.tsx",
  popup: "apps/extension/src/popup.tsx",
  options: "apps/extension/src/options.tsx",
};
for (const [name, entry] of Object.entries(entries))
  await build({
    entryPoints: [join(repo, entry)],
    bundle: true,
    platform: "browser",
    format: "iife",
    loader: { ".png": "dataurl" },
    outfile: join(out, name + ".js"),
  });
await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';import{createUiSession}from'${repo}/packages/ui/src/uiSession';import{useRuntimeSettings}from'${repo}/packages/ui/src/useRuntimeSettings';import'${repo}/packages/ui/src/styles.css';import'${repo}/packages/ui/src/host.css';import'${repo}/apps/android/src/android-host.css';window.fixtureSession=createUiSession();function App(){const appearanceSettings=useRuntimeSettings(window.fixturePort);return <div className="android-host"><ClipboardApp session={window.fixtureSession} appearanceSettings={appearanceSettings} {...${JSON.stringify(runtime)}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({status:'accepted'})} onReject={async()=>({status:'rejected'})} onPairText={async()=>({status:'invalid-input'})} onRequestPairingCode={async()=>({text:'fixture'})} onCopyPairingText={async()=>({status:'copied'})} onReuseClip={async()=> 'complete'} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>{}} onMutateManagedRelay={async()=>({status:'rejected',error:'fixture-only'})}/></div>}createRoot(document.getElementById('root')).render(<App/>);`,
    loader: "tsx",
    resolveDir: repo,
  },
  bundle: true,
  format: "iife",
  loader: { ".png": "dataurl" },
  outfile: join(out, "android-shared.js"),
});
const report = {
  actualNativeHost: false,
  appearance: "Playwright emulated color scheme",
  clipboard: "memory API installed before entry",
  ports: [],
  cases: [],
  errors: [],
  closed: false,
};
const profile = await mkdtemp(join(tmpdir(), "clipp-theme-fixture-"));
report.profile = profile;
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1000, height: 800 },
  colorScheme: "light",
});
await context.route("**/*", (route) => route.abort());
async function open(name, historyUnavailable = false) {
  const page = await context.newPage();
  pages.add(page);
  await page.exposeBinding("fixtureRequest", (_, message) => request(message));
  page.on("pageerror", (error) =>
    report.errors.push({ name, error: error.message })
  );
  await page.setContent(
    '<!doctype html><html><head><meta name="color-scheme" content="light dark"></head><body><div id="root"></div></body></html>'
  );
  await page.addScriptTag({ content: shim });
  await page.evaluate((value) => {
    window.fixtureHistoryUnavailable = value;
  }, historyUnavailable);
  await page.addStyleTag({ path: join(out, name + ".css") });
  await page.addScriptTag({ path: join(out, name + ".js") });
  await page.getByLabel("Appearance", { exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Appearance"]').disabled
  );
  return page;
}
const luminance = (rgb) => {
  const channels = rgb
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
async function inspect(page, name, mode) {
  const field = page.getByLabel("Appearance", { exact: true });
  await field.focus();
  const colors = await field.evaluate((el) => {
    const s = getComputedStyle(el),
      body = getComputedStyle(document.body);
    return {
      text: s.color,
      field: s.backgroundColor,
      border: s.borderColor,
      focus: s.outlineColor,
      outline: s.outlineWidth,
      body: body.backgroundColor,
      bodyText: body.color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  assert.ok(
    ratio(colors.text, colors.field) >= 4.5,
    `${name} ${mode} field contrast`
  );
  assert.ok(
    ratio(colors.bodyText, colors.body) >= 4.5,
    `${name} ${mode} text contrast`
  );
  assert.ok(
    ratio(colors.border, colors.field) >= 3,
    `${name} ${mode} border contrast`
  );
  assert.ok(
    ratio(colors.focus, colors.body) >= 3,
    `${name} ${mode} focus contrast`
  );
  assert.equal(colors.outline, "3px");
  const portal = page.getByRole("dialog", { name: "Pair this device" });
  if (await portal.count()) {
    const palette = await portal.evaluate((el) => {
      const surface = getComputedStyle(el);
      const button = getComputedStyle(el.querySelector(".qr-modal-copy"));
      const hint = getComputedStyle(el.querySelector(".qr-modal-status"));
      return {
        text: surface.color,
        background: surface.backgroundColor,
        actionText: button.color,
        action: button.backgroundColor,
        hint: hint.color,
      };
    });
    assert.ok(
      ratio(palette.text, palette.background) >= 4.5,
      "portal text contrast"
    );
    assert.ok(
      ratio(palette.hint, palette.background) >= 4.5,
      "portal hint contrast"
    );
    assert.ok(
      ratio(palette.actionText, palette.action) >= 4.5,
      "portal action contrast"
    );
    report.cases.push({ name, mode, portal: palette });
  }
  report.cases.push({
    name,
    mode,
    colors,
    textContrast: ratio(colors.text, colors.field),
    focusContrast: ratio(colors.focus, colors.body),
  });
  await page.screenshot({
    path: join(out, `${name}-${mode}.png`),
    fullPage: true,
  });
  return colors;
}
try {
  const opened = {};
  for (const name of ["electron", "popup", "options", "android-shared"])
    opened[name] = await open(name);
  for (const [name, page] of Object.entries(opened))
    await inspect(page, name, "system-light");
  const recoveryPage = await open("electron", true);
  const retry = recoveryPage
    .locator(".initialization-error")
    .getByRole("button", { name: "Retry", exact: true });
  await retry.waitFor();
  await retry.focus();
  const recoveryPalette = await retry.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      text: s.color,
      background: s.backgroundColor,
      focus: s.outlineColor,
      outline: s.outlineWidth,
      surface: getComputedStyle(el.parentElement).backgroundColor,
    };
  });
  report.historyRecoveryPalette = recoveryPalette;
  await recoveryPage.screenshot({
    path: join(out, "electron-light-history-recovery.png"),
    fullPage: true,
  });
  assert.ok(
    ratio(recoveryPalette.text, recoveryPalette.background) >= 4.5,
    "Light History-recovery Retry text contrast"
  );
  assert.ok(
    ratio(recoveryPalette.focus, recoveryPalette.surface) >= 3,
    "Light History-recovery focus contrast"
  );
  assert.equal(recoveryPalette.outline, "3px");
  pages.delete(recoveryPage);
  await recoveryPage.close();

  const before = writes.length;
  await Promise.all(
    Object.values(opened).map((page) =>
      page.emulateMedia({ colorScheme: "dark" })
    )
  );
  for (const [name, page] of Object.entries(opened)) {
    await inspect(page, name, "system-dark");
    assert.equal(
      await page.getByLabel("Appearance", { exact: true }).inputValue(),
      "system"
    );
  }
  assert.equal(
    writes.length,
    before,
    "System appearance changes must never persist a preference"
  );
  await opened.popup
    .getByLabel("Appearance", { exact: true })
    .selectOption("light");
  for (const [name, page] of Object.entries(opened)) {
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Appearance"]').value === "light"
    );
    const light = await inspect(page, name, "explicit-light");
    assert.equal(light.scheme, "light");
  }
  await opened.options
    .getByRole("checkbox", { name: "Auto Sync", exact: true })
    .click();
  await opened.options.waitForFunction(
    () =>
      ![...document.querySelectorAll('input[type="checkbox"]')].find((el) =>
        el.closest("label")?.textContent.includes("Auto Sync")
      ).checked
  );
  assert.equal((await owner.read()).state.theme, "light");
  assert.equal((await owner.read()).state.autoSync, false);
  assert.equal(
    await opened.options
      .locator(".appearance-settings")
      .getByText("Appearance saved.")
      .count(),
    0,
    "unrelated save cannot claim Appearance saved"
  );
  await opened.options
    .getByRole("button", { name: "Add relay", exact: true })
    .click();
  await opened.options
    .getByLabel("Name", { exact: true })
    .fill("Preserved relay draft");
  await opened.popup
    .getByLabel("Search history", { exact: true })
    .fill("Retained query");
  await opened.electron
    .getByLabel("Search history", { exact: true })
    .fill("Desktop query");
  await opened["android-shared"].evaluate(async () => {
    window.fixtureSession.pairing.change("Retained pairing draft");
    await window.fixtureSession.qr.generate(async () => ({
      text: "fixture-pairing-target",
    }));
  });
  await opened["android-shared"]
    .getByRole("dialog", { name: "Pair this device" })
    .waitFor();
  await inspect(opened["android-shared"], "android-shared", "light-portal");
  await opened.popup
    .getByLabel("Appearance", { exact: true })
    .selectOption("dark");
  for (const [name, page] of Object.entries(opened)) {
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Appearance"]').value === "dark"
    );
    await inspect(page, name, "explicit-dark");
  }
  assert.equal(
    await opened.options.getByLabel("Name", { exact: true }).inputValue(),
    "Preserved relay draft"
  );
  assert.equal(
    await opened.popup
      .getByLabel("Search history", { exact: true })
      .inputValue(),
    "Retained query"
  );
  assert.equal(
    await opened.electron
      .getByLabel("Search history", { exact: true })
      .inputValue(),
    "Desktop query"
  );
  const draftColors = await opened.options
    .getByLabel("Name", { exact: true })
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { text: s.color, bg: s.backgroundColor };
    });
  assert.ok(ratio(draftColors.text, draftColors.bg) >= 4.5);
  await Promise.all(
    Object.values(opened).map((page) =>
      page.emulateMedia({ colorScheme: "light" })
    )
  );
  for (const [name, page] of Object.entries(opened)) {
    const dark = await inspect(page, name, "dark-host-light");
    assert.equal(dark.scheme, "dark");
  }
  assert.equal(
    await opened["android-shared"].evaluate(
      () => window.fixtureSession.pairing.getSnapshot().raw
    ),
    "Retained pairing draft"
  );
  await opened["android-shared"]
    .getByRole("button", { name: "Close QR dialog", exact: true })
    .click();
  failWrite = true;
  await opened.popup
    .getByLabel("Appearance", { exact: true })
    .selectOption("light");
  await opened.popup
    .getByRole("alert")
    .filter({ hasText: "Appearance was not saved" })
    .waitFor();
  assert.equal(
    await opened.popup.getByLabel("Appearance", { exact: true }).inputValue(),
    "dark"
  );
  const rejectedPalette = await opened.popup
    .getByRole("alert")
    .filter({ hasText: "Appearance was not saved" })
    .evaluate((el) => ({
      text: getComputedStyle(el).color,
      background: getComputedStyle(document.body).backgroundColor,
    }));
  assert.ok(
    ratio(rejectedPalette.text, rejectedPalette.background) >= 4.5,
    "visible rejection contrast"
  );
  await opened.popup.screenshot({
    path: join(out, "popup-rejected.png"),
    fullPage: true,
  });
  report.rejectedPalette = rejectedPalette;
  failWrite = false;
  loseReply = true;
  await opened.popup
    .getByLabel("Appearance", { exact: true })
    .selectOption("light");
  await opened.popup
    .getByRole("alert")
    .filter({ hasText: "Appearance save could not be confirmed" })
    .waitFor();
  assert.equal(
    await opened.popup.getByLabel("Appearance", { exact: true }).inputValue(),
    "light"
  );
  loseReply = false;
  pages.delete(opened.popup);
  await opened.popup.close();
  const reopened = await open("popup");
  assert.equal(
    await reopened.getByLabel("Appearance", { exact: true }).inputValue(),
    "light"
  );
  await inspect(reopened, "popup", "reopened-light");
  await reopened
    .getByLabel("Appearance", { exact: true })
    .selectOption("system");
  await reopened.waitForFunction(
    () => document.querySelector('[aria-label="Appearance"]').value === "system"
  );
  await reopened.emulateMedia({ colorScheme: "dark" });
  assert.equal(
    (await inspect(reopened, "popup", "system-restored-dark")).scheme,
    "dark"
  );
  report.writes = writes;
  report.sharedDraftAndSearchPreserved = true;
  report.failedAndUnconfirmedVisible = true;
  report.reopenedApplied = true;
  report.clipboard = await reopened.evaluate(() => window.fixtureClipboard);
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
  report.profileRemoved = await stat(profile).then(
    () => false,
    () => true
  );
  report.buildHashes = {};
  for (const name of [
    "authority.mjs",
    "electron.js",
    "electron.css",
    "popup.js",
    "popup.css",
    "options.js",
    "options.css",
    "android-shared.js",
    "android-shared.css",
  ])
    report.buildHashes[name] = createHash("sha256")
      .update(await readFile(join(out, name)))
      .digest("hex");
  report.closed = true;
  report.profiles =
    "Owned fixture profile removed after context/browser closure; no user profile, font, OS appearance or clipboard touched";
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    cases: report.cases.length,
    closed: report.closed,
    errors: report.errors.length,
  })
);
