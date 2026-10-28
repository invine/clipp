import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("scripts/agent-status.mjs");
let root: string;
let client: string;
let relay: string;
function git(repo: string, ...args: string[]) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
  }).trim();
}
function file(path: string, text: string) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, text);
}
function ticket(name: string, status = "ready-for-agent", blocked = "None.") {
  file(
    join(client, "tickets", name),
    `# Ticket\n\n**Status:** ${status}\n\n**Blocked by:** ${blocked}\n`
  );
}
function setup() {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agent recovery ")));
  client = join(root, "client repo");
  relay = join(root, "relay repo");
  for (const repo of [client, relay]) {
    mkdirSync(repo);
    git(repo, "init", "--quiet", "--initial-branch=integration");
    git(repo, "config", "user.email", "fixture@example.invalid");
    git(repo, "config", "user.name", "Fixture");
    file(join(repo, "tracked.txt"), "baseline\n");
    file(join(repo, "decision.md"), "accepted decision\n");
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "baseline");
  }
  ticket("01-first.md");
  const repositories = Object.fromEntries(
    [client, relay].map((repo, i) => [
      i === 0 ? "client" : "relay",
      {
        baseline: git(repo, "rev-parse", "HEAD"),
        integrationBranch: "integration",
        integrationTip: git(repo, "rev-parse", "HEAD"),
      },
    ])
  );
  const ledger = {
    schemaVersion: 1,
    runId: "fixture",
    coordinator: "coordinator",
    maxImplementers: 2,
    tracker: { role: "client", path: "tickets" },
    repositories,
    tickets: [
      {
        path: "01-first.md",
        roles: ["client", "relay"],
        decision: {
          assessment: "preserves",
          references: [{ role: "client", path: "decision.md" }],
        },
        externalBlockers: [] as { reason: string; owner: string }[],
        requiredProfiles: ["routine"],
      },
    ],
    claims: [],
    integrations: [],
    evidence: [],
  };
  const local = {
    schemaVersion: 1,
    roots: { client, relay },
    worktrees: {},
    artifacts: {},
  };
  return { ledger, local };
}
function run(ledger: unknown, local: unknown, ...args: string[]) {
  file(join(root, "run.json"), JSON.stringify(ledger));
  file(join(root, "local.json"), JSON.stringify(local));
  return spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
      "--json",
      ...args,
    ],
    { encoding: "utf8" }
  );
}
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("fresh coordinator sees explicit repository facts and an eligible frontier", () => {
  const { ledger, local } = setup();
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.schemaVersion).toBe(1);
  expect(report.frontier).toEqual(["01-first.md"]);
  expect(report.repositories.client.integrationTip).toBe(
    ledger.repositories.client.integrationTip
  );
  expect(report.repositories.relay.head).toBe(
    ledger.repositories.relay.integrationTip
  );
  expect(report.repositories.client.worktrees[0].dirty).toEqual({
    staged: 0,
    unstaged: 0,
    untracked: 1,
  });
  expect(report.diagnostics).toEqual([]);
  const human = spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
    ],
    { encoding: "utf8" }
  );
  expect(human.status).toBe(0);
  expect(human.stdout).toContain("01-first.md");
  expect(human.stdout).toContain("relay");
});

test("restart finds committed work before integration and eligible work while preserving dirty linked worktrees and stashes", () => {
  const { ledger, local } = setup();
  ticket("01-first.md", "claimed");
  ticket("02-blocked.md", "claimed");
  ticket("03-eligible.md");
  ticket("33-deferred.md", "deferred");
  const implementation = join(root, "implementation space");
  const unrelated = join(root, "unrelated dirty work");
  git(client, "worktree", "add", "--quiet", "-b", "ticket-01", implementation);
  file(join(implementation, "result.txt"), "committed result\n");
  git(implementation, "add", "result.txt");
  git(implementation, "commit", "--quiet", "-m", "result before interruption");
  const source = git(implementation, "rev-parse", "HEAD");
  git(client, "worktree", "add", "--quiet", "-b", "unrelated", unrelated);
  file(join(unrelated, "tracked.txt"), "stashed canary\n");
  git(unrelated, "stash", "push", "--quiet", "-m", "preserved stash");
  file(join(unrelated, "tracked.txt"), "staged canary\n");
  git(unrelated, "add", "tracked.txt");
  file(join(unrelated, "tracked.txt"), "unstaged canary\n");
  file(
    join(unrelated, "private profile $(touch forbidden).json"),
    "credential canary\n"
  );
  const next = {
    ...ledger,
    tickets: [
      ...ledger.tickets,
      ...["02-blocked.md", "03-eligible.md", "33-deferred.md"].map((path) => ({
        ...ledger.tickets[0],
        path,
      })),
    ],
    claims: [
      {
        id: "claim-01",
        ticket: "01-first.md",
        owner: "worker",
        coordinator: "coordinator",
        activity: "handoff",
        repositories: {
          client: {
            branch: "ticket-01",
            baseline: ledger.repositories.client.integrationTip,
            worktree: "implementation",
            sourceCommits: [source],
          },
        },
      },
      {
        id: "claim-02",
        ticket: "02-blocked.md",
        owner: "waiting-worker",
        coordinator: "coordinator",
        activity: "blocked",
        repositories: {},
      },
    ],
  };
  next.tickets[1] = {
    ...next.tickets[1],
    externalBlockers: [{ reason: "waiting for device", owner: "operator" }],
  };
  const paths = { ...local, worktrees: { implementation } };
  function preserved(dir: string): Record<string, string> {
    return Object.fromEntries(
      readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const path = join(entry.parentPath, entry.name);
          return [path, readFileSync(path).toString("base64")];
        })
    );
  }
  const before = [client, relay, implementation, unrelated].map(preserved);
  const result = run(next, paths);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.frontier).toEqual(["03-eligible.md"]);
  expect(report.claims[0].repositories.client.integration).toBe("unintegrated");
  expect(report.claims[0].repositories.client.sourceCommits).toEqual([source]);
  expect(
    report.tickets.find(
      (item: { path: string }) => item.path === "02-blocked.md"
    ).externalBlockers[0].owner
  ).toBe("operator");
  expect(
    report.repositories.client.worktrees.find(
      (item: { path: string }) => item.path === unrelated
    ).dirty
  ).toEqual({ staged: 1, unstaged: 1, untracked: 1 });
  expect(report.repositories.client.stashes[0]).toEqual({
    ref: "stash@{0}",
    commit: git(client, "rev-parse", "stash@{0}"),
  });
  expect(result.stdout).not.toContain("canary");
  expect([client, relay, implementation, unrelated].map(preserved)).toEqual(
    before
  );
});

