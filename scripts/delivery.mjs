#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  statSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planPathForId, runDelivery, statusDelivery } from "./delivery/run.mjs";

const script = fileURLToPath(import.meta.url);
const profilePath = path.join(
  path.dirname(script),
  "delivery",
  "profiles",
  "v1.json"
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const moduleSha256 = () =>
  sha(
    ["run.mjs", "ownership.mjs", "android-qualification.mjs"]
      .map((name) =>
        readFileSync(path.join(path.dirname(script), "delivery", name))
      )
      .reduce((all, bytes) => Buffer.concat([all, bytes]), Buffer.alloc(0))
  );
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const gitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_)/.test(
        key
      )
  )
);

function git(
  cwd,
  args,
  code = "source_unavailable",
  timeout = 15_000,
  raw = false
) {
  const result = spawnSync("git", args, {
    cwd,
    env: gitEnvironment,
    encoding: "utf8",
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    fail(
      code,
      `Git ${args[0]} failed: ${(result.stderr || result.error?.message || "unavailable").trim().slice(0, 300)}`
    );
  return raw ? result.stdout : result.stdout.trim();
}

function readJson(file, code) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(code, `Cannot read valid JSON from ${file}`);
  }
}
function options(args) {
  const parsed = { targets: [] };
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (token === "--json") {
      parsed.json = true;
      continue;
    }
    const field = {
      "--repo": "repo",
      "--config": "config",
      "--source": "source",
      "--target": "targets",
      "--supersedes": "supersedes",
    }[token];
    if (!field || !args[index + 1] || args[index + 1].startsWith("--"))
      fail("invalid_options", `Invalid or missing value for ${token}`);
    if (field === "targets") parsed.targets.push(args[++index]);
    else if (parsed[field] !== undefined)
      fail("invalid_options", `Duplicate ${token}`);
    else parsed[field] = args[++index];
  }
  if (
    !parsed.repo ||
    !parsed.config ||
    !parsed.source ||
    !parsed.targets.length
  )
    fail(
      "invalid_options",
      "Plan requires --repo, --config, --source and at least one --target"
    );
  return parsed;
}

