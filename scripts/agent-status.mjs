#!/usr/bin/env node
// Read Git metadata and coordinator records only. No repair, dispatch or shell execution.
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
  frontier: [],
  diagnostics: [],
};
const diagnostic = (code, message) =>
  report.diagnostics.push({ code, message });
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
// This deliberately supports just the keywords used by the two checked-in schemas.
function validate(schema, value, path = "input") {
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
  return {
    head: git(root, "rev-parse", "HEAD"),
    branch: git(root, "branch", "--show-current") || null,
    integrationBranch: saved.integrationBranch,
    integrationTip,
    worktrees,
    stashes,
  };
}
function main() {
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/agent-status.mjs --ledger RUN.json --local LOCAL.json [--json]\nRead-only recovery status, output schemaVersion 1; exit 1 withholds assignment. See docs/agents/recovery.md."
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
  const schemaRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../docs/agents/ledger"
  );
  validate(
    readJson(resolve(schemaRoot, "run-v1.schema.json")),
    ledger,
    "ledger"
  );
  validate(
    readJson(resolve(schemaRoot, "local-v1.schema.json")),
    local,
    "local"
  );
  report.runId = ledger.runId;
  requireValue(
    ledger.tracker.role === "client",
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
    if (value && !/^(?:none(?:\s+\([^()\[\]]*\))?\.?|[-—])$/i.test(value)) {
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
  const claimIds = new Set();
  const claimed = new Set();
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
    else if (["resolved", "deferred", "wontfix"].includes(ticket.status))
      diagnostic(
        "ticket-owner",
        `${claim.id}: retained claim conflicts with ${ticket.status} ticket; reconcile explicitly`
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
  function available(id) {
    try {
      requireValue(
        isAbsolute(local.artifacts[id] ?? ""),
        "absolute artifact path required"
      );
      statSync(local.artifacts[id]);
      return true;
    } catch {
      diagnostic(
        "artifact-unavailable",
        `${id}: supply an accessible local artifact mapping; contents are not read`
      );
      return false;
    }
  }
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
      freshness = "stale";
      diagnostic(
        "evidence-stale",
        `${item.id}: renew evidence at current integration revisions`
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
        item.freshness === "fresh"
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
          `${ticket.path}: resolution requires fresh passed profiles and Standards/Spec reviews for every role`
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
  if (!report.diagnostics.length && report.availableSlots)
    report.frontier = report.tickets
      .filter(
        (ticket) =>
          ticket.status === "ready-for-agent" &&
          !claimed.has(ticket.path) &&
          ticket.decision?.assessment !== "pending" &&
          !ticket.externalBlockers.length &&
          ticket.dependencies.every(
            (path) => tickets.get(path)?.status === "resolved"
          )
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
    report.frontier = [];
    report.complete = false;
  }
  const output = json
    ? JSON.stringify(report)
    : [
        `${report.runId ?? "Run"}: ${report.complete ? "consistent" : "incomplete"} (${report.observedAt})`,
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
        `Frontier (${report.availableSlots ?? 0} slots): ${report.frontier.join(", ") || "withheld/none"}`,
        ...report.diagnostics.map((item) => `${item.code}: ${item.message}`),
      ].join("\n");
  if (Buffer.byteLength(output) > 1024 * 1024) {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
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