test("inconsistent required state is diagnostic and withholds assignment", () => {
  const { ledger, local } = setup();
  const claim = {
    id: "claim",
    ticket: "01-first.md",
    owner: "worker",
    coordinator: "coordinator",
    activity: "handoff",
    repositories: {},
  };
  for (const [record, config, code] of [
    [
      ledger,
      { ...local, roots: { ...local.roots, relay: join(root, "missing") } },
      "repository-unavailable",
    ],
    [{ ...ledger, schemaVersion: 9 }, local, "invalid-input"],
    [
      {
        ...ledger,
        repositories: {
          ...ledger.repositories,
          relay: {
            ...ledger.repositories.relay,
            integrationTip: "1".repeat(40),
          },
        },
      },
      local,
      "integration-tip-changed",
    ],
    [
      { ...ledger, claims: [claim, { ...claim, id: "other", owner: "other" }] },
      local,
      "duplicate-claim",
    ],
    [
      { ...ledger, claims: [{ ...claim, coordinator: "intruder" }] },
      local,
      "claim-coordinator",
    ],
    [
      { ...ledger, claims: [{ ...claim, ticket: "99-missing.md" }] },
      local,
      "claim-ticket",
    ],
  ]) {
    const result = run(record, config);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.frontier).toEqual([]);
    expect(
      report.diagnostics.map((item: { code: string }) => item.code)
    ).toContain(code);
  }
  ticket("02-dependent.md", "ready-for-agent", "[01](01-first.md)");
  const next = {
    ...ledger,
    tickets: [
      ...ledger.tickets,
      { ...ledger.tickets[0], path: "02-dependent.md" },
    ],
  };
  expect(JSON.parse(run(next, local).stdout).frontier).toEqual(["01-first.md"]);
  for (const [blocked, code] of [
    ["[missing](99-missing.md)", "missing-dependency"],
    ["[cycle](02-dependent.md)", "cyclic-dependency"],
    ["some vague prose", "malformed-dependency"],
  ]) {
    ticket("01-first.md", "ready-for-agent", blocked);
    const report = run(next, local);
    expect(report.status).toBe(1);
    expect(JSON.parse(report.stdout).frontier).toEqual([]);
    expect(
      JSON.parse(report.stdout).diagnostics.map(
        (item: { code: string }) => item.code
      )
    ).toContain(code);
  }
  ticket("01-first.md", "claimed");
  expect(
    JSON.parse(run(next, local).stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("ticket-owner");
});

test("cherry-picked cross-repository completion requires verified mapping and fresh available checks and two reviews", () => {
  const { ledger, local } = setup();
  git(client, "checkout", "--quiet", "-b", "source");
  file(join(client, "result.txt"), "ticket result\n");
  git(client, "add", "result.txt");
  git(client, "commit", "--quiet", "-m", "source result");
  const source = git(client, "rev-parse", "HEAD");
  git(client, "checkout", "--quiet", "integration");
  file(join(client, "other.txt"), "other integration\n");
  git(client, "add", "other.txt");
  git(client, "commit", "--quiet", "-m", "other ticket");
  git(client, "cherry-pick", source);
  const integrated = git(client, "rev-parse", "HEAD");
  expect(integrated).not.toBe(source);
  ticket("01-first.md", "resolved");
  const revisions = {
    client: integrated,
    relay: ledger.repositories.relay.integrationTip,
  };
  file(
    join(root, "private receipt.txt"),
    "do not print or read receipt canary\n"
  );
  const config = {
    ...local,
    artifacts: { receipt: join(root, "private receipt.txt") },
  };
  const integrations = [
    {
      ticket: "01-first.md",
      role: "client",
      sourceCommit: source,
      integratedCommit: integrated,
      verifiedBy: "coordinator",
      artifact: "receipt",
    },
    {
      ticket: "01-first.md",
      role: "relay",
      sourceCommit: revisions.relay,
      integratedCommit: revisions.relay,
      verifiedBy: "coordinator",
      artifact: "receipt",
    },
  ];
  const evidence = ["verification", "standards", "spec"].map((kind) => ({
    id: kind,
    ticket: "01-first.md",
    kind,
    outcome: "passed",
    profile: "routine",
    command: "fixture verification",
    reviewer: "reviewer",
    tools: { node: process.version },
    observedAt: new Date().toISOString(),
    revisions,
    artifacts: ["receipt"],
  }));
  const complete = {
    ...ledger,
    repositories: {
      ...ledger.repositories,
      client: { ...ledger.repositories.client, integrationTip: integrated },
    },
    integrations,
    evidence,
  };
  const result = run(complete, config);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.integrations[0].ancestry).toBe(false);
  expect(report.integrations[0].integration).toBe("verified-mapping");
  expect(report.integrations[0].acceptance).toBe("fresh");
  expect(report.integrations[1].integration).toBe("ancestry");
  expect(
    report.evidence.map((item: { freshness: string }) => item.freshness)
  ).toEqual(["fresh", "fresh", "fresh"]);
  expect(result.stdout).not.toContain("receipt canary");
  for (const [record, paths, code] of [
    [
      { ...complete, integrations: [integrations[0]] },
      config,
      "resolution-integration",
    ],
    [
      {
        ...complete,
        integrations: [
          { ...integrations[0], verifiedBy: "worker" },
          integrations[1],
        ],
      },
      config,
      "integration-unverified",
    ],
    [complete, { ...config, artifacts: {} }, "artifact-unavailable"],
    [
      {
        ...complete,
        evidence: evidence.map((item) => ({
          ...item,
          revisions: { ...revisions, client: source },
        })),
      },
      config,
      "evidence-stale",
    ],
    [
      { ...complete, evidence: evidence.slice(0, 2) },
      config,
      "resolution-evidence",
    ],
    [
      {
        ...complete,
        evidence: evidence.map((item) => ({ ...item, outcome: "not-run" })),
      },
      config,
      "resolution-evidence",
    ],
  ]) {
    const failure = run(record, paths);
    expect(failure.status).toBe(1);
    expect(JSON.parse(failure.stdout).frontier).toEqual([]);
    expect(
      JSON.parse(failure.stdout).diagnostics.map(
        (item: { code: string }) => item.code
      )
    ).toContain(code);
  }
  file(join(client, "further.txt"), "revision changed\n");
  git(client, "add", "further.txt");
  git(client, "commit", "--quiet", "-m", "later change");
  const later = {
    ...complete,
    repositories: {
      ...complete.repositories,
      client: {
        ...complete.repositories.client,
        integrationTip: git(client, "rev-parse", "HEAD"),
      },
    },
  };
  expect(
    JSON.parse(run(later, config).stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("evidence-stale");
});

test("two implementation slots bound dispatch and missing worktree or changed source tip requires reconciliation", () => {
  const { ledger, local } = setup();
  ticket("02-second.md");
  ticket("03-third.md");
  const claims = ["01-first.md", "02-second.md", "03-third.md"].map(
    (path, i) => {
      ticket(path, "claimed");
      const worktree = join(root, `worker ${i}`);
      git(client, "worktree", "add", "--quiet", "-b", `worker-${i}`, worktree);
      return {
        id: `claim-${i}`,
        ticket: path,
        owner: `owner-${i}`,
        coordinator: "coordinator",
        activity: "active",
        repositories: {
          client: {
            branch: `worker-${i}`,
            baseline: ledger.repositories.client.integrationTip,
            worktree: `worker${i}`,
            sourceCommits: [],
          },
        },
      };
    }
  );
  const config = {
    ...local,
    worktrees: Object.fromEntries(
      claims.map((_, i) => [`worker${i}`, join(root, `worker ${i}`)])
    ),
  };
  const record = {
    ...ledger,
    tickets: [
      ...ledger.tickets,
      ...["02-second.md", "03-third.md"].map((path) => ({
        ...ledger.tickets[0],
        path,
      })),
    ],
    claims,
  };
  expect(
    JSON.parse(run({ ...record, claims: claims.slice(0, 2) }, config).stdout)
      .frontier
  ).toEqual([]);
  const over = run(record, config);
  expect(over.status).toBe(1);
  expect(
    JSON.parse(over.stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("implementer-limit");
  const conflict = run(
    {
      ...record,
      claims: [claims[0], { ...claims[1], owner: claims[0].owner }],
    },
    config
  );
  expect(
    JSON.parse(conflict.stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("owner-conflict");
  const inaccessible = run(
    { ...record, claims: [claims[0]] },
    { ...config, worktrees: { worker0: join(root, "missing") } }
  );
  expect(
    JSON.parse(inaccessible.stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("claim-repository");
  const changed = {
    ...claims[0],
    repositories: {
      client: {
        ...claims[0].repositories.client,
        sourceCommits: [ledger.repositories.client.integrationTip],
      },
    },
  };
  const worktree = config.worktrees.worker0;
  file(join(worktree, "later.txt"), "later source\n");
  git(worktree, "add", "later.txt");
  git(worktree, "commit", "--quiet", "-m", "changed source after save");
  expect(
    JSON.parse(
      run({ ...record, claims: [changed] }, config).stdout
    ).diagnostics.map((item: { code: string }) => item.code)
  ).toContain("claim-repository");
});

test("pending decisions keep unrelated work eligible and an approved toggle needs distinct user decision evidence", () => {
  const { ledger, local } = setup();
  ticket("02-unrelated.md");
  const pending = {
    ...ledger,
    tickets: [
      {
        ...ledger.tickets[0],
        decision: { ...ledger.tickets[0].decision, assessment: "pending" },
      },
      { ...ledger.tickets[0], path: "02-unrelated.md" },
    ],
  };
  expect(JSON.parse(run(pending, local).stdout).frontier).toEqual([
    "02-unrelated.md",
  ]);
  const approved = {
    ...pending,
    tickets: [
      {
        ...pending.tickets[0],
        decision: { ...pending.tickets[0].decision, assessment: "approved" },
      },
      pending.tickets[1],
    ],
  };
  const withoutDecision = run(approved, local);
  expect(withoutDecision.status).toBe(1);
  expect(JSON.parse(withoutDecision.stdout).frontier).toEqual([]);
  expect(
    JSON.parse(withoutDecision.stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("decision-approval");
  file(join(client, "user decision.md"), "user acceptance fixture\n");
  const userDecision = {
    reference: { role: "client", path: "user decision.md" },
    source: "operator instruction fixture",
    date: "2026-10-07",
    scope: "approve changed invariant",
  };
  const authorized = {
    ...approved,
    tickets: [
      {
        ...approved.tickets[0],
        decision: { ...approved.tickets[0].decision, userDecision },
      },
      approved.tickets[1],
    ],
  };
  expect(JSON.parse(run(authorized, local).stdout).frontier).toEqual([
    "01-first.md",
    "02-unrelated.md",
  ]);
  const reused = {
    ...authorized,
    tickets: [
      {
        ...authorized.tickets[0],
        decision: {
          ...authorized.tickets[0].decision,
          userDecision: {
            ...userDecision,
            reference: { role: "client", path: "decision.md" },
          },
        },
      },
      authorized.tickets[1],
    ],
  };
  expect(
    JSON.parse(run(reused, local).stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("decision-approval");
});

test("malformed input and unavailable preserved worktrees report bounded machine errors without executing repository hooks", () => {
  const { ledger, local } = setup();
  const missing = join(root, "preserved but inaccessible");
  git(client, "worktree", "add", "--quiet", "-b", "preserved", missing);
  rmSync(missing, { recursive: true });
  const unavailable = run(ledger, local);
  expect(unavailable.status).toBe(1);
  expect(
    JSON.parse(unavailable.stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("worktree-unavailable");
  expect(JSON.parse(unavailable.stdout).frontier).toEqual([]);
  for (const args of [
    [],
    ["--unknown"],
    [
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
      "--ledger",
      join(root, "run.json"),
    ],
  ]) {
    const result = spawnSync(process.execPath, [cli, "--json", ...args], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics[0].code).toBe("invalid-input");
    expect(result.stderr).toBe("");
  }
  file(join(root, "run.json"), "{bad json");
  const malformed = spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
      "--json",
    ],
    { encoding: "utf8" }
  );
  expect(malformed.status).toBe(1);
  expect(JSON.parse(malformed.stdout).frontier).toEqual([]);
  // A configured fsmonitor is repository code; status must disable it.
  const hook = join(root, "fsmonitor.sh");
  file(hook, `#!/bin/sh\ntouch '${join(root, "forbidden")}'\n`);
  chmodSync(hook, 0o755);
  git(client, "config", "core.fsmonitor", hook);
  run(ledger, local);
  expect(readdirSync(root)).not.toContain("forbidden");
});

test("canonical no-dependency annotations are accepted without interpreting arbitrary prose as a clear dependency list", () => {
  const { ledger, local } = setup();
  ticket("01-first.md", "ready-for-agent", "None (can start immediately).");
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).frontier).toEqual(["01-first.md"]);
  ticket("01-first.md", "ready-for-agent", "None [but depends](99-missing.md)");
  expect(run(ledger, local).status).toBe(1);
});

test("saved claims require canonical claimed status and blocked ownership requires a recorded blocker", () => {
  const { ledger, local } = setup();
  ticket("02-unrelated.md");
  const implementation = join(root, "implementation");
  git(client, "worktree", "add", "--quiet", "-b", "worker", implementation);
  const claim = {
    id: "claim",
    ticket: "01-first.md",
    owner: "worker",
    coordinator: "coordinator",
    activity: "active",
    repositories: {
      client: {
        branch: "worker",
        baseline: ledger.repositories.client.integrationTip,
        worktree: "implementation",
        sourceCommits: [],
      },
    },
  };
  const record = {
    ...ledger,
    tickets: [
      ...ledger.tickets,
      { ...ledger.tickets[0], path: "02-unrelated.md" },
    ],
    claims: [claim],
  };
  const config = { ...local, worktrees: { implementation } };
  for (const activity of ["active", "blocked", "handoff"]) {
    for (const status of [
      "ready-for-agent",
      "ready-for-human",
      "needs-triage",
      "needs-info",
      "blocked",
      "deferred",
      "resolved",
      "wontfix",
    ]) {
      ticket("01-first.md", status);
      const result = run(
        { ...record, claims: [{ ...claim, activity }] },
        config
      );
      const report = JSON.parse(result.stdout);
      expect(result.status).toBe(1);
      expect(report.complete).toBe(false);
      expect(report.frontier).toEqual([]);
      expect(
        report.diagnostics.map((item: { code: string }) => item.code)
      ).toContain("ticket-owner");
    }
    ticket("01-first.md", "claimed");
    const retained = {
      ...record,
      tickets: [
        {
          ...record.tickets[0],
          externalBlockers:
            activity === "blocked"
              ? [{ owner: "operator", reason: "waiting for device" }]
              : [],
        },
        record.tickets[1],
      ],
      claims: [{ ...claim, activity }],
    };
    const valid = run(retained, config);
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout).frontier).toEqual(["02-unrelated.md"]);
    if (activity === "blocked") {
      const missingReason = run(
        { ...record, claims: [{ ...claim, activity }] },
        config
      );
      expect(missingReason.status).toBe(1);
      expect(
        JSON.parse(missingReason.stdout).diagnostics.map(
          (item: { code: string }) => item.code
        )
      ).toContain("claim-reason");
    }
  }
});

test("implementation claims reserve isolated branches and canonical worktrees while integration stays coordinator-owned", () => {
  const { ledger, local } = setup();
  ticket("01-first.md", "claimed");
  ticket("02-second.md", "claimed");
  ticket("03-eligible.md");
  const implementation = join(root, "worker");
  git(client, "worktree", "add", "--quiet", "-b", "worker", implementation);
  const claim = {
    id: "first",
    ticket: "01-first.md",
    owner: "first-worker",
    coordinator: "coordinator",
    activity: "active",
    repositories: {
      client: {
        branch: "worker",
        baseline: ledger.repositories.client.integrationTip,
        worktree: "worker",
        sourceCommits: [],
      },
    },
  };
  const record = {
    ...ledger,
    tickets: [
      ledger.tickets[0],
      ...["02-second.md", "03-eligible.md"].map((path) => ({
        ...ledger.tickets[0],
        path,
      })),
    ],
    claims: [claim],
  };
  const config = {
    ...local,
    worktrees: {
      worker: implementation,
      alias: join(implementation, "."),
      integration: client,
    },
  };
  for (const activity of ["active", "handoff", "blocked"]) {
    const duplicate = {
      ...claim,
      id: "second",
      ticket: "02-second.md",
      owner: "second-worker",
      activity,
      repositories: {
        client: { ...claim.repositories.client, worktree: "alias" },
      },
    };
    const result = run(
      {
        ...record,
        tickets: record.tickets.map((item) => ({
          ...item,
          externalBlockers:
            item.path === "02-second.md" && activity === "blocked"
              ? [{ owner: "operator", reason: "waiting for device" }]
              : [],
        })),
        claims: [claim, duplicate],
      },
      config
    );
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.complete).toBe(false);
    expect(report.frontier).toEqual([]);
    expect(
      report.diagnostics.map((item: { code: string }) => item.code)
    ).toContain("claim-isolation");
  }
  const integration = run(
    {
      ...record,
      claims: [
        {
          ...claim,
          repositories: {
            client: {
              ...claim.repositories.client,
              branch: "integration",
              worktree: "integration",
            },
          },
        },
      ],
    },
    config
  );
  expect(integration.status).toBe(1);
  expect(
    JSON.parse(integration.stdout).diagnostics.map(
      (item: { code: string }) => item.code
    )
  ).toContain("claim-isolation");
  const relayWorker = join(root, "relay worker");
  git(relay, "worktree", "add", "--quiet", "-b", "worker", relayWorker);
  const separateRoles = run(
    {
      ...record,
      claims: [
        claim,
        {
          ...claim,
          id: "second",
          ticket: "02-second.md",
          owner: "second-worker",
          repositories: {
            relay: {
              ...claim.repositories.client,
              baseline: ledger.repositories.relay.integrationTip,
              worktree: "relayWorker",
            },
          },
        },
      ],
    },
    { ...config, worktrees: { ...config.worktrees, relayWorker } }
  );
  expect(separateRoles.status).toBe(0);
  expect(JSON.parse(separateRoles.stdout).activeImplementers).toBe(2);
});

test("recovery inventories unclaimed retained branches without worktrees and distinguishes ancestry, mapping and unverified preservation", () => {
  const { ledger, local } = setup();
  git(client, "branch", "contained-no-worktree");
  git(client, "checkout", "--quiet", "-b", "retained-no-worktree");
  file(join(client, "result.txt"), "preserved result\n");
  git(client, "add", "result.txt");
  git(client, "commit", "--quiet", "-m", "retained result");
  const source = git(client, "rev-parse", "HEAD");
  git(client, "checkout", "--quiet", "integration");
  const refs = git(client, "show-ref");
  const index = readFileSync(join(client, ".git/index"));
  const preserved = run(ledger, local);
  expect(preserved.status).toBe(0);
  const report = JSON.parse(preserved.stdout);
  expect(report.repositories.client.branches).toEqual(
    expect.arrayContaining([
      {
        branch: "contained-no-worktree",
        tip: ledger.repositories.client.integrationTip,
        integration: "ancestry",
        worktrees: [],
      },
      {
        branch: "retained-no-worktree",
        tip: source,
        integration: "unverified",
        worktrees: [],
      },
    ])
  );
  expect(report.diagnostics).toEqual([]);
  expect(git(client, "show-ref")).toBe(refs);
  expect(readFileSync(join(client, ".git/index"))).toEqual(index);
  file(join(client, "other.txt"), "other integration\n");
  git(client, "add", "other.txt");
  git(client, "commit", "--quiet", "-m", "other integration");
  git(client, "cherry-pick", source);
  const integrated = git(client, "rev-parse", "HEAD");
  expect(integrated).not.toBe(source);
  const next = {
    ...ledger,
    repositories: {
      ...ledger.repositories,
      client: { ...ledger.repositories.client, integrationTip: integrated },
    },
    integrations: [
      {
        ticket: "01-first.md",
        role: "client",
        sourceCommit: source,
        integratedCommit: integrated,
        verifiedBy: "coordinator",
        artifact: "receipt",
      },
    ],
  };
  file(join(root, "receipt.txt"), "receipt canary\n");
  const mapped = run(next, {
    ...local,
    artifacts: { receipt: join(root, "receipt.txt") },
  });
  expect(mapped.status).toBe(0);
  expect(JSON.parse(mapped.stdout).repositories.client.branches).toContainEqual(
    {
      branch: "retained-no-worktree",
      tip: source,
      integration: "verified-mapping",
      worktrees: [],
    }
  );
  const human = spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
    ],
    { encoding: "utf8" }
  );
  expect(human.status).toBe(0);
  expect(human.stdout).toContain(
    `retained-no-worktree ${source}; verified-mapping`
  );
  expect(human.stdout).not.toContain("receipt canary");
});

test("oversized local branch inventories fail visibly and withhold the frontier", () => {
  const { ledger, local } = setup();
  execFileSync("git", ["-C", client, "update-ref", "--stdin"], {
    input:
      Array.from(
        { length: 500 },
        (_, i) =>
          `create refs/heads/retained-${i} ${ledger.repositories.client.integrationTip}`
      ).join("\n") + "\n",
  });
  const result = run(ledger, local);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.complete).toBe(false);
  expect(report.frontier).toEqual([]);
  expect(report.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining("more than 500 local branches"),
      }),
    ])
  );
});

