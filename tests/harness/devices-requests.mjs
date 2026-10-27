import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "clipp-devices-requests-"));
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ClipboardApp}from'${repo}/packages/ui/src/ClipboardApp';window.fixture={calls:[],fail:true,holdNext:false};function Fixture(){const[devices,setDevices]=useState([{deviceId:'12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv',deviceName:'Reported device name',displayName:'Local alias',localAlias:'Local alias'}]);window.fixture.getDevices=()=>devices;return <ClipboardApp clips={[]} devices={devices} pending={[{deviceId:'pending-peer',deviceName:'Waiting device',requestVersion:'v1'}]} peers={[]} connectionStateKnown={false} pinnedIds={[]} identity={{deviceId:'local',deviceName:'This installation'}} onDeleteClip={()=>{}} onUnpair={()=>{}} onAccept={async()=>({status:'accepted'})} onReject={async()=>({status:'rejected'})} onPairText={async()=>({status:'invalid-input'})} onCopyPairingText={async()=>({status:'copied'})} onRequestPairingCode={async()=>({text:'fixture'})} onReuseClip={()=>'complete'} onShareNow={()=>{}} onSetPinned={()=>{}} onClearAll={()=>{}} onRenameDevice={async(id,name)=>{window.fixture.calls.push({id,name});if(window.fixture.holdNext){window.fixture.holdNext=false;return new Promise(resolve=>{window.fixture.resolveClear=()=>{setDevices(old=>old.map(device=>device.deviceId===id?{...device,displayName:name||device.deviceName,localAlias:name||undefined}:device));resolve({deviceId:id,deviceName:'Reported device name',displayName:name||'Reported device name',localAlias:name||undefined})}})}if(window.fixture.fail)throw new Error('fixture_clear_failed');setDevices(old=>old.map(device=>device.deviceId===id?{...device,displayName:name||device.deviceName,localAlias:name||undefined}:device));return {deviceId:id,deviceName:'Reported device name',displayName:name||'Reported device name',localAlias:name||undefined}}}/>};createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: repo,
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  format: "iife",
  outfile: `${out}/devices-requests.js`,
  target: ["chrome91"],
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.setContent('<div id="root"></div>');
  for (const css of ["packages/ui/src/styles.css", "packages/ui/src/host.css"])
    await page.addStyleTag({
      content: await readFile(`${repo}/${css}`, "utf8"),
    });
  await page.addScriptTag({ path: `${out}/devices-requests.js` });
  await page.getByRole("button", { name: /^Devices/ }).click();
  await page
    .getByRole("button", { name: "Edit Local Device Alias", exact: true })
    .click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value) => (window.fixture.copied = value) },
    });
  });
  await page.getByRole("button", { name: "Copy Peer ID", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.fixture.copied),
    "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv"
  );
  const alias = page.getByRole("textbox", { name: "Local Device Alias" });
  await alias.fill("Keep alias on failure");
  await page
    .getByRole("button", { name: "Use device name", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Alias Save was not confirmed" })
    .waitFor();
  assert.equal(await alias.inputValue(), "Keep alias on failure");
  await page.evaluate(() => {
    window.fixture.fail = false;
  });
  await page
    .getByRole("button", { name: "Use device name", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Local Device Alias"]') === null
  );
  assert.deepEqual(
    await page.evaluate(() => window.fixture.calls),
    [
      { id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv", name: "" },
      { id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv", name: "" },
    ],
    "Use device name clears only the local alias through the existing alias action"
  );
  await page
    .getByRole("button", { name: "Edit Local Device Alias", exact: true })
    .click();
  await alias.fill("Submitted before clear");
  await page.evaluate(() => {
    window.fixture.holdNext = true;
  });
  await page
    .getByRole("button", { name: "Use device name", exact: true })
    .click();
  await page.waitForFunction(
    () => typeof window.fixture.resolveClear === "function"
  );
  await alias.fill("Newer alias typed while clear is pending");
  await page.evaluate(() => window.fixture.resolveClear());
  await page.waitForFunction(() => {
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save Local Device Alias"
    );
    return Boolean(save && !save.disabled);
  });
  assert.equal(
    await alias.inputValue(),
    "Newer alias typed while clear is pending"
  );
  await page
    .getByRole("button", { name: "Save Local Device Alias", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Local Device Alias"]') === null
  );
  assert.deepEqual(
    await page.evaluate(() => window.fixture.calls.slice(-2)),
    [
      { id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv", name: "" },
      {
        id: "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv",
        name: "Newer alias typed while clear is pending",
      },
    ],
    "a later Save applies the newer alias draft after the clear completes"
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const device = window.fixture.getDevices()[0];
      return { deviceName: device.deviceName, displayName: device.displayName };
    }),
    {
      deviceName: "Reported device name",
      displayName: "Newer alias typed while clear is pending",
    },
    "saving the newer alias leaves the reported Device Name unchanged"
  );
  await page.getByRole("button", { name: /^Devices/ }).click();
  assert.equal(
    await page.getByText("Trusted Devices", { exact: true }).count(),
    1
  );
  assert.equal(await page.getByText("This device", { exact: true }).count(), 1);
  assert.equal(
    await page.getByText("Connection status unknown", { exact: true }).count(),
    1
  );
  await page.getByRole("button", { name: /^Requests/ }).click();
  await page.getByText("Waiting device", { exact: true }).waitFor();
} finally {
  await browser.close();
}
