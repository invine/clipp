import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// SOURCE only: actual task/activation consumer, synthetic external host focus edge.
// A child document permits real blur/hasFocus changes in headless Chromium.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
await build({
  stdin: {
    resolveDir: repo,
    loader: "tsx",
    contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {ClipboardApp} from '${repo}/packages/ui/src/ClipboardApp';
      import {createUiSession} from '${repo}/packages/ui/src/uiSession';
      import {bindElectronHostTaskInput} from '${repo}/apps/electron/src/hostTaskInput';
      import '${repo}/packages/ui/src/styles.css';
      import '${repo}/packages/ui/src/host.css';
      const session=createUiSession();
      let activation;
      window.disposeSourceActivation=bindElectronHostTaskInput({
        onTaskActivation(listener){activation=listener;return()=>{activation=undefined}},
        setTaskInputReady:async()=>{},
      },session,undefined,'source-focus-owner');
      window.sourceActivation=()=>activation?.();
      window.sourceReplaceTask=()=>{session.back();session.open({kind:'pairing',origin:'pairing-start'})};
      createRoot(document.getElementById('root')).render(<ClipboardApp
        session={session} clips={[]} devices={[]} pending={[]} peers={[]} pinnedIds={[]}
        identity={{deviceId:'source-local',deviceName:'Synthetic local'}}
        onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({ok:true,admitted:true})}
        onReject={async()=>({ok:true,admitted:false})} onPairText={async()=>({ok:false,error:'invalid_input'})}
        onRequestPairingCode={async()=>({text:'synthetic code'})} onCopyPairingText={async()=>{throw Error('clipboard_forbidden')}}
        onReuseClip={()=>'complete'} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={async()=>{}}
        onRenameIdentity={async()=>{throw Error('unexpected_source_save')}} />);
    `,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  loader: { ".png": "dataurl" },
  outfile: join(out, "consumer.js"),
});
const profile = await mkdtemp(join(tmpdir(), "clipp-electron-focus-source-"));
const report = {
  nativeHost: false,
  seam: "real ClipboardApp/UiSession/TaskDialog + default Electron activation binder; actual child document blur and first-control keyboard return",
  network: "all requests blocked",
  clipboard: "forbidden before actual source",
  cases: [],
  errors: [],
  hashes: {},
  closed: false,
};
for (const path of [
  "apps/electron/src/hostTaskInput.ts",
  "packages/ui/src/sessionFocus.ts",
  "packages/ui/src/TaskDialog.tsx",
  "packages/ui/src/ClipboardApp.tsx",
  "packages/ui/src/uiSession.ts",
  "tests/harness/electron-task-focus.mjs",
])
  report.hashes[path] = createHash("sha256")
    .update(await readFile(join(repo, path)))
    .digest("hex");
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 760, height: 780 },
  });
  await context.route("**/*", (request) => request.abort());
  for (const name of [
    "editor",
    "intentional-Close",
    "intentional-Save",
    "consume-once",
    "newer-keyboard",
    "newer-pointer",
    "disabled",
    "disappeared",
    "task-replacement",
    "disposed",
  ]) {
    const page = await context.newPage();
    page.setDefaultTimeout(3500);
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.setContent(
      '<button id="host-boundary">Synthetic host focus boundary</button><iframe title="Source app" style="width:720px;height:700px"></iframe>'
    );
    const frame = page.frames()[1];
    await frame.setContent('<!doctype html><div id="root"></div>');
    await frame.addScriptTag({
      content:
        "Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{throw Error('clipboard_forbidden')},writeText:async()=>{throw Error('clipboard_forbidden')}}})",
    });
    await frame.addStyleTag({ path: join(out, "consumer.css") });
    await frame.addScriptTag({ path: join(out, "consumer.js") });
    await frame
      .getByRole("navigation", { name: "Clipp destinations" })
      .getByRole("button", { name: /^Devices/ })
      .click();
    await frame
      .getByRole("button", { name: "Rename this device", exact: true })
      .click();
    const task = frame.getByRole("dialog", {
      name: "Device Name",
      exact: true,
    });
    const field = task.getByRole("textbox", {
      name: "Device Name",
      exact: true,
    });
    const close = task.getByRole("button", {
      name: "Close name editor",
      exact: true,
    });
    const save = task.getByRole("button", {
      name: "Save Device Name",
      exact: true,
    });
    await field.fill("native-return");
    await field.press("Home");
    await field.press("ArrowRight");
    await field.press("Shift+ArrowRight");
    if (["intentional-Close", "newer-keyboard", "newer-pointer"].includes(name))
      await page.keyboard.press("Shift+Tab");
    if (name === "intentional-Save") await page.keyboard.press("Tab");
    const snapshot = () =>
      frame.evaluate(() => {
        const active = document.activeElement,
          input = document.querySelector('input[aria-label="Device Name"]');
        return {
          documentFocused: document.hasFocus(),
          active:
            active.getAttribute("aria-label") ||
            active.textContent.trim().slice(0, 100),
          raw: input?.value,
          selection: input ? [input.selectionStart, input.selectionEnd] : null,
        };
      });
    const before = await snapshot();
    assert.equal(before.documentFocused, true);
    await page.locator("#host-boundary").click();
    await frame.waitForFunction(() => !document.hasFocus());
    const blurred = await snapshot();
    if (name === "disabled")
      await field.evaluate((element) => {
        element.disabled = true;
      });
    if (name === "disappeared")
      await field.evaluate((element) => element.remove());
    if (name === "task-replacement") {
      await frame.evaluate(() => window.sourceReplaceTask());
      await frame
        .getByRole("dialog", { name: "Pairing", exact: true })
        .waitFor();
    }
    if (name === "disposed")
      await frame.evaluate(() => window.disposeSourceActivation());
    // Some controlled DOM changes legitimately recover focus already. Return the
    // synthetic host focus before genuine first-control keyboard entry.
    await page.locator("#host-boundary").click();
    await frame.waitForFunction(() => !document.hasFocus());
    await page.keyboard.press("Tab");
    await frame.waitForFunction(() => document.hasFocus());
    const firstControl = await snapshot();
    if (name === "newer-keyboard") {
      await page.keyboard.press("Tab");
      await field.press("End");
      await field.press("x");
    }
    if (name === "newer-pointer") await field.click();
    await frame.evaluate(() => window.sourceActivation());
    const after = await snapshot();
    report.cases.push({ name, before, blurred, firstControl, after });
    const expected = ["disabled", "disappeared", "disposed"].includes(name)
      ? close
      : name === "task-replacement"
        ? frame.getByRole("button", { name: "Close Pairing", exact: true })
        : name === "intentional-Close"
          ? close
          : name === "intentional-Save"
            ? save
            : field;
    assert.equal(
      await expected.evaluate((element) => element === document.activeElement),
      true,
      `${name}: meaningful retained/current task target`
    );
    if (name === "editor" || name === "consume-once")
      assert.deepEqual(after.selection, before.selection);
    if (name === "newer-keyboard") assert.equal(after.raw, "native-returnx");
    if (name === "consume-once") {
      // Platform-controlled focus change with no new user input: a consumed
      // intent must not be reused by a duplicate activation.
      await close.focus();
      await frame.evaluate(() => window.sourceActivation());
      assert.equal(
        await close.evaluate((element) => element === document.activeElement),
        true
      );
    }
    await page.close();
  }
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