function setupOwnership() {
  const { ledger, local } = setup();
  const canonical = { role: "client", path: ".scratch/feature" };
  const specification = { role: "client", path: ".scratch/feature/spec.md" };
  const decisions = { role: "client", path: ".scratch/feature/decisions.md" };
  const pointer = { role: "relay", path: ".scratch/feature/README.md" };
  const header =
    "**Owning repository:** client (Clipp).  \n**Canonical feature directory:** client:`.scratch/feature/`.\n";
  file(join(client, canonical.path, "README.md"), header);
  file(join(relay, pointer.path), header);
  file(
    join(client, specification.path),
    "# Specification\n\n## Artifact ownership\n"
  );
  file(join(client, decisions.path), "private decision prose canary\n");
  file(
    join(client, canonical.path, "issues/01-first.md"),
    readFileSync(join(client, "tickets/01-first.md"), "utf8")
  );
  file(join(root, "preserved/evidence.txt"), "private artifact canary\n");
  return {
    ledger: {
      ...ledger,
      schemaVersion: 2,
      tracker: { role: "client", path: ".scratch/feature/issues" },
      ownership: {
        canonical,
        specification,
        decisions,
        roles: {
          client: "Coordination and client",
          relay: "Relay implementation",
        },
        pointers: [pointer],
        coverage: [
          {
            decision: "D1",
            source: decisions,
            disposition: "accepted",
            requirements: ["Artifact ownership"],
          },
        ],
        artifacts: ["preserved"],
      },
    },
    local: {
      ...local,
      artifacts: { preserved: join(root, "preserved/evidence.txt") },
    },
  };
}

