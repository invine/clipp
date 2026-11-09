const required = [
  "/dist/main.cjs",
  "/dist/preload.js",
  "/node_modules/@koush/wrtc/package.json",
  "/node_modules/@libp2p/webrtc/package.json",
  "/node_modules/node-datachannel/package.json",
  "/node_modules/better-sqlite3/package.json",
];

export function inspectElectronConfig(manifest, profile) {
  if (
    manifest?.name !== "clipp-electron" ||
    !Array.isArray(manifest.build?.files) ||
    JSON.stringify(manifest.build.files) !==
      JSON.stringify(profile.applicationFiles) ||
    !Array.isArray(manifest.build?.extraResources) ||
    manifest.build.extraResources.length !== 1 ||
    manifest.build.extraResources[0]?.from !== "assets/icons" ||
    manifest.build.extraResources[0]?.to !== "clipp-electron-icons-bundle" ||
    !Array.isArray(manifest.build.extraResources[0]?.filter) ||
    JSON.stringify(manifest.build.extraResources[0].filter) !==
      JSON.stringify(profile.resourceFiles) ||
    JSON.stringify(manifest.build?.mac?.target) !== JSON.stringify(["dmg"]) ||
    manifest.build.mac.identity != null ||
    manifest.build.afterSign != null ||
    manifest.build.sign != null
  )
    throw new Error(
      "Electron package config must retain the production file and resource allowlist"
    );
  return manifest.build;
}

export function inspectElectronInventory(entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error("Electron package inventory is empty");
  const paths = new Set(entries.map((entry) => entry.replaceAll("\\", "/")));
  for (const name of paths) {
    if (!name.startsWith("/") || name.includes("/../") || name.endsWith("/.."))
      throw new Error(`Invalid package entry: ${name}`);
    if (
      /^\/(release|\.scratch|src)(\/|$)/i.test(name) ||
      /\.(dmg|app)(\/|$)/i.test(name)
    )
      throw new Error(
        `Nested installer or source artifact in Electron package: ${name}`
      );
  }
  for (const name of required) {
    if (!paths.has(name))
      throw new Error(`Missing production dependency or bundle: ${name}`);
  }
  if (
    ![...paths].some(
      (name) => name.startsWith("/dist/") && name.endsWith(".html")
    )
  )
    throw new Error("Missing Electron renderer HTML");
  return { files: paths.size };
}
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const within = (root, target) =>
  target === root || target.startsWith(`${root}${path.sep}`);

function bundleInventory(root) {
  const files = {};
  let count = 0;
  let totalBytes = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      if (++count > 50_000)
        fail(
          "electron_inventory_invalid",
          "Electron bundle entry limit exceeded"
        );
      const file = path.join(directory, entry);
      const relative = path.relative(root, file);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) {
        const destination = realpathSync(file);
        if (!within(root, destination))
          fail(
            "electron_inventory_invalid",
            `Bundle link escapes application: ${relative}`
          );
        files[relative] = { link: readlinkSync(file) };
      } else if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        totalBytes += stat.size;
        if (totalBytes > 4 * 1024 ** 3)
          fail(
            "electron_inventory_invalid",
            "Electron bundle byte limit exceeded"
          );
        files[relative] = {
          size: stat.size,
          sha256: sha(readFileSync(file)),
          executable: Boolean(stat.mode & 0o111),
        };
      } else
        fail(
          "electron_inventory_invalid",
          `Unsupported bundle entry: ${relative}`
        );
    }
  };
  walk(root);
  if (!Object.keys(files).length)
    fail("electron_inventory_invalid", "Packaged application is empty");
  return files;
}

export function electronNativeInventory(checkout) {
  return Object.fromEntries(
    [
      "@koush/wrtc",
      "better-sqlite3",
      "node-datachannel",
      "@node-datachannel/darwin-arm64",
    ].map((name) => {
      const root = path.join(checkout, "node_modules", name);
      if (!existsSync(root) || !lstatSync(root).isDirectory())
        fail(
          "prerequisite_unavailable",
          `Native Electron dependency is missing: ${name}`
        );
      return [name, sha(JSON.stringify(bundleInventory(root)))];
    })
  );
}

