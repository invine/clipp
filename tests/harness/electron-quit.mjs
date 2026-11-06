import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";

// Build Electron first. Optional arguments select a packaged main and executable.
// Exercise the real before-quit handler and the transport's own native dependency.
// The wrapper isolates the profile and replaces OS clipboard access before startup.
const require = createRequire(import.meta.url);
const main = path.resolve(process.argv[2] ?? "apps/electron/dist/main.cjs");
const executablePath = process.argv[3] ?? require("electron");
const profile = await mkdtemp(path.join(tmpdir(), "clipp-quit-"));
const wrapper = path.join(profile, "main.cjs");
await writeFile(
  wrapper,
  `const { app, clipboard, dialog } = require("electron");
dialog.showErrorBox = (title, message) => {
  console.error(title, message);
  app.exit(1);
};
const { createRequire } = require("node:module");
const main = ${JSON.stringify(main)};
app.setPath("userData", ${JSON.stringify(profile)});
clipboard.readText = () => "";
clipboard.writeText = () => {};
const transportRequire = createRequire(createRequire(main).resolve("@libp2p/webrtc"));
globalThis.createQuitChannel = () => {
  const { RTCPeerConnection } = transportRequire("node-datachannel/polyfill");
  const connection = new RTCPeerConnection({ iceServers: [] });
  globalThis.quitChannel = connection.createDataChannel("clipp-quit-regression");
  connection.close();
};
require(main);
`
);
let child;
let deadline;
try {
  const instance = await electron.launch({
    executablePath,
    args: [wrapper],
    timeout: 15_000,
  });
  child = instance.process();
  child.stdout.resume();
  child.stderr.resume();
  const exited = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal }))
  );
  await instance.firstWindow();
  // Let transport startup finish before exercising final application shutdown.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await instance.evaluate(() => globalThis.createQuitChannel());
  await instance.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 0);
  });
  const result = await Promise.race([
    exited,
    new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error("Electron remains alive 5 seconds after Quit")),
        5000
      );
    }),
  ]);
  assert.deepEqual(result, { code: 0, signal: null });
  console.log(
    "PASS: Electron exits normally after closing a native WebRTC data channel"
  );
} finally {
  clearTimeout(deadline);
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
