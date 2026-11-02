import { build } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
// Focused source regression only: no native app, operator profile or clipboard.
// Build with the actual Android Vite config and default production transport;
// retain real browser WebRTC, cryptography, canvas and dependency implementations.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const out = await mkdtemp(
  join(repo, ".local", "network-webview-compatibility-")
);
await writeFile(
  join(out, "entry.js"),
  `
import {createLibp2pMessagingTransport} from '${repo}/packages/core/network/engine.ts';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {encodePairingTarget,decodePairingTarget} from '${repo}/packages/core/pairing/v2.ts';
import {createPairingCode} from '${repo}/packages/core/pairing/qrCode.ts';
window.runCompatibility = async()=>{
 const privateKey=await generateKeyPair('Ed25519');
 const peerId=peerIdFromPrivateKey(privateKey);
 const transport=createLibp2pMessagingTransport({privateKey,peerId,relayAddresses:[],enableWebRTCDirect:true,enableDCUtR:true,enableRelayReservations:false,allowInsecureBrowserDials:true});
 try {
  await transport.start();
  const record=await transport.getSignedPeerRecord();
  const text=encodePairingTarget({targetPeerId:peerId.toString(),signedPeerRecord:record,deviceNameHint:'Source Android'});
  const code=await createPairingCode(text);
  return {recordBytes:record.byteLength,image:code.image?.slice(0,30),validTarget:!!decodePairingTarget(code.text),peerMatches:decodePairingTarget(code.text)?.targetPeerId===peerId.toString()};
 } finally {await transport.stop();}
};`
);
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await build({
    configFile: join(repo, "apps/android/vite.config.ts"),
    build: {
      outDir: join(out, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: join(out, "entry.js"),
        output: { entryFileNames: "entry.js" },
      },
    },
    logLevel: "warn",
  });
  const context = await browser.newContext({ permissions: [] });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://clipp-compat.invalid") return route.abort();
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body><script type="module" src="/entry.js"></script></body></html>',
      });
    return route.fulfill({
      contentType: "text/javascript",
      body: await readFile(join(out, "dist", url.pathname.slice(1))),
    });
  });
  await context.addInitScript(() => {
    Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(String.prototype, "at", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(AbortSignal, "any", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(Object, "hasOwn", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(Array.prototype, "at", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "structuredClone", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => {
          throw Error("source fixture forbids host clipboard");
        },
        writeText: () => {
          throw Error("source fixture forbids host clipboard");
        },
      },
      configurable: true,
    });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("console", msg.text());
  });
  await page.goto("https://clipp-compat.invalid");
  await page.waitForFunction(
    () => typeof window.runCompatibility === "function"
  );
  const result = await page.evaluate(() => window.runCompatibility());
  const capabilities = await page.evaluate(() => ({
    randomUUID: typeof crypto.randomUUID,
    arrayAt: typeof Array.prototype.at,
    stringAt: typeof String.prototype.at,
    objectHasOwn: typeof Object.hasOwn,
    structuredClone: typeof structuredClone,
    abortTimeout: typeof AbortSignal.timeout,
    abortAny: typeof AbortSignal.any,
    abortThrow: typeof AbortSignal.prototype.throwIfAborted,
    getRandomValues: typeof crypto.getRandomValues,
  }));
  for (const key of [
    "randomUUID",
    "arrayAt",
    "stringAt",
    "objectHasOwn",
    "structuredClone",
    "abortTimeout",
    "abortAny",
  ])
    assert.equal(capabilities[key], "undefined");
  assert.equal(capabilities.abortThrow, "function");
  assert.equal(capabilities.getRandomValues, "function");
  assert.deepEqual(
    pageErrors,
    [],
    "real network initialization must not leave unhandled failures"
  );
  assert.ok(result.recordBytes > 0);
  assert.ok(result.image?.startsWith("data:image/png"));
  assert.ok(result.validTarget && result.peerMatches);
  console.log(
    JSON.stringify({
      sourceOnly: true,
      browserDefaultTransport: true,
      capabilities,
      ...result,
    })
  );
} finally {
  await browser?.close();
  await rm(out, { recursive: true, force: true });
}