function distInventory(root) {
  const files = {};
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const file = path.join(directory, entry);
      const stat = lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile())
        files[path.relative(root, file)] = {
          size: stat.size,
          sha256: sha(readFileSync(file)),
        };
      else
        fail(
          "electron_artifact_invalid",
          "Copied production output contains a non-file entry"
        );
    }
  };
  walk(root);
  return files;
}

function artifact(file, runRoot, kind) {
  const absolute = path.resolve(file);
  if (!within(runRoot, absolute) || !lstatSync(absolute).isFile())
    fail("electron_artifact_invalid", `Invalid ${kind} artifact`);
  const size = statSync(absolute).size;
  return {
    kind,
    path: path.relative(runRoot, absolute),
    size,
    sha256: sha(readFileSync(absolute)),
  };
}

export function verifyElectronReceipt(run, receipt, runRoot) {
  if (
    !receipt ||
    receipt.source !== run.source.commit ||
    receipt.arch !== process.arch
  )
    fail(
      "electron_artifact_changed",
      "Electron receipt is incompatible with this candidate"
    );
  for (const item of [receipt.dmg, receipt.asar]) {
    const file = path.resolve(runRoot, item?.path || "");
    if (
      !within(runRoot, file) ||
      !existsSync(file) ||
      !lstatSync(file).isFile() ||
      statSync(file).size !== item.size ||
      sha(readFileSync(file)) !== item.sha256
    )
      fail(
        "electron_artifact_changed",
        `Electron ${item?.kind || "artifact"} differs from receipt`
      );
  }
  const app = path.resolve(runRoot, receipt.app?.path || "");
  if (
    !within(runRoot, app) ||
    !existsSync(app) ||
    !lstatSync(app).isDirectory() ||
    sha(JSON.stringify(bundleInventory(app))) !== receipt.app.sha256
  )
    fail(
      "electron_artifact_changed",
      "Packaged Electron application differs from receipt"
    );
}

function packageLocations(output) {
  const apps = [];
  const dmgs = [];
  for (const entry of readdirSync(output)) {
    const full = path.join(output, entry);
    if (entry.endsWith(".dmg") && lstatSync(full).isFile()) dmgs.push(full);
    else if (entry.startsWith("mac-") && lstatSync(full).isDirectory()) {
      for (const child of readdirSync(full)) {
        if (child.endsWith(".app")) apps.push(path.join(full, child));
      }
    }
  }
  if (apps.length !== 1 || dmgs.length !== 1)
    fail(
      "electron_artifact_invalid",
      "Electron builder must produce one app and one DMG"
    );
  return { app: apps[0], dmg: dmgs[0] };
}

function resourceHashes(checkout, app, config) {
  const source = path.join(checkout, "apps/electron");
  const resources = path.join(
    app,
    "Contents/Resources/clipp-electron-icons-bundle"
  );
  const expected = config.extraResources[0].filter;
  const actual = readdirSync(resources).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
    fail(
      "electron_inventory_invalid",
      "Packaged resource inventory differs from declared allowlist"
    );
  return Object.fromEntries(
    expected.map((name) => {
      const original = path.join(source, "assets/icons", name);
      const packaged = path.join(resources, name);
      const digest = sha(readFileSync(original));
      if (digest !== sha(readFileSync(packaged)))
        fail(
          "electron_inventory_invalid",
          `Packaged resource differs from source: ${name}`
        );
      return [name, digest];
    })
  );
}

