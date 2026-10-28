// A derived view: canonical tickets and the existing status evaluator own state.
export function compactRecovery(report, ledger, entry) {
  const revisions = Object.fromEntries(
    Object.entries(report.repositories).map(([role, repo]) => [
      role,
      repo.integrationTip,
    ])
  );
  const matches = (ledger?.candidates ?? []).filter(
    (candidate) =>
      Object.keys(revisions).length ===
        Object.keys(candidate.revisions).length &&
      Object.entries(revisions).every(
        ([role, tip]) => candidate.revisions[role] === tip
      )
  );
  const selectedId = ledger?.selectedCandidateId ?? entry?.candidateId;
  const candidate = selectedId
    ? (ledger?.candidates ?? []).find((item) => item.id === selectedId)
    : matches.length === 1
      ? matches[0]
      : null;
  const authorizations = report.operational.authorizations ?? [];
  const scenarios = (report.scenarios ?? []).map((scenario) => {
    const owner = report.tickets.find(
      (ticket) => ticket.path === scenario.primaryOwner
    );
    const evidence = report.evidence
      .filter((item) =>
        (ledger?.evidenceBindings ?? []).some(
          (binding) =>
            binding.evidenceId === item.id &&
            binding.scenarioIds.includes(scenario.id)
        )
      )
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        profile: item.profile,
        outcome: item.outcome,
        artifacts: item.artifacts,
        freshness: item.freshness,
        applicability: (report.carryForwards ?? [])
          .filter(
            (record) =>
              record.evidenceId === item.id && record.scenarioId === scenario.id
          )
          .map((record) => ({
            candidateId: record.candidateId,
            state: record.state,
            reasons: record.reasons,
          })),
      }));
    return {
      id: scenario.id,
      output: scenario.consumingOutput,
      runtime: scenario.runtime,
      disposition: scenario.disposition,
      owner: scenario.primaryOwner,
      ownerStatus: scenario.ownerStatus,
      remaining:
        !owner ||
        owner.status !== "resolved" ||
        Object.values(owner.integration ?? {}).some(
          (state) => state !== "accepted"
        ) ||
        report.diagnostics.some(
          (item) => !item.ticket || item.ticket === scenario.primaryOwner
        ),
      requirement: scenario.requirement,
      qualification: scenario.qualification,
      applicability: evidence.some(
        (item) =>
          item.outcome === "passed" &&
          ["fresh", "carried-forward"].includes(item.freshness)
      )
        ? "available"
        : "pending",
      evidence,
    };
  });
  const outputs = report.tickets.map((ticket) => ({
    ticket: ticket.path,
    status: ticket.status,
    owners: report.claims
      .filter((claim) => claim.ticket === ticket.path)
      .map((claim) => ({
        id: claim.id,
        owner: claim.owner,
        activity: claim.activity,
      })),
    integration: ticket.integration,
    scenarios: scenarios
      .filter((scenario) => scenario.owner === ticket.path)
      .map((scenario) => scenario.id),
    blockers: [
      ...ticket.dependencies
        .filter(
          (path) =>
            report.tickets.find((item) => item.path === path)?.status !==
            "resolved"
        )
        .map((path) => ({ kind: "dependency", ticket: path })),
      ...(ticket.decision?.assessment === "pending"
        ? [{ kind: "decision", references: ticket.decision.references }]
        : []),
      ...(ticket.evidenceBlocked
        ? [{ kind: "acceptance", state: "blocked" }]
        : []),
      ...ticket.externalBlockers.map((item) => ({ kind: "external", ...item })),
      ...(ticket.operationalBlockers ?? []).map((item) => ({
        kind: "operational",
        ...item,
      })),
      ...report.diagnostics
        .filter((item) => item.ticket === ticket.path)
        .map((item) => ({ kind: "evidence", ...item })),
    ],
  }));
  return {
    schemaVersion: report.schemaVersion,
    observedAt: report.observedAt,
    runId: report.runId,
    complete: report.complete,
    canonical: report.ownership?.canonical ?? { state: "unknown" },
    candidate: candidate
      ? {
          state: matches.some((item) => item.id === candidate.id)
            ? "current"
            : "selected",
          ...candidate,
          integrationState: matches.some((item) => item.id === candidate.id)
            ? "matching-revisions"
            : "different-revisions",
        }
      : { state: "unknown", revisions },
    integration: Object.fromEntries(
      Object.entries(report.repositories).map(([role, repo]) => [
        role,
        { branch: repo.integrationBranch, revision: repo.integrationTip },
      ])
    ),
    claims: report.claims.map(
      ({ id, ticket, owner, activity, coordinator, repositories }) => ({
        id,
        ticket,
        owner,
        activity,
        coordinator,
        repositories,
      })
    ),
    outputs,
    applicabilityTarget: revisions,
    scenarios,
    capacity: {
      active: report.activeImplementers ?? 0,
      available: report.availableSlots ?? 0,
      maximum: ledger?.maxImplementers ?? 2,
    },
    authorizations: {
      state: report.operational.authorizationsState ?? "unknown",
      records: authorizations.map(
        ({
          id,
          action,
          resources,
          limits,
          authorizationDate,
          observedAt,
          source,
          status,
          statusAt,
          statusSource,
          statusAvailability,
          supersededBy,
          permission,
        }) => ({
          id,
          action,
          resources,
          limits,
          authorizationDate,
          observedAt,
          source,
          status,
          statusAt,
          statusSource,
          statusAvailability,
          supersededBy,
          permission,
        })
      ),
      requirements: report.operational.requirements ?? [],
    },
    nextActions: [
      ...report.diagnostics.map(({ code, message, ticket }) => ({
        action: "reconcile",
        code,
        message,
        ...(ticket ? { ticket } : {}),
      })),
      ...report.frontier.map((ticket) => ({ action: "dispatch", ticket })),
      ...report.claims
        .filter((claim) => claim.activity === "handoff")
        .map((claim) => ({
          action: "review-handoff",
          ticket: claim.ticket,
          owner: claim.owner,
        })),
    ],
    diagnostics: report.diagnostics,
  };
}

