import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const command = resolve("scripts/prepare-acceptance-candidate.mjs");
const localGitVariables = spawnSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8",
});
assert.equal(localGitVariables.status, 0, localGitVariables.stderr);
const repositoryEnvironment = new Set(
  localGitVariables.stdout.trim().split("\n")
);
const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !repositoryEnvironment.has(name) && !/^GIT_CONFIG_(KEY|VALUE)_/.test(name)
  )
);
function run(bin, args, cwd, environment = {}) {
  return spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: { ...cleanEnvironment, HUSKY: "0", ...environment },
  });
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "clipp-candidate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  mkdirSync(join(source, "apps/electron"), { recursive: true });
  mkdirSync(join(source, "scripts"));
  mkdirSync(join(source, "packages/electron"), { recursive: true });
  writeFileSync(
    join(source, "packages/electron/package.json"),
    JSON.stringify({ name: "electron", version: "43.4.0" })
  );
  writeFileSync(
    join(source, "package.json"),
    JSON.stringify({ private: true, workspaces: ["apps/*", "packages/*"] })
  );
  writeFileSync(
    join(source, "apps/electron/package.json"),
    JSON.stringify({
      name: "clipp-electron",
      version: "1.0.0",
      scripts: {
        build:
          "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/main.cjs','fixture')\"",
      },
    })
  );
  writeFileSync(
    join(source, "scripts/electron-relay-acceptance.mjs"),
    "// fixture runner v1"
  );
  writeFileSync(join(source, "scenario.json"), '{"scenario":"fixture"}');
  writeFileSync(join(source, ".gitignore"), "node_modules\ndist\n");
  const install = run(
    "npm",
    [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    source
  );
  assert.equal(install.status, 0, `fixture npm install: ${install.stderr}`);
  for (const args of [
    ["init"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
  ]) {
    const result = run("git", args, source);
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  }
  const revision = run("git", ["rev-parse", "HEAD"], source).stdout.trim();
  const destination = join(root, "frozen");
  const args = [
    "prepare",
    "--source",
    source,
    "--revision",
    revision,
    "--destination",
    destination,
    "--scenario",
    "fixture",
    "--scenario-input",
    "scenario.json",
  ];
  const invoke = (extra = args) =>
    run(process.execPath, [command, ...extra], source);
  return {
    root,
    source,
    destination,
    invoke,
    args,
    record: `${destination}.candidate.json`,
  };
}

test("prepares a committed isolated Electron build while preserving unrelated dirty work", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, "unrelated.txt"), "owner work");
  writeFileSync(join(f.source, "scenario.json"), "excluded dirty scenario");
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(f.record));
  assert.equal(record.scenario.id, "fixture");
  assert.equal(
    readFileSync(join(f.destination, "apps/electron/dist/main.cjs"), "utf8"),
    "fixture"
  );
  assert.equal(
    readFileSync(join(f.source, "unrelated.txt"), "utf8"),
    "owner work"
  );
  assert.equal(
    readFileSync(join(f.source, "scenario.json"), "utf8"),
    "excluded dirty scenario"
  );
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("records the installed Electron version rather than a declared range", (t) => {
  const f = fixture(t);
  const result = f.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(f.record)).runtimeVersion, "43.4.0");
});

test("rejects dependency links into another worktree including workspace-local dependencies", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const local = join(f.destination, "apps/electron/node_modules");
  mkdirSync(local);
  symlinkSync(f.source, join(local, "foreign"));
  const result = f.invoke(["verify", "--record", f.record]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /wrong-worktree/);
});

