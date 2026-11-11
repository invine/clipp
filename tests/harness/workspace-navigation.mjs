import { build } from "esbuild";
import { checkConnectionSummary } from "./connection-summary-cases.mjs";
import { chromium } from "@playwright/test";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  readFile,
  access,
  realpath,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, join, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkCompactHistory } from "./compact-history.mjs";
import { checkNavigationTargetStability } from "./navigation-target-stability.mjs";
import {
  exactBoundariesSelected,
  checkExactWorkspaceBoundaries,
} from "./workspace-boundary-selection.mjs";
const exactBoundaries = exactBoundariesSelected(process.argv.slice(2));
const measureNativeControl = (element, profile) => {
  const rect = element.getBoundingClientRect();
  const cssWidth = document.documentElement.getBoundingClientRect().width;
  const pxPerCss = profile.nativeWidth / cssWidth;
  return {
    rect: rect.toJSON(),
    cssWidth,
    minimum: parseFloat(
      document.documentElement.style.getPropertyValue("--clipp-target-min")
    ),
    nativeDp: {
      width: (rect.width * pxPerCss) / profile.density,
      height: (rect.height * pxPerCss) / profile.density,
    },
  };
};
const harnessRoot = await realpath(
  fileURLToPath(new URL("../..", import.meta.url))
);
const sourceRootArgs = process.argv
  .slice(2)
  .filter((value) => value.startsWith("--source-root"));
assert.ok(sourceRootArgs.length <= 1, "at most one local source-root override");
let repo = harnessRoot;
if (sourceRootArgs.length) {
  assert.match(sourceRootArgs[0], /^--source-root=.+$/);
  const requestedRoot = sourceRootArgs[0].slice("--source-root=".length);
  assert.ok(
    isAbsolute(requestedRoot),
    "source-root must be an absolute local worktree path"
  );
  repo = await realpath(requestedRoot);
  assert.ok((await stat(repo)).isDirectory());
  await access(join(repo, ".git"));
  const git = spawnSync("git", ["-C", repo, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 16384,
  });
  assert.equal(
    git.status,
    0,
    "source-root must be a readable local Git worktree"
  );
  assert.equal(
    await realpath(git.stdout.trim()),
    repo,
    "source-root must be the worktree root"
  );
  for (const file of [
    "packages/ui/src/ClipboardApp.tsx",
    "packages/ui/src/uiSession.ts",
    "packages/ui/src/styles.css",
    "packages/ui/src/host.css",
  ])
    assert.ok(
      (await stat(join(repo, file))).isFile(),
      `required source file: ${file}`
    );
}
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
assert.ok(
  (await stat(join(repo, hostFile))).isFile(),
  "selected host stylesheet required"
);
// popup.tsx owns an inline full-size wrapper; other hosts supply it in host CSS.
const hostSizing =
  host === "chrome" ? 'style={{width:"100%",height:"100%"}}' : "";