test("v2 discovers canonical ownership and decision coverage without rewriting v1 or reading private evidence", () => {
  const { ledger, local } = setupOwnership();
  const before = [client, relay].map((repo) => ({
    index: readFileSync(join(repo, ".git/index")),
    refs: git(repo, "show-ref"),
    status: git(repo, "status", "--porcelain=v1"),
  }));
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.schemaVersion).toBe(2);
  expect(report.ownership).toEqual({
    ...ledger.ownership,
    artifacts: [{ id: "preserved", available: true }],
  });
  expect(report.frontier).toEqual(["01-first.md"]);
  expect(result.stdout).not.toContain("private decision prose canary");
  expect(result.stdout).not.toContain("private artifact canary");
  expect(result.stdout).not.toContain(local.artifacts.preserved);
  expect(
    [client, relay].map((repo) => ({
      index: readFileSync(join(repo, ".git/index")),
      refs: git(repo, "show-ref"),
      status: git(repo, "status", "--porcelain=v1"),
    }))
  ).toEqual(before);
  expect(JSON.parse(readFileSync(join(root, "run.json"), "utf8"))).toEqual(
    ledger
  );
});

test("v2 withholds assignments when companion ownership conflicts with the canonical tracker", () => {
  const { ledger, local } = setupOwnership();
  file(
    join(relay, ledger.ownership.pointers[0].path),
    "**Owning repository:** relay\n**Canonical feature directory:** relay:`.scratch/feature/`\n"
  );
  const result = run(ledger, local);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).frontier).toEqual([]);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "ownership-pointer" }),
    ])
  );
});