test("rejects mutated source, lockfile, artifacts and installed runtime before reuse", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  for (const [name, content, reason] of [
    ["package-lock.json", "{}", /source mutation/],
    ["scenario.json", '{"changed":true}', /source mutation/],
    ["apps/electron/dist/main.cjs", "stale artifact", /candidate artifacts/],
    [
      "packages/electron/package.json",
      '{"name":"electron","version":"0.0.0"}',
      /source mutation/,
    ],
  ]) {
    const target = join(f.destination, name);
    const original = readFileSync(target);
    writeFileSync(target, content);
    const result = f.invoke(["verify", "--record", f.record]);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, reason);
    writeFileSync(target, original);
  }
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("missing declared inputs fail preparation without overwriting source or existing destinations", (t) => {
  const f = fixture(t);
  const args = [...f.args];
  args[args.indexOf("--scenario-input") + 1] = "absent.json";
  const result = f.invoke(args);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing declared build input/);
  assert.notEqual(f.invoke().status, 0);
  assert.equal(
    readFileSync(join(f.source, "scenario.json"), "utf8"),
    '{"scenario":"fixture"}'
  );
});

test("a successor preserves its frozen predecessor and requires affected scenarios", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const args = [...f.args];
  args[args.indexOf("--destination") + 1] = join(f.root, "successor");
  assert.notEqual(f.invoke([...args, "--previous", f.record]).status, 0);
  const result = f.invoke([
    ...args,
    "--previous",
    f.record,
    "--affected",
    "fixture,relay-wss",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const successor = JSON.parse(
    readFileSync(join(f.root, "successor.candidate.json"))
  );
  assert.deepEqual(successor.successor.affectedScenarios, [
    "fixture",
    "relay-wss",
  ]);
  assert.equal(f.invoke(["verify", "--record", f.record]).status, 0);
});

test("rejects a destination whose physical parent aliases the source checkout", (t) => {
  const f = fixture(t);
  symlinkSync(f.source, join(f.root, "alias"));
  const args = [...f.args];
  args[args.indexOf("--destination") + 1] = join(
    f.root,
    "alias",
    "new-candidate"
  );
  const result = f.invoke(args);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside source checkout/);
});

test("a changed preparation runner can create a successor but cannot reuse old evidence", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const nextRunner = join(f.root, "next-runner.mjs");
  writeFileSync(
    nextRunner,
    `${readFileSync(command, "utf8")}\n// successor runner version\n`
  );
  const reuse = run(
    process.execPath,
    [nextRunner, "verify", "--record", f.record],
    f.source
  );
  assert.notEqual(reuse.status, 0);
  const args = [...f.args];
  args[args.indexOf("--destination") + 1] = join(
    f.root,
    "next-runner-candidate"
  );
  const successor = run(
    process.execPath,
    [nextRunner, ...args, "--previous", f.record, "--affected", "fixture"],
    f.source
  );
  assert.equal(successor.status, 0, successor.stderr);
});

test("hook Git context cannot redirect candidate preparation or mutate its parent index", (t) => {
  const parent = fixture(t);
  const f = fixture(t);
  writeFileSync(
    join(parent.source, "parent-work.txt"),
    "preserve hook owner work"
  );
  const index = readFileSync(join(parent.source, ".git/index"));
  const config = readFileSync(join(parent.source, ".git/config"));
  const status = run("git", ["status", "--porcelain"], parent.source).stdout;
  const environment = {
    GIT_DIR: join(parent.source, ".git"),
    GIT_WORK_TREE: parent.source,
    GIT_COMMON_DIR: join(parent.source, ".git"),
    GIT_INDEX_FILE: join(parent.source, ".git/index"),
    GIT_OBJECT_DIRECTORY: join(parent.source, ".git/objects"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(parent.source, ".git/objects"),
    GIT_PREFIX: "unrelated-prefix/",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.bare",
    GIT_CONFIG_VALUE_0: "true",
  };
  const prepared = run(
    process.execPath,
    [command, ...f.args],
    f.source,
    environment
  );
  assert.equal(prepared.status, 0, prepared.stderr);
  const verified = run(
    process.execPath,
    [command, "verify", "--record", f.record],
    f.source,
    environment
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(readFileSync(join(parent.source, ".git/index")), index);
  assert.deepEqual(readFileSync(join(parent.source, ".git/config")), config);
  assert.equal(
    run("git", ["status", "--porcelain"], parent.source).stdout,
    status
  );
  assert.equal(
    readFileSync(join(parent.source, "parent-work.txt"), "utf8"),
    "preserve hook owner work"
  );
});
