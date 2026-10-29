// V3 applicability is a separate reviewed attestation, never a new observation.
import { createHash } from "node:crypto";

export function inspectApplicability(
  ledger,
  repositories,
  roots,
  git,
  portable,
  rawGit
) {
  const candidates = new Map();
  const bindings = new Map();
  const records = [];
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  for (const candidate of ledger.candidates ?? []) {
    check(
      !candidates.has(candidate.id),
      `duplicate candidate: ${candidate.id}`
    );
    for (const [role, revision] of Object.entries(candidate.revisions)) {
      check(roots[role], `${candidate.id}: missing candidate repository`);
      git(roots[role], "cat-file", "-e", `${revision}^{commit}`);
    }
    candidates.set(candidate.id, candidate);
  }
  for (const binding of ledger.evidenceBindings ?? []) {
    const evidence = ledger.evidence.find(
      (item) => item.id === binding.evidenceId
    );
    const candidate = candidates.get(binding.candidateId);
    check(
      evidence && candidate && !bindings.has(binding.evidenceId),
      `${binding.evidenceId}: invalid or duplicate original binding`
    );
    check(
      JSON.stringify(Object.entries(candidate.revisions).sort()) ===
        JSON.stringify(Object.entries(evidence.revisions).sort()),
      `${binding.evidenceId}: original candidate revisions differ from observation`
    );
    const scenarios = ledger.scenarios.filter((item) =>
      binding.scenarioIds.includes(item.id)
    );
    check(
      scenarios.length === binding.scenarioIds.length &&
        scenarios.every((item) => item.primaryOwner === evidence.ticket),
      `${binding.evidenceId}: scenario ownership differs from observation`
    );
    for (const input of binding.relevantInputs) {
      portable(input.path);
      check(roots[input.role], "relevant input role unavailable");
    }
    bindings.set(binding.evidenceId, binding);
  }
  const blobCache = new Map();
  const blob = (role, revision, path) => {
    const key = `${role}:${revision}:${path}`;
    if (blobCache.has(key)) return blobCache.get(key);
    try {
      const value = git(
        roots[role],
        "rev-parse",
        "--verify",
        `${revision}:${path}`
      );
      blobCache.set(key, value);
      return value;
    } catch {
      blobCache.set(key, "absent");
      return "absent";
    }
  };
  // Only this exact public canonical issue may have mutable ownership/status
  // headers removed. Everything else in its acceptance body remains byte-exact.
  const sameIssueContract = (role, path, owner, before, after, assessment) => {
    if (
      role !== ledger.tracker.role ||
      path !== `${ledger.tracker.path}/${owner}` ||
      assessment?.assessment !== "status-only"
    )
      return false;
    try {
      const body = (revision) => {
        const object = blob(role, revision, path);
        if (
          object === "absent" ||
          git(roots[role], "cat-file", "-t", object) !== "blob" ||
          Number(git(roots[role], "cat-file", "-s", object)) > 128 * 1024
        )
          return null;
        const text = rawGit(roots[role], "cat-file", "blob", object);
        const status = /^\*\*Status:\*\*[ \t]*([^\r\n]+)\r?$/gm;
        const statuses = [...text.matchAll(status)];
        const assignees = [
          ...text.matchAll(/^\*\*Assignee:\*\*[^\r\n]*\r?$/gm),
        ];
        if (
          statuses.length !== 1 ||
          assignees.length > 1 ||
          ![
            "ready-for-agent",
            "ready-for-human",
            "needs-triage",
            "needs-info",
            "claimed",
            "blocked",
            "deferred",
            "resolved",
            "wontfix",
          ].includes(statuses[0][1].trim())
        )
          return null;
        return text.replace(
          /^\*\*(?:Status|Assignee):\*\*[^\r\n]*(?:\r?\n(?:\r?\n)?|$)/gm,
          ""
        );
      };
      const original = body(before);
      return original !== null && original === body(after);
    } catch {
      return false;
    }
  };
  const seen = new Set();
  for (const carry of ledger.carryForwards ?? []) {
    const key = `${carry.evidenceId}:${carry.scenarioId}:${carry.candidateId}`;
    check(!seen.has(key), `duplicate carry-forward: ${key}`);
    seen.add(key);
    const binding = bindings.get(carry.evidenceId);
    const candidate = candidates.get(carry.candidateId);
    const evidence = ledger.evidence.find(
      (item) => item.id === carry.evidenceId
    );
    check(
      binding && candidate && binding.scenarioIds.includes(carry.scenarioId),
      `${key}: missing original binding or candidate/scenario`
    );
    const original = candidates.get(binding.candidateId);
    const record = { ...carry, state: "review-required", reasons: [] };
    const reject = (reason) => record.reasons.push(reason);
    if (evidence.outcome !== "passed")
      reject("Original observation did not pass");
    const scenarios = ledger.scenarios.filter(
      (item) => item.primaryOwner === evidence.ticket
    );
    if (scenarios.length !== binding.scenarioIds.length)
      reject("Scenario coverage changed");
    const digest = createHash("sha256")
      .update(JSON.stringify(scenarios))
      .digest("hex");
    if (digest !== binding.scenarioDigest)
      reject("Scenario acceptance allocation changed");
    if (
      Object.keys(original.inputs).some(
        (key) => original.inputs[key] !== candidate.inputs[key]
      )
    )
      reject("Candidate execution inputs changed");
    const paths = (inputs) =>
      inputs
        .map((item) => `${item.role}:${item.path}`)
        .sort()
        .join("\n");
    if (paths(binding.relevantInputs) !== paths(carry.relevantInputs))
      reject("Relevant input scope changed");
    const assessments = new Map();
    for (const change of carry.assessedChanges) {
      portable(change.path);
      const path = `${change.role}:${change.path}`;
      check(!assessments.has(path), `${key}: duplicate change assessment`);
      assessments.set(path, change);
    }
    for (const input of binding.relevantInputs) {
      if (
        !original.revisions[input.role] ||
        !candidate.revisions[input.role] ||
        blob(input.role, original.revisions[input.role], input.path) ===
          "absent" ||
        blob(input.role, candidate.revisions[input.role], input.path) ===
          "absent"
      )
        reject(`${input.role}:${input.path}: relevant input unavailable`);
    }
    const actual = new Set();
    for (const role of Object.keys(original.revisions)) {
      const repository = repositories[role];
      const before = original.revisions[role];
      const after = candidate.revisions[role];
      if (!before || !after || after !== repository.integrationTip) {
        reject(`${role}: candidate does not bind current integration`);
        continue;
      }
      // Name-only raw output avoids executing diff drivers and never exposes blobs.
      const changes = rawGit(
        roots[role],
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--name-only",
        "-z",
        before,
        after,
        "--"
      )
        .split("\0")
        .filter(Boolean);
      check(
        changes.length <= 500,
        "more than 500 changed paths; narrow/reconcile applicability"
      );
      const contracts = [
        ledger.ownership.specification,
        ...scenarios.map((item) => item.requirement),
      ];
      for (const path of changes) {
        portable(path);
        const identity = `${role}:${path}`;
        actual.add(identity);
        const assessment = assessments.get(identity);
        if (
          assessment &&
          (assessment.before !== blob(role, before, path) ||
            assessment.after !== blob(role, after, path))
        )
          reject(`${identity}: assessment does not bind actual Git blobs`);
        const contract = contracts.some(
          (item) => item.role === role && item.path === path
        );
        const relevant = binding.relevantInputs.some(
          (item) =>
            item.role === role &&
            (path === item.path || path.startsWith(`${item.path}/`))
        );
        // Global execution inputs cannot receive a prose/filename exemption.
        const execution =
          /(^|\/)(package(?:-lock)?\.json|npm-shrinkwrap\.json|[^/]*lock[^/]*|\.nvmrc|\.node-version|[^/]*config\.[^/]+)$/.test(
            path
          ) || /^(scripts|\.github|patches)\//.test(path);
        const closureMetadata =
          contract &&
          sameIssueContract(
            role,
            path,
            evidence.ticket,
            before,
            after,
            assessment
          );
        if (execution || ((contract || relevant) && !closureMetadata))
          reject(`${identity}: acceptance or execution input changed`);
        else if (
          !assessment ||
          ["changed", "unknown"].includes(assessment.assessment)
        )
          reject(`${identity}: impact requires review or rerun`);
        else if (
          ["documentation-only", "status-only"].includes(
            assessment.assessment
          ) &&
          !/\.md$/.test(path)
        )
          reject(`${identity}: prose assessment cannot exempt execution input`);
      }
    }
    for (const path of assessments.keys())
      if (!actual.has(path))
        reject(`${path}: assessment does not match actual Git changes`);
    if (!record.reasons.length) record.state = "applicable";
    records.push(record);
  }
  return {
    records,
    applicable(evidence) {
      const binding = bindings.get(evidence.id);
      return (
        binding &&
        binding.scenarioIds.every((scenarioId) =>
          records.some(
            (item) =>
              item.evidenceId === evidence.id &&
              item.scenarioId === scenarioId &&
              item.state === "applicable"
          )
        )
      );
    },
  };
}
