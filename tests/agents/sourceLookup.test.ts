import { execFileSync, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("scripts/source-lookup.mjs");
let root: string;
function file(path: string, content = "needle source\n") {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}
function run(...args: string[]) {
  return spawnSync(
    process.execPath,
    [cli, "--repo", root, "--scope", ".", "--json", ...args],
    { encoding: "utf8", cwd: root }
  );
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lookup source "));
  execFileSync("git", ["init", "--quiet", root]);
});

test("reports malformed selection and protects ignored files, symlinks and nested repository roots", () => {
  file("src/source.ts");
  file(".gitignore", "ignored.md\n");
  file("ignored.md", "needle private canary");
  file("nested/.git/HEAD", "ref: refs/heads/main\n");
  file("nested/source.ts", "needle private canary");
  symlinkSync(join(root, "ignored.md"), join(root, "linked.md"));
  execFileSync("git", ["-C", root, "add", "src", "linked.md"]);
  for (const args of [
    ["--repo", join(root, "missing")],
    ["--repo", join(root, "src")],
    ["--scope", "missing"],
    ["--scope", "../"],
    ["--scope", "nested"],
    ["--include", "ignored.md"],
    ["--include", "linked.md"],
    ["--max-results", "0"],
    ["--unknown", "value"],
  ]) {
    const result = run(...args);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).error).toEqual(expect.any(String));
    expect(result.stdout).toBe("");
  }
  const noScope = spawnSync(process.execPath, [cli, "--repo", root], {
    encoding: "utf8",
  });
  expect(noScope.status).toBe(1);
  expect(run("--scope", "src").stdout).not.toContain("linked.md");
  const longError = run("--scope", "x".repeat(5000), "--max-bytes", "4096");
  expect(longError.status).toBe(1);
  expect(Buffer.byteLength(longError.stderr)).toBeLessThanOrEqual(4096);
});

test("limits files examined and treats shell syntax as literal content", () => {
  file("src/one.ts", "$(touch forbidden)\n");
  file("src/two.ts", "$(touch forbidden)\n");
  execFileSync("git", ["-C", root, "add", "."]);
  const result = run("--query", "$(touch forbidden)", "--max-files", "1");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).results).toEqual([
    { path: "src/one.ts", line: 1, text: "$(touch forbidden)" },
  ]);
  expect(JSON.parse(result.stdout).reasons).toContain("max-files");
  expect(
    execFileSync("git", ["-C", root, "status", "--porcelain=v1"], {
      encoding: "utf8",
    })
  ).not.toContain("forbidden");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("lists tracked source and explicitly selected nonignored tasks without changing the checkout", () => {
  file("src/odd space\n$(touch forbidden).ts");
  file(".scratch/task.md");
  file("unselected.md");
  for (const dir of [
    "node_modules",
    ".cache",
    ".local",
    "profiles",
    "recovery",
    "dist",
  ])
    file(`${dir}/canary.txt`, "private canary");
  file("nested/.git/HEAD", "ref: refs/heads/main\n");
  file("nested/source.ts", "private canary");
  file(".gitignore", "ignored.md\n");
  file("ignored.md", "private canary");
  execFileSync("git", [
    "-C",
    root,
    "add",
    "src",
    ".gitignore",
    "node_modules",
    ".cache",
    ".local",
    "profiles",
    "recovery",
    "dist",
    "nested/source.ts",
  ]);
  const before = execFileSync("git", [
    "-C",
    root,
    "status",
    "--porcelain=v1",
    "-z",
  ]);
  const index = readFileSync(join(root, ".git/index"));
  const result = run("--include", ".scratch/task.md");
  expect(result.status).toBe(0);
  expect(
    JSON.parse(result.stdout).results.map((item: { path: string }) => item.path)
  ).toEqual([
    ".gitignore",
    ".scratch/task.md",
    "src/odd space\n$(touch forbidden).ts",
  ]);
  expect(result.stdout).not.toContain("canary");
  expect(JSON.parse(run("--query", "private canary").stdout).results).toEqual(
    []
  );
  expect(
    execFileSync("git", ["-C", root, "status", "--porcelain=v1", "-z"])
  ).toEqual(before);
  expect(readFileSync(join(root, ".git/index"))).toEqual(index);
});

test("searches literal source text with explicit result and byte truncation", () => {
  file("src/source.ts", "needle one\nneedle two\nneedle three\n");
  file("src/binary.bin", "needle\0private binary");
  file("src/huge.txt", "needle".repeat(200000));
  file(".cache/private.txt", "needle private canary");
  execFileSync("git", ["-C", root, "add", "."]);
  const result = run("--query", "needle", "--max-results", "2");
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.version).toBe(1);
  expect(report.results).toEqual([
    { path: "src/source.ts", line: 1, text: "needle one" },
    { path: "src/source.ts", line: 2, text: "needle two" },
  ]);
  expect(report.truncated).toBe(true);
  expect(report.reasons).toContain("max-results");
  expect(report.skipped.largeFiles).toBe(1);
  expect(report.skipped.binaryFiles).toBe(1);
  expect(result.stdout).not.toContain("private canary");
  expect(result.stdout).not.toContain("private binary");
  file("src/source.ts", `${"needle".repeat(1000)}\n`.repeat(5));
  const bounded = run("--query", "needle", "--max-bytes", "4096");
  expect(bounded.status).toBe(0);
  expect(Buffer.byteLength(bounded.stdout)).toBeLessThanOrEqual(4096);
  expect(JSON.parse(bounded.stdout).reasons).toContain("max-bytes");
  const listed = run("--max-results", "1");
  expect(JSON.parse(listed.stdout).results).toHaveLength(1);
  expect(JSON.parse(listed.stdout).truncated).toBe(true);
});

test("agent entry points resolve maintained local navigation links", () => {
  const project = resolve(".");
  for (const document of [
    "AGENTS.md",
    "docs/agents/operations.md",
    "docs/agents/source-lookup.md",
    "docs/agents/domain.md",
  ]) {
    const text = readFileSync(join(project, document), "utf8");
    const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, target] of links) {
      if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
      const path = target.split("#")[0];
      expect(() =>
        lstatSync(resolve(project, document, "..", path))
      ).not.toThrow();
    }
  }
});

test("accepts unusual literal selections including leading dashes and trailing root spaces", () => {
  renameSync(root, `${root} `);
  root = `${root} `;
  file("--odd#space .md", "--needle\n");
  const result = run("--include", "--odd#space .md", "--query", "--needle");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).results).toEqual([
    { path: "--odd#space .md", line: 1, text: "--needle" },
  ]);
  expect(JSON.parse(run("--query", "--help").stdout).results).toEqual([]);
});