test("v2 rejects a tracker outside its owner feature and companion copies of claimable tickets", () => {
  const { ledger, local } = setupOwnership();
  ledger.tracker.path = "tickets";
  file(
    join(relay, ".scratch/feature/issues/01-copy.md"),
    "**Status:** ready-for-agent\n"
  );
  const result = run(ledger, local);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "ownership-consistency" }),
      expect.objectContaining({ code: "ownership-duplicate" }),
    ])
  );
});

test("v2 reports unavailable decision/spec references and uncovered accepted decisions", () => {
  const { ledger, local } = setupOwnership();
  rmSync(join(client, ledger.ownership.specification.path));
  rmSync(join(client, ledger.ownership.decisions.path));
  ledger.ownership.coverage[0].requirements = [];
  const result = run(ledger, local);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "ownership-reference" }),
      expect.objectContaining({ code: "decision-coverage" }),
    ])
  );
  expect(JSON.parse(result.stdout).frontier).toEqual([]);
});

test("v2 keeps private artifacts outside disposable worktrees and reports missing preserved evidence without disclosure", () => {
  const { ledger, local } = setupOwnership();
  const disposable = join(root, "disposable");
  git(client, "worktree", "add", "--quiet", "-b", "disposable", disposable);
  file(join(disposable, "evidence.txt"), "private artifact canary\n");
  local.artifacts.preserved = join(disposable, "evidence.txt");
  let result = run(ledger, local);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "artifact-unpreserved" }),
    ])
  );
  expect(result.stdout).not.toContain("private artifact canary");
  expect(readFileSync(local.artifacts.preserved, "utf8")).toBe(
    "private artifact canary\n"
  );
  local.artifacts.preserved = join(root, "missing-artifact");
  result = run(ledger, local);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).ownership.artifacts).toEqual([
    { id: "preserved", available: false },
  ]);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "artifact-unavailable" }),
    ])
  );
});