export async function packageElectron({ plan, run, file, execute, save }) {
  const target = run.targets["electron-package"];
  if (!target) return;
  const runRoot = path.dirname(file);
  const checkout = run.checkout;
  if (!run.nativeDependencyInventory)
    fail(
      "prerequisite_unavailable",
      "Native Electron dependency inventory is unavailable"
    );
  if (
    JSON.stringify(electronNativeInventory(checkout)) !==
    JSON.stringify(run.nativeDependencyInventory)
  )
    fail(
      "electron_artifact_changed",
      "Native Electron dependency bytes changed after common verification"
    );
  if (target.state === "complete") {
    verifyElectronReceipt(run, target.receipt, runRoot);
    return;
  }
  const manifest = JSON.parse(
    readFileSync(path.join(checkout, "apps/electron/package.json"), "utf8")
  );
  const config = inspectElectronConfig(manifest, plan.profile.electronPackage);
  if (process.platform !== "darwin" || process.arch !== "arm64")
    fail(
      "prerequisite_unavailable",
      "Electron packaging requires declared macOS arm64 host"
    );
  if (
    process.env.ELECTRON_SKIP_BINARY_DOWNLOAD ||
    process.env.npm_config_ignore_scripts ||
    process.env.SKIP_NATIVE_BINARY_DOWNLOAD
  )
    fail(
      "prerequisite_unavailable",
      "Native Electron packaging cannot use CI native-binary skips"
    );
  if (manifest.devDependencies?.electron !== plan.profile.toolchain.electron)
    fail(
      "prerequisite_unavailable",
      "Candidate Electron version differs from the pinned native toolchain"
    );
  const builder = plan.profile.toolchain.electronBuilder;
  const asarVersion = plan.profile.toolchain.electronAsar;
  if (!/^\d+\.\d+\.\d+$/.test(builder) || !/^\d+\.\d+\.\d+$/.test(asarVersion))
    fail("invalid_profile", "Electron packaging tools are not pinned");
  const npx = (pkg, bin, args = []) => [
    "exec",
    "--yes",
    `--package=${pkg}`,
    "--",
    bin,
    ...args,
  ];
  // Builder rebuilds native dependencies. Package from a copy so the verified
  // candidate and its production output hashes remain reusable on resume.
  // macOS's own temporary directory is within builder's trusted path roots.
  const safeRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), "clipp-delivery-electron-"))
  );
  const packageInput = path.join(safeRoot, "checkout");
  target.packageInput = packageInput;
  target.state = "running";
  target.updatedAt = new Date().toISOString();
  save();
  await execute(
    "cp",
    ["-cR", checkout, packageInput],
    runRoot,
    {},
    300_000,
    "electron-package-input"
  );
  if (
    JSON.stringify(
      distInventory(path.join(packageInput, "apps/electron/dist"))
    ) !== JSON.stringify(run.artifacts.electron)
  )
    fail(
      "electron_artifact_changed",
      "Copied Electron build differs from verified candidate"
    );
  if (
    sha(
      readFileSync(path.join(packageInput, "node_modules/.package-lock.json"))
    ) !== run.installationSha256
  )
    fail(
      "electron_artifact_changed",
      "Copied dependency installation differs from verified candidate"
    );
  const require = createRequire(
    path.join(packageInput, "apps/electron/package.json")
  );
  const installedVersion = JSON.parse(
    readFileSync(require.resolve("electron/package.json"), "utf8")
  ).version;
  if (installedVersion !== plan.profile.toolchain.electron)
    fail(
      "prerequisite_unavailable",
      "Installed Electron version differs from frozen profile"
    );
  await execute(
    process.execPath,
    [require.resolve("electron/install.js")],
    packageInput,
    {},
    300_000,
    "electron-native-provision"
  );
  let electronBinary;
  try {
    electronBinary = require("electron");
  } catch {
    fail(
      "prerequisite_unavailable",
      "Candidate Electron binary is unavailable"
    );
  }
  if (
    typeof electronBinary !== "string" ||
    !within(packageInput, realpathSync(electronBinary))
  )
    fail(
      "prerequisite_unavailable",
      "Candidate Electron binary is outside owned package input"
    );
  let versionLog;
  try {
    versionLog = await execute(
      "npm",
      npx(`electron-builder@${builder}`, "electron-builder", ["--version"]),
      packageInput,
      {},
      120_000,
      "electron-builder-version"
    );
  } catch {
    fail("prerequisite_unavailable", "Pinned electron-builder is unavailable");
  }
  if (readFileSync(versionLog, "utf8").trim().split("\n").at(-1) !== builder)
    fail(
      "prerequisite_unavailable",
      "Installed electron-builder version differs from frozen profile"
    );
  const stage = path.join(runRoot, `electron-stage-${randomUUID()}`);
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  target.stage = path.relative(runRoot, stage);
  target.updatedAt = new Date().toISOString();
  save();
  await execute(
    "npm",
    npx(`electron-builder@${builder}`, "electron-builder", [
      "--projectDir",
      "apps/electron",
      "--mac",
      "dmg",
      `--config.directories.output=${stage}`,
    ]),
    packageInput,
    {
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith("CSC_"))
          .map((name) => [name, undefined])
      ),
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
    },
    1_800_000,
    "electron-dmg-package"
  );
  const { app, dmg } = packageLocations(stage);
  const asar = path.join(app, "Contents/Resources/app.asar");
  if (!existsSync(asar))
    fail("electron_artifact_invalid", "Packaged app.asar is missing");
  const asarLog = await execute(
    "npm",
    npx(`@electron/asar@${asarVersion}`, "asar", ["list", asar]),
    packageInput,
    {},
    120_000,
    "electron-asar-list"
  );
  const entries = readFileSync(asarLog, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("/"));
  const archive = inspectElectronInventory(entries);
  const resourceDigests = resourceHashes(checkout, app, config);
  const signatureLog = await execute(
    "codesign",
    ["-dv", "--verbose=2", app],
    packageInput,
    {},
    120_000,
    "electron-signing-state"
  );
  const signature = readFileSync(signatureLog, "utf8");
  if (
    !/Signature=adhoc/.test(signature) ||
    !/TeamIdentifier=not set/.test(signature)
  )
    fail(
      "electron_signing_unexpected",
      "Electron app does not have the declared unsigned local signing state"
    );
  await execute(
    "hdiutil",
    ["verify", dmg],
    packageInput,
    {},
    120_000,
    "electron-dmg-integrity"
  );
  await execute(
    electronBinary,
    [
      path.join(packageInput, "tests/harness/electron-packaged-webrtc.cjs"),
      asar,
    ],
    packageInput,
    { ELECTRON_RUN_AS_NODE: "1" },
    120_000,
    "electron-native-webrtc"
  );
  await execute(
    process.execPath,
    [
      path.join(packageInput, "tests/harness/electron-quit.mjs"),
      path.join(asar, "dist/main.cjs"),
      electronBinary,
    ],
    packageInput,
    {},
    120_000,
    "electron-quit"
  );
  const inventory = bundleInventory(app);
  const receipt = {
    schema: 1,
    source: run.source.commit,
    tree: run.source.tree,
    buildIdentity: sha(
      JSON.stringify({
        source: run.source,
        profile: run.profileSha256,
        application: inventory,
      })
    ),
    arch: process.arch,
    version: manifest.version,
    signing: "unsigned-local",
    appSignature: "adhoc",
    dmgSignature: "not-signed",
    toolchain: {
      electron: plan.profile.toolchain.electron,
      electronBuilder: builder,
      electronAsar: asarVersion,
    },
    asarInventory: archive,
    resources: resourceDigests,
    dmg: artifact(dmg, runRoot, "dmg"),
    asar: artifact(asar, runRoot, "asar"),
    app: {
      kind: "app",
      path: path.relative(runRoot, app),
      files: Object.keys(inventory).length,
      sha256: sha(JSON.stringify(inventory)),
    },
    verifiedAt: new Date().toISOString(),
  };
  target.state = "complete";
  target.receipt = receipt;
  target.nextAction = null;
  rmSync(safeRoot, { recursive: true, force: true });
  target.packageInputCleanup = "passed";
  target.updatedAt = new Date().toISOString();
  save();
}
