import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "clipp-ui-adapter-chrome-"));
const extension = join(temp, "extension");
const profile = join(temp, "profile");
await mkdir(extension);
const report = {
  browserExtensionContext: false,
  reactMounted: false,
  surfaces: ["popup", "options"],
  cases: [],
  errors: [],
};
let context;
try {
  const entry = `
    import { createExtensionUiAdapter } from ${JSON.stringify(join(root, "apps/extension/src/uiRuntimeAdapter.ts"))};
    import { createUiSession } from ${JSON.stringify(join(root, "packages/ui/src/uiSession.ts"))};
    import { verifyUiRuntimeSnapshotConformance, verifyUiRuntimeLifecycleConformance } from ${JSON.stringify(join(root, "tests/ui/runtimeAdapterConformance.ts"))};
    const focusListeners = new Set();
    const diagnostics = { clipboardReads: 0, received: [] };
    chrome.runtime.onMessage.addListener(message => diagnostics.received.push(message?.type));
    const adapter = createExtensionUiAdapter({
      runtime: chrome.runtime,
      surface: document.documentElement.dataset.surface === "popup" ? "popup" : "page",
      session: createUiSession(),
      clipboard: { async readText() { diagnostics.clipboardReads++; return "fixture clip"; }, async writeText() {} },
      host: { async copyText() {}, confirm() { return true; } },
      focus: { hasFocus: () => true, subscribe(listener) { focusListeners.add(listener); return () => focusListeners.delete(listener); } },
      subscribeReturn: () => () => {},
      poll: () => () => {},
    });
    const settle = async () => { for (let i=0;i<80;i++) await new Promise(r=>setTimeout(r,5)); };
    globalThis.__adapterHarness = {
      adapter, diagnostics, focusListeners,
      async start() { await adapter.start?.(); await settle(); },
      async stop() { await adapter.stop?.(); },
      async publish(message) { await chrome.runtime.sendMessage({type:"__fixture_publish", message}); await settle(); },
      async holdNextRuntimeRead() { await chrome.runtime.sendMessage({type:"__fixture_hold_runtime"}); },
      async releaseRuntimeRead() { await chrome.runtime.sendMessage({type:"__fixture_release_runtime"}); await settle(); },
      async exerciseSnapshot() {
        return verifyUiRuntimeSnapshotConformance({ adapter, afterStart: settle, publishObservation: async () => {
          await chrome.runtime.sendMessage({type:"__fixture_publish", message:{type:"runtimeState", state:{identity:{deviceId:"updated",deviceName:"updated"},devices:[],pending:[],waiting:[],pairingErrors:[],pairingState:{sessionId:"runtime-a",revision:5,waiting:[],errors:[],outcomes:[]},peers:[],peerConnections:[],connectionStateKnown:true}}});
          await settle();
        }});
      },
      async exerciseLifecycle() {
        return verifyUiRuntimeLifecycleConformance({ adapter,
          exerciseAction: async () => { await adapter.actions.onSetAutoSync(true); await settle(); },
          publishRetiredObservation: async () => { await chrome.runtime.sendMessage({type:"__fixture_publish", message:{type:"runtimeState",state:{identity:{deviceId:"retired",deviceName:"retired"},devices:[],pending:[],waiting:[],pairingErrors:[],pairingState:{sessionId:"runtime-a",revision:99,waiting:[],errors:[],outcomes:[]},peers:[],peerConnections:[],connectionStateKnown:true}}}); await settle(); }
        });
      },
      async fireFocus() { for (const listener of [...focusListeners]) listener(); await settle(); },
      async flush() { await settle(); },
    };
  `;
  const bundled = await build({
    stdin: { contents: entry, resolveDir: root, loader: "ts" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "chrome120",
  });
  const script = bundled.outputFiles[0].text;
  await writeFile(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Clipp adapter conformance fixture",
      version: "1.0.0",
      permissions: ["storage"],
      background: { service_worker: "worker.js" },
      action: { default_popup: "popup.html" },
      options_page: "options.html",
    })
  );
  await writeFile(
    join(extension, "worker.js"),
    `
    const settings={sessionId:"settings-a",revision:1,state:{theme:"light",autoSync:false,localRetentionMs:1000,sharingLifetimeMs:2000,logLevel:"info"}};
    const history={sessionId:"history-a",revision:1,clips:[],pinnedIds:[]};
    const state={identity:{deviceId:"local",deviceName:"local"},devices:[],pending:[],waiting:[],pairingErrors:[],pairingState:{sessionId:"runtime-a",revision:1,waiting:[],errors:[],outcomes:[]},peers:[],peerConnections:[],connectionStateKnown:true};
    let holdNextRuntime=false, heldRuntimeReply;
    chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
      if(message?.type==="__fixture_publish"){
        if(message.message?.type==="historyChanged"){
          history.revision=message.message.revision;
          history.clips=[{id:"history-authority-clip",type:"text",content:"history fixture"}];
        }
        chrome.runtime.sendMessage(message.message);sendResponse({ok:true});return;
      }
      if(message?.type==="__fixture_hold_runtime"){holdNextRuntime=true;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_release_runtime"){heldRuntimeReply?.();heldRuntimeReply=undefined;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_runtime_held"){sendResponse({held:!!heldRuntimeReply});return;}
      if(message?.type==="getRuntimeState"&&holdNextRuntime){holdNextRuntime=false;heldRuntimeReply=()=>sendResponse({state:{...state,identity:{deviceId:"stale-popup-read",deviceName:"stale"},pairingState:{...state.pairingState,revision:88}}});return true;}
      let reply={ok:true};
      switch(message?.type){
        case "getRuntimeState": reply={state}; break;
        case "getRuntimeAuthority": reply={sessionId:"runtime-a"}; break;
        case "getInitializationError": reply={error:null}; break;
        case "getClipHistory": reply={ok:true,snapshot:history}; break;
        case "getSettings": reply={ok:true,snapshot:settings}; break;
        case "setSettings": settings.revision++;Object.assign(settings.state,message.settings);reply={status:"confirmed",snapshot:settings};break;
        case "getNotificationAvailability": reply={ok:true,state:{status:"available"}};break;
        case "identityResetRead": reply={ok:true,state:{phase:"idle"}};break;
        case "managementStatus": reply={ok:true,records:[]};break;
        default: reply={ok:true};
      }
      sendResponse(reply);return true;
    });
  `
  );
  for (const [name, surface] of [
    ["popup", "popup"],
    ["options", "options"],
  ]) {
    await writeFile(
      join(extension, `${name}.html`),
      `<!doctype html><html data-surface="${surface}"><head><meta charset="utf-8"></head><body><script src="adapter.js"></script></body></html>`
    );
  }
  await writeFile(join(extension, "adapter.js"), script);
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    timeout: 20000,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  report.browserExtensionContext = true;
  const pageFor = async (name) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/${name}.html`);
    await page.waitForFunction(() => !!globalThis.__adapterHarness);
    return page;
  };

  for (const [name, surface] of [
    ["popup", "popup"],
    ["options", "page"],
  ]) {
    const page = await pageFor(name);
    await page.evaluate(async () => {
      await __adapterHarness.start();
    });
    const snapshotCase = await page.evaluate(async () => {
      const result = await __adapterHarness.exerciseSnapshot();
      return result.current.identity?.deviceId;
    });
    assert.equal(snapshotCase, "updated");
    report.cases.push("common-snapshot-conformance");

    const surfaceData = await page.evaluate(async () => {
      const a = __adapterHarness.adapter;
      await __adapterHarness.flush();
      const initialReads = __adapterHarness.diagnostics.clipboardReads;
      const supportsShare = typeof a.actions.onShareNow === "function";
      await __adapterHarness.fireFocus();
      const readsAfterFocus = __adapterHarness.diagnostics.clipboardReads;
      return {
        supportsShare,
        initialReads,
        readsAfterFocus,
        capabilities: a.capabilities,
      };
    });
    if (surface === "popup") {
      assert.equal(surfaceData.supportsShare, true);
      assert.ok(surfaceData.readsAfterFocus > surfaceData.initialReads);
    } else {
      assert.equal(surfaceData.supportsShare, false);
      assert.equal(surfaceData.readsAfterFocus, surfaceData.initialReads);
    }

    await page.evaluate(async () => {
      await __adapterHarness.stop();
    });
    await page.evaluate(async () => {
      await __adapterHarness.start();
    });
    await page.evaluate(async () => {
      await __adapterHarness.exerciseLifecycle();
    });
    report.cases.push("common-lifecycle-conformance");
    await page.evaluate(async () => {
      await __adapterHarness.stop();
    });
    await page.close();
  }
  report.cases.push("surface-capabilities-and-popup-capture");

  // Keep an options authority alive while retiring a popup with an outstanding read.
  const options = await pageFor("options");
  await options.evaluate(async () => {
    await __adapterHarness.start();
  });
  const popup = await pageFor("popup");
  const stalePublications = await popup.evaluate(async () => {
    let count = 0;
    globalThis.__stalePublicationCount = 0;
    __adapterHarness.adapter.subscribe(() => {
      count++;
      globalThis.__stalePublicationCount = count;
    });
    await __adapterHarness.holdNextRuntimeRead();
    await __adapterHarness.start();
    for (let i = 0; i < 80; i++) {
      const held = await chrome.runtime.sendMessage({
        type: "__fixture_runtime_held",
      });
      if (held.held) {
        count = 0;
        globalThis.__stalePublicationCount = 0;
        return { count, held: true };
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    return { count, held: false };
  });
  assert.equal(
    stalePublications.held,
    true,
    "old popup runtime read must remain outstanding"
  );
  const staleBefore = await popup.evaluate(
    () => __adapterHarness.adapter.getSnapshot().identity?.deviceId
  );
  await popup.evaluate(async () => {
    await __adapterHarness.stop();
  });
  const replacement = await pageFor("popup");
  await replacement.evaluate(async () => {
    await __adapterHarness.start();
  });
  const before = await options.evaluate(
    () => __adapterHarness.adapter.getSnapshot().identity?.deviceId
  );
  await replacement.evaluate(async () => {
    await __adapterHarness.releaseRuntimeRead();
  });
  const after = await options.evaluate(
    () => __adapterHarness.adapter.getSnapshot().identity?.deviceId
  );
  assert.equal(before, after);
  assert.equal(after, "local");
  assert.equal(
    await popup.evaluate(
      () => __adapterHarness.adapter.getSnapshot().identity?.deviceId
    ),
    staleBefore
  );
  assert.equal(
    await popup.evaluate(() => globalThis.__stalePublicationCount),
    0
  );
  report.cases.push(
    "retired-popup-read-does-not-affect-replacement-or-options"
  );

  await options.evaluate(async () => {
    await __adapterHarness.publish({
      type: "settingsState",
      snapshot: {
        sessionId: "settings-a",
        revision: 4,
        state: {
          theme: "dark",
          autoSync: true,
          localRetentionMs: 1000,
          sharingLifetimeMs: 2000,
          logLevel: "info",
        },
      },
    });
  });
  await options.evaluate(async () => {
    await __adapterHarness.publish({
      type: "historyChanged",
      sessionId: "history-a",
      revision: 2,
    });
  });
  await options.waitForFunction(
    () =>
      __adapterHarness.adapter
        .getSnapshot()
        .clips.some((clip) => clip.id === "history-authority-clip"),
    null,
    { timeout: 5000 }
  );
  await options.waitForTimeout(300);
  const independent = await options.evaluate(() => ({
    settings:
      __adapterHarness.adapter.getSnapshot().appearanceSettings?.snapshot,
    clips: __adapterHarness.adapter.getSnapshot().clips,
    historyLoading: __adapterHarness.adapter.getSnapshot().historyLoading,
    received: __adapterHarness.diagnostics.received,
  }));
  assert.equal(independent.settings?.revision, 4, JSON.stringify(independent));
  assert.equal(independent.historyLoading, false, JSON.stringify(independent));
  assert.deepEqual(
    independent.clips.map((clip) => clip.id),
    ["history-authority-clip"]
  );
  assert.equal(independent.settings?.sessionId, "settings-a");
  report.cases.push("settings-and-history-authorities-remain-independent");
  await popup.close();
  await replacement.evaluate(async () => {
    await __adapterHarness.stop();
  });
  await replacement.close();
  await options.evaluate(async () => {
    await __adapterHarness.stop();
  });
  await options.close();
  process.stdout.write(JSON.stringify(report));
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  await rm(temp, { recursive: true, force: true }).catch(() => {});
}
