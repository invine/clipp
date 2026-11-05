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
    let notificationAction;
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
      async holdNextNotificationRead() { await chrome.runtime.sendMessage({type:"__fixture_hold_notification_read"}); },
      async releaseNotificationRead(state, index=0) { await chrome.runtime.sendMessage({type:"__fixture_release_notification_read", state, index}); await settle(); },
      async setNotificationState(state) { await chrome.runtime.sendMessage({type:"__fixture_set_notification_state", state}); await settle(); },
      async holdNextSettingsAction() { await chrome.runtime.sendMessage({type:"__fixture_hold_settings_action"}); },
      async releaseSettingsAction(ok) { await chrome.runtime.sendMessage({type:"__fixture_release_settings_action", ok}); await settle(); },
      async waitForHeldNotificationRead(count=1) { for(let i=0;i<80;i++){const value=await chrome.runtime.sendMessage({type:"__fixture_notification_read_held"});if(value.count>=count)return;await new Promise(r=>setTimeout(r,5));}throw new Error("notification_read_not_held"); },
      async waitForHeldSettingsAction() { for(let i=0;i<80;i++){const value=await chrome.runtime.sendMessage({type:"__fixture_settings_action_held"});if(value.held)return;await new Promise(r=>setTimeout(r,5));}const counts=await chrome.runtime.sendMessage({type:"__fixture_notification_counts"});throw new Error("notification_action_not_held:"+JSON.stringify(counts)+":"+JSON.stringify(adapter.getSnapshot().notificationControls)); },
      async failNextSettingsAction() { await chrome.runtime.sendMessage({type:"__fixture_fail_next_settings_action"}); },
      async notificationCounts() { return chrome.runtime.sendMessage({type:"__fixture_notification_counts"}); },
      async notificationAction() {
        const controls = adapter.getSnapshot().notificationControls;
        const first = controls?.openSettings?.();
        const duplicate = controls?.openSettings?.();
        notificationAction = Promise.all([first, duplicate]);
        await settle();
      },
      async waitNotificationAction() { await notificationAction; },
      async refreshNotifications() { return adapter.getSnapshot().notificationControls?.refresh(); },
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
    let holdNotificationReads=0, heldNotificationReplies=[];
    let holdNextSettingsAction=false, heldSettingsReply;
    let failNextSettingsAction=false;
    let notificationState={status:"available"};
    let notificationReadCount=0, settingsActionCount=0;
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
      if(message?.type==="__fixture_hold_notification_read"){holdNotificationReads++;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_release_notification_read"){notificationState=message.state;const reply=heldNotificationReplies.splice(message.index??0,1)[0];reply?.({ok:true,state:notificationState});sendResponse({ok:true});return;}
      if(message?.type==="__fixture_set_notification_state"){notificationState=message.state;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_hold_settings_action"){holdNextSettingsAction=true;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_release_settings_action"){heldSettingsReply?.({ok:message.ok});heldSettingsReply=undefined;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_fail_next_settings_action"){failNextSettingsAction=true;sendResponse({ok:true});return;}
      if(message?.type==="__fixture_notification_read_held"){sendResponse({count:heldNotificationReplies.length});return;}
      if(message?.type==="__fixture_settings_action_held"){sendResponse({held:!!heldSettingsReply});return;}
      if(message?.type==="__fixture_notification_counts"){sendResponse({notificationReadCount,settingsActionCount});return;}
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
        case "getNotificationAvailability":
          notificationReadCount++;
          if(holdNotificationReads>0){holdNotificationReads--;heldNotificationReplies.push(sendResponse);return true;}
          reply={ok:true,state:notificationState};break;
        case "openNotificationSettings":
          settingsActionCount++;
          if(holdNextSettingsAction){holdNextSettingsAction=false;heldSettingsReply=sendResponse;return true;}
          if(failNextSettingsAction){failNextSettingsAction=false;reply={ok:false};break;}
          reply={ok:true};break;
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
      await __adapterHarness.start();
      await __adapterHarness.holdNextSettingsAction();
      await __adapterHarness.notificationAction();
      await __adapterHarness.waitForHeldSettingsAction();
      const readsBefore = (await __adapterHarness.notificationCounts())
        .notificationReadCount;
      await __adapterHarness.holdNextNotificationRead();
      const refresh = __adapterHarness.refreshNotifications();
      await __adapterHarness.waitForHeldNotificationRead();
      await __adapterHarness.releaseNotificationRead({ status: "blocked" });
      await refresh;
      const pendingSnapshot = __adapterHarness.adapter.getSnapshot();
      if (
        pendingSnapshot.notificationControls?.pending !== true ||
        pendingSnapshot.notificationControls?.state?.status !== "blocked"
      )
        throw new Error("passive_refresh_did_not_preserve_pending_action");
      const counts = await __adapterHarness.notificationCounts();
      if (
        counts.settingsActionCount < 1 ||
        counts.notificationReadCount <= readsBefore
      )
        throw new Error("notification_effects_not_translated");
      await __adapterHarness.stop();
      await __adapterHarness.start();
      await __adapterHarness.flush();
      if (
        __adapterHarness.adapter.getSnapshot().notificationControls?.pending !==
        false
      )
        throw new Error("pending_action_survived_restart");
      globalThis.__retiredNotificationSnapshot =
        __adapterHarness.adapter.getSnapshot();
      await __adapterHarness.releaseSettingsAction(
        document.documentElement.dataset.surface === "popup"
      );
      await __adapterHarness.waitNotificationAction();
      if (
        __adapterHarness.adapter.getSnapshot() !==
        globalThis.__retiredNotificationSnapshot
      )
        throw new Error("retired_action_published_into_replacement");
      await __adapterHarness.setNotificationState({ status: "available" });
      await __adapterHarness.refreshNotifications();
      if (
        __adapterHarness.adapter.getSnapshot().notificationControls?.state
          ?.status !== "available"
      )
        throw new Error("current_refresh_missed_retired_native_change");
      await __adapterHarness.holdNextNotificationRead();
      const earlierRead = __adapterHarness.refreshNotifications();
      await __adapterHarness.waitForHeldNotificationRead();
      await __adapterHarness.failNextSettingsAction();
      await __adapterHarness.adapter
        .getSnapshot()
        .notificationControls.openSettings();
      if (!__adapterHarness.adapter.getSnapshot().notificationControls?.error)
        throw new Error("notification_action_error_not_published");
      await __adapterHarness.releaseNotificationRead({ status: "blocked" });
      await earlierRead;
      if (!__adapterHarness.adapter.getSnapshot().notificationControls?.error)
        throw new Error("earlier_read_cleared_notification_action_error");
      await __adapterHarness.holdNextNotificationRead();
      const recoveryRead = __adapterHarness.refreshNotifications();
      await __adapterHarness.waitForHeldNotificationRead();
      await __adapterHarness.releaseNotificationRead({ status: "available" });
      await recoveryRead;
      if (__adapterHarness.adapter.getSnapshot().notificationControls?.error)
        throw new Error("successful_refresh_did_not_clear_notification_error");
      await __adapterHarness.holdNextNotificationRead();
      await __adapterHarness.holdNextNotificationRead();
      const oldestRead = __adapterHarness.refreshNotifications();
      const newestRead = __adapterHarness.refreshNotifications();
      await __adapterHarness.waitForHeldNotificationRead(2);
      await __adapterHarness.releaseNotificationRead({ status: "blocked" }, 1);
      await newestRead;
      await __adapterHarness.releaseNotificationRead(
        { status: "available" },
        0
      );
      await oldestRead;
      if (
        __adapterHarness.adapter.getSnapshot().notificationControls?.state
          ?.status !== "blocked"
      )
        throw new Error("stale_read_overwrote_newer_notification_state");
    });
    report.cases.push("notification-action-generation-and-passive-refresh");
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
