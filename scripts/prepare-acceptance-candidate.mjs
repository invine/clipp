#!/usr/bin/env node
// Frozen build preparation; native loading and interaction belong to runtime acceptance.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import {
  resolve,
  relative,
  join,
  isAbsolute,
  dirname,
  basename,
} from "node:path";
import { fileURLToPath } from "node:url";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const scriptHash = digest(readFileSync(fileURLToPath(import.meta.url)));
let isolatedEnvironment;
function childEnvironment() {
  if (isolatedEnvironment) return isolatedEnvironment;
  // Hooks export Git's repository selectors. Explicit cwd is insufficient while
  // they remain set, and even npm lifecycle scripts can inherit those selectors.
  const names = spawnSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
  });
  if (names.error || names.status !== 0)
    throw new Error("cannot isolate Git repository environment");
  const local = new Set(names.stdout.trim().split("\n"));
  isolatedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !local.has(name) && !/^GIT_CONFIG_(KEY|VALUE)_/.test(name)
    )
  );
  return isolatedEnvironment;
}
function run(bin, args, cwd, quiet = true) {
  const result = spawnSync(bin, args, {
    cwd,
    env: childEnvironment(),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${bin} ${args[0]} failed${result.stderr ? `: ${result.stderr.slice(-2000)}` : ""}`
    );
  return result.stdout?.trim() ?? "";
}
function within(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function file(root, name) {
  const target = resolve(root, name);
  if (
    !within(root, target) ||
    !within(root, realpathSync(target)) ||
    !lstatSync(target).isFile()
  )
    throw new Error(`input must be a regular candidate file: ${name}`);
  return target;
}
function tracked(root) {
  const paths = run("git", ["ls-files", "-z"], root)
    .split("\0")
    .filter(Boolean);
  if (paths.length > 20_000) throw new Error("candidate input limit exceeded");
  return Object.fromEntries(
    paths.sort().map((name) => [name, digest(readFileSync(file(root, name)))])
  );
}
function tree(root, name, linksOnly = false) {
  const base = resolve(root, name);
  if (!within(root, realpathSync(base)))
    throw new Error(`wrong-worktree resolution: ${name}`);
  const hashes = {};
  let count = 0;
  function visit(dir) {
    for (const entry of readdirSync(dir).sort()) {
      if (++count > 150_000) throw new Error("candidate tree limit exceeded");
      const target = join(dir, entry);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        if (!within(root, realpathSync(target)))
          throw new Error(
            `wrong-worktree resolution: ${relative(root, target)}`
          );
        if (!linksOnly) throw new Error("artifact symlinks are unsupported");
      } else if (stat.isDirectory()) visit(target);
      else if (!linksOnly)
        hashes[relative(base, target)] = digest(readFileSync(target));
    }
  }
  visit(base);
  if (!linksOnly && !Object.keys(hashes).length)
    throw new Error("missing built artifacts");
  return hashes;
}
function clean(root, revision) {
  if (
    run("git", ["rev-parse", "HEAD"], root) !== revision ||
    run("git", ["status", "--porcelain", "--untracked-files=all"], root)
  )
    throw new Error("candidate source mutation");
}
function same(a, b, reason) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(reason);
}
function dependencies(root) {
  tree(root, "node_modules", true);
  const lock = JSON.parse(readFileSync(file(root, "package-lock.json")));
  for (const [name, entry] of Object.entries(lock.packages ?? {})) {
    if (!entry.link) continue;
    const actual = realpathSync(resolve(root, name));
    const expected = resolve(root, entry.resolved);
    if (!within(root, actual) || actual !== expected)
      throw new Error(`wrong-worktree workspace resolution: ${name}`);
    const nested = join(entry.resolved, "node_modules");
    if (existsSync(resolve(root, nested))) tree(root, nested, true);
  }
}
function electronVersion(root) {
  const resolved = createRequire(
    join(root, "apps/electron/package.json")
  ).resolve("electron/package.json");
  if (!within(root, realpathSync(resolved)))
    throw new Error("wrong-worktree Electron resolution");
  return JSON.parse(readFileSync(resolved)).version;
}
function verify(record, reuse = true) {
  if (
    record.version !== 1 ||
    record.runtime !== "electron" ||
    !record.source?.revision ||
    !record.inputs ||
    !record.artifacts ||
    !record.scenario?.id
  )
    throw new Error("invalid candidate record");
  if (reuse)
    same(record.preparer, scriptHash, "candidate preparation runner changed");
  const root = realpathSync(record.source.checkout);
  same(root, record.source.checkout, "candidate checkout relocated");
  clean(root, record.source.revision);
  same(tracked(root), record.inputs, "candidate build inputs changed");
  if (reuse)
    same(
      {
        node: process.version,
        npm: run("npm", ["--version"], root),
        platform: process.platform,
        arch: process.arch,
      },
      record.toolchain,
      "candidate toolchain changed"
    );
  dependencies(root);
  same(
    electronVersion(root),
    record.runtimeVersion,
    "installed Electron version changed"
  );
  same(
    digest(readFileSync(file(root, "node_modules/.package-lock.json"))),
    record.installation,
    "candidate dependency installation changed"
  );
  same(
    tree(root, "apps/electron/dist"),
    record.artifacts,
    "stale or changed candidate artifacts"
  );
  return record;
}
function parse(argv) {
  const [mode, ...args] = argv;
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !args[i].startsWith("--") ||
      !args[i + 1] ||
      Object.hasOwn(options, args[i].slice(2))
    )
      throw new Error("expected unique --option value pairs");
    options[args[i].slice(2)] = args[i + 1];
  }
  return { mode, options };
}
try {
  const { mode, options: o } = parse(process.argv.slice(2));
  if (mode === "verify") {
    if (!o.record || Object.keys(o).length !== 1)
      throw new Error("verify requires --record");
    const record = verify(JSON.parse(readFileSync(o.record)));
    console.log(
      JSON.stringify({
        verified: true,
        revision: record.source.revision,
        artifact: digest(JSON.stringify(record.artifacts)),
        runtime: "electron",
      })
    );
  } else if (mode === "prepare") {
    for (const name of [
      "source",
      "revision",
      "destination",
      "scenario",
      "scenario-input",
    ])
      if (!o[name]) throw new Error(`missing --${name}`);
    for (const name of Object.keys(o))
      if (
        ![
          "source",
          "revision",
          "destination",
          "scenario",
          "scenario-input",
          "previous",
          "affected",
        ].includes(name)
      )
        throw new Error(`unknown option: ${name}`);
    const [major, minor, patch] = process.versions.node.split(".").map(Number);
    if (
      major < 22 ||
      (major === 22 && (minor < 22 || (minor === 22 && patch < 1)))
    )
      throw new Error("Node >=22.22.1 required");
    const source = realpathSync(o.source);
    same(
      run("git", ["rev-parse", "--show-toplevel"], source),
      source,
      "source must be repository root"
    );
    const revision = run(
      "git",
      ["rev-parse", "--verify", `${o.revision}^{commit}`],
      source
    );
    let destination = join(
      realpathSync(dirname(resolve(o.destination))),
      basename(resolve(o.destination))
    );
    const recordPath = `${destination}.candidate.json`;
    if (
      within(source, destination) ||
      existsSync(destination) ||
      existsSync(recordPath)
    )
      throw new Error("destination must be new and outside source checkout");
    let successor;
    if (o.previous || o.affected) {
      if (!o.previous || !o.affected?.split(",").every((item) => item.trim()))
        throw new Error(
          "successor requires --previous and --affected scenario IDs"
        );
      const previous = verify(JSON.parse(readFileSync(o.previous)), false);
      successor = {
        recordHash: digest(readFileSync(o.previous)),
        revision: previous.source.revision,
        affectedScenarios: o.affected.split(","),
      };
    }
    run("git", ["clone", "--no-local", "--no-checkout", source, destination]);
    destination = realpathSync(destination);
    run("git", ["checkout", "--detach", revision], destination);
    clean(destination, revision);
    const inputs = tracked(destination);
    for (const name of [
      "package.json",
      "package-lock.json",
      "apps/electron/package.json",
      "scripts/electron-relay-acceptance.mjs",
      o["scenario-input"],
    ])
      if (!Object.hasOwn(inputs, name))
        throw new Error(`missing declared build input: ${name}`);
    const toolchain = {
      node: process.version,
      npm: run("npm", ["--version"], destination),
      platform: process.platform,
      arch: process.arch,
    };
    // npm owns installation and native lifecycle scripts; do not share dependencies.
    run("npm", ["ci", "--no-audit", "--no-fund"], destination, false);
    dependencies(destination);
    run(
      "npm",
      ["--workspace", "apps/electron", "run", "build"],
      destination,
      false
    );
    clean(destination, revision);
    same(tracked(destination), inputs, "build mutated candidate inputs");
    const record = {
      version: 1,
      runtime: "electron",
      source: { revision, checkout: realpathSync(destination) },
      inputs,
      toolchain,
      preparer: scriptHash,
      scenario: {
        id: o.scenario,
        input: o["scenario-input"],
        runner: "scripts/electron-relay-acceptance.mjs",
      },
      installation: digest(
        readFileSync(file(destination, "node_modules/.package-lock.json"))
      ),
      runtimeVersion: electronVersion(destination),
      artifacts: tree(destination, "apps/electron/dist"),
      ...(successor ? { successor } : {}),
    };
    verify(record);
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        prepared: true,
        record: recordPath,
        revision,
        artifact: digest(JSON.stringify(record.artifacts)),
      })
    );
  } else
    throw new Error(
      "usage: prepare-acceptance-candidate.mjs prepare|verify --option value"
    );
} catch (error) {
  console.error(`candidate preparation failed: ${error.message}`);
  process.exitCode = 1;
}