test("v2 refuses a durable ledger stored in a disposable worktree", () => {
  const { ledger, local } = setupOwnership();
  const disposable = join(root, "disposable");
  git(client, "worktree", "add", "--quiet", "-b", "disposable", disposable);
  run(ledger, local);
  file(join(disposable, "run.json"), JSON.stringify(ledger));
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(disposable, "run.json"),
      "--local",
      join(root, "local.json"),
      "--json",
    ],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "input-unpreserved" }),
    ])
  );
  expect(
    JSON.parse(readFileSync(join(disposable, "run.json"), "utf8"))
  ).toEqual(ledger);
});

test("v2 detects a coverage reference to a missing specification heading", () => {
  const { ledger, local } = setupOwnership();
  ledger.ownership.coverage[0].requirements = ["Missing requirement"];
  const result = run(ledger, local);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "decision-coverage" }),
    ])
  );
});

test("v2 supports a relay-owned single-role effort without inventing companion participation", () => {
  const { ledger, local } = setupOwnership();
  const { canonical, specification, decisions } = ledger.ownership;
  file(
    join(relay, canonical.path, "README.md"),
    "**Owning repository:** relay\n**Canonical feature directory:** relay:`.scratch/feature/`\n"
  );
  for (const path of [
    specification.path,
    decisions.path,
    ledger.tracker.path + "/01-first.md",
  ])
    file(join(relay, path), readFileSync(join(client, path), "utf8"));
  const next = {
    ...ledger,
    tracker: { ...ledger.tracker, role: "relay" },
    tickets: ledger.tickets.map((item) => ({ ...item, roles: ["relay"] })),
    ownership: {
      ...ledger.ownership,
      canonical: { ...canonical, role: "relay" },
      specification: { ...specification, role: "relay" },
      decisions: { ...decisions, role: "relay" },
      roles: { relay: "Coordination and implementation" },
      pointers: [],
      coverage: ledger.ownership.coverage.map((item) => ({
        ...item,
        source: { ...decisions, role: "relay" },
      })),
    },
  };
  const result = run(next, local);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).frontier).toEqual(["01-first.md"]);
});

test("human v2 status displays canonical ownership, decision coverage and artifact availability", () => {
  const { ledger, local } = setupOwnership();
  run(ledger, local);
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
    ],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Canonical: client:.scratch/feature");
  expect(result.stdout).toContain("D1: accepted; Artifact ownership");
  expect(result.stdout).toContain("preserved: available");
  expect(result.stdout).not.toContain("private artifact canary");
});

test("historical v1 and v2 records keep absent operational facts unknown", () => {
  const historical = setup();
  const before = JSON.stringify(historical.ledger);
  const result = run(historical.ledger, historical.local);
  expect(JSON.parse(result.stdout).operational).toEqual({ state: "unknown" });
  expect(readFileSync(join(root, "run.json"), "utf8")).toBe(before);
  rmSync(root, { recursive: true, force: true });
  const { ledger, local } = setupOwnership();
  const current = run(ledger, local);
  expect(current.status).toBe(0);
  expect(JSON.parse(current.stdout).operational).toEqual({ state: "unknown" });
  expect(JSON.parse(current.stdout).frontier).toEqual(["01-first.md"]);
  const explicitlyUnknown = run(
    {
      ...ledger,
      operational: {
        deployments: [],
        access: [],
        authorizations: [],
        requirements: [],
      },
    },
    local
  );
  expect(JSON.parse(explicitlyUnknown.stdout).operational).toMatchObject({
    state: "recorded",
    deploymentsState: "unknown",
    accessState: "unknown",
    authorizationsState: "unknown",
  });
});

function setupOperational() {
  const { ledger, local } = setupOwnership();
  const source = { kind: "artifact", id: "operational-source" };
  file(join(root, "preserved/operational.txt"), "PRIVATE_OPERATIONAL_CANARY");
  return {
    ledger: {
      ...ledger,
      operational: {
        deployments: [
          {
            id: "deployment",
            displayName: "prod (user wording)",
            identity: {
              context: "fixture-context",
              namespace: "test",
              release: "relay-test",
              publicEndpoint: "https://relay.example.invalid",
            },
            observedAt: "2026-10-25",
            source,
            qualification: {
              status: "limited",
              observedAt: "2026-10-25",
              revisions: { relay: ledger.repositories.relay.integrationTip },
              source,
              limits: ["Client acceptance outstanding"],
            },
          },
        ],
        access: [
          {
            id: "github",
            service: "GitHub",
            route: "Authenticated Chrome web UI",
            observedAt: "2026-10-25",
            source,
            resources: ["fixture/relay"],
            recheck: `Inspect supported connector, then existing Chrome session; $(touch '${join(root, "forbidden")}')`,
          },
        ],
        authorizations: [
          {
            id: "clipboard",
            observedAt: "2026-10-25",
            authorizationDate: "2026-10-25",
            source: {
              kind: "public",
              role: "client",
              path: ".scratch/feature/decisions.md",
            },
            action: "Overwrite clipboard for this effort's native tests",
            resources: ["Owned native test clipboard"],
            limits: [
              "No publication of clipboard data",
              "Restoration not required",
            ],
            status: "recorded",
            statusAt: "2026-10-25",
            statusSource: {
              kind: "public",
              role: "client",
              path: ".scratch/feature/decisions.md",
            },
            supersededBy: undefined as string | undefined,
          },
        ],
        requirements: [{ ticket: "01-first.md", records: ["clipboard"] }],
      },
    },
    local: {
      ...local,
      artifacts: {
        ...local.artifacts,
        "operational-source": join(root, "preserved/operational.txt"),
      },
    },
  };
}

