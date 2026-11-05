/* eslint-disable @typescript-eslint/no-var-requires -- Runs in Electron's Node mode. */
// Run with ELECTRON_RUN_AS_NODE=1 <packaged Electron executable> <this script> <app.asar>.
// This imports from the packaged main's context, without starting Clipp or opening a profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { findPackageJSON } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

async function main() {
  assert.ok(process.versions.electron, "Run this probe with Electron");
  assert.ok(process.argv[2], "Supply the packaged app.asar path");
  const appRoot = fs.realpathSync(process.argv[2]);
  const mainPath = path.join(appRoot, "dist/main.cjs");
  assert.ok(fs.existsSync(mainPath), "Packaged main bundle must exist");

  function packageImport(specifier, parent = mainPath) {
    const manifest = findPackageJSON(specifier, pathToFileURL(parent));
    assert.ok(manifest, `Missing packaged dependency: ${specifier}`);
    const relative = path.relative(appRoot, manifest);
    assert.ok(
      relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative),
      `${specifier} must load from the package, not the workspace`
    );
    return vm.compileFunction("return import(specifier)", ["specifier"], {
      filename: parent,
      importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    })(specifier);
  }

  const transport = await packageImport("@libp2p/webrtc");
  assert.equal(typeof transport.webRTC, "function");
  assert.equal(typeof transport.webRTCDirect, "function");
  console.log("PASS: packaged WebRTC transport factories load");

  // Resolve the native dependency from the transport's own dependency tree.
  const transportManifest = findPackageJSON(
    "@libp2p/webrtc",
    pathToFileURL(mainPath)
  );
  const native = await packageImport("node-datachannel", transportManifest);
  const { RTCPeerConnection } = await packageImport(
    "node-datachannel/polyfill",
    transportManifest
  );
  const connection = new RTCPeerConnection({ iceServers: [] });
  try {
    connection.createDataChannel("clipp-package-probe");
    console.log("PASS: packaged native WebRTC data channel constructs");
  } finally {
    connection.close();
    native.cleanup();
  }
}

main().catch((error) => {
  console.error("FAIL: packaged WebRTC runtime", error.code || error.message);
  process.exitCode = 1;
});
