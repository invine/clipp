// Source-only owning regression: no browser/SDK/native process or network session.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { build } from "esbuild";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
assert.ok(
  process.argv.length === 3 || process.argv.length === 4,
  "Supply a fresh ignored output directory and optional control case"
);
const selectedCase = process.argv[3] ?? "early-retained-resume";
assert.ok(
  ["early-retained-resume", "late", "empty", "repeated", "fenced"].includes(
    selectedCase
  ),
  "Known source case only"
);
const output = path.resolve(process.argv[2]);
assert.ok(
  output.startsWith(path.join(root, ".local") + path.sep),
  "Output must be author-local ignored evidence"
);
await fs.mkdir(output, { recursive: false });
const platform = path.join(
  root,
  "tests/harness/android-startup-replay/platform.ts"
);
const bundle = path.join(output, "early-resume.mjs");
const inputs = [
  "tests/harness/android-startup-replay.mjs",
  "tests/harness/android-startup-replay/early-resume.ts",
  "tests/harness/android-startup-replay/platform.ts",
  "tests/harness/android-startup-replay/controls.ts",
  "apps/android/src/client.ts",
  "apps/android/src/backgroundContinuity.ts",
  "packages/core/clipboard/service.ts",
  "packages/core/clipboard/captureCoordinator.ts",
  "packages/core/history/indexeddb.ts",
];
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const bindings = Object.fromEntries(
  await Promise.all(
    inputs.map(async (name) => [
      name,
      sha(await fs.readFile(path.join(root, name))),
    ])
  )
);
await build({
  absWorkingDir: root,
  entryPoints: [
    path.join(
      root,
      "tests/harness/android-startup-replay",
      selectedCase === "early-retained-resume"
        ? "early-resume.ts"
        : "controls.ts"
    ),
  ],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  alias: { "@core": path.join(root, "packages/core") },
  plugins: [
    {
      name: "public-external-ports-only",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^(@capacitor\/(core|clipboard|preferences|local-notifications)|libp2p)$/,
          },
          () => ({ path: platform })
        );
      },
    },
  ],
});
const log = await fs.open(path.join(output, "actual.log"), "wx");
const started = Date.now();
const child = spawn(process.execPath, [bundle, selectedCase], {
  cwd: root,
  stdio: ["ignore", log.fd, log.fd],
});
// The child is exact/direct/owned; Node's spawn timeout only reaps that child.
const timeout = setTimeout(() => child.kill("SIGTERM"), 60000);
const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve({ code, signal }));
}).finally(() => clearTimeout(timeout));
await log.close();
const bytes = await fs.readFile(path.join(output, "actual.log"));
await fs.writeFile(
  path.join(output, "receipt.json"),
  JSON.stringify(
    {
      sourceOnly: true,
      case: selectedCase,
      started,
      ended: Date.now(),
      ...result,
      bindings,
      bundleSha256: sha(await fs.readFile(bundle)),
      logSha256: sha(bytes),
      publicBoundaries: [
        "Capacitor plugins",
        "IndexedDB API via fake-indexeddb",
        "libp2p package network refusal",
      ],
      actualProjectComposition:
        "createAndroidRuntime/start, real clipboard/coordinator/History acceptance and publicState",
      nativeAndroidQualified: false,
    },
    null,
    2
  ) + "\n",
  { flag: "wx" }
);
process.stdout.write(bytes);
assert.equal(
  result.signal,
  null,
  "Source fixture timed out or received a signal"
);
assert.equal(
  result.code,
  0,
  "Owning source regression failed; preserve actual.log"
);
