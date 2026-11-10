import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  closeSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statfsSync,
  openSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { acquireOwnership } from "./ownership.mjs";
import { qualifyAndroid } from "./android-qualification.mjs";
import { packageAndroid } from "./android-package.mjs";
import {
  electronNativeInventory,
  inspectElectronConfig,
  packageElectron,
} from "./electron.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const knownChecks = [
  ["lint", ["npm", "run", "lint"]],
  ["typecheck", ["npm", "run", "typecheck"]],
  ["jest", ["npm", "test", "--", "--runInBand"]],
  ["candidate-tooling", ["npm", "run", "check:candidate"]],
  ["delivery-tooling", ["npm", "run", "check:delivery"]],
  ["electron-build", ["npm", "--workspace", "apps/electron", "run", "build"]],
  ["android-web-build", ["npm", "--workspace", "apps/android", "run", "build"]],
  ["chrome-build", ["npm", "--workspace", "apps/extension", "run", "build"]],
  ["ui-behavior", ["npm", "run", "test:ui-behavior"]],
];
const knownGeneratedOutputs = [
  "/.local/startup-replay-*/",
  "/test-results/.last-run.json",
];
const gitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_)/.test(
        name
      )
  )
);
function readJson(file, code) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(code, `Cannot read valid JSON from ${file}`);
  }
}
function atomically(file, record) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const { integritySha256: _prior, ...body } = record;
  record.integritySha256 = sha(JSON.stringify(body));
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temporary, file);
}
async function invoke(bin, args, cwd, environment, timeout, log, onStart) {
  const startedAt = new Date().toISOString();
  const fd = openSync(log, "wx", 0o600);
  let child;
  try {
    child = spawn(bin, args, {
      cwd,
      env: { ...gitEnvironment, ...environment },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    closeSync(fd);
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: null,
      signal: null,
      error: error.code || "spawn_failed",
      passed: false,
    };
  }
  onStart(child.pid || null);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => writeSync(fd, chunk));
  let timedOut = false;
  let killTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    killTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already exited */
      }
    }, 5000);
    killTimer.unref();
  }, timeout);
  const result = await new Promise((resolve) => {
    let spawnError;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (exitCode, signal) =>
      resolve({
        exitCode,
        signal,
        error: spawnError?.code || (timedOut ? "ETIMEDOUT" : null),
      })
    );
  });
  clearTimeout(timer);
  clearTimeout(killTimer);
  closeSync(fd);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    ...result,
    passed: result.exitCode === 0 && !result.error,
  };
}
function planRecord(file, identity) {
  const bytes = readFileSync(file);
  let recordedDigest;
  try {
    recordedDigest = readFileSync(`${file}.sha256`, "utf8").trim();
  } catch {
    fail("invalid_plan", "Saved plan has no integrity receipt");
  }
  if (recordedDigest !== sha(bytes))
    fail("plan_changed", "Saved plan differs from its immutable receipt");
  const plan = readJson(file, "invalid_plan");
  if (
    plan.schema !== 1 ||
    !/^[0-9a-f-]{36}$/.test(plan.id || "") ||
    !/^[0-9a-f]{40}$/.test(plan.source?.commit || "") ||
    !plan.repository?.root ||
    !plan.tool?.scriptSha256 ||
    !plan.profile?.sha256 ||
    !plan.configurationSha256 ||
    !plan.targets ||
    !plan.outputRoot
  )
    fail("invalid_plan", "Unsupported or incomplete delivery plan");
  const expectedPath = path.join(
    path.dirname(path.dirname(plan.outputRoot)),
    "plans",
    plan.id,
    "plan.json"
  );
  if (path.resolve(file) !== path.resolve(expectedPath))
    fail("invalid_plan", "Plan must be stored at its declared run root");
  let existing = plan.outputRoot;
  while (!lstatSync(existing, { throwIfNoEntry: false })) {
    const parent = path.dirname(existing);
    if (parent === existing)
      fail("invalid_plan", "Run root has no existing ancestor");
    existing = parent;
  }
  const physicalOutput = path.resolve(
    realpathSync(existing),
    path.relative(existing, plan.outputRoot)
  );
  const repo = realpathSync(plan.repository.root);
  if (
    physicalOutput === repo ||
    physicalOutput.startsWith(`${repo}${path.sep}`)
  )
    fail("invalid_plan", "Run output must stay outside source repository");
  if (
    plan.tool.scriptSha256 !== identity.scriptSha256 ||
    plan.tool.moduleSha256 !== identity.moduleSha256
  )
    fail(
      "tool_changed",
      "Delivery tool changed since planning; create a successor plan"
    );
  if (plan.profile.sha256 !== identity.profileSha256)
    fail(
      "profile_changed",
      "Delivery profile changed since planning; create a successor plan"
    );
  if (
    JSON.stringify(plan.profile.commonChecks) !==
    JSON.stringify(knownChecks.map(([id, command]) => ({ id, command })))
  )
    fail("invalid_profile", "Frozen common check allocation is unsupported");
  const supportedProfile = JSON.parse(
    readFileSync(new URL("./profiles/v1.json", import.meta.url), "utf8")
  );
  if (
    JSON.stringify(plan.profile.electronPackage) !==
    JSON.stringify(supportedProfile.electronPackage)
  )
    fail("invalid_profile", "Frozen Electron package profile is unsupported");
  if (
    JSON.stringify(plan.profile.androidPackage) !==
    JSON.stringify(supportedProfile.androidPackage)
  )
    fail("invalid_profile", "Frozen Android package profile is unsupported");
  if (
    JSON.stringify(plan.profile.candidateGeneratedOutputs) !==
    JSON.stringify(knownGeneratedOutputs)
  )
    fail(
      "invalid_profile",
      "Frozen generated-output allocation is unsupported"
    );
  if (
    !Number.isSafeInteger(plan.profile.preflight?.minimumFreeBytes) ||
    plan.profile.preflight.minimumFreeBytes <= 0
  )
    fail("invalid_profile", "Frozen storage preflight is unsupported");
  const current = spawnSync(
    "git",
    ["-C", plan.repository.root, "rev-parse", "--show-toplevel"],
    { encoding: "utf8", env: gitEnvironment, timeout: 10_000 }
  );
  if (current.status !== 0 || current.stdout.trim() !== plan.repository.root)
    fail("wrong_repository", "Planned Clipp root is unavailable");
  return plan;
}
function runFile(plan) {
  return path.join(plan.outputRoot, "run.json");
}
function validIntegrity(record) {
  const { integritySha256, ...body } = record;
  return (
    /^[0-9a-f]{64}$/.test(integritySha256 || "") &&
    integritySha256 === sha(JSON.stringify(body))
  );
}
function validCheckoutPath(checkout, outputRoot) {
  if (
    typeof checkout !== "string" ||
    !/^checkout-[0-9a-f-]{36}$/.test(path.basename(checkout)) ||
    path.dirname(checkout) !== outputRoot
  )
    return false;
  let existing = checkout;
  while (!lstatSync(existing, { throwIfNoEntry: false })) {
    const parent = path.dirname(existing);
    if (parent === existing) return false;
    existing = parent;
  }
  const physical = path.resolve(
    realpathSync(existing),
    path.relative(existing, checkout)
  );
  const physicalRoot = realpathSync(outputRoot);
  return physical.startsWith(`${physicalRoot}${path.sep}`);
}
function validateRun(record, plan, digest) {
  if (
    !validIntegrity(record) ||
    record.schema !== 1 ||
    record.id !== plan.id ||
    record.planSha256 !== digest ||
    record.source?.commit !== plan.source.commit ||
    record.profileSha256 !== plan.profile.sha256 ||
    record.configurationSha256 !== plan.configurationSha256 ||
    !record.stages?.prepare ||
    !record.stages?.commonVerify ||
    !record.stages?.electronPackage ||
    !record.stages?.androidPackage
  )
    fail("invalid_run", "Run record is incompatible with the frozen plan");
  if (
    (record.checkout !== null &&
      !validCheckoutPath(record.checkout, plan.outputRoot)) ||
    !Array.isArray(record.retainedCheckouts) ||
    record.retainedCheckouts.some(
      (checkout) => !validCheckoutPath(checkout, plan.outputRoot)
    ) ||
    JSON.stringify(Object.keys(record.targets || {}).sort()) !==
      JSON.stringify(Object.keys(plan.targets).sort())
  )
    fail(
      "invalid_run",
      "Run record contains paths or targets outside the frozen plan"
    );
  if (
    JSON.stringify(record.environment) !== JSON.stringify(environmentIdentity())
  )
    fail(
      "environment_changed",
      "Node, npm or host environment differs from the saved run"
    );
  return record;
}
function environmentIdentity() {
  const npm = spawnSync("npm", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    env: gitEnvironment,
  });
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    npm: npm.status === 0 ? npm.stdout.trim() : null,
  };
}
function summary(run) {
  const outstanding = Object.entries(run.targets || {}).find(
    ([, target]) => target.state !== "complete"
  );
  return {
    ...run,
    nextAction:
      run.stages.prepare.state !== "passed"
        ? "prepare candidate"
        : run.stages.commonVerify.state !== "passed"
          ? "run common local verification"
          : outstanding?.[1].nextAction ||
            (outstanding ? `complete ${outstanding[0]}` : null),
  };
}
function stage(run, name, state, detail, file) {
  run.stages[name] = {
    ...run.stages[name],
    state,
    updatedAt: new Date().toISOString(),
    detail,
  };
  run.updatedAt = new Date().toISOString();
  atomically(file, run);
}
function artifactTree(root) {
  if (!existsSync(root))
    fail("candidate_artifact_missing", `Missing production output: ${root}`);
  const files = {};
  function walk(directory) {
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
          "candidate_artifact_invalid",
          "Production output contains a non-file entry"
        );
    }
  }
  walk(root);
  if (!Object.keys(files).length)
    fail("candidate_artifact_missing", `Empty production output: ${root}`);
  return files;
}
function passedCases(id, rawLog) {
  const log = rawLog.replace(/\u001b\[[0-9;]*m/g, "");
  if (id === "jest") {
    const line = log.split("\n").findLast((value) => /Tests:\s/.test(value));
    const passed = /([0-9]+) passed/.exec(line || "");
    const total = /([0-9]+) total/.exec(line || "");
    return passed &&
      total &&
      Number(passed[1]) > 0 &&
      passed[1] === total[1] &&
      !/\d+ skipped|\d+ failed|\d+ pending/.test(line)
      ? Number(passed[1])
      : null;
  }
  if (id === "candidate-tooling" || id === "delivery-tooling") {
    const number = (label) => {
      const match = [
        ...log.matchAll(new RegExp(`(?:ℹ|#)\\s*${label}\\s+(\\d+)`, "g")),
      ].at(-1);
      return match ? Number(match[1]) : null;
    };
    const tests = number("tests");
    const passed = number("pass");
    return tests > 0 &&
      passed === tests &&
      number("fail") === 0 &&
      number("cancelled") === 0 &&
      number("skipped") === 0
      ? tests
      : null;
  }
  if (id === "ui-behavior") {
    const passed = [...log.matchAll(/(?:^|\n)\s*(\d+) passed(?:\s|$)/g)].at(-1);
    return passed &&
      Number(passed[1]) > 0 &&
      !/\d+ skipped|\d+ failed/.test(log)
      ? Number(passed[1])
      : null;
  }
  return undefined;
}
function outputs(checkout) {
  return Object.fromEntries(
    ["electron", "android", "extension"].map((runtime) => [
      runtime,
      artifactTree(path.join(checkout, "apps", runtime, "dist")),
    ])
  );
}
function generatedOutputs(checkout) {
  const files = {};
  let count = 0;
  const capture = (file) => {
    if (++count > 1000)
      fail("candidate_artifact_invalid", "Too many generated test outputs");
    const stat = lstatSync(file);
    if (!stat.isFile())
      fail(
        "candidate_artifact_invalid",
        "Generated test output is not a regular file"
      );
    files[path.relative(checkout, file)] = {
      size: stat.size,
      sha256: sha(readFileSync(file)),
    };
  };
  const local = path.join(checkout, ".local");
  if (existsSync(local)) {
    for (const entry of readdirSync(local).sort()) {
      if (!entry.startsWith("startup-replay-")) continue;
      if (
        !/^startup-replay-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          entry
        )
      )
        fail(
          "candidate_artifact_invalid",
          "Unexpected generated-output directory"
        );
      const directory = path.join(local, entry);
      if (!lstatSync(directory).isDirectory())
        fail(
          "candidate_artifact_invalid",
          "Generated test output directory is invalid"
        );
      for (const name of readdirSync(directory).sort())
        capture(path.join(directory, name));
    }
  }
  const playwright = path.join(checkout, "test-results", ".last-run.json");
  if (existsSync(playwright)) capture(playwright);
  return files;
}
function retainUiFailureDiagnostics(run, file, number) {
  const results = path.join(run.checkout, "test-results");
  if (!existsSync(results)) return;
  const destinationRoot = path.join(
    path.dirname(file),
    "ui-failures",
    String(number)
  );
  let count = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const source = path.join(directory, entry);
      const relative = path.relative(run.checkout, source);
      const stat = lstatSync(source);
      if (stat.isDirectory()) {
        visit(source);
        continue;
      }
      if (relative === "test-results/.last-run.json") continue;
      if (
        !stat.isFile() ||
        stat.size > 100 * 1024 * 1024 ||
        ++count > 1000 ||
        !/^test-results\/[A-Za-z0-9._/-]+$/.test(relative) ||
        relative.split("/").includes("..")
      )
        fail(
          "candidate_artifact_invalid",
          "Unsafe UI failure diagnostic output"
        );
      const copy = path.join(destinationRoot, path.relative(results, source));
      mkdirSync(path.dirname(copy), { recursive: true, mode: 0o700 });
      copyFileSync(source, copy);
      chmodSync(copy, 0o600);
      run.uiFailureDiagnostics.push({
        path: relative,
        copy: path.relative(path.dirname(file), copy),
        size: stat.size,
        sha256: sha(readFileSync(copy)),
      });
      appendFileSync(
        path.join(run.checkout, ".git", "info", "exclude"),
        `/${relative}\n`
      );
    }
  };
  visit(results);
}
function sourceClean(checkout, commit) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: checkout,
    env: gitEnvironment,
    encoding: "utf8",
    timeout: 10_000,
  });
  const dirty = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: checkout, env: gitEnvironment, encoding: "utf8", timeout: 10_000 }
  );
  if (
    head.status !== 0 ||
    head.stdout.trim() !== commit ||
    dirty.status !== 0 ||
    dirty.stdout.trim()
  )
    fail(
      "candidate_source_mutated",
      "Candidate source differs from selected commit"
    );
}
function selectedSource(checkout, plan) {
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: checkout,
    env: gitEnvironment,
    encoding: "utf8",
    timeout: 10_000,
  });
  const lock = spawnSync("git", ["show", "HEAD:package-lock.json"], {
    cwd: checkout,
    env: gitEnvironment,
    timeout: 10_000,
  });
  if (
    tree.status !== 0 ||
    tree.stdout.trim() !== plan.source.tree ||
    lock.status !== 0 ||
    sha(lock.stdout) !== plan.source.lockfileSha256
  )
    fail(
      "candidate_source_mismatch",
      "Checkout tree or lockfile differs from frozen plan"
    );
}
function checkRecordedArtifacts(run, file) {
  sourceClean(run.checkout, run.source.commit);
  checkUiFailureDiagnostics(run, file);
  const actual = outputs(run.checkout);
  if (JSON.stringify(actual) !== JSON.stringify(run.artifacts))
    fail(
      "candidate_artifact_changed",
      "Production output differs from recorded artifact inventory"
    );
  if (
    JSON.stringify(generatedOutputs(run.checkout)) !==
    JSON.stringify(run.generatedOutputs)
  )
    fail(
      "candidate_evidence_changed",
      "Generated test output differs from recorded evidence"
    );
}
function checkUiFailureDiagnostics(run, file) {
  const root = path.dirname(file);
  const base = path.join(root, "ui-failures");
  for (const record of run.uiFailureDiagnostics || []) {
    const copy = path.resolve(root, record.copy || "");
    if (
      !copy.startsWith(`${base}${path.sep}`) ||
      !existsSync(copy) ||
      !lstatSync(copy).isFile() ||
      sha(readFileSync(copy)) !== record.sha256
    )
      fail(
        "candidate_evidence_changed",
        "Retained UI failure diagnostic changed"
      );
  }
}
function priorCheckValid(prior, file) {
  const base = path.dirname(file);
  const log = path.resolve(base, prior.log || "");
  if (
    !log.startsWith(`${base}${path.sep}`) ||
    !existsSync(log) ||
    sha(readFileSync(log)) !== prior.logSha256
  )
    return false;
  return true;
}
function priorBuildValid(prior, id, run) {
  const app = {
    "electron-build": "electron",
    "android-web-build": "android",
    "chrome-build": "extension",
  }[id];
  return (
    !app ||
    JSON.stringify(prior.outputInventory) ===
      JSON.stringify(artifactTree(path.join(run.checkout, "apps", app, "dist")))
  );
}
function newRun(plan, digest) {
  return {
    schema: 1,
    id: plan.id,
    planSha256: digest,
    source: { commit: plan.source.commit, tree: plan.source.tree },
    tool: plan.tool,
    profileSha256: plan.profile.sha256,
    configurationSha256: plan.configurationSha256,
    environment: environmentIdentity(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checkout: null,
    retainedCheckouts: [],
    stages: {
      prepare: { state: "pending", attempts: [], updatedAt: null },
      commonVerify: { state: "pending", attempts: [], updatedAt: null },
      electronPackage: { state: "pending", attempts: [], updatedAt: null },
      androidPackage: { state: "pending", attempts: [], updatedAt: null },
    },
    targets: Object.fromEntries(
      Object.keys(plan.targets).map((target) => [
        target,
        { state: "pending", nextAction: "platform adapter unavailable" },
      ])
    ),
    androidQualification: Object.keys(plan.targets).some((target) =>
      target.startsWith("android")
    )
      ? {
          state: "pending",
          nextAction: "prepare native acceptance",
          updatedAt: null,
        }
      : null,
    artifacts: null,
    nativeDependencyInventory: null,
    generatedOutputs: null,
    uiFailureDiagnostics: [],
    installationSha256: null,
  };
}
async function commandAttempt(
  run,
  name,
  bin,
  args,
  cwd,
  environment,
  timeout,
  file,
  checkId = null
) {
  const number = run.stages[name].attempts.length + 1;
  const log = path.join(path.dirname(file), "logs", `${name}-${number}.log`);
  mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
  const attempt = {
    number,
    checkId,
    command: [bin, ...args],
    cwd,
    log: path.relative(path.dirname(file), log),
    state: "running",
    pid: null,
    startedAt: new Date().toISOString(),
  };
  run.stages[name].attempts.push(attempt);
  stage(run, name, "running", `${bin} ${args.join(" ")}`, file);
  const observation = await invoke(
    bin,
    args,
    cwd,
    environment,
    timeout,
    log,
    (pid) => {
      attempt.pid = pid;
      atomically(file, run);
    }
  );
  const logBytes = readFileSync(log);
  const cases = observation.passed
    ? passedCases(checkId, logBytes.toString("utf8"))
    : undefined;
  const empty = cases === null;
  Object.assign(attempt, observation, {
    state: observation.passed && !empty ? "passed" : "failed",
    passed: observation.passed && !empty,
    cases,
  });
  attempt.logSha256 = sha(logBytes);
  if (!attempt.passed && checkId === "ui-behavior")
    retainUiFailureDiagnostics(run, file, number);
  if (
    attempt.passed &&
    ["electron-build", "android-web-build", "chrome-build"].includes(checkId)
  ) {
    const app = {
      "electron-build": "electron",
      "android-web-build": "android",
      "chrome-build": "extension",
    }[checkId];
    attempt.outputInventory = artifactTree(path.join(cwd, "apps", app, "dist"));
  }
  atomically(file, run);
  if (empty)
    fail(
      "required_check_empty",
      `${checkId} did not report complete nonzero test cases`
    );
  if (!observation.passed)
    fail("required_check_failed", `${name} failed; see private log ${log}`);
  return log;
}
async function prepare(run, plan, file) {
  if (run.stages.prepare.state === "passed") {
    sourceClean(run.checkout, plan.source.commit);
    checkUiFailureDiagnostics(run, file);
    const installed = path.join(
      run.checkout,
      "node_modules",
      ".package-lock.json"
    );
    if (
      !existsSync(installed) ||
      !run.installationSha256 ||
      sha(readFileSync(installed)) !== run.installationSha256
    )
      fail("candidate_installation_changed", "Installed dependencies changed");
    return;
  }
  if (run.checkout) run.retainedCheckouts.push(run.checkout);
  const checkout = path.join(plan.outputRoot, `checkout-${randomUUID()}`);
  run.checkout = checkout;
  atomically(file, run);
  const source = plan.source.cache || plan.repository.root;
  await commandAttempt(
    run,
    "prepare",
    "git",
    ["clone", "--no-local", "--no-checkout", source, checkout],
    plan.outputRoot,
    {},
    120_000,
    file
  );
  await commandAttempt(
    run,
    "prepare",
    "git",
    ["fetch", "--no-tags", source, plan.source.commit],
    checkout,
    {},
    120_000,
    file
  );
  await commandAttempt(
    run,
    "prepare",
    "git",
    ["checkout", "--detach", plan.source.commit],
    checkout,
    {},
    30_000,
    file
  );
  selectedSource(checkout, plan);
  appendFileSync(
    path.join(checkout, ".git", "info", "exclude"),
    `\n# Known delivery check outputs; tracked source and other untracked files remain visible.\n${plan.profile.candidateGeneratedOutputs.join("\n")}\n`
  );
  const packageJson = readJson(
    path.join(checkout, "package.json"),
    "candidate_adapter_missing"
  );
  for (const script of [
    "lint",
    "typecheck",
    "test",
    "check:candidate",
    "check:delivery",
    "test:ui-behavior",
  ])
    if (!packageJson.scripts?.[script])
      fail("candidate_adapter_missing", `Selected source lacks ${script}`);
  for (const app of ["electron", "android", "extension"])
    if (
      !readJson(
        path.join(checkout, "apps", app, "package.json"),
        "candidate_adapter_missing"
      ).scripts?.build
    )
      fail("candidate_adapter_missing", `Selected source lacks ${app} build`);
  await commandAttempt(
    run,
    "prepare",
    "npm",
    ["ci", "--no-audit", "--no-fund"],
    checkout,
    {},
    600_000,
    file
  );
  sourceClean(checkout, plan.source.commit);
  const installed = path.join(checkout, "node_modules", ".package-lock.json");
  if (!existsSync(installed))
    fail(
      "candidate_installation_changed",
      "Dependency installation is incomplete"
    );
  run.installationSha256 = sha(readFileSync(installed));
  stage(
    run,
    "prepare",
    "passed",
    "isolated committed checkout and dependencies ready",
    file
  );
}
async function commonVerify(run, plan, file) {
  if (run.stages.commonVerify.state === "passed") {
    for (const { id } of plan.profile.commonChecks) {
      const prior = run.stages.commonVerify.attempts.findLast(
        (attempt) => attempt.checkId === id && attempt.state === "passed"
      );
      if (!prior || !priorCheckValid(prior, file))
        fail("candidate_evidence_changed", `Previous ${id} evidence changed`);
    }
    checkRecordedArtifacts(run, file);
    return;
  }
  for (const { id, command } of plan.profile.commonChecks) {
    const prior = run.stages.commonVerify.attempts.findLast(
      (attempt) => attempt.checkId === id && attempt.state === "passed"
    );
    if (prior) {
      if (!priorCheckValid(prior, file))
        fail("candidate_evidence_changed", `Previous ${id} evidence changed`);
      if (!priorBuildValid(prior, id, run))
        fail("candidate_artifact_changed", `Previous ${id} output changed`);
      continue;
    }
    sourceClean(run.checkout, plan.source.commit);
    await commandAttempt(
      run,
      "commonVerify",
      command[0],
      command.slice(1),
      run.checkout,
      {},
      id === "ui-behavior" ? 900_000 : 1_800_000,
      file,
      id
    );
  }
  sourceClean(run.checkout, plan.source.commit);
  run.artifacts = outputs(run.checkout);
  if (plan.targets["electron-package"]) {
    try {
      const manifest = readJson(
        path.join(run.checkout, "apps/electron/package.json"),
        "prerequisite_unavailable"
      );
      inspectElectronConfig(manifest, plan.profile.electronPackage);
      run.nativeDependencyInventory = electronNativeInventory(run.checkout);
    } catch {
      // Electron-specific prerequisite is reported by its adapter after the
      // common checks. It must not invalidate independent target progress.
      run.nativeDependencyInventory = null;
    }
  }
  run.generatedOutputs = generatedOutputs(run.checkout);
  stage(
    run,
    "commonVerify",
    "passed",
    "required common checks and production outputs verified",
    file
  );
}
function liveGroup(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}
function hostReady(plan) {
  const host = plan.profile.supportedHost;
  if (
    process.platform !== host.platform ||
    !host.architectures.includes(process.arch)
  )
    fail(
      "prerequisite_unavailable",
      "Unsupported host for frozen delivery profile"
    );
  const meets = (actual, required) => {
    const a = String(actual).replace(/^v/, "").split(".").map(Number);
    const b = String(required).replace(/^>=/, "").split(".").map(Number);
    for (let i = 0; i < b.length; i++) {
      if (!Number.isInteger(a[i]) || !Number.isInteger(b[i])) return false;
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return true;
  };
  const current = environmentIdentity();
  if (
    !meets(current.node, plan.profile.toolchain.node) ||
    !meets(current.npm, plan.profile.toolchain.npm)
  )
    fail(
      "prerequisite_unavailable",
      "Node or npm version is below frozen delivery profile"
    );
  let available;
  try {
    const storage = statfsSync(plan.outputRoot, { bigint: true });
    available = storage.bavail * storage.bsize;
  } catch {
    fail("prerequisite_unavailable", "Cannot inspect candidate store capacity");
  }
  if (available < BigInt(plan.profile.preflight.minimumFreeBytes))
    fail(
      "prerequisite_unavailable",
      "Candidate store has insufficient free space"
    );
  const probe = path.join(plan.outputRoot, `.write-probe-${randomUUID()}`);
  try {
    writeFileSync(probe, "", { flag: "wx", mode: 0o600 });
    rmSync(probe);
  } catch {
    fail("prerequisite_unavailable", "Candidate store is not writable");
  }
}
export async function runDelivery(planPath, identity, options = {}) {
  const plan = planRecord(planPath, identity);
  const bytes = readFileSync(planPath);
  const digest = sha(bytes);
  try {
    mkdirSync(plan.outputRoot, { recursive: true, mode: 0o700 });
  } catch {
    fail(
      "prerequisite_unavailable",
      "Cannot create candidate output in the private run store"
    );
  }
  const file = runFile(plan);
  const release = acquireOwnership(`run:${plan.outputRoot}`, {
    canRecover: () => {
      if (!existsSync(file)) return true;
      const previous = readJson(file, "invalid_run");
      return [
        "prepare",
        "commonVerify",
        "electronPackage",
        "androidPackage",
      ].every(
        (name) =>
          previous.stages?.[name]?.state !== "running" ||
          (previous.stages[name].attempts.length &&
            !liveGroup(previous.stages[name].attempts.at(-1).pid))
      );
    },
  });
  try {
    const run = existsSync(file)
      ? validateRun(readJson(file, "invalid_run"), plan, digest)
      : newRun(plan, digest);
    if (!existsSync(file)) atomically(file, run);
    for (const name of [
      "prepare",
      "commonVerify",
      "electronPackage",
      "androidPackage",
    ]) {
      if (run.stages[name].state !== "running") continue;
      const attempt = run.stages[name].attempts.at(-1);
      if (attempt?.state === "running")
        Object.assign(attempt, {
          state: "interrupted",
          finishedAt: new Date().toISOString(),
          passed: false,
          error: "owner_interrupted",
        });
      stage(
        run,
        name,
        "failed",
        {
          code: "owner_interrupted",
          message: "Previous command ended with its owner",
        },
        file
      );
    }
    try {
      hostReady(plan);
      await prepare(run, plan, file);
      await commonVerify(run, plan, file);
      await qualifyAndroid({
        plan,
        run,
        save: () => atomically(file, run),
        invoke,
        diagnostic: options.native || {},
      });
    } catch (error) {
      const name =
        run.stages.prepare.state === "passed" ? "commonVerify" : "prepare";
      stage(
        run,
        name,
        error.code === "prerequisite_unavailable" ? "blocked" : "failed",
        {
          code: error.code || "delivery_internal_error",
          message: error.message,
        },
        file
      );
      return {
        code: error.code || "delivery_internal_error",
        run: summary(run),
      };
    }
    let platformCode = null;
    if (run.targets["electron-package"]) {
      try {
        await packageElectron({
          plan,
          run,
          file,
          execute: (bin, args, cwd, environment, timeout, checkId) =>
            commandAttempt(
              run,
              "electronPackage",
              bin,
              args,
              cwd,
              environment,
              timeout,
              file,
              checkId
            ),
          save: () => atomically(file, run),
        });
        if (run.stages.electronPackage.state !== "passed")
          stage(
            run,
            "electronPackage",
            "passed",
            "Electron DMG and packaged runtime verified",
            file
          );
      } catch (error) {
        const blocked =
          !error.code || error.code === "prerequisite_unavailable";
        platformCode = blocked ? null : error.code;
        run.targets["electron-package"] = {
          ...run.targets["electron-package"],
          state: blocked ? "blocked" : "failed",
          nextAction: error.message,
          updatedAt: new Date().toISOString(),
        };
        stage(
          run,
          "electronPackage",
          blocked ? "blocked" : "failed",
          {
            code: error.code || "prerequisite_unavailable",
            message: error.message,
          },
          file
        );
      }
    }
    if (
      run.targets["android-package"] ||
      run.targets["android-local"] ||
      run.targets["android-internal"]
    ) {
      try {
        await packageAndroid({
          plan,
          run,
          execute: (bin, args, cwd, environment, timeout, checkId) =>
            commandAttempt(
              run,
              "androidPackage",
              bin,
              args,
              cwd,
              environment,
              timeout,
              file,
              checkId
            ),
          save: () => atomically(file, run),
        });
      } catch (error) {
        const selected = run.targets["android-package"]
          ? "android-package"
          : run.targets["android-local"]
            ? "android-local"
            : "android-internal";
        const blocked = error.code === "prerequisite_unavailable";
        platformCode = blocked
          ? platformCode
          : error.code || "android_package_failed";
        run.targets[selected] = {
          ...run.targets[selected],
          state: blocked ? "blocked" : "failed",
          nextAction: error.message,
          updatedAt: new Date().toISOString(),
        };
        if (run.stages.androidPackage.state === "passed") {
          // Preserve the completed receipt so a changed artifact cannot be
          // silently rebuilt and accepted by replaying the same candidate.
          run.stages.androidPackage.integrityError = {
            code: error.code || "android_package_failed",
            message: error.message,
          };
          atomically(file, run);
        } else {
          stage(
            run,
            "androidPackage",
            blocked ? "blocked" : "failed",
            {
              code: error.code || "android_package_failed",
              message: error.message,
            },
            file
          );
        }
      }
    }
    return {
      code:
        platformCode ||
        (Object.values(run.targets).every(
          (target) => target.state === "complete"
        )
          ? "delivery_complete"
          : "delivery_incomplete"),
      run: summary(run),
    };
  } finally {
    release();
  }
}
export function statusDelivery(runRoot, id) {
  if (!/^[0-9a-f-]{36}$/.test(id))
    fail("invalid_run_id", "Expected a delivery run ID");
  const file = path.join(runRoot, "runs", id, "run.json");
  const run = readJson(file, "run_unavailable");
  if (
    !validIntegrity(run) ||
    run.schema !== 1 ||
    run.id !== id ||
    !run.stages?.prepare ||
    !run.stages?.commonVerify
  )
    fail("invalid_run", "Unsupported or corrupt run record");
  return { code: "status", run: summary(run) };
}
export function planPathForId(runRoot, id) {
  if (!/^[0-9a-f-]{36}$/.test(id))
    fail("invalid_run_id", "Expected a delivery run ID");
  return path.join(runRoot, "plans", id, "plan.json");
}
