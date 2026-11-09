import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const tool = path.resolve("scripts/delivery.mjs");
function command(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "clipp-delivery-plan-"));
  const remote = path.join(root, "remote.git");
  const repo = path.join(root, "repo");
  const store = path.join(root, "store");
  command("git", ["init", "--bare", remote], root);
  command("git", ["init", "-b", "main", repo], root);
  command("git", ["config", "user.email", "fixture@example.test"], repo);
  command("git", ["config", "user.name", "Fixture"], repo);
  mkdirSync(path.join(repo, "apps", "electron"), { recursive: true });
  mkdirSync(path.join(repo, "apps", "android"), { recursive: true });
  mkdirSync(path.join(repo, "apps", "extension"), { recursive: true });
  writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ workspaces: ["apps/*", "packages/*"] })
  );
  writeFileSync(path.join(repo, "package-lock.json"), "fixture-lock\n");
  writeFileSync(
    path.join(repo, "apps", "electron", "package.json"),
    '{"version":"1.2.3"}'
  );
  writeFileSync(
    path.join(repo, "apps", "android", "package.json"),
    '{"version":"1.2.3"}'
  );
  writeFileSync(
    path.join(repo, "apps", "extension", "package.json"),
    '{"version":"1.2.3"}'
  );
  command("git", ["add", "."], repo);
  command("git", ["commit", "-m", "first"], repo);
  const first = command("git", ["rev-parse", "HEAD"], repo);
  command("git", ["remote", "add", "origin", remote], repo);
  command("git", ["push", "-u", "origin", "main"], repo);
  const config = path.join(root, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      schema: 1,
      runRoot: store,
      destinations: { electronInstallPath: path.join(root, "Clipp.app") },
    })
  );
  return { root, repo, remote, store, config, first };
}
function plan(f, source, ...extra) {
  return spawnSync(
    process.execPath,
    [
      tool,
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      source,
      "--target",
      "electron-package",
      "--json",
      ...extra,
    ],
    { encoding: "utf8" }
  );
}

test("plan observes remote main rather than stale local tracking ref and freezes its revision", () => {
  const f = fixture();
  const stale = command(
    "git",
    ["rev-parse", "refs/remotes/origin/main"],
    f.repo
  );
  writeFileSync(path.join(f.repo, "change.txt"), "new remote source");
  command("git", ["add", "change.txt"], f.repo);
  command("git", ["commit", "-m", "second"], f.repo);
  const latest = command("git", ["rev-parse", "HEAD"], f.repo);
  command("git", ["push", "origin", "main"], f.repo);
  command("git", ["update-ref", "refs/remotes/origin/main", stale], f.repo);
  writeFileSync(path.join(f.repo, "untracked.txt"), "leave me alone");
  const branchBefore = command(
    "git",
    ["symbolic-ref", "--short", "HEAD"],
    f.repo
  );
  const result = plan(f, "origin/main");
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.plan.source.commit, latest);
  assert.notEqual(report.plan.source.commit, stale);
  assert.equal(
    command("git", ["symbolic-ref", "--short", "HEAD"], f.repo),
    branchBefore
  );
  assert.equal(
    readFileSync(path.join(f.repo, "untracked.txt"), "utf8"),
    "leave me alone"
  );
  assert.equal(
    command("git", ["rev-parse", "refs/remotes/origin/main"], f.repo),
    stale
  );
  assert.equal(
    JSON.parse(readFileSync(report.path, "utf8")).source.commit,
    latest
  );
});

test("immutable commit works when remote is unavailable, while latest branch fails closed", () => {
  const f = fixture();
  command(
    "git",
    ["remote", "set-url", "origin", path.join(f.root, "missing.git")],
    f.repo
  );
  const failed = plan(f, "origin/main");
  assert.notEqual(failed.status, 0);
  assert.equal(JSON.parse(failed.stdout).code, "source_freshness_unavailable");
  const selected = plan(f, f.first);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(JSON.parse(selected.stdout).plan.source.commit, f.first);
});

test("plan records exact committed lockfile bytes and rejects unknown targets", () => {
  const f = fixture();
  const selected = plan(f, f.first);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(
    JSON.parse(selected.stdout).plan.source.lockfileSha256,
    createHash("sha256").update("fixture-lock\n").digest("hex")
  );
  const unknown = spawnSync(
    process.execPath,
    [
      tool,
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.first,
      "--target",
      "relay-test",
      "--json",
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(unknown.status, 0);
  assert.equal(JSON.parse(unknown.stdout).code, "invalid_target");
});

test("Android plans declare signing mode and publication blockers without exposing credentials", () => {
  const f = fixture();
  writeFileSync(
    f.config,
    JSON.stringify({
      schema: 1,
      runRoot: f.store,
      destinations: {
        playApplicationId: "example.clipp",
        playTrack: "internal",
      },
      signing: { androidPackage: "unsigned-artifact", androidLocal: "debug" },
      references: { playCredentialRef: "env:PLAY_CREDENTIAL" },
    })
  );
  const result = spawnSync(
    process.execPath,
    [
      tool,
      "plan",
      "--repo",
      f.repo,
      "--config",
      f.config,
      "--source",
      f.first,
      "--target",
      "android-package",
      "--target",
      "android-internal",
      "--json",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PLAY_CREDENTIAL: "secret-value" },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout).plan;
  assert.equal(report.targets["android-package"].signing, "unsigned-artifact");
  assert.ok(
    report.targets["android-internal"].prerequisites.includes(
      "signing:android-internal-requires-upload"
    )
  );
  assert.equal(
    report.privateReferences.playCredentialRef,
    "env:PLAY_CREDENTIAL"
  );
  assert.ok(!result.stdout.includes("secret-value"));
});
