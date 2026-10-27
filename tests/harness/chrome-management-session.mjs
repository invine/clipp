import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
await build({
  stdin: {
    resolveDir: repo,
    loader: "tsx",
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ExtensionApp}from'./apps/extension/src/ExtensionApp';import'./packages/ui/src/styles.css';import'./packages/ui/src/host.css';import'./apps/extension/src/options-host.css';import'./apps/extension/src/management-host.css';createRoot(document.getElementById('root')).render(<ExtensionApp surface="page"/>);`,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  loader: { ".png": "dataurl" },
  outfile: join(out, "consumer.js"),
});
const report = {
  native: false,
  seam: "actual ExtensionApp + ClipboardApp + UiSession + TaskDialog; Chrome runtime and clipboard boundary in memory",
  cases: [],
  errors: [],
};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(3000);
page.on("pageerror", (e) => report.errors.push(e.message));
await page.route("**/*", (route) => route.abort());
try {
  await page.setContent('<!doctype html><div id="root"></div>');
  await page.addScriptTag({
    content: `
window.fixture={messages:[],posts:[],reads:0,writes:[],rename:'reject',pairingReady:false};
const f=window.fixture, listeners=new Set();
f.content='first line\\n'+'unbroken'.repeat(150)+'\\nlast line';
f.history={sessionId:'worker',revision:0,clips:[{id:'clip',type:'text',content:f.content,originPeerId:'remote',capturedAt:Date.now(),shareExpiresAt:Date.now()+86400000}],pinnedIds:[]};
f.settings={sessionId:'worker',revision:0,state:{theme:'system',autoSync:true,localRetentionMs:2592000000,sharingLifetimeMs:86400000,logLevel:'info'}};
f.state={identity:{deviceId:'local',deviceName:'Desktop'},devices:[{deviceId:'remote',deviceName:'Remote',localAlias:'Desk'}],pending:[{deviceId:'request',deviceName:'Incoming',requestVersion:'request-1'}],waiting:[],pairingErrors:[],managedRelayConfigurations:[],managedRelayStates:[],peers:[],peerConnections:[]};
f.publish=()=>listeners.forEach(l=>l({type:'runtimeState',state:structuredClone(f.state)}));
f.ready=()=>{f.state.pairingState={sessionId:'worker',revision:0,outcomes:[],waiting:[],errors:[]};f.publish()};
f.historyChanged=()=>{f.history.revision++;listeners.forEach(l=>l({type:'historyState',snapshot:structuredClone(f.history)}))};
f.deliver=handoff=>f.portMessage({type:'destination',handoff});
Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{f.reads++;return ''},writeText:async text=>{f.writes.push(text)}}});
window.chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)},connect:()=>({postMessage:v=>f.posts.push(v),disconnect:()=>{},onMessage:{addListener:l=>f.portMessage=l},onDisconnect:{addListener:l=>f.portDisconnect=l}}),sendMessage:(message,callback)=>{f.messages.push(message);let reply;
switch(message.type){
case 'managementStatus':reply={ok:true,records:[]};break;
case 'getRuntimeAuthority':reply={sessionId:'worker'};break;
case 'getRuntimeState':reply={state:structuredClone(f.state)};break;
case 'getInitializationError':reply={error:null};break;
case 'getClipHistory':reply={ok:true,snapshot:structuredClone(f.history)};break;
case 'getSettings':reply={ok:true,snapshot:structuredClone(f.settings)};break;
case 'updateSettings':case 'setSettings':f.settings={...f.settings,revision:f.settings.revision+1,state:{...f.settings.state,...message.settings}};reply={status:'applied',snapshot:structuredClone(f.settings)};break;
case 'getConnectedPeers':reply={peers:[],peerConnections:[]};break;
case 'getTrustedDevices':reply={devices:structuredClone(f.state.devices)};break;
case 'getPendingRequests':if(f.deferPending){const old=structuredClone(f.state.pending);f.releasePending=()=>callback(old);return;}reply=structuredClone(f.state.pending);break;
case 'reuseClip':reply={ok:true,outcome:f.copyUnconfirmed?'unconfirmed':'complete'};break;
case 'setPin':f.history.pinnedIds=message.pinned?[message.id]:[];reply={ok:true};break;
case 'deleteClip':f.history.clips=f.history.clips.filter(c=>c.id!==message.id);reply={ok:true};break;
case 'clearHistory':f.history.clips=[];f.history.pinnedIds=[];reply={ok:true};break;
case 'respondTrust':if(f.deferDecision){f.finishDecision=()=>callback({ok:false,error:'outcome_unconfirmed',admitted:null});return;}reply={ok:false,error:'cleanup_failed',admitted:message.accept};break;
case 'pairDevice':reply={ok:false,error:'invalid_pairing_target'};break;
case 'getPairingTarget':reply={text:'fixture pairing text'};break;
case 'renameLocalIdentity':if(f.rename==='defer'){f.completeRename=()=>{f.state.identity.deviceName=message.name;callback({ok:true,identity:structuredClone(f.state.identity)})};return;}reply={ok:false,error:'rename_outcome_unconfirmed'};break;
case 'renameDevice':reply={ok:false,error:'rename_outcome_unconfirmed'};break;
case 'managedRelayRefresh':reply={ok:true,configurations:[]};break;
case 'managedRelayMutate':reply={ok:true,result:{status:'rejected',configurationApplied:false,credentialsRemoved:[],configurations:[],error:'fixture-relay-failure'}};break;
default:reply={ok:false,error:'fixture unsupported '+message.type};}
queueMicrotask(()=>callback?.(reply));}}};`,
  });
  await page.addStyleTag({ path: join(out, "consumer.css") });
  await page.addScriptTag({ path: join(out, "consumer.js") });
  const nav = page.getByRole("navigation", { name: "Clipp destinations" });
  await nav.waitFor();
  await page.waitForFunction(() => fixture.posts.length > 0);
  assert.equal(await page.evaluate(() => fixture.reads), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Share current clipboard now" })
      .count(),
    0
  );
  await page.evaluate(() =>
    fixture.deliver({
      id: "details",
      destination: { kind: "clip-details", entity: "clip" },
    })
  );
  assert.equal(
    await page
      .getByRole("dialog", { name: "Clip details", exact: true })
      .count(),
    0
  );
  await page.evaluate(() => fixture.ready());
  const details = page.getByRole("dialog", {
    name: "Clip details",
    exact: true,
  });
  await details.waitFor();
  assert.equal(
    await details.locator("pre").textContent(),
    await page.evaluate(() => fixture.content)
  );
  await details.getByRole("button", { name: "Copy Clip", exact: true }).click();
  await page.waitForFunction(() =>
    fixture.messages.some((m) => m.type === "reuseClip" && m.id === "clip")
  );
  await details.getByRole("button", { name: "Pin Clip", exact: true }).click();
  await details
    .getByRole("button", { name: "Unpin Clip", exact: true })
    .waitFor();
  await details
    .getByRole("button", { name: "Delete Clip", exact: true })
    .click();
  await details
    .getByText("This Clip is no longer available.", { exact: true })
    .waitFor();
  await details
    .getByRole("button", { name: "Open History", exact: true })
    .click();
  report.cases.push(
    "authority waits for Pairing state; real full-page no capture/Send; entire details content and Copy/Pin/Delete/live removal"
  );
  await nav.getByRole("button", { name: "Devices", exact: true }).click();
  await page
    .getByRole("button", { name: "Rename this device", exact: true })
    .click();
  let name = page.getByRole("dialog", { name: "Device Name", exact: true });
  await name.getByLabel("Device Name", { exact: true }).fill("retained edit");
  await name
    .getByRole("button", { name: "Save Device Name", exact: true })
    .click();
  await name.getByText(/Save result could not be confirmed/).waitFor();
  await page.keyboard.press("Escape");
  await name.waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Rename this device", exact: true })
    .click();
  name = page.getByRole("dialog", { name: "Device Name", exact: true });
  assert.equal(
    await name.getByLabel("Device Name", { exact: true }).inputValue(),
    "retained edit"
  );
  await page.evaluate(() => (fixture.rename = "defer"));
  await name
    .getByRole("button", { name: "Save Device Name", exact: true })
    .click();
  await name
    .getByRole("button", { name: "Close name editor", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rename this device", exact: true })
    .click();
  await name.getByLabel("Device Name", { exact: true }).fill("newer edit");
  await page.evaluate(() => fixture.completeRename());
  await name
    .getByRole("button", { name: "Save Device Name", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    await name.getByLabel("Device Name", { exact: true }).inputValue(),
    "newer edit"
  );
  await page.keyboard.press("Escape");
  report.cases.push(
    "actual name editor failed/reopen/Close pending/newer typing survives late Save"
  );
  await nav.getByRole("button", { name: /^Requests/ }).click();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByText(/admitted.*cleanup|cleanup.*admitted/i).waitFor();
  report.cases.push(
    "actual guarded Requests approval reports admitted-but-cleanup failure"
  );
  await page.evaluate(() => (fixture.deferDecision = true));
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.evaluate(() => {
    fixture.state.identity = { deviceId: "rotated", deviceName: "Rotated" };
    fixture.state.pairingState.revision++;
    fixture.publish();
  });
  await nav.getByRole("button", { name: "Devices", exact: true }).click();
  await page.locator('.peer-item.active [title="Rotated"]').waitFor();
  await page.evaluate(() => fixture.finishDecision());
  await nav.getByRole("button", { name: /^Requests/ }).click();
  await page.getByRole("button", { name: "Accept", exact: true }).waitFor();
  assert.equal(
    await page
      .getByText(/Device admitted locally, but request cleanup failed/)
      .count(),
    0
  );
  assert.equal(await page.getByText(/Decision outcome unconfirmed/).count(), 0);
  report.cases.push(
    "Identity Rotation drops old approval feedback and ignores late decision results"
  );
  await nav.getByRole("button", { name: "Devices", exact: true }).click();
  await page
    .getByRole("button", { name: "Pair this device", exact: true })
    .click();
  const pairing = page.getByRole("dialog", { name: "Pairing", exact: true });
  await pairing
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  const paste = page.getByRole("dialog", {
    name: "Paste pairing text",
    exact: true,
  });
  await paste
    .getByLabel("Pairing text", { exact: true })
    .fill("retained invalid pairing");
  await paste
    .getByRole("button", { name: "Submit pairing text", exact: true })
    .click();
  await page.waitForFunction(() =>
    fixture.messages.some((m) => m.type === "pairDevice")
  );
  await page.keyboard.press("Escape");
  await pairing.waitFor();
  await pairing
    .getByRole("button", { name: "Paste QR/Text from Clipboard", exact: true })
    .click();
  await pairing
    .getByText("Clipboard is empty. Paste pairing text instead.", {
      exact: true,
    })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Pair this device", exact: true })
    .click();
  await pairing
    .getByText("Clipboard is empty. Paste pairing text instead.", {
      exact: true,
    })
    .waitFor();
  await pairing
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  assert.equal(
    await paste.getByLabel("Pairing text", { exact: true }).inputValue(),
    "retained invalid pairing"
  );
  await page.evaluate(() => {
    document.activeElement.blur();
    fixture.deliver({
      id: "matching-pairing",
      destination: { kind: "pairing" },
    });
  });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Pairing text"
  );
  assert.equal(
    await paste.getByLabel("Pairing text", { exact: true }).inputValue(),
    "retained invalid pairing"
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  report.cases.push(
    "Pairing chooser/Paste/DOM Escape parent and retained invalid text/import failure after reopening; matching destination focuses retained subtask"
  );
  await page
    .getByRole("button", { name: "Pair this device", exact: true })
    .click();
  await pairing
    .getByRole("button", { name: "Discard pairing input", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rename this device", exact: true })
    .click();
  await name
    .getByRole("button", { name: "Cancel name edit", exact: true })
    .click();
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.waitForFunction(() => fixture.settings.state.theme === "dark");
  await page
    .getByLabel("Keep unpinned history", { exact: true })
    .selectOption("604800000");
  await page.waitForFunction(
    () => fixture.settings.state.localRetentionMs === 604800000
  );
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: "Advanced", exact: true })
    .click();
  await page
    .getByLabel("Clip Sharing Lifetime", { exact: true })
    .selectOption("3600000");
  await page.waitForFunction(
    () => fixture.settings.state.sharingLifetimeMs === 3600000
  );
  report.cases.push(
    "actual full-page Appearance/Clip validated preference owner"
  );
  await nav.getByRole("button", { name: "Devices", exact: true }).click();
  await page
    .getByRole("button", { name: "Pair this device", exact: true })
    .click();
  await pairing
    .getByRole("button", { name: "Paste pairing text", exact: true })
    .click();
  await paste
    .getByLabel("Pairing text", { exact: true })
    .fill("former identity target");
  await page.evaluate(() => (fixture.deferPending = true));
  await paste
    .getByRole("button", { name: "Submit pairing text", exact: true })
    .click();
  await paste
    .getByText("Invalid pairing payload. Edit the text and try again.", {
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => {
    fixture.state.identity = {
      deviceId: "rotated-again",
      deviceName: "Newest identity",
    };
    fixture.state.pending = [];
    fixture.state.pairingState.revision++;
    fixture.publish();
  });
  await page.locator('.peer-item.active [title="Newest identity"]').waitFor();
  await page.evaluate(() => fixture.releasePending?.());
  await nav.getByRole("button", { name: /^Requests/ }).click();
  await page.getByText("No pending requests.", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Accept", exact: true }).count(),
    0
  );
  report.cases.push(
    "late former-identity Pairing refresh cannot republish a stale Request after ordered live authority"
  );
  for (const size of [
    { width: 320, height: 600 },
    { width: 600, height: 320 },
    { width: 1100, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%")
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
  }
  report.cases.push(
    "full-page 320px/narrow short/wide 200% renderer text has no document horizontal overflow (fixture only)"
  );
  assert.deepEqual(report.errors, []);
  await page.screenshot({ path: join(out, "final.png") });
} catch (error) {
  report.failure = error.message;
  await page.screenshot({ path: join(out, "failure.png") });
  throw error;
} finally {
  await browser.close();
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
