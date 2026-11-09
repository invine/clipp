import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  electronNativeInventory,
  inspectElectronConfig,
  inspectElectronInventory,
  packageElectron,
  verifyElectronReceipt,
} from "../../scripts/delivery/electron.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const profile = JSON.parse(
  readFileSync(
    new URL("../../scripts/delivery/profiles/v1.json", import.meta.url),
    "utf8"
  )
);
const manifest = JSON.parse(
  readFileSync(
    new URL("../../apps/electron/package.json", import.meta.url),
    "utf8"
  )
);

const valid = [
  "/dist/main.cjs",
  "/dist/preload.js",
  "/dist/index.html",
  "/node_modules/@koush/wrtc/package.json",
  "/node_modules/@libp2p/webrtc/package.json",
  "/node_modules/node-datachannel/package.json",
  "/node_modules/better-sqlite3/package.json",
  "/node_modules/@libp2p/webrtc/src/index.js",
];

test("Electron package inventory accepts only the selected application and production dependencies", () => {
  assert.doesNotThrow(() => inspectElectronInventory(valid));
  assert.throws(
    () => inspectElectronInventory([...valid, "/release/Old Clipp.dmg"]),
    /nested installer/i
  );
  assert.throws(
    () =>
      inspectElectronInventory(
        valid.filter((name) => !name.includes("node-datachannel"))
      ),
    /node-datachannel/i
  );
});

test("a changed DMG or packaged app cannot reuse an Electron receipt", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "clipp-electron-receipt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "Clipp.app");
  mkdirSync(path.join(app, "Contents/Resources"), { recursive: true });
  writeFileSync(path.join(app, "Contents/Resources/app.asar"), "asar");
  writeFileSync(path.join(root, "Clipp.dmg"), "dmg");
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  const receipt = {
    source: "a".repeat(40),
    arch: process.arch,
    dmg: { kind: "dmg", path: "Clipp.dmg", size: 3, sha256: sha("dmg") },
    asar: {
      kind: "asar",
      path: "Clipp.app/Contents/Resources/app.asar",
      size: 4,
      sha256: sha("asar"),
    },
    app: {
      path: "Clipp.app",
      sha256: sha(
        JSON.stringify({
          "Contents/Resources/app.asar": {
            size: 4,
            sha256: sha("asar"),
            executable: false,
          },
        })
      ),
    },
  };
  const run = { source: { commit: receipt.source } };
  assert.doesNotThrow(() => verifyElectronReceipt(run, receipt, root));
  writeFileSync(path.join(root, "Clipp.dmg"), "tampered");
  assert.throws(
    () => verifyElectronReceipt(run, receipt, root),
    /differs from receipt/
  );
  writeFileSync(path.join(root, "Clipp.dmg"), "dmg");
  writeFileSync(path.join(app, "Contents/Resources/app.asar"), "tampered");
  assert.throws(
    () => verifyElectronReceipt(run, receipt, root),
    /differs from receipt/
  );
});

test("Electron package config retains the fixed application and tray resource selections", () => {
  assert.doesNotThrow(() =>
    inspectElectronConfig(manifest, profile.electronPackage)
  );
  const changed = structuredClone(manifest);
  changed.build.extraResources[0].filter.push("old-release.dmg");
  assert.throws(
    () => inspectElectronConfig(changed, profile.electronPackage),
    /allowlist/i
  );
  const signed = structuredClone(manifest);
  signed.build.mac.identity = "Developer ID Application";
  assert.throws(
    () => inspectElectronConfig(signed, profile.electronPackage),
    /allowlist/i
  );
});

function packageFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "clipp-electron-adapter-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, "checkout");
  const electron = path.join(checkout, "node_modules/electron");
  mkdirSync(path.join(checkout, "apps/electron/dist"), { recursive: true });
  mkdirSync(path.join(electron, "dist"), { recursive: true });
  writeFileSync(
    path.join(checkout, "apps/electron/package.json"),
    JSON.stringify(manifest)
  );
  writeFileSync(path.join(checkout, "apps/electron/dist/main.cjs"), "verified");
  writeFileSync(path.join(checkout, "node_modules/.package-lock.json"), "{}");
  writeFileSync(
    path.join(electron, "package.json"),
    JSON.stringify({
      name: "electron",
      version: profile.toolchain.electron,
      main: "index.js",
    })
  );
  writeFileSync(
    path.join(electron, "index.js"),
    'module.exports = require("node:path").join(__dirname, "dist/Electron");'
  );
  writeFileSync(path.join(electron, "install.js"), "");
  writeFileSync(path.join(electron, "dist/Electron"), "binary");
  for (const name of [
    "@koush/wrtc",
    "better-sqlite3",
    "node-datachannel",
    "@node-datachannel/darwin-arm64",
  ]) {
    const directory = path.join(checkout, "node_modules", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "native.bin"), "original");
  }
  const run = {
    checkout,
    source: { commit: "a".repeat(40) },
    artifacts: {
      electron: {
        "main.cjs": {
          size: 8,
          sha256: createHash("sha256").update("verified").digest("hex"),
        },
      },
    },
    installationSha256: createHash("sha256").update("{}").digest("hex"),
    nativeDependencyInventory: electronNativeInventory(checkout),
    targets: { "electron-package": { state: "pending" } },
  };
  return {
    root,
    checkout,
    run,
    native: path.join(checkout, "node_modules/better-sqlite3/native.bin"),
  };
}

test(
  "Electron packaging rejects native bytes changed after common verification",
  { skip: process.platform !== "darwin" || process.arch !== "arm64" },
  async (t) => {
    const f = packageFixture(t);
    writeFileSync(f.native, "modified");
    await assert.rejects(
      packageElectron({
        plan: { profile },
        run: f.run,
        file: path.join(f.root, "run.json"),
        execute: () => {
          throw new Error("unexpected command");
        },
        save: () => {},
      }),
      /Native Electron dependency bytes changed/
    );
    assert.equal(f.run.targets["electron-package"].packageInput, undefined);
    f.run.targets["electron-package"].state = "complete";
    await assert.rejects(
      packageElectron({
        plan: { profile },
        run: f.run,
        file: path.join(f.root, "run.json"),
        execute: () => {
          throw new Error("unexpected command");
        },
        save: () => {},
      }),
      /Native Electron dependency bytes changed/
    );
  }
);

test(
  "failed native package work changes only its owned copy",
  { skip: process.platform !== "darwin" || process.arch !== "arm64" },
  async (t) => {
    const f = packageFixture(t);
    const log = path.join(f.root, "version.log");
    writeFileSync(log, `${profile.toolchain.electronBuilder}\n`);
    const execute = async (bin, args) => {
      if (bin === "cp") {
        const result = spawnSync(bin, args);
        assert.equal(result.status, 0, result.stderr?.toString());
        return log;
      }
      if (bin === "npm" && args.includes("--version")) return log;
      if (bin === "npm") {
        writeFileSync(
          path.join(
            f.run.targets["electron-package"].packageInput,
            "node_modules/better-sqlite3/native.bin"
          ),
          "rebuilt"
        );
        throw new Error("synthetic builder failure");
      }
      return log;
    };
    await assert.rejects(
      packageElectron({
        plan: { profile },
        run: f.run,
        file: path.join(f.root, "run.json"),
        execute,
        save: () => {},
      }),
      /synthetic builder failure/
    );
    assert.equal(readFileSync(f.native, "utf8"), "original");
    rmSync(path.dirname(f.run.targets["electron-package"].packageInput), {
      recursive: true,
      force: true,
    });
  }
);