function sourceFrom(root, ref, cache) {
  const named = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._/-]+)$/.exec(ref);
  let gitRoot = root;
  let commit;
  if (named) {
    const [, remote, branch] = named;
    if (
      branch.includes("..") ||
      branch.startsWith("/") ||
      branch.endsWith("/") ||
      branch.startsWith("-")
    )
      fail("invalid_source", "Invalid remote branch");
    const url = git(root, ["remote", "get-url", remote], "invalid_source");
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i.test(url))
      fail(
        "invalid_source",
        "Remote URL embeds credentials; use a credential helper"
      );
    const line = git(
      root,
      ["ls-remote", "--exit-code", remote, `refs/heads/${branch}`],
      "source_freshness_unavailable",
      30_000
    );
    const observed = line.split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/.test(observed))
      fail(
        "source_freshness_unavailable",
        "Remote branch did not resolve to one commit"
      );
    mkdirSync(cache, { recursive: true, mode: 0o700 });
    git(cache, ["init", "--bare", "-q"], "source_cache_unavailable");
    const fetchUrl =
      path.isAbsolute(url) ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ||
      /^[^/]+:/.test(url)
        ? url
        : path.resolve(root, url);
    git(
      cache,
      ["fetch", "--no-tags", "--quiet", fetchUrl, `refs/heads/${branch}`],
      "source_freshness_unavailable",
      120_000
    );
    const fetched = git(
      cache,
      ["rev-parse", "FETCH_HEAD"],
      "source_freshness_unavailable"
    );
    if (fetched !== observed)
      fail(
        "source_freshness_changed",
        "Remote branch advanced during planning; retry"
      );
    git(
      cache,
      ["update-ref", "refs/delivery/selected", fetched],
      "source_cache_unavailable"
    );
    gitRoot = cache;
    commit = fetched;
  } else {
    if (!/^[a-f0-9]{40}$/.test(ref))
      fail("invalid_source", "Source must be a full commit or remote/branch");
    commit = git(
      root,
      ["rev-parse", "--verify", `${ref}^{commit}`],
      "source_unavailable"
    );
    if (commit !== ref)
      fail("invalid_source", "Source is not an immutable commit");
  }
  const tree = git(gitRoot, ["rev-parse", `${commit}^{tree}`]);
  const show = (file) =>
    git(
      gitRoot,
      ["show", `${commit}:${file}`],
      "source_metadata_unavailable",
      15_000,
      true
    );
  const lockfileSha256 = sha(show("package-lock.json"));
  const versions = Object.fromEntries(
    ["electron", "android", "extension"].map((runtime) => [
      runtime,
      readPackage(show(`apps/${runtime}/package.json`)).version,
    ])
  );
  return {
    requested: ref,
    commit,
    tree,
    observedAt: new Date().toISOString(),
    lockfileSha256,
    versions,
    cache: named ? cache : null,
  };
}
function readPackage(value) {
  try {
    return JSON.parse(value);
  } catch {
    fail(
      "source_metadata_unavailable",
      "Selected source has invalid package metadata"
    );
  }
}
function checkedRoot(requested) {
  let root;
  try {
    root = realpathSync(requested);
  } catch {
    fail("wrong_repository", "Selected repository is unavailable");
  }
  if (git(root, ["rev-parse", "--show-toplevel"], "wrong_repository") !== root)
    fail("wrong_repository", "Select the Clipp repository root");
  const pkg = readJson(path.join(root, "package.json"), "wrong_repository");
  if (!Array.isArray(pkg.workspaces) || !pkg.workspaces.includes("apps/*"))
    fail("wrong_repository", "Selected root is not a Clipp workspace");
  for (const name of ["electron", "android", "extension"]) {
    try {
      statSync(path.join(root, "apps", name, "package.json"));
    } catch {
      fail("wrong_repository", `Selected root lacks ${name}`);
    }
  }
  return root;
}
function configuration(file, root) {
  const config = readJson(file, "invalid_configuration");
  if (
    config.schema !== 1 ||
    typeof config.runRoot !== "string" ||
    !path.isAbsolute(config.runRoot) ||
    typeof config.destinations !== "object" ||
    config.destinations === null ||
    Object.keys(config).some(
      (key) =>
        ![
          "schema",
          "runRoot",
          "destinations",
          "references",
          "signing",
        ].includes(key)
    )
  )
    fail(
      "invalid_configuration",
      "Expected schema 1, absolute runRoot and destinations"
    );
  let existing = path.resolve(config.runRoot);
  while (!lstatSync(existing, { throwIfNoEntry: false })) {
    const parent = path.dirname(existing);
    if (parent === existing)
      fail("invalid_configuration", "Run store has no existing ancestor");
    existing = parent;
  }
  let runRoot;
  try {
    runRoot = path.resolve(
      realpathSync(existing),
      path.relative(existing, config.runRoot)
    );
  } catch {
    fail("invalid_configuration", "Run store contains an unresolved symlink");
  }
  if (runRoot === root || runRoot.startsWith(root + path.sep))
    fail(
      "invalid_configuration",
      "Run store must be outside the selected source repository"
    );
  const destinationKeys = [
    "electronInstallPath",
    "chromeExtensionDir",
    "chromeProfilePath",
    "androidDeviceSerial",
    "playApplicationId",
    "playTrack",
    "androidAcceptanceEffort",
    "androidAcceptanceSerialApi31",
    "androidAcceptanceSerialApi33",
    "androidAcceptanceSerialApi34",
    "androidAcceptanceSerialApi35",
    "androidAcceptanceSerialApi36",
  ];
  if (
    Object.keys(config.destinations).some(
      (key) => !destinationKeys.includes(key)
    ) ||
    Object.values(config.destinations).some(
      (value) => typeof value !== "string"
    )
  )
    fail("invalid_configuration", "Unsupported destination configuration");
  const referenceKeys = [
    "androidSigningRef",
    "playCredentialRef",
    "androidSdkRef",
    "javaHomeRef",
    "androidAcceptanceStateRootRef",
    "androidAcceptanceAuthorizationRef",
  ];
  if (
    config.references &&
    (typeof config.references !== "object" ||
      Object.keys(config.references).some(
        (key) => !referenceKeys.includes(key)
      ) ||
      Object.values(config.references).some(
        (value) => typeof value !== "string"
      ))
  )
    fail(
      "invalid_configuration",
      "Unsupported private reference configuration"
    );
  for (const reference of Object.values(config.references || {})) {
    if (
      !/^(env:[A-Z_][A-Z0-9_]*|file:\/[^\n]+|keychain:[A-Za-z0-9._/-]+)$/.test(
        reference
      )
    )
      fail(
        "invalid_configuration",
        "Private values must be environment, file or keychain references"
      );
  }
  if (
    config.signing !== undefined &&
    (typeof config.signing !== "object" ||
      config.signing === null ||
      Object.keys(config.signing).some(
        (key) => !["androidPackage", "androidLocal"].includes(key)
      ) ||
      ![undefined, "upload", "unsigned-artifact"].includes(
        config.signing.androidPackage
      ) ||
      ![undefined, "debug", "upload"].includes(config.signing.androidLocal))
  )
    fail("invalid_configuration", "Unsupported Android signing mode");
  return { config, runRoot };
}
function prerequisites(target, profile, config) {
  const missing = [];
  const required =
    {
      "electron-local": ["electronInstallPath"],
      "chrome-local": ["chromeExtensionDir", "chromeProfilePath"],
      "android-local": ["androidDeviceSerial"],
      "android-internal": ["playApplicationId", "playTrack"],
    }[target] || [];
  for (const key of required)
    if (!config.destinations[key]) missing.push(`destination:${key}`);
  if (target.startsWith("android")) {
    for (const key of ["androidSdkRef", "javaHomeRef"])
      if (!config.references?.[key]) missing.push(`reference:${key}`);
    if (!config.references?.androidAcceptanceStateRootRef)
      missing.push("reference:androidAcceptanceStateRootRef");
    if (!config.references?.androidAcceptanceAuthorizationRef)
      missing.push("reference:androidAcceptanceAuthorizationRef");
    if (!config.destinations.androidAcceptanceEffort)
      missing.push("destination:androidAcceptanceEffort");
    for (const api of profile.androidQualification.apis)
      if (!config.destinations[`androidAcceptanceSerialApi${api}`])
        missing.push(`destination:androidAcceptanceSerialApi${api}`);
  }
  if (
    ["android-package", "android-internal"].includes(target) &&
    config.signing?.androidPackage !== "unsigned-artifact"
  )
    if (!config.references?.androidSigningRef)
      missing.push("reference:androidSigningRef");
  if (target === "android-local" && !config.signing?.androidLocal)
    missing.push("signing:androidLocal");
  if (
    target === "android-local" &&
    config.signing?.androidLocal === "upload" &&
    !config.references?.androidSigningRef
  )
    missing.push("reference:androidSigningRef");
  if (
    target === "android-internal" &&
    config.signing?.androidPackage === "unsigned-artifact"
  )
    missing.push("signing:android-internal-requires-upload");
  if (target === "android-internal" && !config.references?.playCredentialRef)
    missing.push("reference:playCredentialRef");
  if (
    process.platform !== profile.supportedHost.platform ||
    !profile.supportedHost.architectures.includes(process.arch)
  )
    missing.push(
      `host:${profile.supportedHost.platform}/${profile.supportedHost.architectures.join(",")}`
    );
  return missing;
}
function versionAtLeast(actual, minimum) {
  const a = actual.replace(/^v/, "").split(".").map(Number);
  const b = minimum.replace(/^>=/, "").split(".").map(Number);
  if (a.length < b.length || a.some((n) => !Number.isInteger(n))) return false;
  for (let index = 0; index < b.length; index++) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}
