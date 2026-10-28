#!/usr/bin/env node
// Read Git metadata and coordinator records only. No repair, dispatch or shell execution.
import { inspectApplicability } from "./lib/evidence-applicability.mjs";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const schemaRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/agents/ledger"
);

const report = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  runId: null,
  complete: false,
  repositories: {},
  tickets: [],
  claims: [],
  integrations: [],
  evidence: [],
  operational: { state: "unknown" },
  frontier: [],
  diagnostics: [],
};
const diagnostic = (code, message, ticket) =>
  report.diagnostics.push({ code, message, ...(ticket ? { ticket } : {}) });
const hasIntegrityFailure = () =>
  report.diagnostics.some((item) => !item.ticket);
const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const args = process.argv.slice(2);
const json = args.includes("--json");
function readJson(path) {
  requireValue(
    statSync(path).size <= 1024 * 1024,
    `JSON input exceeds 1 MiB: ${path}`
  );
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Malformed JSON metadata: ${path}`);
  }
}
// This deliberately supports just the keywords used by the checked-in schemas.
function validate(schema, value, path = "input") {
  if (schema.$ref) {
    const [file, pointer] = schema.$ref.split("#/");
    const referenced = pointer
      .split("/")
      .reduce((part, key) => part[key], readJson(resolve(schemaRoot, file)));
    return validate(referenced, value, path);
  }
  if (schema.const !== undefined)
    requireValue(value === schema.const, `${path}: expected ${schema.const}`);
  if (schema.enum)
    requireValue(schema.enum.includes(value), `${path}: unsupported value`);
  if (schema.type === "string") {
    requireValue(
      typeof value === "string" &&
        value.length >= (schema.minLength ?? 0) &&
        value.length <= (schema.maxLength ?? Infinity),
      `${path}: expected bounded string`
    );
    if (schema.pattern)
      requireValue(
        new RegExp(schema.pattern).test(value),
        `${path}: invalid format`
      );
  }
  if (schema.type === "array") {
    requireValue(
      Array.isArray(value) &&
        value.length >= (schema.minItems ?? 0) &&
        value.length <= schema.maxItems,
      `${path}: expected bounded array`
    );
    if (schema.uniqueItems)
      requireValue(
        new Set(value.map((item) => JSON.stringify(item))).size ===
          value.length,
        `${path}: duplicate items`
      );
    value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`));
  }
  if (schema.type === "object") {
    requireValue(
      value !== null && typeof value === "object" && !Array.isArray(value),
      `${path}: expected object`
    );
    requireValue(
      Object.keys(value).length >= (schema.minProperties ?? 0) &&
        Object.keys(value).length <= (schema.maxProperties ?? Infinity),
      `${path}: invalid object size`
    );
    for (const field of schema.required ?? [])
      requireValue(Object.hasOwn(value, field), `${path}.${field}: required`);
    for (const [field, item] of Object.entries(value)) {
      const child = schema.properties?.[field] ?? schema.additionalProperties;
      requireValue(
        child !== false && child !== undefined,
        `${path}.${field}: unknown field`
      );
      validate(child, item, `${path}.${field}`);
    }
  }
}
function portable(path) {
  requireValue(
    !isAbsolute(path) &&
      !path
        .split(/[\\/]/)
        .some((part) =>
          [
            "..",
            ".git",
            "node_modules",
            "profiles",
            "credentials",
            "recovery",
            "dist",
          ].includes(part)
        ),
    `unsafe portable path: ${path}`
  );
  return path;
}
function selected(root, path) {
  const target = resolve(root, portable(path));
  requireValue(
    realpathSync(target).startsWith(`${realpathSync(root)}${sep}`),
    `reference leaves selected root: ${path}`
  );
  return target;
}
function rawGit(root, ...command) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
  ])
    delete env[key];
  return execFileSync(
    "git",
    [
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-C",
      root,
      ...command,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
}
const git = (root, ...command) => rawGit(root, ...command).trim();
const ancestor = (root, commit, tip) => {
  try {
    git(root, "merge-base", "--is-ancestor", commit, tip);
    return true;
  } catch {
    return false;
  }
};
function observeRepository(root, saved) {
  requireValue(isAbsolute(root), "root must be absolute");
  requireValue(
    realpathSync(root) ===
      realpathSync(git(root, "rev-parse", "--show-toplevel")),
    "root must select a repository/worktree top level"
  );
  git(root, "cat-file", "-e", `${saved.baseline}^{commit}`);
  const integrationTip = git(
    root,
    "rev-parse",
    "--verify",
    `refs/heads/${saved.integrationBranch}^{commit}`
  );
  const blocks = rawGit(root, "worktree", "list", "--porcelain", "-z")
    .split("\0\0")
    .filter(Boolean);
  requireValue(
    blocks.length <= 200,
    "more than 200 worktrees; narrow/reconcile the run"
  );
  const worktrees = blocks.map((block) => {
    const fields = Object.fromEntries(
      block
        .split("\0")
        .filter(Boolean)
        .map((row) => {
          const space = row.indexOf(" ");
          return [
            space < 0 ? row : row.slice(0, space),
            space < 0 ? true : row.slice(space + 1),
          ];
        })
    );
    const dirty = { staged: 0, unstaged: 0, untracked: 0 };
    try {
      const rows = rawGit(
        fields.worktree,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=all"
      ).split("\0");
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        if (row.startsWith("??")) dirty.untracked++;
        else {
          if (row[0] !== " ") dirty.staged++;
          if (row[1] !== " ") dirty.unstaged++;
          if (/[RC]/.test(row.slice(0, 2))) i++;
        }
      }
      return {
        path: fields.worktree,
        head: fields.HEAD,
        branch: fields.branch?.replace("refs/heads/", "") ?? null,
        dirty,
      };
    } catch {
      diagnostic(
        "worktree-unavailable",
        `Inspect preserved worktree ${fields.worktree}; status unavailable`
      );
      return {
        path: fields.worktree,
        head: fields.HEAD,
        branch: fields.branch ?? null,
        dirty: null,
      };
    }
  });
  const stashes = rawGit(root, "stash", "list", "--format=%gd%x00%H")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [ref, commit] = row.split("\0");
      return { ref, commit };
    });
  const branchRows = rawGit(
    root,
    "for-each-ref",
    "--format=%(refname:strip=2)%00%(objectname)",
    "refs/heads"
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (branchRows.length > 500) {
    diagnostic(
      "branch-inventory-limit",
      "more than 500 local branches; reconcile the branch inventory"
    );
    throw new Error("branch inventory exceeds limit");
  }
  const branches = branchRows.map((row) => {
    const [branch, tip] = row.split("\0");
    return {
      branch,
      tip,
      integration: ancestor(root, tip, integrationTip)
        ? "ancestry"
        : "unverified",
      worktrees: worktrees
        .filter((item) => item.branch === branch)
        .map((item) => item.path),
    };
  });
  return {
    head: git(root, "rev-parse", "HEAD"),
    branch: git(root, "branch", "--show-current") || null,
    integrationBranch: saved.integrationBranch,
    integrationTip,
    worktrees,
    stashes,
    branches,
  };
}
function publicDocument(root, path) {
  const target = selected(root, path);
  requireValue(
    !path.split("/").includes(".local") &&
      realpathSync(target) === resolve(realpathSync(root), portable(path)) &&
      lstatSync(target).isFile() &&
      statSync(target).size <= 128 * 1024,
    "reference must be a bounded regular public file"
  );
  return readFileSync(target, "utf8");
}
function ownershipPointer(root, path, canonical) {
  const text = publicDocument(root, path);
  const owners = [
    ...text.matchAll(
      /^\*\*Owning repository:\*\*[ \t]*(client|relay)\b[^\r\n]*$/gm
    ),
  ];
  const directories = [
    ...text.matchAll(
      /^\*\*Canonical feature directory:\*\*[ \t]*(client|relay):`([^`]+)`[^\r\n]*$/gm
    ),
  ];
  requireValue(
    owners.length === 1 &&
      directories.length === 1 &&
      owners[0][1] === canonical.role &&
      directories[0][1] === canonical.role &&
      directories[0][2].replace(/\/$/, "") ===
        canonical.path.replace(/\/$/, ""),
    "pointer must identify the canonical owner and feature directory"
  );
}
// Public role-relative references are metadata-only; private artifacts use local IDs.
function referenceAvailable(reference, local) {
  try {
    return statSync(
      selected(local.roots[reference.role], reference.path)
    ).isFile();
  } catch {
    return false;
  }
}
function inspectOwnership(ledger, local) {
  const ownership = ledger.ownership;
  const canonical = ownership.canonical;
  const directory = canonical.path.replace(/\/$/, "");
  try {
    portable(directory);
    requireValue(
      /^\.scratch\/[^/]+$/.test(directory) &&
        ledger.tracker.role === canonical.role &&
        ledger.tracker.path === `${directory}/issues` &&
        ownership.specification.role === canonical.role &&
        ownership.specification.path === `${directory}/spec.md` &&
        ownership.decisions.role === canonical.role &&
        ownership.decisions.path === `${directory}/decisions.md`,
      "owner must contain the canonical tracker, specification and decisions"
    );
    const roles = Object.keys(ownership.roles);
    requireValue(
      roles.includes(canonical.role) &&
        ledger.tickets.every((ticket) =>
          ticket.roles.every((role) => roles.includes(role))
        ) &&
        ownership.pointers.length === roles.length - 1 &&
        new Set(ownership.pointers.map((pointer) => pointer.role)).size ===
          ownership.pointers.length &&
        ownership.pointers.every(
          (pointer) =>
            pointer.role !== canonical.role && roles.includes(pointer.role)
        ),
      "each companion role requires exactly one pointer"
    );
  } catch {
    diagnostic(
      "ownership-consistency",
      "Reconcile canonical owner, feature directory, tracker, specification, decisions and participating roles"
    );
  }
  for (const reference of [
    ownership.specification,
    ownership.decisions,
    ...ownership.coverage.map((item) => item.source),
  ]) {
    if (
      !Object.hasOwn(ownership.roles, reference.role) ||
      !referenceAvailable(reference, local)
    )
      diagnostic(
        "ownership-reference",
        `${reference.role}:${reference.path}: required public reference unavailable`
      );
  }
  const headings = new Map();
  try {
    const text = publicDocument(
      local.roots[ownership.specification.role],
      ownership.specification.path
    );
    let fence = null;
    for (const line of text.split(/\r?\n/)) {
      const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (delimiter) {
        if (!fence) fence = delimiter[1];
        else if (
          delimiter[1][0] === fence[0] &&
          delimiter[1].length >= fence.length
        )
          fence = null;
        continue;
      }
      const heading =
        !fence && line.match(/^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
      if (heading)
        headings.set(heading[1], (headings.get(heading[1]) ?? 0) + 1);
    }
  } catch {
    diagnostic(
      "ownership-reference",
      "Canonical specification must be an available bounded public Markdown file"
    );
  }
  const decisions = new Set();
  for (const item of ownership.coverage) {
    if (
      decisions.has(item.decision) ||
      (item.disposition === "accepted" && !item.requirements.length) ||
      item.requirements.some((heading) => headings.get(heading) !== 1)
    )
      diagnostic(
        "decision-coverage",
        `${item.decision}: require a unique decision ID and existing unambiguous specification headings; accepted decisions need coverage`
      );
    decisions.add(item.decision);
  }
  for (const pointer of ownership.pointers) {
    try {
      const target = selected(local.roots[pointer.role], pointer.path);
      requireValue(
        pointer.path.endsWith("/README.md"),
        "companion pointer must be a README"
      );
      const parent = dirname(target);
      const entries = readdirSync(parent);
      requireValue(entries.length <= 500, "companion directory exceeds limit");
      let tickets = [];
      if (entries.includes("issues"))
        tickets = readdirSync(selected(parent, "issues"));
      requireValue(
        !entries.includes("spec.md") &&
          ![...entries, ...tickets].some((name) => /^\d+-.*\.md$/.test(name)),
        "companion directory contains a duplicate specification or numbered tickets"
      );
    } catch {
      diagnostic(
        "ownership-duplicate",
        `${pointer.role}:${pointer.path}: require an accessible pointer-only companion directory`
      );
    }
  }
  for (const reference of [
    {
      role: ownership.canonical.role,
      path: `${ownership.canonical.path.replace(/\/$/, "")}/README.md`,
    },
    ...ownership.pointers,
  ]) {
    try {
      ownershipPointer(
        local.roots[reference.role],
        reference.path,
        ownership.canonical
      );
    } catch {
      diagnostic(
        "ownership-pointer",
        `${reference.role}:${reference.path}: canonical owner/directory pointer missing or inconsistent`
      );
    }
  }
}
function inspectScenarios(ledger, local, tickets) {
  const ids = new Set();
  function dependsOn(owner, prerequisite, visited = new Set()) {
    if (visited.has(owner)) return false;
    visited.add(owner);
    return (tickets.get(owner)?.dependencies ?? []).some(
      (path) => path === prerequisite || dependsOn(path, prerequisite, visited)
    );
  }
  for (const scenario of ledger.scenarios) {
    if (ids.has(scenario.id))
      diagnostic(
        "scenario-duplicate",
        `${scenario.id}: each scenario criterion needs exactly one primary allocation; use distinct IDs for separate runtime cases`
      );
    ids.add(scenario.id);
    if (!tickets.has(scenario.primaryOwner))
      diagnostic(
        "scenario-owner",
        `${scenario.id}: primary qualification owner ${scenario.primaryOwner} must be an existing canonical numbered ticket`
      );
    if (
      !Object.hasOwn(ledger.ownership.roles, scenario.requirement.role) ||
      scenario.requirement.path.split(/[\\/]/).includes(".local") ||
      !referenceAvailable(scenario.requirement, local)
    )
      diagnostic(
        "scenario-reference",
        `${scenario.id}: requirement must reference an available public file in a participating repository`
      );
    for (const path of scenario.prerequisites)
      if (
        !tickets.has(path) ||
        path === scenario.primaryOwner ||
        !dependsOn(scenario.primaryOwner, path)
      )
        diagnostic(
          "scenario-dependency",
          `${scenario.id}: prerequisite ${path} must exist in the primary owner's canonical dependency graph`
        );
    for (const path of scenario.contributors)
      if (!tickets.has(path) || path === scenario.primaryOwner)
        diagnostic(
          "scenario-contributor",
          `${scenario.id}: contributor ${path} must name another existing canonical numbered ticket`
        );
  }
  report.scenarios = ledger.scenarios.map((scenario) => ({
    ...scenario,
    ownerStatus: tickets.get(scenario.primaryOwner)?.status ?? "unavailable",
    qualification: "not-assessed",
  }));
}
function inspectOperational(ledger, local, preserved) {
  if (!ledger.operational) return;
  const byId = new Map();
  const operationalRows = [
    ...ledger.operational.deployments.map((item) => ["deployment", item]),
    ...ledger.operational.access.map((item) => ["access", item]),
    ...ledger.operational.authorizations.map((item) => ["authorization", item]),
  ];
  const validDate = (value) => Number.isFinite(Date.parse(value));
  const validateSource = (source, label) => {
    if (source.kind === "public")
      requireValue(
        ["client", "relay"].includes(source.role) &&
          typeof source.path === "string" &&
          source.path.length > 0,
        `${label}: public source requires repository role and relative path`
      );
    if (source.kind === "artifact")
      requireValue(
        typeof source.id === "string" && source.id.length > 0,
        `${label}: artifact source requires artifact id`
      );
  };
  for (const [kind, item] of operationalRows) {
    requireValue(
      !byId.has(item.id),
      `duplicate operational record id: ${item.id}`
    );
    requireValue(
      validDate(item.observedAt),
      `${item.id}: observedAt must be a date`
    );
    validateSource(item.source, item.id);
    if (kind === "deployment") {
      requireValue(
        validDate(item.qualification.observedAt),
        `${item.id}: qualification observedAt must be a date`
      );
      validateSource(item.qualification.source, `${item.id} qualification`);
      requireValue(
        !/:[^/@\s]+@/.test(item.identity.publicEndpoint),
        `${item.id}: public endpoint must not contain embedded credentials`
      );
    }
    if (kind === "access")
      requireValue(
        !/:[^/@\s]+@/.test(item.route),
        `${item.id}: access route must not contain embedded credentials`
      );
    if (kind === "authorization") {
      requireValue(
        validDate(item.authorizationDate),
        `${item.id}: authorizationDate must be a date`
      );
      requireValue(
        validDate(item.statusAt),
        `${item.id}: statusAt must be a date`
      );
      requireValue(
        Date.parse(item.statusAt) >= Date.parse(item.authorizationDate),
        `${item.id}: statusAt precedes authorization`
      );
      validateSource(item.statusSource, `${item.id} status`);
      requireValue(
        item.status === "superseded"
          ? typeof item.supersededBy === "string" &&
              item.supersededBy.length > 0 &&
              item.supersededBy !== item.id
          : item.supersededBy === undefined,
        `${item.id}: supersededBy must only identify a replacement authorization`
      );
    }
    byId.set(item.id, { kind, item });
  }
  for (const { kind, item } of byId.values())
    if (kind === "authorization" && item.status === "superseded")
      requireValue(
        byId.has(item.supersededBy),
        `${item.id}: superseded authorization reference unavailable`
      );
  function sourceAvailable(source) {
    if (source.kind === "public") return referenceAvailable(source, local);
    try {
      const path = local.artifacts[source.id];
      return isAbsolute(path) && !!statSync(path) && preserved(path);
    } catch {
      return false;
    }
  }
  const records = (items) =>
    items.map((item) => ({
      ...item,
      availability: sourceAvailable(item.source) ? "available" : "unavailable",
    }));
  const requirements = ledger.operational.requirements.map((requirement) => {
    const ticket = report.tickets.find(
      (item) => item.path === requirement.ticket
    );
    requireValue(
      ticket,
      `${requirement.ticket}: operational requirement ticket unavailable`
    );
    const states = requirement.records.map((id) => {
      const record = byId.get(id);
      if (!record) return { id, state: "unknown" };
      const { kind, item } = record;
      let state =
        sourceAvailable(item.source) &&
        (kind !== "authorization" || sourceAvailable(item.statusSource))
          ? "available"
          : "unavailable";
      if (
        kind === "authorization" &&
        ["revoked", "superseded"].includes(item.status)
      )
        state = item.status;
      return { id, state };
    });
    return {
      ticket: requirement.ticket,
      records: requirement.records,
      blockers: states.filter(({ state }) => state !== "available"),
    };
  });
  report.operational = {
    state: "recorded",
    deploymentsState: ledger.operational.deployments.length
      ? "recorded"
      : "unknown",
    accessState: ledger.operational.access.length ? "recorded" : "unknown",
    authorizationsState: ledger.operational.authorizations.length
      ? "recorded"
      : "unknown",
    deployments: records(ledger.operational.deployments).map((item) => ({
      ...item,
      currentState: "unverified",
      qualification: {
        ...item.qualification,
        availability: sourceAvailable(item.qualification.source)
          ? "available"
          : "unavailable",
        freshness: Object.entries(item.qualification.revisions).every(
          ([role, revision]) =>
            report.repositories[role]?.integrationTip === revision
        )
          ? "matching-revisions"
          : "stale",
      },
    })),
    access: records(ledger.operational.access).map((item) => ({
      ...item,
      currentAvailability: "unverified",
    })),
    authorizations: records(ledger.operational.authorizations).map((item) => ({
      ...item,
      statusAvailability: sourceAvailable(item.statusSource)
        ? "available"
        : "unavailable",
      permission: "not-assessed",
    })),
    requirements,
  };
  for (const ticket of report.tickets) {
    ticket.operationalBlockers = requirements
      .filter((item) => item.ticket === ticket.path)
      .flatMap((item) => item.blockers);
  }
}
function main() {
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/agent-status.mjs --ledger RUN.json --local LOCAL.json [--json]\nRead-only recovery status, run/output schemaVersion 1, 2 or 3; local schemaVersion 1; exit 1 withholds assignment. See docs/agents/recovery.md."
    );
    return;
  }
  const inputs = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--json") continue;
    requireValue(
      ["--ledger", "--local"].includes(flag) && args[i + 1] && !inputs[flag],
      `expected --ledger and --local once, got ${flag}`
    );
    inputs[flag] = args[++i];
  }
  requireValue(
    inputs["--ledger"] && inputs["--local"],
    "explicit --ledger and --local are required"
  );
  const ledger = readJson(inputs["--ledger"]);
  const local = readJson(inputs["--local"]);
  requireValue(
    [1, 2, 3].includes(ledger.schemaVersion),
    "unsupported run schemaVersion"
  );
  validate(
    readJson(resolve(schemaRoot, `run-v${ledger.schemaVersion}.schema.json`)),
    ledger,
    "ledger"
  );
  validate(
    readJson(resolve(schemaRoot, "local-v1.schema.json")),
    local,
    "local"
  );
  report.schemaVersion = ledger.schemaVersion;
  report.runId = ledger.runId;
  requireValue(
    ledger.schemaVersion >= 2 || ledger.tracker.role === "client",
    "canonical tracker must belong to client role"
  );
  for (const [role, saved] of Object.entries(ledger.repositories)) {
    try {
      report.repositories[role] = observeRepository(local.roots[role], saved);
      if (report.repositories[role].integrationTip !== saved.integrationTip)
        diagnostic(
          "integration-tip-changed",
          `${role}: reconcile saved integrationTip with observed ${report.repositories[role].integrationTip}`
        );
    } catch {
      diagnostic(
        "repository-unavailable",
        `${role}: inspect explicit root, baseline and integration branch; required repository unavailable`
      );
    }
  }
  if (report.repositories.client && report.repositories.relay)
    requireValue(
      realpathSync(
        resolve(
          local.roots.client,
          git(local.roots.client, "rev-parse", "--git-common-dir")
        )
      ) !==
        realpathSync(
          resolve(
            local.roots.relay,
            git(local.roots.relay, "rev-parse", "--git-common-dir")
          )
        ),
      "client and relay must select distinct repositories"
    );
  if (ledger.schemaVersion >= 2) inspectOwnership(ledger, local);
  const trackerRoot = local.roots[ledger.tracker.role];
  const tracker = selected(trackerRoot, ledger.tracker.path);
  const paths = readdirSync(tracker)
    .filter((path) => /^\d+-.*\.md$/.test(path))
    .sort();
  requireValue(paths.length <= 500, "tracker exceeds 500 numbered tickets");
  for (const path of paths) {
    const target = selected(tracker, path);
    requireValue(
      lstatSync(target).isFile() && statSync(target).size <= 128 * 1024,
      `ticket must be a bounded regular file: ${path}`
    );
    const text = readFileSync(target, "utf8");
    const statuses = [...text.matchAll(/^\*\*Status:\*\*[ \t]*([^\r\n]+)$/gm)];
    const blockers = [
      ...text.matchAll(/^\*\*Blocked by:\*\*[ \t]*([^\r\n]*)$/gm),
    ];
    requireValue(
      statuses.length === 1 && blockers.length === 1,
      `${path}: one bold Status and Blocked by field required`
    );
    const status = statuses[0][1].trim();
    requireValue(
      [
        "ready-for-agent",
        "ready-for-human",
        "needs-triage",
        "needs-info",
        "claimed",
        "blocked",
        "deferred",
        "resolved",
        "wontfix",
      ].includes(status),
      `${path}: unknown Status`
    );
    const value = blockers[0][1].trim();
    const dependencies = [];
    if (value && !/^(?:none(?:\s+\([^()[\]]*\))?\.?|[-—])$/i.test(value)) {
      const links = [...value.matchAll(/\[[^\]]+\]\((\d+-[^)]+\.md)\)/g)];
      const remainder = value
        .replace(/\[[^\]]+\]\((\d+-[^)]+\.md)\)/g, "")
        .replace(/[\s,;.]/g, "");
      if (!links.length || remainder)
        diagnostic(
          "malformed-dependency",
          `${path}: use linked numbered ticket filenames or None.`
        );
      dependencies.push(...links.map((link) => link[1]));
    }
    const metadata = ledger.tickets.find((ticket) => ticket.path === path);
    if (!metadata)
      diagnostic(
        "ticket-metadata",
        `${path}: add decision/role/evidence requirements to ledger`
      );
    report.tickets.push({
      path,
      status,
      dependencies,
      roles: metadata?.roles ?? [],
      decision: metadata?.decision ?? null,
      externalBlockers: metadata?.externalBlockers ?? [],
    });
  }
  const tickets = new Map(
    report.tickets.map((ticket) => [ticket.path, ticket])
  );
  requireValue(
    new Set(ledger.tickets.map((ticket) => ticket.path)).size ===
      ledger.tickets.length,
    "duplicate ticket metadata"
  );
  for (const ticket of ledger.tickets) {
    portable(ticket.path);
    if (!tickets.has(ticket.path))
      diagnostic(
        "ticket-missing",
        `${ticket.path}: canonical numbered ticket unavailable`
      );
    for (const reference of ticket.decision.references) {
      try {
        statSync(selected(local.roots[reference.role], reference.path));
      } catch {
        diagnostic(
          "decision-reference",
          `${ticket.path}: required decision reference unavailable: ${reference.role}:${reference.path}`
        );
      }
    }
    if (ticket.decision.assessment === "approved") {
      const decision = ticket.decision.userDecision;
      try {
        requireValue(
          decision && Number.isFinite(Date.parse(decision.date)),
          "dated explicit user decision required"
        );
        requireValue(
          !ticket.decision.references.some(
            (reference) =>
              reference.role === decision.reference.role &&
              reference.path === decision.reference.path
          ),
          "user decision reference must be distinct from prior accepted references"
        );
        statSync(
          selected(
            local.roots[decision.reference.role],
            decision.reference.path
          )
        );
      } catch {
        diagnostic(
          "decision-approval",
          `${ticket.path}: approved interpretation requires distinct available user decision reference, source, date and scope; an assessment toggle is insufficient`
        );
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(path) {
    if (visiting.has(path)) {
      diagnostic("cyclic-dependency", `${path}: reconcile dependency cycle`);
      return;
    }
    if (visited.has(path)) return;
    const ticket = tickets.get(path);
    if (!ticket) {
      diagnostic(
        "missing-dependency",
        `${path}: dependency ticket unavailable`
      );
      return;
    }
    visiting.add(path);
    ticket.dependencies.forEach(visit);
    visiting.delete(path);
    visited.add(path);
  }
  paths.forEach(visit);
  if (ledger.schemaVersion === 3) inspectScenarios(ledger, local, tickets);
  const claimIds = new Set();
  const claimed = new Set();
  const implementationBranches = new Set();
  const implementationWorktrees = new Set();
  for (const claim of ledger.claims) {
    if (claimIds.has(claim.id) || claimed.has(claim.ticket))
      diagnostic(
        "duplicate-claim",
        `${claim.ticket}: coordinator must reconcile duplicate claim`
      );
    claimIds.add(claim.id);
    claimed.add(claim.ticket);
    if (claim.coordinator !== ledger.coordinator)
      diagnostic(
        "claim-coordinator",
        `${claim.id}: claim was not saved by run coordinator`
      );
    const ticket = tickets.get(claim.ticket);
    if (!ticket)
      diagnostic("claim-ticket", `${claim.id}: canonical ticket unavailable`);
    else if (ticket.status !== "claimed")
      diagnostic(
        "ticket-owner",
        `${claim.id}: retained claim conflicts with ${ticket.status} ticket; reconcile explicitly`
      );
    if (
      claim.activity === "blocked" &&
      ticket &&
      ticket.decision?.assessment !== "pending" &&
      !ticket.externalBlockers.length &&
      !ticket.dependencies.some(
        (path) => tickets.get(path)?.status !== "resolved"
      )
    )
      diagnostic(
        "claim-reason",
        `${claim.id}: blocked ownership requires a recorded dependency, decision or external blocker`
      );
    if (
      claim.activity === "active" &&
      (!ticket ||
        ticket.decision?.assessment === "pending" ||
        ticket.externalBlockers.length ||
        ticket.dependencies.some(
          (path) => tickets.get(path)?.status !== "resolved"
        ))
    )
      diagnostic(
        "claim-blocked",
        `${claim.id}: active implementation has uncleared blockers`
      );
    const repositories = {};
    if (claim.activity === "active" && !Object.keys(claim.repositories).length)
      diagnostic(
        "claim-repository",
        `${claim.id}: active implementation requires an isolated repository/worktree record`
      );
    for (const [role, source] of Object.entries(claim.repositories)) {
      const branchKey = `${role}:${source.branch}`;
      if (
        implementationBranches.has(branchKey) ||
        source.branch === ledger.repositories[role].integrationBranch
      )
        diagnostic(
          "claim-isolation",
          `${claim.id}:${role}: implementation branch must be exclusive to its claim and separate from integration`
        );
      implementationBranches.add(branchKey);
      try {
        const root = local.roots[role];
        requireValue(
          ticket?.roles.includes(role),
          "claim role outside ticket scope"
        );
        git(root, "cat-file", "-e", `${source.baseline}^{commit}`);
        const branchTip = git(
          root,
          "rev-parse",
          "--verify",
          `refs/heads/${source.branch}^{commit}`
        );
        requireValue(
          ancestor(root, source.baseline, branchTip),
          "claim branch lost recorded baseline"
        );
        requireValue(
          ancestor(root, ledger.repositories[role].baseline, source.baseline) &&
            ancestor(
              root,
              source.baseline,
              report.repositories[role].integrationTip
            ),
          "claim baseline must belong to the approved integration lineage"
        );
        const worktreePath = local.worktrees[source.worktree];
        requireValue(
          worktreePath && isAbsolute(worktreePath),
          "claim worktree local mapping required"
        );
        const worktreeKey = `${role}:${realpathSync(worktreePath)}`;
        if (implementationWorktrees.has(worktreeKey))
          diagnostic(
            "claim-isolation",
            `${claim.id}:${role}: implementation worktree is already reserved by another claim`
          );
        implementationWorktrees.add(worktreeKey);
        const worktree = report.repositories[role]?.worktrees.find(
          (item) => realpathSync(item.path) === realpathSync(worktreePath)
        );
        requireValue(
          worktree &&
            worktree.branch === source.branch &&
            worktree.head === branchTip,
          "claim worktree branch/tip mismatch"
        );
        if (source.sourceCommits.length)
          requireValue(
            source.sourceCommits.at(-1) === branchTip,
            "source branch tip changed; reconcile saved commits"
          );
        for (const commit of source.sourceCommits)
          requireValue(
            ancestor(root, commit, branchTip),
            "source commit is not retained by source branch"
          );
        const contained =
          source.sourceCommits.length &&
          source.sourceCommits.every((commit) =>
            ancestor(root, commit, report.repositories[role].integrationTip)
          );
        repositories[role] = {
          ...source,
          integration: contained ? "ancestry" : "unintegrated",
          branchTip,
          containment: Object.fromEntries(
            source.sourceCommits.map((commit) => [
              commit,
              git(
                root,
                "for-each-ref",
                `--contains=${commit}`,
                "--format=%(refname:short)",
                "refs/heads"
              )
                .split("\n")
                .filter(Boolean),
            ])
          ),
        };
      } catch {
        diagnostic(
          "claim-repository",
          `${claim.id}:${role}: inspect branch, baseline, saved commits and required worktree mapping`
        );
      }
    }
    report.claims.push({ ...claim, repositories });
  }
  for (const ticket of report.tickets)
    if (ticket.status === "claimed" && !claimed.has(ticket.path))
      diagnostic(
        "ticket-owner",
        `${ticket.path}: claimed ticket has no saved owner`
      );
  const active = ledger.claims.filter((claim) => claim.activity === "active");
  if (active.length > ledger.maxImplementers)
    diagnostic(
      "implementer-limit",
      "At most two active implementation claims may run; coordinator must reconcile capacity"
    );
  if (new Set(active.map((claim) => claim.owner)).size !== active.length)
    diagnostic(
      "owner-conflict",
      "Active implementer owns multiple claims; reconcile dispatch identity"
    );
  report.activeImplementers = active.length;
  report.availableSlots = Math.max(0, ledger.maxImplementers - active.length);
  function preserved(path) {
    const target = realpathSync(path);
    const disposable = Object.values(report.repositories).flatMap(
      (repository) =>
        repository.worktrees
          .filter((worktree) => {
            try {
              return statSync(resolve(worktree.path, ".git")).isFile();
            } catch {
              return true;
            }
          })
          .map((worktree) => worktree.path)
    );
    return !disposable.some((path) => {
      const worktree = realpathSync(path);
      return target === worktree || target.startsWith(`${worktree}${sep}`);
    });
  }
  function available(id) {
    try {
      requireValue(
        isAbsolute(local.artifacts[id] ?? ""),
        "absolute artifact path required"
      );
      statSync(local.artifacts[id]);
      if (ledger.schemaVersion >= 2 && !preserved(local.artifacts[id])) {
        diagnostic(
          "artifact-unpreserved",
          `${id}: preserve required evidence outside linked implementation/integration worktrees`
        );
        return false;
      }
      return true;
    } catch {
      diagnostic(
        "artifact-unavailable",
        `${id}: supply an accessible local artifact mapping; contents are not read`
      );
      return false;
    }
  }
  if (ledger.schemaVersion >= 2) {
    for (const flag of ["--ledger", "--local"])
      if (!preserved(inputs[flag]))
        diagnostic(
          "input-unpreserved",
          `${flag}: keep mutable records outside linked implementation/integration worktrees`
        );
    report.ownership = {
      ...ledger.ownership,
      artifacts: ledger.ownership.artifacts.map((id) => ({
        id,
        available: available(id),
      })),
    };
  }
  if (ledger.schemaVersion >= 2) inspectOperational(ledger, local, preserved);
  const applicability =
    ledger.schemaVersion === 3
      ? inspectApplicability(
          ledger,
          report.repositories,
          local.roots,
          git,
          portable,
          rawGit
        )
      : null;
  if (applicability) report.carryForwards = applicability.records;
  const evidenceIds = new Set();
  for (const item of ledger.evidence) {
    requireValue(
      !evidenceIds.has(item.id),
      `duplicate evidence id: ${item.id}`
    );
    evidenceIds.add(item.id);
    const ticket = tickets.get(item.ticket);
    requireValue(ticket, `${item.id}: evidence ticket missing`);
    requireValue(
      Number.isFinite(Date.parse(item.observedAt)),
      `${item.id}: observedAt must be a date`
    );
    requireValue(
      item.kind === "verification"
        ? item.profile && item.command && item.tools
        : item.reviewer,
      `${item.id}: command/profile/tools or reviewer required`
    );
    requireValue(
      ticket.roles.every((role) => item.revisions[role]),
      `${item.id}: exact revision required for each ticket role`
    );
    let freshness = "fresh";
    if (
      ticket.roles.some(
        (role) =>
          item.revisions[role] !== report.repositories[role]?.integrationTip
      )
    ) {
      freshness = applicability?.applicable(item) ? "carried-forward" : "stale";
      if (freshness === "stale")
        diagnostic(
          "evidence-stale",
          `${item.id}: renew evidence or review applicability at current integration revisions`,
          ledger.schemaVersion === 3 ? ticket.path : undefined
        );
    }
    if (!item.artifacts.map(available).every(Boolean))
      freshness = "unavailable";
    report.evidence.push({ ...item, freshness });
  }
  function accepted(ticket) {
    const required = ledger.tickets.find(
      (item) => item.path === ticket.path
    ).requiredProfiles;
    const evidence = report.evidence.filter(
      (item) =>
        item.ticket === ticket.path &&
        item.outcome === "passed" &&
        ["fresh", "carried-forward"].includes(item.freshness)
    );
    return (
      required.every((profile) =>
        evidence.some(
          (item) => item.kind === "verification" && item.profile === profile
        )
      ) &&
      ["standards", "spec"].every((kind) =>
        evidence.some((item) => item.kind === kind)
      )
    );
  }
  const integratedKeys = new Set();
  for (const item of ledger.integrations) {
    const ticket = tickets.get(item.ticket);
    requireValue(
      ticket?.roles.includes(item.role),
      `${item.ticket}:${item.role}: integration outside ticket scope`
    );
    const key = `${item.ticket}:${item.role}:${item.sourceCommit}`;
    requireValue(
      !integratedKeys.has(key),
      `duplicate integration mapping: ${key}`
    );
    integratedKeys.add(key);
    let ancestry = false;
    let verifiedMapping = false;
    try {
      const root = local.roots[item.role];
      git(root, "cat-file", "-e", `${item.sourceCommit}^{commit}`);
      git(root, "cat-file", "-e", `${item.integratedCommit}^{commit}`);
      requireValue(
        ancestor(
          root,
          item.integratedCommit,
          report.repositories[item.role].integrationTip
        ),
        "integrated revision not contained"
      );
      ancestry = ancestor(
        root,
        item.sourceCommit,
        report.repositories[item.role].integrationTip
      );
      verifiedMapping =
        item.verifiedBy === ledger.coordinator && available(item.artifact);
      if (!verifiedMapping)
        diagnostic(
          "integration-unverified",
          `${key}: coordinator attestation and available receipt required`
        );
    } catch {
      diagnostic(
        "integration-unverified",
        `${key}: source/integrated revisions must exist and integrated commit must be contained`
      );
    }
    const integration = ancestry
      ? "ancestry"
      : verifiedMapping
        ? "verified-mapping"
        : "unverified";
    report.integrations.push({
      ...item,
      ancestry,
      verifiedMapping,
      integration,
      acceptance: verifiedMapping && accepted(ticket) ? "fresh" : "pending",
    });
  }
  for (const claim of report.claims)
    for (const [role, source] of Object.entries(claim.repositories)) {
      if (
        source.integration === "unintegrated" &&
        source.sourceCommits.length &&
        source.sourceCommits.every((commit) =>
          report.integrations.some(
            (item) =>
              item.ticket === claim.ticket &&
              item.role === role &&
              item.sourceCommit === commit &&
              item.verifiedMapping
          )
        )
      )
        source.integration = "verified-mapping";
    }
  for (const [role, repository] of Object.entries(report.repositories))
    for (const branch of repository.branches)
      if (
        branch.integration === "unverified" &&
        report.integrations.some(
          (item) =>
            item.role === role &&
            item.sourceCommit === branch.tip &&
            item.verifiedMapping
        )
      )
        branch.integration = "verified-mapping";
  for (const ticket of report.tickets)
    if (ticket.status === "resolved") {
      if (
        !ticket.roles.every((role) =>
          report.integrations.some(
            (item) =>
              item.ticket === ticket.path &&
              item.role === role &&
              item.verifiedMapping
          )
        )
      )
        diagnostic(
          "resolution-integration",
          `${ticket.path}: every ticket role needs demonstrated integration with coordinator receipt`
        );
      if (!accepted(ticket))
        diagnostic(
          "resolution-evidence",
          `${ticket.path}: resolution requires applicable passed profiles and Standards/Spec reviews for every role`,
          ledger.schemaVersion === 3 ? ticket.path : undefined
        );
      if (
        ticket.decision?.assessment === "pending" ||
        ticket.externalBlockers.length ||
        ticket.dependencies.some(
          (path) => tickets.get(path)?.status !== "resolved"
        )
      )
        diagnostic(
          "resolution-blocked",
          `${ticket.path}: resolved ticket retains dependency, decision or external blockers`
        );
    }
  for (const ticket of report.tickets)
    ticket.integration = Object.fromEntries(
      ticket.roles.map((role) => {
        const records = report.integrations.filter(
          (item) => item.ticket === ticket.path && item.role === role
        );
        return [
          role,
          records.length
            ? records.every((item) => item.acceptance === "fresh")
              ? "accepted"
              : "pending-acceptance"
            : "not-recorded",
        ];
      })
    );
  const evidenceBlocked = new Set(
    report.diagnostics
      .filter((item) => item.ticket && !accepted(tickets.get(item.ticket)))
      .map((item) => item.ticket)
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const ticket of report.tickets)
      if (
        !evidenceBlocked.has(ticket.path) &&
        ticket.dependencies.some((path) => evidenceBlocked.has(path))
      ) {
        evidenceBlocked.add(ticket.path);
        expanded = true;
      }
  }
  if (!hasIntegrityFailure() && report.availableSlots)
    report.frontier = report.tickets
      .filter(
        (ticket) =>
          ticket.status === "ready-for-agent" &&
          !evidenceBlocked.has(ticket.path) &&
          !claimed.has(ticket.path) &&
          ticket.decision?.assessment !== "pending" &&
          !ticket.externalBlockers.length &&
          ticket.dependencies.every(
            (path) => tickets.get(path)?.status === "resolved"
          ) &&
          !ticket.operationalBlockers?.length
      )
      .map((ticket) => ticket.path);
  report.complete = report.diagnostics.length === 0;
}
try {
  main();
} catch (error) {
  diagnostic("invalid-input", `Reconcile input: ${error.message}`);
}
if (!args.includes("--help")) {
  if (report.diagnostics.length) {
    if (hasIntegrityFailure()) report.frontier = [];
    report.complete = false;
  }
  const output = json
    ? JSON.stringify(report)
    : [
        `${report.runId ?? "Run"}: ${report.complete ? "consistent" : "incomplete"} (${report.observedAt})`,
        `Operational facts: ${report.operational.state}`,
        ...(report.scenarios ?? []).map(
          (item) =>
            `Scenario ${item.id}: ${item.disposition}; owner ${item.primaryOwner} (${item.ownerStatus}); ${item.runtime}; qualification ${item.qualification}`
        ),
        ...(report.ownership
          ? [
              `Canonical: ${report.ownership.canonical.role}:${report.ownership.canonical.path}`,
              ...Object.entries(report.ownership.roles).map(
                ([role, responsibility]) => `${role}: ${responsibility}`
              ),
              `Specification: ${report.ownership.specification.role}:${report.ownership.specification.path}`,
              `Decisions: ${report.ownership.decisions.role}:${report.ownership.decisions.path}`,
              ...report.ownership.pointers.map(
                (item) => `Pointer: ${item.role}:${item.path}`
              ),
              ...report.ownership.coverage.map(
                (item) =>
                  `${item.decision}: ${item.disposition}; ${item.requirements.join(", ") || "no retained requirement"}; source ${item.source.role}:${item.source.path}`
              ),
              ...report.ownership.artifacts.map(
                (item) =>
                  `${item.id}: ${item.available ? "available" : "unavailable"}`
              ),
            ]
          : []),
        ...Object.entries(report.repositories).map(
          ([role, repo]) =>
            `${role}: ${repo.branch ?? "detached"} ${repo.head}; integration ${repo.integrationBranch} ${repo.integrationTip}; ${repo.worktrees.length} worktrees, ${repo.stashes.length} stashes`
        ),
        ...Object.entries(report.repositories).flatMap(([role, repo]) => [
          ...repo.worktrees.map(
            (item) =>
              `${role} worktree ${JSON.stringify(item.path)}: ${item.branch ?? "detached"} ${item.head}; ${item.dirty ? `staged ${item.dirty.staged}, unstaged ${item.dirty.unstaged}, untracked ${item.dirty.untracked}` : "unavailable"}`
          ),
          ...repo.stashes.map((item) => `${role} ${item.ref} ${item.commit}`),
          ...repo.branches.map(
            (item) =>
              `${role} branch ${item.branch} ${item.tip}; ${item.integration}; ${item.worktrees.length} worktrees`
          ),
        ]),
        ...report.tickets.map(
          (ticket) =>
            `${ticket.path}: ${ticket.status}; decision ${ticket.decision?.assessment ?? "missing"}; ${ticket.externalBlockers.map((item) => `${item.owner}: ${item.reason}`).join(", ") || "no external blocker"}; ${Object.entries(
              ticket.integration ?? {}
            )
              .map(([role, state]) => `${role} ${state}`)
              .join(", ")}`
        ),
        ...report.claims.map(
          (claim) =>
            `${claim.ticket}: ${claim.owner} (${claim.activity}); ${Object.entries(
              claim.repositories
            )
              .map(([role, repo]) => `${role} ${repo.integration}`)
              .join(", ")}`
        ),
        ...report.integrations.map(
          (item) =>
            `${item.ticket}:${item.role}: ${item.integration}, ${item.acceptance}; ${item.sourceCommit} -> ${item.integratedCommit}`
        ),
        ...report.evidence.map(
          (item) =>
            `${item.id}: ${item.kind} ${item.outcome}, ${item.freshness}`
        ),
        ...(report.carryForwards ?? []).map(
          (item) =>
            `Carry-forward ${item.evidenceId}/${item.scenarioId}: candidate ${item.candidateId}; ${item.state}; reviewer ${item.reviewer}; ${item.reasons.join("; ")}`
        ),
        `Frontier (${report.availableSlots ?? 0} slots): ${report.frontier.join(", ") || "withheld/none"}`,
        ...report.diagnostics.map((item) => `${item.code}: ${item.message}`),
      ].join("\n");
  if (Buffer.byteLength(output) > 1024 * 1024) {
    console.log(
      JSON.stringify({
        schemaVersion: report.schemaVersion,
        complete: false,
        frontier: [],
        diagnostics: [
          {
            code: "output-limit",
            message: "Report exceeds 1 MiB; reconcile/narrow run metadata",
          },
        ],
      })
    );
    process.exitCode = 1;
  } else {
    console.log(output);
    process.exitCode = report.complete ? 0 : 1;
  }
}