await mkdir(out, { recursive: true });
await build({
  stdin: {
    resolveDir: repo,
    loader: "tsx",
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';import{createUiSession}from'${repo}/packages/ui/src/uiSession';import{createSettingsHandler}from'${repo}/packages/core/runtime/settingsAuthority';import{useRuntimeSettings}from'${repo}/packages/ui/src/useRuntimeSettings';import'${repo}/packages/ui/src/styles.css';import'${repo}/packages/ui/src/host.css';import'${repo}/${hostFile}';import{bindHostGeometry}from'${repo}/packages/ui/src/hostGeometry';let geometryListener;window.startFixtureGeometry=snapshot=>{window.stopFixtureGeometry=bindHostGeometry({getSnapshot:async()=>snapshot,addListener:async listener=>{geometryListener=listener;return{remove:()=>{geometryListener=null}}}},window,document)};window.publishFixtureGeometry=snapshot=>geometryListener?.(snapshot);window.fixtureSession=createUiSession();window.fixtureActions=[];const values=new Map(),listeners=new Set();let retentionValue=30*86400000;const retentionState=()=>({value:retentionValue,persistenceError:null,cleanupError:null});const settingsOwner=createSettingsHandler({sessionId:'synthetic-navigation-settings',retention:{read:async()=>retentionState(),set:async value=>{if(window.rejectSetting==='localRetentionMs')return {...retentionState(),status:'rejected',error:'controlled-policy-failure'};retentionValue=value;return {...retentionState(),status:'applied'}}},storage:{get:async key=>{if(window.settingsReadFault)throw Error('controlled-settings-read-failure');return values.get(key)},set:async(key,value)=>{if(key===window.rejectSetting)throw Error('controlled-policy-failure');if(key==='autoSync'&&window.rejectAutoSync)throw Error('controlled-auto-sync-rejection');values.set(key,value);if(key==='autoSync'&&window.failAutoSyncReadback)window.settingsReadFault=true}},applyAutoSync:()=>{},applyLogLevel:()=>{},publish:async snapshot=>listeners.forEach(listener=>listener({type:'settingsState',snapshot}))});const settingsPort={send:async message=>message.type==='getSettings'?{ok:true,snapshot:await settingsOwner.read()}:settingsOwner.write(message.settings),subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}};function App(){const settings=useRuntimeSettings(settingsPort);const [state,setState]=useState({pending:[{deviceId:'request-1',deviceName:'Incoming device',requestVersion:'request-v1'}],identity:{deviceId:'local',deviceName:'This installation'},devices:[{deviceId:'remote',deviceName:'Remote device',displayName:'My alias'}],peers:[],connectionStateKnown:false,clips:[],pinnedIds:[]});window.publishFixture=patch=>setState(old=>({...old,...patch}));return <div ${hostSizing} className="${hostClass}"><ClipboardApp {...state} session={window.fixtureSession} appearanceSettings={settings} autoSync={settings.snapshot?.state.autoSync} autoSyncKnown={settings.snapshot!==null} autoSyncLoading={settings.loading} peers={state.peers??[]} connectionStateKnown={state.connectionStateKnown??false} pinnedIds={state.pinnedIds} onDeleteClip={async id=>{window.fixtureActions.push({action:'delete',id});if(window.failDelete)throw Error('controlled-delete-failure');setState(old=>({...old,clips:old.clips.filter(clip=>clip.id!==id)}))}} onUnpair={()=>{}} onAccept={async request=>{window.fixtureActions.push({action:'accept',request});setState(old=>({...old,pending:[]}));return {ok:false,error:'cleanup_failed',admitted:true}}} onReject={async request=>{window.fixtureActions.push({action:'reject',request});setState(old=>({...old,pending:[]}));return {ok:true,admitted:false}}} onPairText={async()=>({ok:false,error:'invalid_input'})} onRequestPairingCode={async()=>({text:'synthetic-qr-text',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/></svg>'})} onCopyPairingText={async()=>({status:'copied'})} onRenameIdentity={async raw=>{if(window.deferName)return new Promise(resolve=>{window.resolveName=()=>{setState(old=>({...old,identity:{...old.identity,deviceName:raw.trim()}}));resolve({deviceId:'local',deviceName:raw.trim()})}});throw Error('controlled-name-failure')}} onRenameDevice={async()=>{throw Error('controlled-alias-failure')}} onReuseClip={async id=>{window.fixtureActions.push({action:'copy',id});return window.copyOutcome??'complete'}} onShareNow={async()=>{window.fixtureActions.push({action:'send'});if(window.sendFailure)throw Object.assign(Error('controlled-send-failure'),{code:window.sendFailure})}} onSetPinned={async(id,pinned)=>{window.fixtureActions.push({action:'pin',id,pinned});setState(old=>({...old,pinnedIds:pinned?[...old.pinnedIds,id]:old.pinnedIds.filter(value=>value!==id),clips:!pinned&&window.removeOnUnpin?old.clips.filter(clip=>clip.id!==id):old.clips}))}} onClearAll={async()=>{if(window.deferClear)await new Promise(resolve=>{window.completeClear=resolve})}} onSetAutoSync={async enabled=>{window.fixtureActions.push({action:'auto-sync-save',enabled});const result=await settingsOwner.write({autoSync:enabled});return {status:result.status,autoSync:result.snapshot.state.autoSync,error:result.error}}} onRetryRequests={async()=>{setState(old=>({...old,requestsUnavailable:false}));return true}} onRetryAutoSync={async()=>{window.fixtureActions.push({action:'auto-sync-refresh'});let confirmed=false;try{const response=await settingsPort.send({type:'getSettings'});confirmed=response.ok===true;if(confirmed)listeners.forEach(listener=>listener({type:'settingsState',snapshot:response.snapshot}))}catch{}setState(old=>({...old,autoSyncRefreshError:confirmed?null:'controlled-settings-read-failure'}));return confirmed}} onRefreshManagedRelays={async()=>[]} onMutateManagedRelay={async()=>({status:'rejected',configurations:[],configurationApplied:false,credentialsRemoved:[],error:'controlled-relay-failure'})}/></div>}createRoot(document.getElementById('root')).render(<App/>);`,
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
  sourceRoot: repo,
  harnessRoot,
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
        "tests/harness/workspace-navigation.mjs",
        "tests/harness/connection-summary-cases.mjs",
        "tests/harness/navigation-target-stability.mjs",
        "tests/harness/compact-history.mjs",
        "packages/ui/src/previewText.ts",
        "packages/ui/src/ClipDetails.tsx",
        "tests/harness/workspace-boundary-selection.mjs",
        "packages/ui/src/ClipboardApp.tsx",
        "packages/ui/src/ConnectionSummary.tsx",
        "packages/core/runtime/connectionSummary.ts",
        "packages/ui/src/TaskDialog.tsx",
        "packages/ui/src/sessionFocus.ts",
        "packages/ui/src/RecoveryIssues.tsx",
        "packages/ui/src/useTaskRecoveryIssues.ts",
        "packages/ui/src/PreferenceSaveFeedback.tsx",
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
          .update(
            await readFile(
              join(file.startsWith("tests/harness/") ? harnessRoot : repo, file)
            )
          )
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
    ...(process.argv.includes("--connection-summary")
      ? { hasTouch: true }
      : {}),
    // Use the browser's own scrollsurface for the edge probe; no foreign overlay.
    ...(process.argv.includes("--summary-edge")
      ? { ignoreDefaultArgs: ["--hide-scrollbars"] }
      : {}),
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
  const toggle = page.locator('button[aria-controls="workspace-navigation"]');
  const runSafeNavigationCase = [
    "--workspace-navigation",
    "--settings-category-focus",
    "--navigation-target-stability",
  ].some((flag) => process.argv.includes(flag));
  if (
    (!process.argv.includes("--skip-initial") || runSafeNavigationCase) &&
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) === "false"
  )
    await toggle.click();
  const nav = page.getByRole("navigation", { name: "Clipp destinations" });
  if (!process.argv.includes("--skip-initial") || runSafeNavigationCase)
    await nav.waitFor({ timeout: 3000 });
  if (
    process.argv.includes("--skip-initial") &&
    process.argv.includes("--workspace-navigation")
  )
    await nav.getByRole("button", { name: "History", exact: true }).click();
  const openCompactNavigation = async () => {
    if (
      (await toggle.isVisible()) &&
      (await toggle.getAttribute("aria-expanded")) === "false"
    )
      await toggle.click();
  };
  const chooseDestination = async (name) => {
    const toggle = page.locator('button[aria-controls="workspace-navigation"]');
    if (await toggle.isVisible()) {
      if ((await toggle.getAttribute("aria-expanded")) === "false")
        await toggle.click();
      await page.waitForFunction(() => {
        const navigation = document.querySelector("#workspace-navigation");
        return navigation.getBoundingClientRect().left >= 0;
      });
    }
    await nav
      .getByRole("button", {
        name: name === "Devices" ? /^Devices(?: \(\d+\))?$/ : name,
        exact: name !== "Devices",
      })
      .click();
  };
  const openIssues = async () => {
    const notice = page.locator(".issue-notice");
    if (await notice.isVisible()) {
      await notice.getByRole("button", { name: "Review", exact: true }).click();
    } else {
      await chooseDestination("Settings");
      await page
        .getByRole("button", { name: "Review issues", exact: true })
        .click();
    }
  };
  if (process.argv.includes("--navigation-target-stability")) {
    await checkNavigationTargetStability({ page, nav, report, host });
  } else if (!process.argv.includes("--skip-initial")) {
    await openCompactNavigation();
    for (const name of ["History", "Devices", "Relays", "Settings"])
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
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search history", { exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".workspace-topbar")
        .getByLabel("Search history", { exact: true })
        .count(),
      1,
      "search belongs to the workspace header"
    );
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Search history"
    );
    if (process.argv.includes("--compact-top")) {
      await page.setViewportSize({ width: 520, height: 760 });
      await page.waitForFunction(() =>
        document
          .querySelector(".app-shell")
          ?.classList.contains("workspace-narrow")
      );
      const geometry = await page.evaluate(() => {
        const header = document
          .querySelector(".workspace-topbar")
          .getBoundingClientRect();
        const toolbar = document
          .querySelector(".history-toolbar")
          .getBoundingClientRect();
        const title = document.querySelector(".workspace-page-head");
        return {
          gap: toolbar.top - header.bottom,
          titleVisible: getComputedStyle(title).display !== "none",
        };
      });
      const statusSpacing = await page.evaluate(() => {
        const status = document
          .querySelector(".workspace-topbar .connection-status")
          .getBoundingClientRect();
        const share = document
          .querySelector(
            '.workspace-topbar [aria-label="Share current clipboard now"]'
          )
          .getBoundingClientRect();
        return {
          statusLeft: status.left,
          shareRight: share.right,
          statusRight: status.right,
          width: innerWidth,
        };
      });
      assert.ok(
        statusSpacing.shareRight <= statusSpacing.statusLeft &&
          statusSpacing.statusRight <= statusSpacing.width,
        "Share and connection controls do not overlap"
      );
      assert.equal(
        geometry.titleVisible,
        false,
        "compact header should not repeat the view title"
      );
      assert.ok(
        geometry.gap < 100,
        `History toolbar is too far below the header: ${geometry.gap}px`
      );
      await page.setViewportSize({ width: 1100, height: 800 });
    }
    if (process.argv.includes("--header-visual")) {
      await page.evaluate(() =>
        window.publishFixture({
          clips: [
            {
              id: "sample",
              type: "text",
              content: "A useful clip from this device",
              originPeerId: "local",
              capturedAt: Date.now(),
              shareExpiresAt: Date.now() + 3600000,
            },
          ],
        })
      );
      await page.evaluate(() => {
        window.publishFixture({ historyRefreshError: true });
        document.activeElement?.blur();
      });
      for (const theme of ["dark", "light"]) {
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 800 });
          await page.evaluate(
            (value) =>
              document.documentElement.setAttribute("data-clipp-theme", value),
            theme
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: join(out, `header-${theme}-${width}.png`),
          });
        }
      }
      await page.evaluate(() =>
        window.publishFixture({ historyRefreshError: false })
      );
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.getByLabel("Search history", { exact: true }).focus();
    }
    await page.keyboard.press("Tab");
    await page.keyboard.press("Meta+k");
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Search history"
    );
    await openCompactNavigation();
    await nav.getByRole("button", { name: /^Devices/ }).click();
    await page
      .getByRole("button", { name: /Approve request from Incoming device/ })
      .click();
    await page.waitForFunction(() =>
      window.fixtureActions.some((value) => value.action === "accept")
    );
    assert.equal(
      await page.getByRole("region", { name: "Trust requests" }).count(),
      0
    );
    report.cases.push({
      label: `${host} Devices navigation and actual approval callback`,
      passed: true,
    });
  }
  if (process.argv.includes("--issue-notice")) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForFunction(() =>
      document.querySelector(".app-shell")?.classList.contains("workspace-wide")
    );
    await chooseDestination("History");
    await page.evaluate(() =>
      window.publishFixture({ historyRefreshError: true })
    );
    const notice = page.locator(".issue-notice");
    await notice.getByRole("button", { name: "Review", exact: true }).waitFor();
    await notice
      .getByRole("button", { name: "Dismiss notification", exact: true })
      .click();
    await notice.waitFor({ state: "hidden" });
    await chooseDestination("Settings");
    await page
      .getByRole("button", { name: "Review issues", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Issues and recovery" });
    await dialog
      .getByText(/History is unavailable or could not refresh/)
      .waitFor();
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await page.evaluate(() =>
      window.publishFixture({ historyRefreshError: false })
    );
    await page.waitForFunction(() => !document.querySelector(".issue-notice"));
    await page.mouse.move(2, 2);
    await page.evaluate(() =>
      window.publishFixture({ historyRefreshError: true })
    );
    await notice.waitFor({ state: "visible" });
    await page.evaluate(() => document.activeElement?.blur());
    await notice.waitFor({ state: "hidden", timeout: 10000 });
    assert.equal(
      await page
        .getByRole("button", { name: "Review issues", exact: true })
        .count(),
      1
    );
    report.cases.push({
      label:
        "Issue notice dismisses, recurs after resolution, times out and remains reviewable",
      passed: true,
    });
  }
  if (process.argv.includes("--workspace-navigation")) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() =>
      document
        .querySelector(".app-shell")
        ?.classList.contains("workspace-narrow")
    );
    await page.evaluate(() =>
      window.publishFixture({
        clips: [
          {
            id: "workspace-text",
            type: "text",
            content: "A clipboard note",
            originPeerId: "local",
            capturedAt: 2,
            shareExpiresAt: 3,
          },
          {
            id: "workspace-link",
            type: "url",
            content: "https://example.test/article",
            originPeerId: "remote",
            capturedAt: 1,
            shareExpiresAt: 4,
          },
        ],
      })
    );
    const toggle = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    assert.equal(
      await page
        .getByRole("navigation", { name: "Clipp destinations" })
        .count(),
      0,
      "closed compact navigation is hidden from assistive technology"
    );
    await toggle.click();
    assert.equal(
      await nav.isVisible(),
      true,
      "compact navigation opens on request"
    );
    await nav.getByRole("button", { name: "History", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .isVisible(),
      true,
      "choosing a destination closes the compact navigation"
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label")
      ),
      "Open navigation",
      "focus returns to the compact navigation control"
    );
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    if ((await filters.getAttribute("aria-expanded")) === "false")
      await filters.click();
    await page
      .getByRole("group", { name: "History filters" })
      .getByRole("button", { name: "Links", exact: true })
      .click();
    await page
      .getByText("https://example.test/article", { exact: false })
      .waitFor();
    assert.equal(
      await page.getByText("A clipboard note", { exact: false }).count(),
      0
    );
    report.cases.push({
      label: "compact navigation opens, selects History, and restores focus",
      passed: true,
    });
  }
  if (process.argv.includes("--connection-summary")) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForFunction(() =>
      document.querySelector(".app-shell")?.classList.contains("workspace-wide")
    );
    await checkConnectionSummary({ page, nav, report, out, host });
  }
  if (exactBoundaries)
    await checkExactWorkspaceBoundaries({ page, nav, report, out });
  if (process.argv.includes("--auto-sync-recovery")) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForFunction(() =>
      document.querySelector(".app-shell")?.classList.contains("workspace-wide")
    );
    await chooseDestination("History");
    const query = page.getByLabel("Search history", { exact: true });
    await query.fill("  recovery query  ");
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    const nameTask = page.getByRole("dialog", {
      name: "Device Name",
      exact: true,
    });
    await nameTask
      .getByLabel("Device Name", { exact: true })
      .fill("  recovery draft  ");
    await nameTask
      .getByRole("button", { name: "Close name editor", exact: true })
      .click();
    for (const outcome of ["rejected", "unconfirmed"]) {
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      await page.evaluate((value) => {
        window.rejectAutoSync = value === "rejected";
        window.failAutoSyncReadback = value === "unconfirmed";
      }, outcome);
      const autoSync = page.getByLabel("Auto Sync", { exact: true });
      await autoSync.click();
      const feedback =
        outcome === "rejected"
          ? "Auto Sync was not saved."
          : "Auto Sync Save could not be confirmed.";
      await page.getByRole("alert").filter({ hasText: feedback }).waitFor();
      await nav.getByRole("button", { name: "History", exact: true }).click();
      await openIssues();
      const issues = page.getByRole("dialog", {
        name: "Issues and recovery",
        exact: true,
      });
      await issues
        .getByRole("button", { name: "Open Auto Sync", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Settings", exact: true })
        .waitFor();
      assert.equal(
        await issues.count(),
        0,
        "the Issues task returns to the applied Auto Sync consumer"
      );
      assert.equal(
        await page.getByRole("alert").filter({ hasText: feedback }).isVisible(),
        true
      );
      assert.equal(
        await page.evaluate(() => window.fixtureSession.getSnapshot().search),
        "  recovery query  "
      );
      assert.equal(await autoSync.isDisabled(), outcome === "unconfirmed");
      if (outcome === "rejected") {
        // Current refresh failure is a runtime-owned public prop; its Retry invokes the real settings port.
        await page.evaluate(() => {
          window.settingsReadFault = true;
          window.publishFixture({
            autoSyncRefreshError: "controlled-settings-read-failure",
          });
        });
      }
      const refresh = page.getByRole("button", {
        name: outcome === "rejected" ? "Retry auto sync" : "Refresh Auto Sync",
        exact: true,
      });
      await refresh.click();
      await page
        .getByText(
          "Auto Sync could not be refreshed: controlled-settings-read-failure.",
          { exact: false }
        )
        .waitFor();
      await nav.getByRole("button", { name: /^Devices/ }).click();
      await openIssues();
      await issues
        .getByRole("button", { name: "Open Auto Sync", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Settings", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Retry auto sync", exact: true })
          .isVisible(),
        true,
        "failed refresh remains reachable after recovery navigation"
      );
      if (outcome === "unconfirmed")
        assert.equal(await autoSync.isDisabled(), true);
      await page.evaluate(() => {
        window.settingsReadFault = false;
        window.rejectAutoSync = false;
        window.failAutoSyncReadback = false;
      });
      await refresh.click();
      await page.waitForFunction(
        () => !window.fixtureSession.getSnapshot().autoSync.pending
      );
      await page
        .getByRole("button", { name: "Retry auto sync", exact: true })
        .waitFor({ state: "detached" });
      assert.equal(await autoSync.isDisabled(), false);
      assert.equal(
        await autoSync.getAttribute("aria-checked"),
        outcome === "rejected" ? "true" : "false",
        "the current read, not the failed feedback, supplies the applied value"
      );
      await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
      await page
        .getByRole("button", { name: "Rename this device", exact: true })
        .click();
      assert.equal(
        await nameTask.getByLabel("Device Name", { exact: true }).inputValue(),
        "  recovery draft  "
      );
      await nameTask
        .getByRole("button", { name: "Close name editor", exact: true })
        .click();
      report.cases.push({
        label: `${outcome} Auto Sync Save and failed refresh → real Issues action → Settings with retained query/draft and working refresh`,
        passed: true,
      });
    }
    const actions = await page.evaluate(() =>
      window.fixtureActions.filter((value) =>
        value.action.startsWith("auto-sync")
      )
    );
    assert.deepEqual(
      actions.filter((value) => value.action === "auto-sync-save"),
      [
        { action: "auto-sync-save", enabled: false },
        { action: "auto-sync-save", enabled: false },
      ]
    );
    assert.equal(
      actions.filter((value) => value.action === "auto-sync-refresh").length,
      4
    );
    await chooseDestination("History");
    await query.fill("");
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
    await page
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    await nameTask
      .getByRole("button", { name: "Cancel name edit", exact: true })
      .click();
  }
  if (process.argv.includes("--requests-state")) {
    await openCompactNavigation();
    await nav.getByRole("button", { name: /^Devices/ }).click();
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
    await page
      .getByText(
        "Requests are unavailable. Retry to refresh the current list.",
        { exact: true }
      )
      .waitFor({ state: "hidden" });
    report.cases.push({
      label:
        "Requests live availability and Retry do not invent an empty loaded list",
      passed: true,
    });
  }
  if (process.argv.includes("--name-task")) {
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
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
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
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
    await page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Connections", exact: true })
      .click();
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
    await relay.getByLabel("Name", { exact: true }).focus();
    await page.keyboard.press("Escape");
    await relay.waitFor({ state: "detached" });
    assert.equal(
      await page
        .getByRole("button", { name: "Add relay", exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
      "relay Escape returns to its logical origin"
    );
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
        "real managed Relay task retains failed raw fields across narrow reflow, Close and Escape with logical origin restoration",
      passed: true,
    });
  }
  if (process.argv.includes("--compact-history"))
    await checkCompactHistory({ page, nav, report, out });
  if (process.argv.includes("--matrix")) {
    await page.setViewportSize(
      host === "chrome"
        ? { width: 480, height: 600 }
        : { width: 1400, height: 900 }
    );
    await page.waitForFunction(
      (host) =>
        document
          .querySelector(".app-shell")
          ?.classList.contains(
            host === "chrome" ? "workspace-narrow" : "workspace-wide"
          ),
      host
    );
    await chooseDestination("History");
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
        await page.waitForFunction((width) => {
          const root = document.querySelector(".app-shell");
          return width <= 1100
            ? root?.classList.contains("workspace-narrow")
            : root?.classList.contains("workspace-wide");
        }, width);
        await page.evaluate((scale) => {
          document.documentElement.style.fontSize = scale + "%";
        }, scale);
        await page.waitForTimeout(50);
        await page.getByLabel("Search history", { exact: true }).fill("clip");
        const actionsBeforeNavigation = await page.evaluate(
          () => window.fixtureActions.length
        );
        await chooseDestination("Devices");
        assert.equal(
          await page.getByLabel("Search history", { exact: true }).count(),
          0,
          "History search is scoped to History"
        );
        assert.equal(
          await page.evaluate(() => window.fixtureActions.length),
          actionsBeforeNavigation,
          "changing destinations invokes no History action"
        );
        await chooseDestination("History");
        assert.equal(
          await page.getByLabel("Search history", { exact: true }).inputValue(),
          "clip",
          "History search is retained when returning to History"
        );
        await page
          .getByRole("button", { name: "Clear search", exact: true })
          .click();
        await page.waitForFunction(() => {
          const root = document.querySelector(".app-shell");
          const sidebar = document
            .querySelector(".workspace-sidebar")
            .getBoundingClientRect();
          return (
            root?.classList.contains("workspace-wide") || sidebar.right <= 0
          );
        });
        const placement = await page.evaluate(() =>
          Object.fromEntries(
            [
              ".workspace-topbar",
              ".workspace-controls",
              ".workspace-navigation",
              ".app-main",
              ".workspace-sidebar",
              ".workspace-content",
            ].map((selector) => [
              selector,
              document.querySelector(selector).getBoundingClientRect().toJSON(),
            ])
          )
        );
        assert.ok(
          placement[".workspace-controls"].top >=
            placement[".workspace-topbar"].top &&
            placement[".workspace-controls"].bottom <=
              placement[".workspace-topbar"].bottom + 1,
          `History actions remain inside the header ${width}x${height}/${scale}%: ${JSON.stringify(placement)}`
        );
        if (scale === 100 && width <= 1100 && height >= 700)
          assert.ok(
            placement[".workspace-sidebar"].right <= 0 &&
              (await page
                .getByRole("button", {
                  name: "Open navigation",
                  exact: true,
                })
                .getAttribute("aria-expanded")) === "false",
            "narrow navigation closes after a destination is selected"
          );
        if (scale === 100 && width > 1100 && height >= 800)
          assert.ok(
            placement[".workspace-sidebar"].right <=
              placement[".workspace-content"].x + 1,
            "wide navigation remains in the sidebar"
          );
        if (height <= 500)
          assert.ok(
            (await page
              .getByRole("button", {
                name: "Open navigation",
                exact: true,
              })
              .getAttribute("aria-expanded")) === "false",
            "cramped narrow navigation remains collapsed"
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
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
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
    await page.waitForFunction(
      () => {
        const root = document.querySelector(".app-shell");
        return (
          root.classList.contains("workspace-narrow") &&
          !root.classList.contains("workspace-cramped")
        );
      },
      null,
      { timeout: 3000 }
    );
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
        const root = document.querySelector(".app-shell");
        return (
          root.classList.contains("workspace-wide") &&
          root.classList.contains("workspace-cramped") &&
          document.activeElement === last &&
          rect.top >= 0 &&
          rect.bottom <= 350
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
    // This journey starts after the real scroll has reached its public session
    // owner. Resizing while scroll publication is pending is a separate case.
    await page.waitForFunction(
      () => {
        const root = document.querySelector(".app-shell");
        const top = root.getBoundingClientRect().top;
        const firstVisible = [
          ...document.querySelectorAll("[data-clip-id]"),
        ].find((element) => element.getBoundingClientRect().bottom > top);
        const snapshot = window.fixtureSession.getSnapshot();
        return (
          root.classList.contains("workspace-wide") &&
          root.classList.contains("workspace-cramped") &&
          Math.abs(
            (snapshot.scroll["workspace:history"] ?? 0) - root.scrollTop
          ) < 1 &&
          snapshot.historyAnchor?.clipId === firstVisible?.dataset.clipId
        );
      },
      null,
      { timeout: 3000 }
    );
    const measureReflow = (elements, expectedText) => {
      const item = elements.find((element) => {
        if (expectedText !== undefined)
          return (
            element.querySelector(".history-text").textContent === expectedText
          );
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      });
      const snapshot = window.fixtureSession.getSnapshot();
      const root = document.querySelector(".app-shell");
      const pane = document.querySelector(".content-pane");
      const measure = (element) => ({
        rect: element.getBoundingClientRect().toJSON(),
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
      return {
        atPerformanceMs: performance.now(),
        text: item?.querySelector(".history-text").textContent,
        clipId: item?.dataset.clipId,
        item: item ? measure(item) : null,
        root: { ...measure(root), classes: root.className },
        pane: measure(pane),
        activeFocusKey: document.activeElement?.dataset.sessionFocus ?? null,
        session: {
          historyAnchor: snapshot.historyAnchor,
          scroll: snapshot.scroll,
          focusKey: snapshot.focusKey,
          destination: snapshot.destination,
        },
      };
    };
    // Capture the pre-resize observation in the existing browser task, avoiding
    // another protocol round-trip that could change scroll-event timing.
    const beforeReflow = await page
      .locator(".history-card")
      .evaluateAll(measureReflow);
    const visibleText = beforeReflow.text;
    report.historyReflowObservation = { before: beforeReflow };
    await page.setViewportSize({ width: 800, height: 800 });
    try {
      await page.waitForFunction(
        (text) => {
          const item = [...document.querySelectorAll(".history-text")].find(
            (element) => element.textContent === text
          );
          const rect = item.getBoundingClientRect();
          const root = document.querySelector(".app-shell");
          const pane = document
            .querySelector(".content-pane")
            .getBoundingClientRect();
          return (
            root.classList.contains("workspace-narrow") &&
            !root.classList.contains("workspace-cramped") &&
            pane.height > 0 &&
            pane.top >= 0 &&
            pane.bottom <= innerHeight + 0.5 &&
            rect.bottom > pane.top &&
            rect.top < pane.bottom
          );
        },
        visibleText,
        { timeout: 3000 }
      );
    } finally {
      report.historyReflowObservation.after = await page
        .locator(".history-card")
        .evaluateAll(measureReflow, visibleText);
    }
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
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
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
      await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
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
    await nav.getByRole("button", { name: /^Devices(?: \(\d+\))?$/ }).click();
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
  if (process.argv.includes("--settings-recovery-route")) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForFunction(() =>
      document.querySelector(".app-shell")?.classList.contains("workspace-wide")
    );
    const categories = page.getByRole("navigation", {
      name: "Settings categories",
    });
    for (const [field, label, value, category, code] of [
      [
        "sharingLifetimeMs",
        "Clip Sharing Lifetime",
        "3600000",
        "Advanced",
        "clip-settings",
      ],
      ["logLevel", "Log level", "debug", "Advanced", "settings"],
      ["theme", "Appearance", "dark", "General", "settings"],
      [
        "localRetentionMs",
        "Keep unpinned history",
        "604800000",
        "General",
        "clip-settings",
      ],
    ]) {
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      await categories
        .getByRole("button", { name: category, exact: true })
        .click();
      await page.evaluate((field) => (window.rejectSetting = field), field);
      await page
        .getByRole("combobox", { name: label, exact: true })
        .selectOption(value);
      await openIssues();
      const issue = page.locator(`[data-issue-id="task:preference:${code}"]`);
      await issue
        .getByRole("button", {
          name: code === "settings" ? "Open Settings" : "Open task",
          exact: true,
        })
        .click();
      assert.equal(
        await categories
          .getByRole("button", { name: category, exact: true })
          .getAttribute("aria-current"),
        "location",
        `${field} recovery category`
      );
      assert.equal(
        await page
          .getByRole("combobox", { name: label, exact: true })
          .isVisible(),
        true,
        `${field} recovery control`
      );
      if (code === "clip-settings") {
        const other = category === "General" ? "Advanced" : "General";
        await categories
          .getByRole("button", { name: other, exact: true })
          .click();
        const panel = page.locator(
          `[data-settings-panel="${other.toLowerCase()}"]`
        );
        assert.equal(
          await panel.getByText(/controlled-policy-failure/).count(),
          0,
          `${field} feedback stays with its control`
        );
        await categories
          .getByRole("button", { name: category, exact: true })
          .click();
      }
      await page.evaluate(() => (window.rejectSetting = null));
      await page
        .getByRole("combobox", { name: label, exact: true })
        .selectOption(value);
      await page.mouse.move(2, 2);
      await page
        .locator(".issue-notice")
        .waitFor({ state: "hidden", timeout: 10000 });
    }
    report.cases.push({
      label:
        "Settings recovery issues open the category containing the failed field",
      passed: true,
    });
  }
  if (process.argv.includes("--settings-category-focus")) {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.waitForFunction(() =>
      document.querySelector(".app-shell")?.classList.contains("workspace-wide")
    );
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    const categories = page.getByRole("navigation", {
      name: "Settings categories",
    });
    for (const name of ["Connections", "Advanced"]) {
      const button = categories.getByRole("button", { name, exact: true });
      await button.click();
      await button.focus();
      assert.equal(
        await button.getAttribute("data-session-focus"),
        `settings-category:${name.toLowerCase()}`
      );
      await page.setViewportSize({ width: 320, height: 650 });
      await page.waitForTimeout(100);
      assert.equal(
        await button.evaluate((element) => document.activeElement === element),
        true,
        `${name} retains focus after resize`
      );
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.waitForTimeout(100);
      assert.equal(
        await button.evaluate((element) => document.activeElement === element),
        true,
        `${name} retains focus after restoring`
      );
    }
    report.cases.push({
      label: "Settings category focus survives layout changes",
      passed: true,
    });
  }
  if (process.argv.includes("--m3-settings")) {
    await page.setViewportSize({ width: 320, height: 650 });
    await page.waitForFunction(() =>
      document
        .querySelector(".app-shell")
        ?.classList.contains("workspace-narrow")
    );
    await chooseDestination("Settings");
    const categories = page.getByRole("navigation", {
      name: "Settings categories",
    });
    await categories
      .getByRole("button", { name: "Appearance", exact: true })
      .click();
    await page.waitForFunction(() => {
      const target = document.querySelector(
        '[data-session-focus="settings:appearance"]'
      );
      const rect = target?.getBoundingClientRect();
      return rect && rect.top >= 0 && rect.top < window.innerHeight;
    });
    await categories
      .getByRole("button", { name: "General", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Keep unpinned history", { exact: true })
        .isVisible(),
      true
    );
    assert.equal(
      await page
        .getByLabel("Clip Sharing Lifetime", { exact: true })
        .isVisible(),
      true
    );
    await page
      .getByLabel("Keep unpinned history", { exact: true })
      .selectOption(String(7 * 86400000));
    await page.getByLabel("Keep unpinned history", { exact: true }).waitFor();
    await categories
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    assert.equal(
      await page
        .getByText("No relays configured. Direct connections remain available.")
        .isVisible(),
      true
    );
    await page.getByRole("button", { name: "Add relay", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Relay configuration" });
    await editor
      .getByLabel("Name", { exact: true })
      .fill("Retained relay draft");
    await page.setViewportSize({ width: 1100, height: 800 });
    assert.equal(
      await editor.getByLabel("Name", { exact: true }).inputValue(),
      "Retained relay draft"
    );
    await editor
      .getByRole("button", { name: "Close relay editor", exact: true })
      .click();
    await categories
      .getByRole("button", { name: "General", exact: true })
      .click();
    await categories
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page.getByRole("button", { name: "Add relay", exact: true }).click();
    assert.equal(
      await editor.getByLabel("Name", { exact: true }).inputValue(),
      "Retained relay draft"
    );
    await editor
      .getByRole("button", { name: "Cancel relay edit", exact: true })
      .click();
    await page.evaluate(() =>
      window.publishFixture({
        managedRelayConfigurations: Array.from({ length: 5 }, (_, i) => ({
          key: `relay-${i}`,
          name: `Relay ${i}`,
          kind: "managed",
          discoveryUrl: `https://${"long".repeat(14)}-${i}.example.test/v1/relay`,
        })),
      })
    );
    const relay = page.locator("details.managed-relay-card").first();
    await relay.locator("summary").waitFor({ state: "visible" });
    assert.equal(
      await relay
        .getByRole("button", { name: "Remove", exact: true })
        .isVisible(),
      false
    );
    await relay.locator("summary").click();
    assert.equal(
      await relay
        .getByRole("button", { name: "Remove", exact: true })
        .isVisible(),
      true
    );
    assert.equal(
      await relay.locator(".relay-address").innerText(),
      `https://${"long".repeat(14)}-0.example.test/v1/relay`
    );
    await relay.getByRole("button", { name: "Remove", exact: true }).click();
    await page
      .getByText(/controlled-relay-failure/)
      .first()
      .waitFor();
    await categories
      .getByRole("button", { name: "Advanced", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Clip Sharing Lifetime", { exact: true })
        .isVisible(),
      true
    );
    assert.equal(
      await page
        .getByLabel("Keep unpinned history", { exact: true })
        .isVisible(),
      true
    );
    await page
      .getByLabel("Clip Sharing Lifetime", { exact: true })
      .selectOption(String(3600000));
    assert.equal(
      await page
        .getByRole("button", { name: "Clear all local history", exact: true })
        .isVisible(),
      true
    );
    await page.setViewportSize({ width: 320, height: 650 });
    assert.equal(
      await categories
        .getByRole("button", { name: "Advanced", exact: true })
        .getAttribute("aria-current"),
      "location"
    );
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    assert.equal(overflow, false, "no page-level horizontal overflow");
    await page.screenshot({ path: join(out, "m3-advanced-320.png") });
    await categories
      .getByRole("button", { name: "General", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Keep unpinned history", { exact: true })
        .inputValue(),
      String(7 * 86400000)
    );
    await page.screenshot({ path: join(out, "m3-general-320.png") });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const enlarged = await page.evaluate(() => {
      const control = document
        .querySelector('[role="switch"][id="auto-sync"]')
        .getBoundingClientRect();
      return {
        width: control.width,
        height: control.height,
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    assert.ok(
      enlarged.width >= 40 && enlarged.height >= 40,
      "switch retains its target at enlarged text"
    );
    assert.equal(
      enlarged.overflow,
      false,
      "enlarged Settings has no page-level horizontal overflow"
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    report.cases.push({
      label: `${host} M3 categories, real settings writes, retained relay editor through resize and Advanced Clear`,
      passed: true,
    });
  }
  if (process.argv.includes("--clear-focus")) {
    await page.setViewportSize({ width: 800, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "100%";
      window.deferClear = true;
    });
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Advanced", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear all local history", exact: true })
      .click();
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
  if (process.argv.includes("--fractional-target")) {
    assert.equal(host, "android");
    const profiles = [
      {
        width: 412,
        height: 732,
        nativeWidth: 1080,
        nativeHeight: 1920,
        density: 2.625,
      },
      {
        width: 340,
        height: 350,
        nativeWidth: 1080,
        nativeHeight: 1111,
        density: 3.5,
      },
      {
        width: 640,
        height: 360,
        nativeWidth: 1920,
        nativeHeight: 1080,
        density: 3.5,
      },
    ];
    for (const [index, profile] of profiles.entries()) {
      await page.setViewportSize({
        width: profile.width,
        height: profile.height,
      });
      await page.evaluate(
        (profile) => {
          document.documentElement.style.fontSize = "100%";
          window.stopFixtureGeometry?.();
          window.publishFixture({
            initializationError: "controlled-initialization-failure",
          });
          window.startFixtureGeometry({
            sequence: profile.index + 10,
            windowPx: {
              left: 0,
              top: 0,
              width: profile.nativeWidth,
              height: profile.nativeHeight,
            },
            webViewPx: {
              left: 0,
              top: 0,
              width: profile.nativeWidth,
              height: profile.nativeHeight,
            },
            safeAreaPx: {
              left: 0,
              top: 0,
              width: profile.nativeWidth,
              height: profile.nativeHeight,
            },
            systemBarsPx: { left: 0, top: 0, right: 0, bottom: 0 },
            cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
            imePx: { left: 0, top: 0, right: 0, bottom: 0 },
            density: profile.density,
            fontScale: 1,
            imeVisible: false,
          });
        },
        { ...profile, index }
      );
      await page.waitForFunction(
        () => document.documentElement.dataset.hostGeometry === "android"
      );
      const summary = page.getByRole("button", {
        name: "Review",
        exact: true,
      });
      await summary.scrollIntoViewIfNeeded();
      const measured = await summary.evaluate(measureNativeControl, profile);
      report.cases.push({
        label: `actual ClipboardApp issue action with public HostGeometry ${profile.nativeWidth}/${profile.density} at CSS ${profile.width}x${profile.height}`,
        native: false,
        sourceProfile:
          "recorded b507 physical width/density at 412x732; other cases are bounded synthetic geometry, zero insets",
        measured,
      });
      assert.ok(
        measured.rect.height >= measured.minimum,
        `actual rendered action ${measured.rect.height} must meet strict converted minimum ${measured.minimum}`
      );
      assert.ok(
        measured.nativeDp.width >= 48 && measured.nativeDp.height >= 48,
        "actual control must preserve 48dp using measured WebView/CSS ratio, independently of DPR"
      );
      assert.equal(
        await summary.evaluate((element) => {
          const r = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          );
        }),
        true
      );
      await summary.click();
      const recovery = page.getByRole("dialog", {
        name: "Issues and recovery",
        exact: true,
      });
      await recovery.waitFor();
      const close = recovery
        .getByRole("button", { name: "Close", exact: true })
        .first();
      await close.scrollIntoViewIfNeeded();
      const closeMeasurement = await close.evaluate(
        measureNativeControl,
        profile
      );
      assert.ok(
        closeMeasurement.rect.height >= closeMeasurement.minimum &&
          closeMeasurement.nativeDp.height >= 48,
        "portal task uses the same strict native target budget"
      );
      await close.click();
      report.cases.at(-1).passed = true;
      report.cases.at(-1).taskClose = closeMeasurement;
      await page.evaluate(() => window.stopFixtureGeometry());
    }
  }
  if (process.argv.includes("--summary-edge")) {
    for (const scale of [100, 200]) {
      await page.setViewportSize({ width: 732, height: 412 });
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = scale + "%";
        window.stopFixtureGeometry?.();
        window.publishFixture({
          initializationError: "controlled-summary-edge",
          clips: Array.from({ length: 24 }, (_, index) => ({
            id: "edge-" + index,
            type: "text",
            content: "Known native edge profile Clip " + index,
            originPeerId: "local",
            capturedAt: 1,
            shareExpiresAt: 2,
          })),
        });
        if (document.querySelector(".android-host"))
          window.startFixtureGeometry({
            sequence: 42,
            windowPx: { left: 0, top: 0, width: 1920, height: 1080 },
            webViewPx: { left: 0, top: 0, width: 1920, height: 1080 },
            safeAreaPx: { left: 0, top: 63, width: 1794, height: 1017 },
            systemBarsPx: { left: 0, top: 63, right: 126, bottom: 0 },
            cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
            imePx: { left: 0, top: 0, right: 0, bottom: 0 },
            density: 2.625,
            fontScale: scale / 100,
            imeVisible: false,
          });
      }, scale);
      await nav.getByRole("button", { name: "History", exact: true }).click();
      const summary = page.getByRole("button", {
        name: "Review",
        exact: true,
      });
      await summary.scrollIntoViewIfNeeded();
      const shell = page.locator(".app-shell");
      const shellRect = await shell.boundingBox();
      await page.mouse.move(
        shellRect.x + shellRect.width - 1,
        shellRect.y + Math.min(180, shellRect.height / 2)
      );
      await page.mouse.wheel(0, 1);
      const measured = await summary.evaluate(async (element) => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const rect = element.getBoundingClientRect(),
          shell = element.closest(".app-shell"),
          scroll = shell.getBoundingClientRect(),
          style = getComputedStyle(element);
        const radii = [
          "borderTopLeftRadius",
          "borderTopRightRadius",
          "borderBottomRightRadius",
          "borderBottomLeftRadius",
        ].map((key) => style[key]);
        const guard = 1,
          inset = 8;
        const points = [
          ["center", rect.left + rect.width / 2, rect.top + rect.height / 2],
          ["top-left-painted", rect.left + inset, rect.top + inset],
          ["top-right-painted", rect.right - inset, rect.top + inset],
          ["bottom-right-painted", rect.right - inset, rect.bottom - inset],
          ["bottom-left-painted", rect.left + inset, rect.bottom - inset],
          ["top-edge", rect.left + rect.width / 2, rect.top + guard],
          ["right-edge", rect.right - guard, rect.top + rect.height / 2],
          ["bottom-edge", rect.left + rect.width / 2, rect.bottom - guard],
          ["left-edge", rect.left + guard, rect.top + rect.height / 2],
        ];
        return {
          rect: rect.toJSON(),
          scrollport: scroll.toJSON(),
          radii,
          overflow: getComputedStyle(shell).overflow,
          clientWidth: shell.clientWidth,
          scrollHeight: shell.scrollHeight,
          clientHeight: shell.clientHeight,
          clearance: {
            left: rect.left - scroll.left,
            right: scroll.right - rect.right,
          },
          hits: points.map(([name, x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return {
              name,
              x,
              y,
              owned: element.contains(hit),
              hit: hit
                ? { tag: hit.tagName, className: String(hit.className) }
                : null,
            };
          }),
        };
      });
      const target =
        host === "android"
          ? await summary.evaluate(measureNativeControl, {
              nativeWidth: 1920,
              density: 2.625,
            })
          : null;
      report.cases.push({
        label: `${host} actual scrollsurface summary painted probes and bounded clearance at ${scale}% renderer text`,
        native: false,
        measured,
        target,
        mechanism:
          "Native78 is actual occlusion RED. Desktop scrollsurface may not reproduce the Android overlay mechanism; no foreign overlay is inserted.",
      });
      assert.equal(measured.overflow, "auto");
      assert.ok(
        measured.scrollHeight > measured.clientHeight,
        "real outer scrollsurface required"
      );
      assert.ok(
        measured.clearance.left >= 8 && measured.clearance.right >= 8,
        "summary paint must be inset from both outer scrollsurface edges"
      );
      assert.ok(
        measured.hits.every((hit) => hit.owned),
        "all nine original square painted probes must belong to the summary"
      );
      if (target) {
        assert.ok(
          target.rect.height >= target.minimum &&
            target.nativeDp.width >= 48 &&
            target.nativeDp.height >= 48,
          "inset summary retains the strict measured native target budget"
        );
      }
      await summary.click();
      const issues = page.getByRole("dialog", {
        name: "Issues and recovery",
        exact: true,
      });
      await issues.waitFor();
      const close = issues
        .getByRole("button", { name: "Close", exact: true })
        .first();
      if (target) {
        const closeTarget = await close.evaluate(measureNativeControl, {
          nativeWidth: 1920,
          density: 2.625,
        });
        report.cases.at(-1).taskClose = closeTarget;
        assert.ok(
          closeTarget.rect.height >= closeTarget.minimum &&
            closeTarget.nativeDp.width >= 48 &&
            closeTarget.nativeDp.height >= 48,
          "Close retains the same strict native target budget"
        );
      }
      await close.click();
      report.cases.at(-1).passed = true;
      await page.evaluate(() => window.stopFixtureGeometry?.());
    }
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
    report.fixtureActions = await page.evaluate(() => window.fixtureActions);
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
if (process.argv.includes("--assert-no-actions")) {
  assert.deepEqual(report.fixtureActions, []);
  assert.deepEqual(report.clipboardCalls, { reads: 0, writes: 0 });
  assert.equal(report.blockedRequests, 0);
}
console.log(
  JSON.stringify({
    passed: report.cases.length,
    closed: report.closed,
    errors: report.errors,
    fixtureActions: report.fixtureActions,
    clipboardCalls: report.clipboardCalls,
    blockedRequests: report.blockedRequests,
  })
);