function hostPrerequisites(profile) {
  const missing = [];
  if (!versionAtLeast(process.version, profile.toolchain.node))
    missing.push(`tool:node:${profile.toolchain.node}`);
  const npm = spawnSync("npm", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    env: gitEnvironment,
  });
  if (
    npm.error ||
    npm.status !== 0 ||
    !versionAtLeast(npm.stdout.trim(), profile.toolchain.npm)
  )
    missing.push(`tool:npm:${profile.toolchain.npm}`);
  return missing;
}
function plan(args) {
  const parsed = options(args);
  const root = checkedRoot(parsed.repo);
  const { config, runRoot } = configuration(parsed.config, root);
  const profileBytes = readFileSync(profilePath);
  const profile = JSON.parse(profileBytes);
  if (profile.schema !== 1)
    fail("invalid_profile", "Unsupported delivery profile schema");
  const targets = [...new Set(parsed.targets)];
  for (const target of targets)
    if (!profile.targets[target])
      fail("invalid_target", `Unknown target: ${target}`);
  if (
    targets.includes("android-internal") &&
    config.destinations.playTrack &&
    config.destinations.playTrack !== "internal"
  )
    fail(
      "invalid_configuration",
      "Android internal publication requires the internal Play track"
    );
  const hostMissing = hostPrerequisites(profile);
  const id = randomUUID();
  const source = sourceFrom(
    root,
    parsed.source,
    path.join(runRoot, "source-cache", id)
  );
  const parent = parsed.supersedes
    ? readJson(path.resolve(parsed.supersedes), "invalid_predecessor")
    : null;
  if (
    parent &&
    (parent.schema !== 1 || parent.repository?.root !== root || !parent.id)
  )
    fail(
      "invalid_predecessor",
      "Predecessor is not a compatible Clipp delivery plan"
    );
  const targetRecords = Object.fromEntries(
    targets.map((target) => [
      target,
      {
        ...profile.targets[target],
        signing:
          target === "android-package"
            ? config.signing?.androidPackage || "upload"
            : target === "android-local"
              ? config.signing?.androidLocal || null
              : profile.targets[target].signing,
        destinationIdentity:
          config.destinations[profile.targets[target].destination] || null,
        qualification: target.startsWith("android")
          ? {
              effort: config.destinations.androidAcceptanceEffort || null,
              serials: Object.fromEntries(
                profile.androidQualification.apis.map((api) => [
                  api,
                  config.destinations[`androidAcceptanceSerialApi${api}`] ||
                    null,
                ])
              ),
            }
          : undefined,
        prerequisites: [
          ...hostMissing,
          ...prerequisites(target, profile, config),
        ],
      },
    ])
  );
  const record = {
    schema: 1,
    id,
    createdAt: new Date().toISOString(),
    predecessorId: parent?.id || null,
    repository: {
      root,
      identity: git(root, ["rev-parse", "--absolute-git-dir"]),
    },
    source,
    tool: {
      revision: git(
        path.dirname(script),
        ["rev-parse", "HEAD"],
        "tool_revision_unavailable"
      ),
      scriptSha256: sha(readFileSync(script)),
      moduleSha256: moduleSha256(),
    },
    profile: {
      schema: 1,
      sha256: sha(profileBytes),
      toolchain: profile.toolchain,
      supportedHost: profile.supportedHost,
      preflight: profile.preflight,
      candidateGeneratedOutputs: profile.candidateGeneratedOutputs,
      commonChecks: profile.commonChecks,
      androidQualification: profile.androidQualification,
    },
    configurationSha256: sha(JSON.stringify(config)),
    privateReferences: config.references || {},
    targets: targetRecords,
    outputRoot: path.join(runRoot, "runs", id),
    authorization:
      "delivery requires matching authorization; a plan is not permission",
  };
  const directory = path.join(runRoot, "plans", id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, "plan.json");
  const temporary = path.join(directory, `.plan-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  renameSync(temporary, destination);
  writeFileSync(
    `${destination}.sha256`,
    sha(readFileSync(destination)) + "\n",
    {
      mode: 0o600,
      flag: "wx",
    }
  );
  return { code: "planned", path: destination, plan: record };
}
function help() {
  return `Clipp delivery (Mac)\n\n  npm run delivery -- plan --repo <Clipp root> --config <private JSON> --source <full commit|remote/branch> --target <target> [--target <target>] [--supersedes <plan.json>] [--json]\n  npm run delivery -- run <plan.json|run-id> [--config <private JSON>] [--native-diagnostic-change <text> --native-expected-observation <text>] [--native-renewal <absolute decision file>] [--json]\n  npm run delivery -- status <run-id> --config <private JSON> [--json]\n\nTargets: electron-package, electron-local, chrome-local, android-package, android-local, android-internal.\nPlanning may contact a named Git remote and writes an immutable plan to config.runRoot. It does not build, install, publish, or authorize delivery. Run prepares and verifies the frozen source. Android qualification uses explicitly selected and authorized acceptance emulators; other platform stages may remain incomplete. Status is read-only.\n`;
}
function runOptions(args, { status = false } = {}) {
  const [selector, ...rest] = args;
  if (!selector || selector.startsWith("--"))
    fail("invalid_options", "Expected plan path or run ID");
  let configPath = process.env.CLIPP_DELIVERY_CONFIG;
  const native = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--json") continue;
    if (rest[i] === "--config" && rest[i + 1]) configPath = rest[++i];
    else if (
      [
        "--native-diagnostic-change",
        "--native-expected-observation",
        "--native-renewal",
        "--native-successor",
      ].includes(rest[i]) &&
      rest[i + 1] &&
      !rest[i + 1].startsWith("--")
    ) {
      const field = {
        "--native-diagnostic-change": "change",
        "--native-expected-observation": "expectation",
        "--native-renewal": "renewal",
        "--native-successor": "successor",
      }[rest[i]];
      if (native[field]) fail("invalid_options", `Duplicate ${rest[i]}`);
      native[field] = rest[++i];
    } else fail("invalid_options", `Unsupported run/status option: ${rest[i]}`);
  }
  const isId = /^[0-9a-f-]{36}$/.test(selector);
  if (isId && !configPath)
    fail(
      "invalid_options",
      "A run ID requires --config or CLIPP_DELIVERY_CONFIG"
    );
  const runRoot = configPath
    ? readJson(configPath, "invalid_configuration").runRoot
    : null;
  if (configPath && (typeof runRoot !== "string" || !path.isAbsolute(runRoot)))
    fail("invalid_configuration", "Configuration requires absolute runRoot");
  if (status && Object.keys(native).length)
    fail("invalid_options", "Status does not accept native retry options");
  if (
    Boolean(native.change) !== Boolean(native.expectation) ||
    [native.change, native.expectation].some(
      (value) => value && (value.length > 200 || !value.trim())
    ) ||
    (native.renewal && !path.isAbsolute(native.renewal)) ||
    (native.successor && !path.isAbsolute(native.successor)) ||
    (native.renewal && native.successor)
  )
    fail(
      "invalid_options",
      "Native retry requires a bounded changed diagnosis and observation; decisions use absolute paths"
    );
  return { selector, isId, runRoot, native };
}
let json = process.argv.includes("--json");
try {
  if (["help", "--help", "-h"].includes(process.argv[2]))
    process.stdout.write(help());
  else if (process.argv[2] === "plan") {
    const result = plan(process.argv.slice(3));
    process.stdout.write(
      json
        ? JSON.stringify(result) + "\n"
        : `Planned ${result.plan.id} at ${result.path}\nSource ${result.plan.source.commit}\nTargets ${Object.keys(result.plan.targets).join(", ")}\n`
    );
  } else if (process.argv[2] === "run") {
    const { selector, isId, runRoot, native } = runOptions(
      process.argv.slice(3)
    );
    const result = await runDelivery(
      isId ? planPathForId(runRoot, selector) : path.resolve(selector),
      {
        scriptSha256: sha(readFileSync(script)),
        moduleSha256: moduleSha256(),
        profileSha256: sha(readFileSync(profilePath)),
      },
      { native }
    );
    process.stdout.write(
      json
        ? JSON.stringify(result) + "\n"
        : `${result.code}: ${result.run.nextAction}\n`
    );
    process.exitCode =
      result.code === "delivery_incomplete"
        ? 1
        : result.code === "delivery_complete"
          ? 0
          : 1;
  } else if (process.argv[2] === "status") {
    const { selector, isId, runRoot } = runOptions(process.argv.slice(3), {
      status: true,
    });
    if (!isId || !runRoot)
      fail("invalid_options", "Status requires a run ID and --config");
    const result = statusDelivery(runRoot, selector);
    process.stdout.write(
      json
        ? JSON.stringify(result) + "\n"
        : `${result.code}: ${result.run.nextAction} (observed ${result.run.updatedAt})\n`
    );
  } else fail("invalid_operation", "Use plan, run, status or help");
} catch (error) {
  const code = error.code || "delivery_internal_error";
  process.stdout.write(
    json
      ? JSON.stringify({ code, message: error.message }) + "\n"
      : `${code}: ${error.message}\n`
  );
  process.exitCode = 1;
}
