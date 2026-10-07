import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

const root = path.resolve(__dirname, "../..");
const npmCli = process.env.npm_execpath!;
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(path.join(os.tmpdir(), "clipp-verify-"));
  mkdirSync(path.join(fixture, "scripts"));
  mkdirSync(path.join(fixture, "bin"));
  writeFileSync(
    path.join(fixture, "package.json"),
    readFileSync(path.join(root, "package.json"))
  );
  if (existsSync(path.join(root, "scripts/verify.mjs"))) {
    copyFileSync(
      path.join(root, "scripts/verify.mjs"),
      path.join(fixture, "scripts/verify.mjs")
    );
  }
  symlinkSync(process.execPath, path.join(fixture, "bin/node"));
  symlinkSync("/bin/sh", path.join(fixture, "bin/sh"));
  writeFileSync(
    path.join(fixture, "bin/npm"),
    `#!${process.execPath}
import fs from "node:fs";
const command = process.argv.slice(2).join(" ");
if (command === "--version") { console.log("11.13.0"); process.exit(0); }
fs.appendFileSync(process.env.FIXTURE_TRACE, command + "\\n");
process.exit(command === process.env.FIXTURE_FAILURE ? 17 : 0);
`,
    { mode: 0o755 }
  );
});

afterEach(() => rmSync(fixture, { recursive: true, force: true }));

function verify(failure = "") {
  return spawnSync(process.execPath, [npmCli, "run", "verify"], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      PATH: path.join(fixture, "bin"),
      FIXTURE_TRACE: path.join(fixture, "trace"),
      FIXTURE_FAILURE: failure,
    },
  });
}

test("routine verification reports a failed lint check and exits unsuccessfully", () => {
  const result = verify("run lint");
  expect(result.status).toBe(17);
  expect(result.stdout + result.stderr).toMatch(/FAILED.*lint/);
});

const checks = [
  "run lint",
  "run check",
  "--workspace apps/electron run build",
  "--workspace apps/android run build",
  "--workspace apps/extension run build",
];

test("routine verification runs each existing lint, check and production build once", () => {
  const result = verify();
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(
    readFileSync(path.join(fixture, "trace"), "utf8").trim().split("\n")
  ).toEqual(checks);
  expect(result.stdout).toMatch(/Node v/);
  expect(result.stdout).toMatch(/npm 11\.13\.0/);
});

test.each(checks)(
  "failure from %s makes verification fail before later checks",
  (check) => {
    const result = verify(check);
    expect(result.status).toBe(17);
    expect(result.stdout + result.stderr).toMatch(/\[verify\] FAILED/);
    expect(
      readFileSync(path.join(fixture, "trace"), "utf8").trim().split("\n")
    ).toEqual(checks.slice(0, checks.indexOf(check) + 1));
  }
);

test("missing npm makes verification fail with an actionable prerequisite diagnostic", () => {
  rmSync(path.join(fixture, "bin/npm"));
  const result = verify();
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toMatch(
    /FAILED npm prerequisite.*ENOENT/
  );
});

function hook(failure = "") {
  copyFileSync(path.join(fixture, "bin/npm"), path.join(fixture, "bin/npx"));
  return spawnSync("/bin/sh", [path.join(root, ".husky/pre-commit")], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      PATH: path.join(fixture, "bin"),
      FIXTURE_TRACE: path.join(fixture, "trace"),
      FIXTURE_FAILURE: failure,
    },
  });
}

test("pre-commit formats staged files, then runs lint and the existing check", () => {
  const result = hook();
  expect(result.status).toBe(0);
  expect(
    readFileSync(path.join(fixture, "trace"), "utf8").trim().split("\n")
  ).toEqual(["--no-install lint-staged", "run lint", "run check"]);
});

test("pre-commit refuses a lint failure before the existing check", () => {
  const result = hook("run lint");
  expect(result.status).toBe(17);
  expect(
    readFileSync(path.join(fixture, "trace"), "utf8").trim().split("\n")
  ).toEqual(["--no-install lint-staged", "run lint"]);
});

test("ordinary pull requests and main changes use the same read-only routine command", () => {
  const workflow = parse(
    readFileSync(path.join(root, ".github/workflows/verify.yml"), "utf8")
  );
  expect(workflow.on).toEqual({
    pull_request: null,
    push: { branches: ["main"] },
  });
  expect(workflow.permissions).toEqual({ contents: "read" });
  const jobs = Object.values(workflow.jobs) as Array<{
    permissions?: unknown;
    environment?: unknown;
    steps: Array<{
      run?: string;
      uses?: string;
      with?: Record<string, string>;
    }>;
  }>;
  expect(jobs).toHaveLength(1);
  expect(jobs[0].permissions).toBeUndefined();
  expect(jobs[0].environment).toBeUndefined();
  expect(
    jobs[0].steps.filter((step) => step.run).map((step) => step.run)
  ).toEqual(["npm ci", "npm run verify"]);
  const setup = jobs[0].steps.find((step) =>
    step.uses?.startsWith("actions/setup-node@")
  );
  expect(setup?.with?.["node-version-file"]).toBe(".node-version");
  expect(readFileSync(path.join(root, ".node-version"), "utf8").trim()).toBe(
    "24.16.0"
  );
});
