import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Synthetic document fixture only: actual shared task consumer, no native host/clipboard.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
await build({
  stdin: {
    resolveDir: repo,
    loader: "tsx",
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';import{createUiSession}from'${repo}/packages/ui/src/uiSession';import{createHostTaskInput,bindHostOverlayKeyboard}from'${repo}/packages/ui/src/hostTaskInput';import{bindElectronHostTaskInput}from'${repo}/apps/electron/src/hostTaskInput';import{bindAndroidHostTaskInput}from'${repo}/apps/android/src/hostTaskInputNative';import'${repo}/packages/ui/src/styles.css';import'${repo}/packages/ui/src/host.css';window.session=createUiSession();window.input=createHostTaskInput(window.session);window.input.setReady(true);let nativeBack,completeBack,backSequence=0;window.disposeNative=bindAndroidHostTaskInput(window.input,{addListener:async(_,listener)=>{nativeBack=listener;return{remove:async()=>{nativeBack=null}}},setReady:async()=>{},completeBack:async result=>{completeBack?.(result);completeBack=null}},"source-native-port");window.fireNative=imeVisible=>new Promise(resolve=>{completeBack=resolve;nativeBack({owner:"source-native-port",sequence:++backSequence,imeVisible})});window.disposeKeyboard=bindHostOverlayKeyboard(window.input,document);let activation;window.disposeActivation=bindElectronHostTaskInput({onTaskActivation:fn=>{activation=fn;return()=>activation=null},setTaskInputReady:async()=>{}},window.session,undefined,"source-fixture");window.activate=()=>activation?.();createRoot(document.getElementById('root')).render(<ClipboardApp taskInput={window.input} session={window.session} clips={[{id:"source-clip",type:"text",content:"Synthetic public Clip",originPeerId:"synthetic-local",capturedAt:1700000000000,shareExpiresAt:4102444800000}]} devices={[]} pending={[]} peers={[]} pinnedIds={[]} identity={{deviceId:'synthetic-local',deviceName:'Synthetic local'}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({ok:true,admitted:true})} onReject={async()=>({ok:true,admitted:false})} onPairText={async()=>({ok:false,error:'invalid_input'})} onRequestPairingCode={async()=>({text:'public synthetic code'})} onCopyPairingText={async()=>({status:'copied'})} onReuseClip={()=>'complete'} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>new Promise((resolve,reject)=>{window.resolveClear=resolve;window.rejectClear=reject})} onRenameIdentity={async()=>{throw Error('synthetic_failed_save')}} />);`,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  loader: { ".png": "dataurl" },
  outfile: join(out, "consumer.js"),
});
const profile = await mkdtemp(join(tmpdir(), "clipp-host-task-source-"));
const report = {
  nativeHost: false,
  seam: "actual ClipboardApp + UiSession + TaskDialog + Electron activation binder",
  clipboard: "blocked before app source",
  profile,
  cases: [],
  errors: [],
  blockedRequests: 0,
  closed: false,
  node: process.version,
  hashes: {},
};
for (const file of [
  "packages/ui/src/ClipboardApp.tsx",
  "packages/ui/src/uiSession.ts",
  "packages/ui/src/TaskDialog.tsx",
  "packages/ui/src/taskDialogFocus.ts",
  "packages/ui/src/RecoveryIssues.tsx",
  "packages/ui/src/sessionFocus.ts",
  "packages/ui/src/hostTaskInput.ts",
  "apps/electron/src/hostTaskInput.ts",
])
  report.hashes[file] = createHash("sha256")
    .update(await readFile(join(repo, file)))
    .digest("hex");
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 720, height: 700 },
  });
  report.chromium = context.browser()?.version();
  await context.route("**/*", (route) => {
    report.blockedRequests++;
    return route.abort();
  });
  const page = context.pages()[0];
  page.setDefaultTimeout(3500);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.setContent('<!doctype html><div id="root"></div>');
  await page.addScriptTag({
    content: `Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{throw Error('clipboard_forbidden')},writeText:async()=>{throw Error('clipboard_forbidden')}}})`,
  });
  await page.addStyleTag({ path: join(out, "consumer.css") });
  await page.addScriptTag({ path: join(out, "consumer.js") });
  const nav = page.getByRole("navigation", { name: "Clipp destinations" });
  await page
    .getByRole("button", { name: "More Clip actions", exact: true })
    .click();
  await page.locator(".history-menu-dropdown").waitFor();
  assert.equal(
    await page.evaluate(() =>
      window
        .fireNative(false)
        .then((result) => (result.handled ? "overlay" : "root"))
    ),
    "overlay"
  );
  await page.locator(".history-menu-dropdown").waitFor({ state: "hidden" });
  assert.deepEqual(
    await page.evaluate(() => window.session.getSnapshot().tasks),
    []
  );
  report.cases.push(
    "actual ClipboardApp menu consumes native adapter Back before root"
  );
  if (!process.argv.includes("--qr-only")) {
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Advanced", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear all local history", exact: true })
      .click();
    const clear = page.getByRole("alertdialog", {
      name: "Clear all local history?",
      exact: true,
    });
    await clear.waitFor();
    assert.equal(
      (await page.evaluate(() => window.fireNative(false))).handled,
      true,
      "native Clear Back stays in app"
    );
    await clear.waitFor({ state: "hidden" });
    report.cases.push(
      "actual native adapter Back dismisses Clear review without leaving app"
    );
  }

  await nav.getByRole("button", { name: /^Devices/ }).click();
  await page
    .getByRole("button", { name: "Pair this device", exact: true })
    .click();
  const pairing = page.getByRole("dialog", { name: "Pairing", exact: true });
  await pairing.waitFor();
  assert.equal(
    await pairing
      .getByRole("button", { name: "Close Pairing", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.matches("input,textarea")),
    false
  );
  report.cases.push(
    "Pairing chooser entry focuses Close without summoning input"
  );
  // A disappearing or hidden last action must not let Tab escape its shared task.
  await pairing
    .getByRole("button", { name: "Discard pairing input", exact: true })
    .evaluate((el) => {
      el.hidden = true;
    });
  await pairing
    .getByRole("button", { name: "Show my QR", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await pairing
      .getByRole("button", { name: "Close Pairing", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
    "Tab wraps past hidden last control"
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await pairing
      .getByRole("button", { name: "Show my QR", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
    "Shift-Tab wraps past hidden last control"
  );
  report.cases.push("Tab/Shift-Tab containment ignores hidden controls");
  await pairing
    .getByRole("button", { name: "Show my QR", exact: true })
    .click();
  const qr = page.getByRole("dialog", {
    name: "Pair this device",
    exact: true,
  });
  await qr.waitFor();
  assert.equal(
    (await page.evaluate(() => window.fireNative(true))).handled,
    true
  );
  await qr.waitFor();
  assert.equal(
    (await page.evaluate(() => window.fireNative(false))).handled,
    true
  );
  await qr.waitFor({ state: "hidden" });
  await pairing.waitFor();
  assert.deepEqual(
    await page.evaluate(() =>
      window.session.getSnapshot().tasks.map((task) => task.kind)
    ),
    ["pairing"]
  );
  report.cases.push(
    "actual native adapter IME protects displayed QR; next Back closes only QR child"
  );

  await pairing
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const paste = page.getByRole("dialog", {
    name: "Paste pairing text",
    exact: true,
  });
  const field = paste.getByLabel("Pairing text", { exact: true });
  await field.fill("retained failed target");
  await page.evaluate(() => {
    window.releaseOverlay = window.input.registerOverlay({});
  });
  await page.keyboard.press("Escape");
  assert.deepEqual(
    await page.evaluate(() =>
      window.session.getSnapshot().tasks.map((task) => task.kind)
    ),
    ["pairing", "paste"],
    "unqualified overlay consumes Escape before parent task"
  );
  await page.evaluate(() => window.releaseOverlay());
  report.cases.push(
    "unqualified overlay consumes Escape and protects parent task"
  );
  await paste
    .getByRole("button", { name: "Submit pairing text", exact: true })
    .click();
  await page.waitForFunction(
    () => window.session.pairing.getSnapshot().result?.ok === false
  );
  await page.keyboard.down("Escape");
  await pairing.waitFor();
  await page.keyboard.down("Escape"); // Held-key repeat belongs to the same dismissal.
  await page.keyboard.up("Escape");
  assert.deepEqual(
    await page.evaluate(() =>
      window.session.getSnapshot().tasks.map((task) => task.kind)
    ),
    ["pairing"]
  );
  await pairing
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  assert.equal(await field.inputValue(), "retained failed target");
  // Activation shares TaskDialog entry and retains the live renderer draft.
  await page.evaluate(() => {
    document.activeElement.blur();
    window.activate();
  });
  assert.equal(
    await field.evaluate((el) => el === document.activeElement),
    true
  );
  report.cases.push(
    "Enter opens Paste; Escape returns one level; activation restores field and failed draft"
  );
  await page.keyboard.press("Escape");
  await pairing.waitFor();
  await page.evaluate(() => {
    document.querySelector("[data-session-focus=pairing-start]")?.remove();
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.session.getSnapshot().tasks.length === 0
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.sessionFocus),
    "workspace"
  );
  report.cases.push("disappeared invoker returns to workspace");
  // Real ClipboardApp/RecoveryIssues: the failed public Pairing submission above
  // creates its own closed Technical details disclosure, never a seeded issue.
  await page.locator("button.issue-summary").click();
  const issues = page.getByRole("dialog", {
    name: "Issues and recovery",
    exact: true,
  });
  await issues.waitFor();
  const technical = issues.locator("details > summary").first();
  const openPairing = issues.getByRole("button", {
    name: "Open Pairing",
    exact: true,
  });
  assert.equal(await technical.evaluate((el) => el.parentElement.open), false);
  assert.equal(
    await issues
      .locator("[data-task-return]")
      .evaluate((el) => el === document.activeElement),
    true
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await technical.evaluate((el) => el === document.activeElement),
    true,
    "browser Tab reaches the closed disclosure summary"
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await openPairing.evaluate((el) => el === document.activeElement),
    true,
    "Tab from summary continues to the recovery route instead of wrapping to Close"
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await technical.evaluate((el) => el === document.activeElement),
    true,
    "reverse Tab also retains the summary in the task order"
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await pairing.waitFor();
  await pairing
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  await paste.waitFor();
  assert.equal(await field.inputValue(), "retained failed target");
  await page.keyboard.press("Escape");
  await pairing.waitFor();
  await page.keyboard.press("Escape");
  await pairing.waitFor({ state: "hidden" });
  report.cases.push(
    "browser Tab/Shift-Tab crosses the actual Issues Technical details summary and opens retained Pairing input"
  );
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: "Advanced", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear all local history", exact: true })
    .click();
  const pendingClear = page.getByRole("alertdialog", {
    name: "Clear all local history?",
    exact: true,
  });
  await pendingClear
    .getByRole("button", { name: "Clear all local history", exact: true })
    .click();
  await pendingClear
    .getByText("Clearing local history…", { exact: true })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.fireNative(false))).handled,
    true
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.session.getSnapshot().tasks.map((task) => task.kind)
    ),
    ["clear"]
  );
  await page.evaluate(() => {
    document.activeElement.blur();
    window.activate();
  });
  assert.equal(
    await pendingClear.evaluate(
      (element) => element === document.activeElement
    ),
    true,
    "activation retains pending task focus with every button disabled"
  );
  await page.evaluate(() =>
    window.rejectClear(new Error("synthetic_clear_failure"))
  );
  await pendingClear
    .getByRole("alert")
    .filter({ hasText: "Clear could not be confirmed" })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.fireNative(false))).handled,
    true
  );
  await pendingClear.waitFor({ state: "hidden" });
  report.cases.push(
    "pending Clear consumes native Back; activation focuses guarded task; failure allows a safe return"
  );

  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  if (context) {
    await context.close();
    report.closed = true;
  }
  await rm(profile, { recursive: true, force: true });
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
}
