// Programmatic rendered fixture: real ExtensionApp/shared owners, simulated Chrome API.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../..", import.meta.url)),
  out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
await build({
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {ExtensionApp} from './apps/extension/src/ExtensionApp';
const listeners=new Set();let portListener;window.actions=[];window.clipboardReads=0;window.copyFailure=false;window.copyReplyLost=false;window.completedCopyEffects=0;window.deleteFailure=false;window.renameFailure=true;
Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{window.clipboardReads++;return 'fixture-only';},writeText:async()=>{}}});
const clip={id:'clip-one',type:'text',content:'First line\\n'+('long'.repeat(500))+'\\nLast line',originPeerId:'local',capturedAt:Date.now(),shareExpiresAt:Date.now()+86400000};window.exactContent=clip.content;
const history={sessionId:'history',revision:0,clips:[clip],pinnedIds:[]};const settings={sessionId:'settings',revision:0,state:{theme:'system',logLevel:'info',localRetentionMs:2592000000,sharingLifetimeMs:86400000,autoSync:true}};
const state={identity:{deviceId:'local',deviceName:'Local'},devices:[{deviceId:'remote',deviceName:'Remote'},{deviceId:'revocable',deviceName:'Revocable'}],pending:[{deviceId:'request',deviceName:'Incoming'}],waiting:[],pairingErrors:[],pairingState:{sessionId:'runtime',revision:0,outcomes:[]},peers:[],managedRelayConfigurations:[],managedRelayStates:[]};
window.rotateFixtureIdentity=id=>{state.identity={deviceId:id,deviceName:'Fixture new authority'};window.publish();};
window.publish=()=>{state.pairingState.revision++;listeners.forEach(f=>f({type:'runtimeState',state:structuredClone(state)}));};
let handoffCount=0;window.deliver=destination=>{const id='fixture-'+(++handoffCount);portListener({type:'destination',handoff:{id,destination}});return id;};
const runtime={onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},connect:()=>({name:'clipp-management-page-v1',postMessage:value=>window.actions.push({port:value}),disconnect:()=>{},onMessage:{addListener:f=>{portListener=f;}},onDisconnect:{addListener:()=>{}}}),sendMessage(message,done){if(typeof done!=="function")return new Promise(resolve=>runtime.sendMessage(message,resolve));window.actions.push(message);queueMicrotask(()=>{
let response={ok:true};switch(message.type){
case 'getRuntimeAuthority':response={sessionId:'runtime'};break;case 'getRuntimeState':response={state:structuredClone(state)};break;case 'getInitializationError':response={error:null};break;
case 'getClipHistory':response={ok:true,snapshot:structuredClone(history)};break;case 'getSettings':response={ok:true,snapshot:structuredClone(settings)};break;
case 'setSettings':Object.assign(settings.state,message.settings);settings.revision++;response={status:'applied',snapshot:structuredClone(settings)};break;
case 'managementStatus':response=window.statusFailure?{ok:false,error:'fixture-status-failure'}:{ok:true,records:[]};break;case 'getConnectedPeers':response={peers:[],peerConnections:[]};break;
case 'reuseClip':if(window.copyReplyLost){window.completedCopyEffects++;history.clips.push({...clip,id:'copied-event-'+window.completedCopyEffects});history.revision++;listeners.forEach(f=>f({type:'historyChanged',sessionId:history.sessionId,revision:history.revision}));runtime.lastError={message:'lost successful Copy reply'};done(undefined);runtime.lastError=undefined;return;}response=window.copyFailure?{ok:false,error:'clipboard_operation_failed'}:{ok:true,outcome:'complete'};break;
case 'setPin':history.pinnedIds=message.pinned?[message.id]:[];history.revision++;break;
case 'deleteClip':if(window.deleteFailure)response={ok:false,error:'controlled-delete'};else{history.clips=[];history.revision++;}break;
case 'clearHistory':history.clips=[];history.revision++;break;
case 'renameLocalIdentity':response=window.renameFailure?{ok:false,error:'controlled-name'}:{ok:true,identity:{deviceId:'local',deviceName:message.name}};break;
case 'revokeDevice':window.finishRevocation=(receipt={ok:true},publish=true)=>{if(publish){state.devices=state.devices.filter(device=>device.deviceId!==message.id);window.publish();}done(receipt);};if(window.deferRevocation)return;window.finishRevocation();return;
case 'renameDevice':response={ok:false,error:'controlled-alias'};break;
case 'pairDevice':response={ok:false,error:'invalid_pairing_target'};break;
case 'getPairingTarget':response={text:'fixture-pairing-target'};break;
case 'getPendingRequests':response=state.pending;break;case 'getTrustedDevices':response={devices:state.devices};break;
case 'respondTrust':state.pending=[];response={ok:true,admitted:message.accept};break;
case 'managedRelayMutate':response={ok:true,result:{status:'rejected',configurations:[],configurationApplied:false,credentialsRemoved:[],error:'controlled-relay-save'}};break;
}done(response);});}};window.chrome={runtime};
window.managementRoot=createRoot(document.getElementById('root'));window.managementRoot.render(<ExtensionApp surface="page"/>);`,
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  loader: { ".png": "dataurl" },
  outfile: join(out, "consumer.js"),
});
const profile = await mkdtemp(
  join(tmpdir(), "clipp-chrome-management-fixture-")
);
const report = {
  nativeHost: false,
  seam: "actual ExtensionApp + ClipboardApp + UiSession + runtime adapters",
  clipboard: "memory boundary before app source",
  profile,
  cases: [],
  errors: [],
  closed: false,
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1100, height: 800 },
  });
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(String(e)));
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ path: join(root, "packages/ui/src/styles.css") });
  await page.addStyleTag({
    path: join(root, "apps/extension/src/options-host.css"),
  });
  await page.addScriptTag({ path: join(out, "consumer.js") });
  await page.waitForFunction(() =>
    window.actions.some((a) => a.port?.type === "ready" && a.port.ready)
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Share current clipboard now" })
      .count(),
    0
  );
  assert.equal(await page.evaluate(() => window.clipboardReads), 0);
  report.cases.push(
    "full-page usable authority without focus clipboard capture or Send"
  );
  await page.evaluate(() => (window.statusFailure = true));
  await page
    .getByText(
      "Navigation status could not be loaded. Earlier navigation may still need attention."
    )
    .waitFor({ timeout: 3500 });
  await page.evaluate(() => (window.statusFailure = false));
  await page
    .getByRole("button", { name: "Check navigation status", exact: true })
    .click();
  await page
    .getByText(
      "Navigation status could not be loaded. Earlier navigation may still need attention."
    )
    .waitFor({ state: "hidden" });
  report.cases.push(
    "navigation mailbox status failure is visible and Retry recovers its current notices"
  );

  await page.getByRole("button", { name: "Devices", exact: true }).click();
  await page.evaluate(() => (window.deferRevocation = true));
  page.on("dialog", (dialog) => dialog.accept());
  const revocation = page
    .locator(".peer-item")
    .filter({ hasText: "Revocable" })
    .getByRole("button", { name: "Revoke device", exact: true });
  await revocation.click();
  await page.waitForFunction(
    () => typeof window.finishRevocation === "function"
  );
  const revocationHandoff = await page.evaluate(() =>
    window.deliver({ kind: "requests" })
  );
  await page.waitForFunction(
    (id) =>
      window.actions.some(
        (action) => action.port?.type === "ack" && action.port.id === id
      ),
    revocationHandoff
  );
  assert.equal(
    await page.evaluate(
      (id) =>
        window.actions.find(
          (action) => action.port?.type === "ack" && action.port.id === id
        ).port.status,
      revocationHandoff
    ),
    "declined"
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Devices", exact: true })
      .getAttribute("aria-current"),
    "page"
  );
  assert.equal(await revocation.isDisabled(), true);
  await page.evaluate(() => window.finishRevocation());
  await page
    .locator(".peer-item")
    .filter({ hasText: "Revocable" })
    .waitFor({ state: "hidden" });
  const settledHandoff = await page.evaluate(() =>
    window.deliver({ kind: "requests" })
  );
  await page.waitForFunction(
    (id) =>
      window.actions.some(
        (action) =>
          action.port?.type === "ack" &&
          action.port.id === id &&
          action.port.status === "applied"
      ),
    settledHandoff
  );
  report.cases.push(
    "actual revocation keeps session occupied, declines incoming navigation and releases after authoritative removal"
  );
  await page.getByRole("button", { name: "Devices", exact: true }).click();
  const remote = page.locator(".peer-item").filter({ hasText: "Remote" });
  await remote
    .getByRole("button", { name: "Revoke device", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window.actions.filter((action) => action.type === "revokeDevice")
        .length === 2
  );
  await page.evaluate(() => window.rotateFixtureIdentity("fixture-new-local"));
  await page
    .locator('.peer-item.active [title="Fixture new authority"]')
    .waitFor();
  const foreignPending = await page.evaluate(() =>
    window.deliver({ kind: "requests" })
  );
  await page.waitForFunction(
    (id) =>
      window.actions.some(
        (action) =>
          action.port?.type === "ack" &&
          action.port.id === id &&
          action.port.status === "declined"
      ),
    foreignPending
  );
  await page.evaluate(() => window.finishRevocation({ ok: true }, false));
  await remote
    .getByRole("button", { name: "Revoke device", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[title="Revoke this device"]').disabled
  );
  assert.equal(await remote.count(), 1);
  await remote
    .getByRole("button", { name: "Revoke device", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window.actions.filter((action) => action.type === "revokeDevice")
        .length === 3
  );
  await page.evaluate(() => {
    window.rotateFixtureIdentity("fixture-newer-local");
    window.finishRevocation(
      { ok: false, error: "old identity failure" },
      false
    );
  });
  await page.waitForFunction(
    () => !document.querySelector('[title="Revoke this device"]').disabled
  );
  assert.equal(
    await page.getByText(/Device revocation could not be confirmed/).count(),
    0
  );
  report.cases.push(
    "foreign identity acknowledgements cannot remove newer authority or attach stale revocation feedback; pending work remains occupied until settlement"
  );

  await page.evaluate(() =>
    window.deliver({ kind: "clip-details", entity: "clip-one" })
  );
  const dialog = page.getByRole("dialog", { name: "Clip details" });
  await dialog.waitFor();
  assert.equal(
    await dialog.locator("pre").textContent(),
    await page.evaluate(() => window.exactContent)
  );
  await page.evaluate(() => (window.copyReplyLost = true));
  await dialog.getByRole("button", { name: "Copy Clip", exact: true }).click();
  await dialog
    .getByText(/Copy result is unconfirmed/)
    .waitFor({ timeout: 3500 });
  assert.equal(
    await dialog.getByText(/clipboard and history were not changed/).count(),
    0
  );
  assert.equal(
    await dialog.getByRole("button", { name: "Retry", exact: true }).count(),
    0
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "Copy Clip", exact: true })
      .isDisabled(),
    true
  );
  assert.equal(await page.evaluate(() => window.completedCopyEffects), 1);
  await page
    .locator('[data-clip-id="copied-event-1"]')
    .waitFor({ state: "attached" });
  const unknownCount = await page.evaluate(
    () => window.actions.filter((action) => action.type === "reuseClip").length
  );
  await dialog.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.evaluate(() => (window.copyReplyLost = false));
  await dialog.getByRole("button", { name: "Copy Clip", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () =>
        window.actions.filter((action) => action.type === "reuseClip").length
    ),
    unknownCount + 1
  );
  report.cases.push(
    "successful Copy with lost callback stays unconfirmed, blocks direct repeat and requires explicit dismissal before a deliberate new Copy"
  );
  await page.evaluate(() => (window.copyFailure = true));
  await dialog.getByRole("button", { name: "Copy Clip", exact: true }).click();
  await dialog.getByText(/Copy result is unconfirmed/).waitFor();
  await dialog.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.evaluate(() => (window.copyFailure = false));
  await dialog.getByRole("button", { name: "Copy Clip", exact: true }).click();
  await dialog.getByRole("button", { name: "Pin Clip", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role="dialog"] [aria-label="Pin Clip"]')
        ?.getAttribute("aria-pressed") === "true"
  );
  await page.evaluate(() => (window.deleteFailure = true));
  await dialog
    .getByRole("button", { name: "Delete Clip", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Retry", exact: true }).waitFor();
  await page.evaluate(() => (window.deleteFailure = false));
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await dialog.getByText("This Clip is no longer available.").waitFor();
  await dialog
    .getByRole("button", { name: "Open History", exact: true })
    .click();
  report.cases.push(
    "exact long details content and Copy/Pin/Delete/action retry/live disappearance"
  );
  await page.getByRole("button", { name: "Devices", exact: true }).click();
  await page
    .getByRole("button", { name: "Rename this device", exact: true })
    .click();
  const nameDialog = page.getByRole("dialog", { name: "Device Name" });
  const input = nameDialog.getByRole("textbox");
  await input.fill("Retained full-page name");
  await nameDialog
    .getByRole("button", { name: "Save Device Name", exact: true })
    .click();
  await nameDialog.getByText(/Save was not confirmed/).waitFor();
  await input.press("Escape");
  await page
    .getByRole("button", { name: "Rename this device", exact: true })
    .click();
  assert.equal(
    await page.getByRole("dialog").getByRole("textbox").inputValue(),
    "Retained full-page name"
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel name edit", exact: true })
    .click();
  report.cases.push(
    "real wrapper failed Device Name draft survives Escape and reopen"
  );
  await page
    .getByRole("button", { name: "Edit Local Device Alias", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("Retained alias");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save Local Device Alias", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText(/Save was not confirmed/)
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel alias edit", exact: true })
    .click();
  report.cases.push("real alias mutation failure");
  await page.evaluate(() => window.deliver({ kind: "pairing" }));
  await page
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Pairing text", exact: true })
    .fill("bad fixture");
  await page
    .getByRole("button", { name: "Submit pairing text", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText(/invalid|not valid/i)
    .waitFor();
  await page.getByRole("textbox", { name: "Pairing text" }).press("Escape");
  await page
    .getByRole("dialog", { name: "Pairing", exact: true })
    .getByRole("button", { name: "Show my QR", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Copy pairing text", exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close QR dialog", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Pairing", exact: true })
    .locator("input[type=file]")
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
  await page
    .getByRole("dialog")
    .getByText(
      "Unable to load this image. Choose another file or paste pairing text."
    )
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Retry import", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText(
      "Unable to load this image. Choose another file or paste pairing text."
    )
    .waitFor();
  await page
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: "Pairing text" }).inputValue(),
    "bad fixture"
  );
  await page
    .getByRole("button", { name: "Discard pairing input", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close Pairing", exact: true })
    .click();
  report.cases.push("Pairing chooser/Paste/QR and suspended failed raw draft");
  await page
    .getByRole("button", { name: /^Requests/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByText("No pending requests.").waitFor();
  report.cases.push("guarded Requests owner action and refreshed list");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page
    .getByLabel("Keep unpinned history", { exact: true })
    .selectOption("604800000");
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: "Advanced", exact: true })
    .click();
  await page.getByLabel("Log level", { exact: true }).selectOption("debug");
  await page
    .getByLabel("Clip Sharing Lifetime", { exact: true })
    .selectOption("3600000");
  report.cases.push(
    "General/Appearance/Clip settings call ordered settings owner"
  );
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await page.getByRole("button", { name: "Add relay", exact: true }).click();
  const relay = page.getByRole("dialog");
  await relay.getByLabel("Name", { exact: true }).fill("Retained relay");
  await relay
    .getByLabel("HTTPS discovery URL", { exact: true })
    .fill("https://relay.example/v1/relay");
  await relay.getByRole("button", { name: "Save", exact: true }).click();
  await relay.getByText(/controlled-relay-save/).waitFor();
  await relay.getByLabel("Name", { exact: true }).press("Escape");
  await page.getByRole("button", { name: "Add relay", exact: true }).click();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByLabel("Name", { exact: true })
      .inputValue(),
    "Retained relay"
  );
  report.cases.push(
    "actual relay bridge error and suspended relay draft, QR image import retry"
  );
  assert.equal(await page.evaluate(() => window.clipboardReads), 0);
  assert.deepEqual(report.errors, []);
  await page.screenshot({ path: join(out, "management.png") });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close relay editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Devices", exact: true }).click();
  await page
    .locator(".peer-item")
    .filter({ hasText: "Remote" })
    .getByRole("button", { name: "Revoke device", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window.actions.filter((action) => action.type === "revokeDevice")
        .length === 4
  );
  await page.evaluate(() => window.managementRoot.unmount());
  const disposedPosts = await page.evaluate(
    () => window.actions.filter((action) => action.port).length
  );
  await page.evaluate(() => window.finishRevocation({ ok: true }, false));
  assert.equal(
    await page.evaluate(
      () => window.actions.filter((action) => action.port).length
    ),
    disposedPosts
  );
  assert.equal(await page.locator("#root").textContent(), "");
  report.cases.push(
    "disposal releases document revocation ownership and ignores late callback UI work"
  );
} catch (e) {
  report.errors.push(String(e));
  throw e;
} finally {
  if (context) await context.close();
  report.closed = true;
  report.hashes = Object.fromEntries(
    await Promise.all(
      [
        "apps/extension/src/ExtensionApp.tsx",
        "packages/ui/src/ClipboardApp.tsx",
        "packages/ui/src/uiSession.ts",
        "apps/extension/src/managementPage.ts",
      ].map(async (p) => [
        p,
        createHash("sha256")
          .update(await readFile(join(root, p)))
          .digest("hex"),
      ])
    )
  );
  await writeFile(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  await rm(profile, { recursive: true, force: true });
}