test("operational status preserves exact target and dated scope without executing rechecks or disclosing private sources", () => {
  const { ledger, local } = setupOperational();
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.operational.deployments[0]).toMatchObject({
    displayName: "prod (user wording)",
    identity: {
      context: "fixture-context",
      namespace: "test",
      release: "relay-test",
      publicEndpoint: "https://relay.example.invalid",
    },
    qualification: { status: "limited", freshness: "matching-revisions" },
    availability: "available",
    currentState: "unverified",
  });
  expect(report.operational).toMatchObject({
    deploymentsState: "recorded",
    accessState: "recorded",
    authorizationsState: "recorded",
  });
  expect(report.operational.access[0]).toMatchObject({
    route: "Authenticated Chrome web UI",
    currentAvailability: "unverified",
    observedAt: "2026-10-25",
  });
  expect(report.operational.authorizations[0]).toMatchObject({
    status: "recorded",
    permission: "not-assessed",
  });
  expect(report.frontier).toEqual(["01-first.md"]);
  expect(result.stdout).not.toContain("PRIVATE_OPERATIONAL_CANARY");
  expect(result.stdout).not.toContain(local.artifacts["operational-source"]);
  expect(readdirSync(root)).not.toContain("forbidden");
  expect(JSON.parse(readFileSync(join(root, "run.json"), "utf8"))).toEqual(
    ledger
  );
});

test("unavailable operational evidence and unknown facts block only dependent tickets", () => {
  const { ledger, local } = setupOperational();
  const unrelated = { ...ledger.tickets[0], path: "02-unrelated.md" };
  ledger.tickets.push(unrelated);
  file(
    join(client, ledger.tracker.path, unrelated.path),
    "# Unrelated\n\n**Status:** ready-for-agent\n\n**Blocked by:** None.\n"
  );
  ledger.operational.requirements[0].records = ["github", "missing-fact"];
  rmSync(local.artifacts["operational-source"]);
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.complete).toBe(true);
  expect(report.frontier).toEqual(["02-unrelated.md"]);
  expect(report.operational.requirements).toEqual([
    {
      ticket: "01-first.md",
      records: ["github", "missing-fact"],
      blockers: [
        { id: "github", state: "unavailable" },
        { id: "missing-fact", state: "unknown" },
      ],
    },
  ]);
  expect(report.operational.deployments[0].qualification.availability).toBe(
    "unavailable"
  );
});

test("revoked and superseded authorization history is visible without granting permission", () => {
  const { ledger, local } = setupOperational();
  const prior = ledger.operational.authorizations[0];
  prior.status = "superseded";
  prior.statusAt = "2026-10-26";
  prior.supersededBy = "clipboard-v2";
  ledger.operational.authorizations.push({
    ...prior,
    id: "clipboard-v2",
    authorizationDate: "2026-10-26",
    status: "revoked",
    statusAt: "2026-10-27",
  });
  delete ledger.operational.authorizations[1].supersededBy;
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(
    report.operational.authorizations.map(
      (item: {
        id: string;
        status: string;
        supersededBy?: string;
        permission: string;
      }) => ({
        id: item.id,
        status: item.status,
        supersededBy: item.supersededBy,
        permission: item.permission,
      })
    )
  ).toEqual([
    {
      id: "clipboard",
      status: "superseded",
      supersededBy: "clipboard-v2",
      permission: "not-assessed",
    },
    { id: "clipboard-v2", status: "revoked", permission: "not-assessed" },
  ]);
  expect(report.operational.requirements).toEqual([
    {
      ticket: "01-first.md",
      records: ["clipboard"],
      blockers: [{ id: "clipboard", state: "superseded" }],
    },
  ]);
  expect(report.frontier).toEqual([]);
  expect(JSON.parse(readFileSync(join(root, "run.json"), "utf8"))).toEqual(
    ledger
  );
});

test("operational requirements reject malformed authorization transitions and unknown ticket references", () => {
  const { ledger, local } = setupOperational();
  ledger.operational.authorizations[0].status = "revoked";
  ledger.operational.authorizations[0].supersededBy = "missing";
  expect(run(ledger, local).status).toBe(1);
  ledger.operational.authorizations[0].status = "superseded";
  expect(run(ledger, local).status).toBe(1);
  ledger.operational.authorizations[0].status = "recorded";
  delete ledger.operational.authorizations[0].supersededBy;
  ledger.operational.requirements[0].ticket = "missing.md";
  expect(run(ledger, local).status).toBe(1);
});

test("operational records reject invalid source references and credential-bearing routes", () => {
  const { ledger, local } = setupOperational();
  ledger.operational.access[0].source.kind = "public";
  expect(run(ledger, local).status).toBe(1);
  ledger.operational.access[0].source.kind = "artifact";
  ledger.operational.access[0].route =
    "https://operator:private-token@example.invalid/";
  expect(run(ledger, local).status).toBe(1);
});

function setupScenarios() {
  const { ledger, local } = setupOwnership();
  return {
    ledger: {
      ...ledger,
      schemaVersion: 3,
      scenarios: [
        {
          id: "S1",
          requirement: ledger.ownership.specification,
          consumingOutput:
            "Settings composition behind runtime availability controls",
          runtime: "shared UI",
          prerequisites: [] as string[],
          expectedObservation:
            "Reset remains unavailable until runtime qualification",
          evidenceType: "public UI and bridge checks",
          primaryOwner: "01-first.md",
          contributors: [] as string[],
          disposition: "Candidate",
        },
      ],
    },
    local,
  };
}

test("v3 reports finite scenario ownership through canonical numbered tickets without granting qualification", () => {
  const { ledger, local } = setupScenarios();
  const result = run(ledger, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.schemaVersion).toBe(3);
  expect(report.scenarios).toEqual([
    {
      ...ledger.scenarios[0],
      ownerStatus: "ready-for-agent",
      qualification: "not-assessed",
    },
  ]);
  expect(report.frontier).toEqual(["01-first.md"]);
  expect(result.stdout).not.toContain("private artifact canary");
});

test("v3 withholds assignments for an unadopted primary qualification owner", () => {
  const { ledger, local } = setupScenarios();
  ledger.scenarios[0].primaryOwner = "37-proposed-settings.md";
  const result = run(ledger, local);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.frontier).toEqual([]);
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({ code: "scenario-owner" })
  );
});