export function formatCompact(current) {
  const brief = (value) => {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  };
  const list = (values) => {
    const unique = [...new Set(values)];
    return `${unique.slice(0, 3).join(", ")}${unique.length > 3 ? ` (+${unique.length - 3} more)` : ""}`;
  };
  const reference = (value) =>
    value?.kind === "artifact"
      ? `artifact:${value.id}`
      : value?.role
        ? `${value.role}:${value.path}`
        : "unknown";
  const groups = new Map();
  for (const output of current.outputs) {
    for (const blocker of output.blockers) {
      // Evidence diagnostics already have an actionable reconciliation group below.
      if (blocker.kind === "evidence") continue;
      const label =
        blocker.kind === "dependency"
          ? `dependency ${blocker.ticket}`
          : blocker.kind === "external"
            ? `${blocker.owner}: ${brief(blocker.reason)}`
            : blocker.kind === "operational"
              ? `operational ${blocker.id}: ${blocker.state}`
              : blocker.kind === "decision"
                ? "decision pending"
                : "acceptance pending";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(output.ticket);
    }
  }
  const actions = new Map();
  for (const action of current.nextActions) {
    const key =
      action.action === "reconcile"
        ? `reconcile ${action.code}`
        : action.action;
    if (!actions.has(key))
      actions.set(key, { items: [], example: action.message });
    actions.get(key).items.push(action);
  }
  const remaining = current.scenarios.filter((item) => item.remaining).length;
  const applicable = current.scenarios.filter(
    (item) => item.applicability === "available"
  ).length;
  return [
    `${current.runId ?? "Run"}: ${current.complete ? "consistent" : "incomplete"} (${current.observedAt})`,
    `Canonical: ${current.canonical.role ? `${current.canonical.role}:${current.canonical.path}` : "unknown"}`,
    `Candidate: ${current.candidate.id ?? "unknown"}; ${Object.entries(
      current.candidate.revisions
    )
      .map(([role, revision]) => `${role}:${revision}`)
      .join(
        ", "
      )}; ${current.candidate.integrationState ?? "identity unknown"}`,
    ...Object.entries(current.integration).map(
      ([role, item]) => `Integration ${role}: ${item.branch} ${item.revision}`
    ),
    `Capacity: ${current.capacity.active}/${current.capacity.maximum} active; ${current.capacity.available} available`,
    ...current.outputs.map(
      (item) =>
        `${item.ticket}: ${item.status}; owner ${item.owners.map((owner) => `${owner.owner} (${owner.activity})`).join(", ") || "none"}; scenarios ${item.scenarios.length}; integration ${
          Object.entries(item.integration ?? {})
            .map(([role, state]) => `${role} ${state}`)
            .join(", ") || "unknown"
        }; blockers ${item.blockers.length}`
    ),
    `Scenarios: ${current.scenarios.length} total; ${remaining} remaining; applicability ${applicable} available, ${current.scenarios.length - applicable} pending; qualification details --json`,
    ...[...groups].map(
      ([label, tickets]) => `Blocked: ${label}; ${list(tickets)}`
    ),
    `Authorizations: ${current.authorizations.state}; permission not-assessed`,
    ...current.authorizations.records.map(
      (item) =>
        `Authorization ${item.id}: ${item.status}; references ${list([reference(item.source), reference(item.statusSource)])}; limits: see references (${item.limits?.length ?? 0} recorded)${item.supersededBy ? `; superseded by ${item.supersededBy}` : ""}`
    ),
    ...(current.authorizations.requirements.length
      ? [
          `Authorization requirements: ${current.authorizations.requirements.length}; ticket/record scope --json`,
        ]
      : []),
    ...[...actions].map(
      ([key, group]) =>
        `Next: ${key} (${group.items.length}); ${list(group.items.map((item) => item.ticket ?? "run"))}${group.example ? `; ${brief(group.example)}` : ""}`
    ),
    "Details: selected canonical ticket; --compact --json for all scenarios, blockers, evidence and authorization scope.",
  ].join("\n");
}
