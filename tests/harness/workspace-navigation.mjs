import { build } from "esbuild";
import { chromium } from "@playwright/test";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  readFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2]);
const host =
  process.argv.find((value) => value.startsWith("--host="))?.split("=")[1] ??
  "electron";
assert.ok(["electron", "android", "chrome"].includes(host));
const hostFile =
  host === "chrome"
    ? "apps/extension/src/popup-host.css"
    : `apps/${host}/src/${host}-host.css`;
const hostClass = host === "chrome" ? "popup-host" : `${host}-host`;
await mkdir(out, { recursive: true });
await build({
  stdin: {
    resolveDir: repo,
    loader: "tsx",
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';import{createUiSession}from'${repo}/packages/ui/src/uiSession';import{createSettingsHandler}from'${repo}/packages/core/runtime/settingsAuthority';import{useRuntimeSettings}from'${repo}/packages/ui/src/useRuntimeSettings';import'${repo}/packages/ui/src/styles.css';import'${repo}/packages/ui/src/host.css';import'${repo}/${hostFile}';import{bindHostGeometry}from'${repo}/packages/ui/src/hostGeometry';let geometryListener;window.startFixtureGeometry=snapshot=>{window.stopFixtureGeometry=bindHostGeometry({getSnapshot:async()=>snapshot,addListener:async listener=>{geometryListener=listener;return{remove:()=>{geometryListener=null}}}},window,document)};window.publishFixtureGeometry=snapshot=>geometryListener?.(snapshot);window.fixtureSession=createUiSession();window.fixtureActions=[];const values=new Map(),listeners=new Set();const settingsOwner=createSettingsHandler({sessionId:'synthetic-navigation-settings',storage:{get:async key=>values.get(key),set:async(key,value)=>{values.set(key,value)}},applyAutoSync:()=>{},applyLogLevel:()=>{},publish:async snapshot=>listeners.forEach(listener=>listener({type:'settingsState',snapshot}))});const settingsPort={send:async message=>message.type==='getSettings'?{ok:true,snapshot:await settingsOwner.read()}:settingsOwner.write(message.settings),subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}};function App(){const settings=useRuntimeSettings(settingsPort);const [state,setState]=useState({pending:[{deviceId:'request-1',deviceName:'Incoming device'}],identity:{deviceId:'local',deviceName:'This installation'},devices:[{deviceId:'remote',deviceName:'Remote device',displayName:'My alias'}],clips:[]});window.publishFixture=patch=>setState(old=>({...old,...patch}));return <div className="${hostClass}"><ClipboardApp {...state} session={window.fixtureSession} appearanceSettings={settings} autoSync={settings.snapshot?.state.autoSync} autoSyncKnown={settings.snapshot!==null} autoSyncLoading={settings.loading} peers={[]} pinnedIds={[]} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async request=>{window.fixtureActions.push({action:'accept',request});setState(old=>({...old,pending:[]}));return {ok:false,error:'cleanup_failed',admitted:true}}} onReject={async request=>{window.fixtureActions.push({action:'reject',request});setState(old=>({...old,pending:[]}));return {ok:true,admitted:false}}} onPairText={async()=>({ok:false,error:'invalid_input'})} onRequestPairingCode={async()=>({text:'synthetic-qr-text',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/></svg>'})} onCopyPairingText={async()=>({status:'copied'})} onRenameIdentity={async raw=>{if(window.deferName)return new Promise(resolve=>{window.resolveName=()=>{setState(old=>({...old,identity:{...old.identity,deviceName:raw.trim()}}));resolve({deviceId:'local',deviceName:raw.trim()})}});throw Error('controlled-name-failure')}} onRenameDevice={async()=>{throw Error('controlled-alias-failure')}} onReuseClip={async id=>{window.fixtureActions.push({action:'copy',id});return 'complete'}} onShareNow={async()=>{window.fixtureActions.push({action:'send'})}} onSetPinned={()=>{}} onClearAll={async()=>{if(window.deferClear)await new Promise(resolve=>{window.completeClear=resolve})}} onSetAutoSync={async enabled=>{const result=await settingsOwner.write({autoSync:enabled});return {status:result.status,autoSync:result.snapshot.state.autoSync,error:result.error}}} onRetryRequests={async()=>{setState(old=>({...old,requestsUnavailable:false}));return true}} onRetryAutoSync={settings.refresh} onRefreshManagedRelays={async()=>[]} onMutateManagedRelay={async()=>({status:'rejected',configurations:[],configurationApplied:false,credentialsRemoved:[],error:'controlled-relay-failure'})}/></div>}createRoot(document.getElementById('root')).render(<App/>);`,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  loader: { ".png": "dataurl" },
  outfile: join(out, "consumer.js"),
});
const profile = await mkdtemp(join(tmpdir(), "clipp-navigation-fixture-"));
const report = {
  nativeHost: false,
  renderedHostStyles: host,
  sourceSeam: "actual ClipboardApp + provided UiSession + TaskDialog",
  clipboard: "memory boundary before app source",
  profile,
  closed: false,
  cases: [],
  errors: [],
  blockedRequests: 0,
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        "packages/ui/src/ClipboardApp.tsx",
        "packages/ui/src/TaskDialog.tsx",
        "packages/ui/src/ManagedRelaySettings.tsx",
        "packages/ui/src/styles.css",
        "packages/ui/src/uiSession.ts",
        "packages/ui/src/hostGeometry.ts",
        "packages/ui/src/host.css",
        hostFile,
        "packages/ui/src/workspaceLayout.ts",
        "packages/ui/src/useRuntimeSettings.ts",
        "packages/core/runtime/settingsAuthority.ts",
        "packages/core/runtime/settingsClient.ts",
      ].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(join(repo, file)))
          .digest("hex"),
      ])
    )
  ),
  buildHashes: Object.fromEntries(
    await Promise.all(
      ["consumer.js", "consumer.css"].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(join(out, file)))
          .digest("hex"),
      ])
    )
  ),
  node: process.version,
};
let context, page;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport:
      host === "chrome"
        ? { width: 480, height: 600 }
        : { width: 1100, height: 800 },
  });
  report.chromium = context.browser()?.version();
  await context.route("**/*", (route) => {
    report.blockedRequests++;
    return route.abort();
  });
  page = context.pages()[0];
  page.setDefaultTimeout(3000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.setContent('<!doctype html><div id="root"></div>');
  await page.addScriptTag({
    content: `window.fixtureClipboardCalls={reads:0,writes:0};Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{window.fixtureClipboardCalls.reads++;return ''},writeText:async()=>{window.fixtureClipboardCalls.writes++}}});`,
  });
  await page.addStyleTag({ path: join(out, "consumer.css") });
  await page.addScriptTag({ path: join(out, "consumer.js") });
  const nav = page.getByRole("navigation", { name: "Clipp destinations" });
  await nav.waitFor({ timeout: 3000 });
  for (const name of ["History", "Devices", "Requests", "Settings"])
    assert.equal(
      await nav
        .getByRole("button", { name: new RegExp("^" + name) })
        .isVisible(),
      true,
      name + " navigation reachable at exact boundary"
    );
  assert.equal(
    await page.getByLabel("Search history", { exact: true }).isVisible(),
    true
  );
  await nav.getByRole("button", { name: /^Requests/ }).click();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.waitForFunction(() =>
    window.fixtureActions.some((value) => value.action === "accept")
  );
  assert.equal(
    await page.getByText("No pending requests.", { exact: true }).isVisible(),
    true
  );
  report.cases.push({
    label: `${host} initial Requests navigation and actual approval callback`,
    passed: true,
  });
  if (process.argv.includes("--requests-state")) {
    await page.evaluate(() => window.publishFixture({ requestsLoading: true }));
    await page
      .getByText("Loading Requests…", { exact: true })
      .waitFor({ timeout: 3000 });
    assert.equal(
      await page.getByText("No pending requests.", { exact: true }).count(),
      0
    );
    await page.evaluate(() =>
      window.publishFixture({
        requestsLoading: false,
        requestsUnavailable: true,
      })
    );
    await page
      .getByText(
        "Requests are unavailable. Retry to refresh the current list.",
        { exact: true }
      )
      .waitFor({ timeout: 3000 });
    await page
      .getByRole("button", { name: "Retry Requests", exact: true })
      .click();
    await page.getByText("No pending requests.", { exact: true }).waitFor();
    report.cases.push({
      label:
        "Requests live availability and Retry do not invent an empty loaded list",
      passed: true,
    });
  }
  if (process.argv.includes("--name-task")) {
    await nav.getByRole("button", { name: "Devices", exact: true }).click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    const task = page.getByRole("dialog", { name: "Device Name", exact: true });
    await task.waitFor({ timeout: 3000 });
    const input = task.getByLabel("Device Name", { exact: true });
    await input.fill("  retained raw name  ");
    await page.setViewportSize({ width: 340, height: 350 });
    assert.equal(await input.inputValue(), "  retained raw name  ");
    if (process.argv.includes("--task-bounds")) {
      await page.waitForFunction(
        () => {
          const rect = document
            .querySelector('[role="dialog"]')
            .getBoundingClientRect();
          return (
            rect.left === 0 &&
            rect.top === 0 &&
            rect.width === 340 &&
            rect.height === 350
          );
        },
        null,
        { timeout: 3000 }
      );
      assert.equal(
        await input.evaluate((element) => document.activeElement === element),
        true
      );
    }
    await task
      .getByRole("button", { name: "Close name editor", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    assert.equal(await input.inputValue(), "  retained raw name  ");
    await task
      .getByRole("button", { name: "Save Device Name", exact: true })
      .click();
    await task.getByRole("alert").waitFor();
    assert.equal(await input.inputValue(), "  retained raw name  ");
    await task
      .getByRole("button", { name: "Cancel name edit", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    assert.equal(await input.inputValue(), "This installation");
    await task
      .getByRole("button", { name: "Close name editor", exact: true })
      .click();
    report.cases.push({
      label:
        "actual Device Name task preserves raw draft across geometry and Close, failure remains editable, Cancel discards",
      passed: true,
    });
  }
  if (process.argv.includes("--pairing-task")) {
    await nav.getByRole("button", { name: "Devices", exact: true }).click();
    await page
      .getByRole("button", { name: "Pair this device", exact: true })
      .click();
    const chooser = page.getByRole("dialog", { name: "Pairing", exact: true });
    await chooser.waitFor({ timeout: 3000 });
    if (process.argv.includes("--initial-return-focus"))
      assert.equal(
        await chooser
          .getByRole("button", { name: "Close Pairing", exact: true })
          .evaluate((element) => document.activeElement === element),
        true,
        "non-editor tasks begin at their visible return/title area"
      );
    assert.equal(
      await chooser.locator("input,textarea").count(),
      0,
      "chooser does not focus a paste field"
    );
    assert.equal(
      await chooser.evaluate((element) =>
        element.contains(document.activeElement)
      ),
      true
    );
    await chooser
      .getByRole("button", { name: "Paste pairing text", exact: true })
      .click();
    const paste = page.getByRole("dialog", {
      name: "Paste pairing text",
      exact: true,
    });
    const field = paste.getByLabel("Pairing text", { exact: true });
    await field.waitFor();
    assert.equal(
      await field.evaluate((element) => document.activeElement === element),
      true
    );
    await field.fill(" retained pairing text ");
    await field.press("Escape");
    await chooser.waitFor();
    await chooser
      .getByRole("button", { name: "Paste pairing text", exact: true })
      .click();
    assert.equal(await field.inputValue(), " retained pairing text ");
    await paste
      .getByRole("button", { name: "Submit pairing text", exact: true })
      .click();
    await paste.getByRole("status").waitFor();
    assert.equal(await field.inputValue(), " retained pairing text ");
    await paste
      .getByRole("button", { name: "Back to Pairing", exact: true })
      .click();
    await chooser
      .getByRole("button", { name: "Show my QR", exact: true })
      .click();
    const qr = page.getByRole("dialog", {
      name: "Pair this device",
      exact: true,
    });
    await qr.getByRole("img", { name: "Pairing QR", exact: true }).waitFor();
    await qr
      .getByRole("button", { name: "Copy pairing text", exact: true })
      .click();
    await qr
      .getByRole("button", { name: "Close QR dialog", exact: true })
      .click();
    await chooser.waitFor();
    await chooser
      .getByRole("button", { name: "Close Pairing", exact: true })
      .click();
    report.cases.push({
      label:
        "real Pairing chooser, deliberate Paste focus, retained failed input, QR/Copy/Close and one-level return",
      passed: true,
    });
  }
  if (process.argv.includes("--relay-task")) {
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Add relay", exact: true }).click();
    const relay = page.getByRole("dialog", {
      name: "Relay configuration",
      exact: true,
    });
    await relay.waitFor({ timeout: 3000 });
    await relay.getByLabel("Name", { exact: true }).fill(" retained relay ");
    await relay
      .getByLabel("HTTPS discovery URL", { exact: true })
      .fill("https://synthetic.invalid/v1/relay");
    await page.setViewportSize({ width: 340, height: 350 });
    assert.equal(
      await relay.getByLabel("Name", { exact: true }).inputValue(),
      " retained relay "
    );
    await relay.getByRole("button", { name: "Save", exact: true }).click();
    await relay.getByRole("alert").waitFor();
    assert.equal(
      await relay.getByLabel("Name", { exact: true }).inputValue(),
      " retained relay "
    );
    await relay
      .getByRole("button", { name: "Close relay editor", exact: true })
      .click();
    await page.getByRole("button", { name: "Add relay", exact: true }).click();
    assert.equal(
      await relay.getByLabel("Name", { exact: true }).inputValue(),
      " retained relay "
    );
    await relay
      .getByRole("button", { name: "Cancel relay edit", exact: true })
      .click();
    report.cases.push({
      label:
        "real managed Relay task retains failed raw fields across narrow reflow and Close",
      passed: true,
    });
  }
  if (process.argv.includes("--matrix")) {
    await page.setViewportSize(
      host === "chrome"
        ? { width: 480, height: 600 }
        : { width: 1400, height: 900 }
    );
    await nav.getByRole("button", { name: "History", exact: true }).click();
    await page.evaluate(() =>
      window.publishFixture({
        clips: Array.from({ length: 24 }, (_, i) => ({
          id: "clip-" + i,
          type: "text",
          content:
            "clip " +
            i +
            " " +
            (i % 2 ? "long synthetic text ".repeat(50) : "short"),
          originPeerId: "remote",
          capturedAt: Date.now() - i,
          shareExpiresAt: Date.now() + 60000,
        })),
      })
    );
    const cards = page.locator(".history-card");
    await cards.nth(23).waitFor();
    const heights = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height)
    );
    assert.ok(
      Math.max(...heights) - Math.min(...heights) < 1,
      "wide cards retain one shared height rather than masonry"
    );
    for (const [width, height] of host === "chrome"
      ? [
          [480, 600],
          [320, 600],
          [340, 350],
        ]
      : [
          [1099, 800],
          [1100, 800],
          [1101, 800],
          [320, 700],
          [340, 350],
          [640, 360],
          [1400, 900],
        ]) {
      for (const scale of [100, 150, 200]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((scale) => {
          document.documentElement.style.fontSize = scale + "%";
        }, scale);
        await page.waitForTimeout(50);
        await page.getByLabel("Search history", { exact: true }).fill("clip");
        await nav.getByRole("button", { name: "Devices", exact: true }).click();
        assert.equal(
          await page.getByLabel("Search history", { exact: true }).inputValue(),
          "clip"
        );
        await nav.getByRole("button", { name: "History", exact: true }).click();
        await page
          .getByRole("button", { name: "Clear search", exact: true })
          .click();
        const placement = await page.evaluate(() =>
          Object.fromEntries(
            [
              ".app-bar",
              ".workspace-controls",
              ".workspace-navigation",
              ".app-main",
            ].map((selector) => [
              selector,
              document.querySelector(selector).getBoundingClientRect().toJSON(),
            ])
          )
        );
        assert.ok(
          placement[".app-bar"].bottom <=
            placement[".workspace-controls"].top + 1,
          "branding/status stays above Search"
        );
        if (scale === 100 && width <= 1100 && height >= 700)
          assert.ok(
            placement[".workspace-navigation"].top >=
              placement[".app-main"].bottom - 1,
            "ordinary narrow navigation remains at the bottom"
          );
        if (scale === 100 && width > 1100 && height >= 800)
          assert.ok(
            placement[".workspace-navigation"].bottom <=
              placement[".workspace-controls"].top + 1,
            "wide navigation remains in the header"
          );
        if (height <= 500)
          assert.ok(
            placement[".workspace-navigation"].bottom <=
              placement[".app-main"].top + 1,
            "cramped navigation remains near the start of the scroller"
          );
        const overflow = await page
          .locator(".app-shell")
          .evaluate((element) => element.scrollWidth - element.clientWidth);
        assert.ok(
          overflow <= 1,
          `${width}x${height}/${scale}% has no horizontal workspace hunting (${overflow})`
        );
        const last = cards
          .nth(23)
          .getByRole("button", { name: "Copy Clip", exact: true });
        await last.scrollIntoViewIfNeeded();
        const rect = await last.boundingBox();
        assert.ok(
          rect.y >= 0 && rect.y + rect.height <= height + 1,
          `${width}x${height}/${scale}% final Copy is reachable`
        );
        await last.click();
        await page.waitForFunction(() =>
          window.fixtureActions.some(
            (value) => value.action === "copy" && value.id === "clip-23"
          )
        );
        report.cases.push({
          label: `${width}x${height}/${scale}% rendered navigation/query/final Copy`,
          passed: true,
        });
      }
    }
  }
  if (process.argv.includes("--header-routes")) {
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Search history", { exact: true }).fill("clip 5");
    await page.getByText(/^clip 5 /).waitFor({ timeout: 3000 });
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await nav.getByRole("button", { name: "Devices", exact: true }).click();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page
      .getByRole("group", { name: "History filters" })
      .waitFor({ timeout: 3000 });
    report.cases.push({
      label:
        "Search and Filters from another destination reach their real History consumer",
      passed: true,
    });
  }
  if (process.argv.includes("--reflow-anchor")) {
    await page.setViewportSize({ width: 800, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "100%";
    });
    await nav.getByRole("button", { name: "History", exact: true }).click();
    const last = page
      .locator(".history-card")
      .nth(23)
      .getByRole("button", { name: "Copy Clip", exact: true });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    assert.equal(
      await last.evaluate((element) => document.activeElement === element),
      true
    );
    await page.setViewportSize({ width: 1101, height: 350 });
    await page.waitForFunction(
      () => {
        const elements = [
          ...document.querySelectorAll('button[aria-label="Copy Clip"]'),
        ];
        const last = elements.at(-1);
        const rect = last.getBoundingClientRect();
        return (
          document.activeElement === last && rect.top >= 0 && rect.bottom <= 350
        );
      },
      {},
      { timeout: 3000 }
    );
    report.cases.push({
      label:
        "focused final Clip action and logical History scroll remain visible across ordinary narrow → cramped wide reflow",
      passed: true,
    });
    await nav.getByRole("button", { name: "History", exact: true }).click();
    await last.scrollIntoViewIfNeeded();
    const visibleText = await page.locator(".history-card").evaluateAll(
      (elements) =>
        elements
          .find((element) => {
            const rect = element.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < innerHeight;
          })
          .querySelector(".history-text").textContent
    );
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForFunction(
      (text) => {
        const item = [...document.querySelectorAll(".history-text")].find(
          (element) => element.textContent === text
        );
        const rect = item.getBoundingClientRect();
        const pane = document
          .querySelector(".content-pane")
          .getBoundingClientRect();
        return rect.bottom > pane.top && rect.top < pane.bottom;
      },
      visibleText,
      { timeout: 3000 }
    );
    report.cases.push({
      label:
        "scrolling without selecting a Clip retains the same visible logical History item across cramped → ordinary reflow",
      passed: true,
    });
  }
  if (process.argv.includes("--advanced")) {
    await page.setViewportSize({ width: 320, height: 350 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.addStyleTag({
      content:
        ".app-shell *, .task-dialog * {letter-spacing:.12em;word-spacing:.16em;line-height:1.5} .app-shell p,.task-dialog p {margin-bottom:2em}",
    });
    await nav.getByRole("button", { name: "History", exact: true }).click();
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if ((await filters.getAttribute("aria-expanded")) === "false")
      await filters.click();
    await page
      .getByRole("group", { name: "History filters" })
      .getByRole("button", { name: "Pinned", exact: true })
      .click();
    await page.getByLabel("Search history", { exact: true }).fill("missing");
    await page
      .getByText("No Clips match “missing” in Pinned.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Pinned", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    await page.getByText("No pinned Clips.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    assert.ok(
      await page
        .locator(".app-shell")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    );
    await nav.getByRole("button", { name: "Devices", exact: true }).click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    const nameTask = page.getByRole("dialog", {
      name: "Device Name",
      exact: true,
    });
    const nameInput = nameTask.getByLabel("Device Name", { exact: true });
    await page.evaluate(() => {
      window.deferName = true;
    });
    await nameInput.fill("Submitted name");
    await nameTask
      .getByRole("button", { name: "Save Device Name", exact: true })
      .click();
    await nameTask.getByText("Saving Device Name…", { exact: true }).waitFor();
    await nameInput.fill(" newer typing ");
    await page.evaluate(() => window.resolveName());
    await page.waitForFunction(
      () => !window.fixtureSession.name.getSnapshot().pending
    );
    assert.equal(await nameInput.inputValue(), " newer typing ");
    await nameTask
      .getByRole("button", { name: "Cancel name edit", exact: true })
      .click();
    await page.evaluate(() => {
      window.deferName = false;
    });
    for (const theme of ["light", "dark", "system"]) {
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.clippTheme === theme,
        theme
      );
      await nav.getByRole("button", { name: "Devices", exact: true }).click();
      await page
        .getByRole("button", { name: "Rename this device", exact: true })
        .click();
      const task = page.getByRole("dialog", {
        name: "Device Name",
        exact: true,
      });
      const field = task.getByLabel("Device Name", { exact: true });
      await field.fill(" failed field ");
      await task
        .getByRole("button", { name: "Save Device Name", exact: true })
        .click();
      await task.getByRole("alert").waitFor();
      const colors = await field.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          text: style.color,
          background: style.backgroundColor,
          outline: style.outlineColor,
        };
      });
      const contrast = (a, b) => {
        const luminance = (color) => {
          const channels = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const aa = luminance(a),
          bb = luminance(b);
        return (Math.max(aa, bb) + 0.05) / (Math.min(aa, bb) + 0.05);
      };
      assert.ok(
        contrast(colors.text, colors.background) >= 4.5,
        `${host}/${theme} task field contrast`
      );
      await field.focus();
      await field.press("ArrowLeft");
      const focus = await field.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.outlineColor,
          width: style.outlineWidth,
          background: style.backgroundColor,
        };
      });
      assert.ok(
        parseFloat(focus.width) > 0 &&
          contrast(focus.color, focus.background) >= 3,
        `${host}/${theme} visible focus contrast`
      );
      const close = task.getByRole("button", {
        name: "Close name editor",
        exact: true,
      });
      await close.scrollIntoViewIfNeeded();
      await close.click();
      report.cases.push({
        label: `${host}/${theme} actual settings owner, 200% spacing task error/foreground/background/focus contrast`,
        passed: true,
        colors,
        focus,
      });
    }
    await page.getByRole("button", { name: "Show my QR", exact: true }).click();
    const qr = page.getByRole("dialog", {
      name: "Pair this device",
      exact: true,
    });
    const image = qr.getByRole("img", { name: "Pairing QR", exact: true });
    await image.waitFor();
    const imageBounds = await image.boundingBox();
    assert.ok(
      Math.abs(imageBounds.width - imageBounds.height) < 1 &&
        imageBounds.width > 0 &&
        imageBounds.x + imageBounds.width <= 320
    );
    const copy = qr.getByRole("button", {
      name: "Copy pairing text",
      exact: true,
    });
    await copy.scrollIntoViewIfNeeded();
    await copy.click();
    const close = qr.getByRole("button", {
      name: "Close QR dialog",
      exact: true,
    });
    await close.scrollIntoViewIfNeeded();
    await close.click();
    await page
      .getByRole("dialog", { name: "Pairing", exact: true })
      .getByRole("button", { name: "Close Pairing", exact: true })
      .click();
    report.cases.push({
      label: `${host} 200% text-spacing/no-match/scope clear/newer pending name/QR complete image and final Copy/Close`,
      passed: true,
    });
  }
  if (process.argv.includes("--geometry")) {
    assert.equal(host, "android");
    await page.setViewportSize({ width: 640, height: 480 });
    await page.evaluate(() =>
      window.startFixtureGeometry({
        sequence: 1,
        windowPx: { left: 0, top: 0, width: 1280, height: 960 },
        webViewPx: { left: 0, top: 0, width: 1280, height: 960 },
        safeAreaPx: { left: 20, top: 40, width: 1240, height: 400 },
        systemBarsPx: { left: 20, top: 40, right: 20, bottom: 40 },
        cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
        imePx: { left: 0, top: 0, right: 0, bottom: 520 },
        density: 2,
        fontScale: 2,
        imeVisible: true,
      })
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.hostGeometry === "android"
    );
    await nav.getByRole("button", { name: "Devices", exact: true }).click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    const task = page.getByRole("dialog", { name: "Device Name", exact: true });
    await page.waitForFunction(() => {
      const r = document.querySelector("[role=dialog]").getBoundingClientRect();
      return r.x === 10 && r.y === 20 && r.width === 620 && r.height === 200;
    });
    const field = task.getByLabel("Device Name", { exact: true });
    await field.fill("geometry retained draft");
    await page.evaluate(() =>
      window.publishFixtureGeometry({
        sequence: 2,
        windowPx: { left: 0, top: 0, width: 1280, height: 960 },
        webViewPx: { left: 0, top: 0, width: 1280, height: 960 },
        safeAreaPx: { left: 20, top: 40, width: 1240, height: 880 },
        systemBarsPx: { left: 20, top: 40, right: 20, bottom: 40 },
        cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
        imePx: { left: 0, top: 0, right: 0, bottom: 0 },
        density: 2,
        fontScale: 2,
        imeVisible: false,
      })
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[role=dialog]").getBoundingClientRect()
          .height === 440
    );
    assert.equal(await field.inputValue(), "geometry retained draft");
    await task
      .getByRole("button", { name: "Close name editor", exact: true })
      .click();
    await page.evaluate(() => window.stopFixtureGeometry());
    report.cases.push({
      label:
        "Android actual bindHostGeometry public synthetic port: safe/IME intersection, dp target and retained focused task across ordered geometry",
      native: false,
      passed: true,
    });
  }
  if (process.argv.includes("--clear-focus")) {
    await page.setViewportSize({ width: 800, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "100%";
      window.deferClear = true;
    });
    await nav.getByRole("button", { name: "History", exact: true }).click();
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if ((await filters.getAttribute("aria-expanded")) === "false")
      await filters.click();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const confirmation = page.getByRole("alertdialog", {
      name: "Clear all local history?",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Clear all local history", exact: true })
      .click();
    await confirmation
      .getByText("Clearing local history…", { exact: true })
      .waitFor();
    assert.equal(
      await confirmation.evaluate((element) =>
        element.contains(document.activeElement)
      ),
      true,
      "pending destructive confirmation retains DOM focus when controls disable"
    );
    await page.keyboard.press("Escape");
    assert.equal(await confirmation.isVisible(), true);
    await page.evaluate(() => window.completeClear());
    await confirmation.waitFor({ state: "detached" });
    report.cases.push({
      label:
        "compact Clear review keeps pending focus and rejects Escape cancellation after operation starts",
      passed: true,
    });
  }
  report.fonts = await page.evaluate(() => ({
    status: document.fonts.status,
    family: getComputedStyle(document.body).fontFamily,
    entries: [...document.fonts].map((font) => ({
      family: font.family,
      status: font.status,
    })),
  }));
  await page.screenshot({ path: join(out, "exact1100.png"), fullPage: true });
} catch (error) {
  report.failure = error.message;
  if (page) {
    report.failureGeometry = await page.evaluate(() =>
      [...document.querySelectorAll(".task-dialog,.task-dialog-backdrop")].map(
        (element) => ({
          className: element.className,
          rect: element.getBoundingClientRect().toJSON(),
          styles: {
            height: getComputedStyle(element).height,
            maxHeight: getComputedStyle(element).maxHeight,
            padding: getComputedStyle(element).padding,
            boxSizing: getComputedStyle(element).boxSizing,
          },
        })
      )
    );
    await page.screenshot({ path: join(out, "failure.png"), fullPage: true });
  }
  throw error;
} finally {
  if (page) {
    await page.evaluate(() => window.stopFixtureGeometry?.());
    report.clipboardCalls = await page.evaluate(
      () => window.fixtureClipboardCalls
    );
    report.geometryDisposed = await page.evaluate(
      () => !document.documentElement.dataset.hostGeometry
    );
  }
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  report.closed = true;
  report.profileRemoved = await access(profile).then(
    () => false,
    () => true
  );
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    passed: report.cases.length,
    closed: report.closed,
    errors: report.errors,
  })
);