test("v3 rejects inconsistent scenario references and duplicate criterion allocation", () => {
  const { ledger, local } = setupScenarios();
  const scenario = ledger.scenarios[0];
  for (const [scenarios, code] of [
    [[scenario, { ...scenario, runtime: "Electron" }], "scenario-duplicate"],
    [
      [{ ...scenario, requirement: { role: "client", path: "absent.md" } }],
      "scenario-reference",
    ],
    [
      [{ ...scenario, prerequisites: ["38-missing-host.md"] }],
      "scenario-dependency",
    ],
    [
      [{ ...scenario, contributors: ["24-missing-collector.md"] }],
      "scenario-contributor",
    ],
    [[{ ...scenario, prerequisites: ["01-first.md"] }], "scenario-dependency"],
  ] as const) {
    const result = run({ ...ledger, scenarios }, local);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.frontier).toEqual([]);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code })
    );
  }
});

test("v3 verified scoped outputs unlock disabled reset UI while residual native and final qualification remain open", () => {
  const { ledger, local } = setupScenarios();
  const names = [
    "01-first.md",
    "02-host.md",
    "03-reset-ui.md",
    "04-native.md",
    "05-final.md",
  ];
  const addTicket = (path: string, status: string, dependencies: string[]) =>
    file(
      join(client, ledger.tracker.path, path),
      `# Scoped output\n\n**Status:** ${status}\n\n**Blocked by:** ${dependencies.length ? dependencies.map((name) => `[${name}](${name})`).join(", ") : "None."}\n`
    );
  addTicket(names[1], "ready-for-agent", []);
  addTicket(names[2], "ready-for-agent", names.slice(0, 2));
  addTicket(names[3], "ready-for-agent", names.slice(0, 1));
  addTicket(names[4], "ready-for-agent", names.slice(2, 4));
  const scenarios = [
    ledger.scenarios[0],
    {
      ...ledger.scenarios[0],
      id: "UI",
      primaryOwner: names[2],
      prerequisites: names.slice(0, 2),
    },
    {
      ...ledger.scenarios[0],
      id: "Native",
      primaryOwner: names[3],
      prerequisites: names.slice(0, 1),
      runtime: "Electron, Chrome popup/full-page, Android native",
      evidenceType: "actual native journeys",
    },
    {
      ...ledger.scenarios[0],
      id: "Final",
      primaryOwner: names[4],
      prerequisites: names.slice(2, 4),
      expectedObservation:
        "Same-candidate reset recovery and normal clipboard baseline through integrated UI",
    },
  ];
  const pending = {
    ...ledger,
    tickets: names.map((path) => ({ ...ledger.tickets[0], path })),
    scenarios,
  };
  expect(JSON.parse(run(pending, local).stdout).frontier).toEqual(
    names.slice(0, 2)
  );

  // A split/status edit alone cannot qualify a predecessor.
  for (const name of names.slice(0, 2)) addTicket(name, "resolved", []);
  const split = run(pending, local);
  expect(split.status).toBe(1);
  expect(JSON.parse(split.stdout).diagnostics).toContainEqual(
    expect.objectContaining({ code: "resolution-evidence" })
  );

  git(client, "checkout", "--quiet", "-b", "scoped-output");
  file(
    join(client, "scoped-output.txt"),
    "Settings composition and qualified host seam; reset availability stays disabled\n"
  );
  git(client, "add", "scoped-output.txt");
  git(client, "commit", "--quiet", "-m", "scoped compatible inputs");
  const source = git(client, "rev-parse", "HEAD");
  git(client, "checkout", "--quiet", "integration");
  git(
    client,
    "merge",
    "--quiet",
    "--no-ff",
    "scoped-output",
    "-m",
    "integrate scoped inputs"
  );
  const revisions = {
    client: git(client, "rev-parse", "HEAD"),
    relay: ledger.repositories.relay.integrationTip,
  };
  const complete = {
    ...pending,
    repositories: {
      ...ledger.repositories,
      client: {
        ...ledger.repositories.client,
        integrationTip: revisions.client,
      },
    },
    integrations: names.slice(0, 2).flatMap((name) =>
      ["client", "relay"].map((role) => ({
        ticket: name,
        role,
        sourceCommit: role === "client" ? source : revisions.relay,
        integratedCommit:
          role === "client" ? revisions.client : revisions.relay,
        verifiedBy: ledger.coordinator,
        artifact: "preserved",
      }))
    ),
    evidence: names.slice(0, 2).flatMap((name) =>
      ["verification", "standards", "spec"].map((kind) => ({
        id: `${name}-${kind}`,
        ticket: name,
        kind,
        outcome: "passed",
        profile: "routine",
        command: `descriptive only $(touch '${join(root, "forbidden")}')`,
        reviewer: "reviewer",
        tools: { node: process.version },
        observedAt: new Date().toISOString(),
        revisions,
        artifacts: ["preserved"],
      }))
    ),
  };
  const result = run(complete, local);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.frontier).toEqual(names.slice(2, 4));
  expect(
    report.tickets.find((item: { path: string }) => item.path === names[4])
  ).toMatchObject({
    status: "ready-for-agent",
    dependencies: names.slice(2, 4),
  });
  expect(
    report.scenarios
      .slice(1)
      .map((item: { ownerStatus: string; qualification: string }) => [
        item.ownerStatus,
        item.qualification,
      ])
  ).toEqual([
    ["ready-for-agent", "not-assessed"],
    ["ready-for-agent", "not-assessed"],
    ["ready-for-agent", "not-assessed"],
  ]);
  expect(readdirSync(root)).not.toContain("forbidden");
  expect(result.stdout).not.toContain("private artifact canary");

  addTicket(names[2], "ready-for-agent", ["99-missing.md"]);
  const missing = run(complete, local);
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout).diagnostics).toContainEqual(
    expect.objectContaining({ code: "missing-dependency" })
  );
  addTicket(names[2], "ready-for-agent", [names[4]]);
  const cycle = run(complete, local);
  expect(cycle.status).toBe(1);
  expect(JSON.parse(cycle.stdout).frontier).toEqual([]);
  expect(JSON.parse(cycle.stdout).diagnostics).toContainEqual(
    expect.objectContaining({ code: "cyclic-dependency" })
  );
});

test("human v3 status shows scenario owner and explicitly unassessed qualification", () => {
  const { ledger, local } = setupScenarios();
  run(ledger, local);
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--ledger",
      join(root, "run.json"),
      "--local",
      join(root, "local.json"),
    ],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    "Scenario S1: Candidate; owner 01-first.md (ready-for-agent); shared UI; qualification not-assessed"
  );
});
