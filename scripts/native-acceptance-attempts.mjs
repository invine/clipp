/** Persistent diagnostic policy for the maintained native acceptance commands. */
import assert from "node:assert/strict";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
  symlink,
  lstat,
  readlink,
  cp,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const budgetMs = 20 * 60 * 1000;
const maxAttempts = 5;
async function save(file, value) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(`${file}.tmp`, file);
}

// output is the durable scenario directory, reused across invocations. Diagnostic
// prose is private evidence: consumers must not copy it into public receipts.
async function beginLegacyAttempt({
  output,
  scenario,
  change,
  expectation,
  deferDiagnosticClockUntilFailure = false,
  diagnosticInitial = false,
  now = () => Date.now(),
}) {
  await mkdir(output, { recursive: true, mode: 0o700 });
  const lockPath = path.join(output, ".attempt.lock");
  const lock = await open(lockPath, "wx", 0o600);
  const historyPath = path.join(output, "attempts.json");
  let history;
  try {
    try {
      history = JSON.parse(await readFile(historyPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      history = {
        version: 1,
        scenario,
        diagnosticStartedAt: null,
        attempts: [],
      };
    }
    assert(
      history.version === 1 &&
        history.scenario === scenario &&
        Array.isArray(history.attempts),
      "attempt_history_invalid"
    );
    assert(
      history.attempts.length < maxAttempts,
      "diagnostic_attempt_budget_exhausted"
    );
    if (history.attempts.length) {
      assert(
        history.attempts.at(-1).result !== "passed",
        "scenario_already_passed"
      );
      assert(
        typeof change === "string" &&
          change.trim() &&
          typeof expectation === "string" &&
          expectation.trim(),
        "changed_diagnosis_required"
      );
      assert(
        !history.attempts.some((attempt) => attempt.change === change.trim()),
        "unchanged_diagnosis_refused"
      );
      // Legacy callers include attempt one. Electron can defer the diagnostic
      // budget until its initial failure is recorded. A retry never resets it.
      history.diagnosticStartedAt ??= deferDiagnosticClockUntilFailure
        ? (history.attempts[0].finishedAt ?? new Date(now()).toISOString())
        : history.attempts[0].startedAt;
      assert(
        Number.isFinite(Date.parse(history.diagnosticStartedAt)),
        "attempt_history_invalid"
      );
      assert(
        now() - Date.parse(history.diagnosticStartedAt) < budgetMs,
        "diagnostic_time_budget_exhausted"
      );
    }
    const number = history.attempts.length + 1;
    const directory = path.join(output, `attempt-${number}`);
    await mkdir(directory, { mode: 0o700 });
    const attempt = {
      number,
      startedAt: new Date(now()).toISOString(),
      result: "running",
      ...(number > 1 || diagnosticInitial
        ? { change: change.trim(), expectation: expectation.trim() }
        : {}),
    };
    if (!deferDiagnosticClockUntilFailure || number > 1)
      history.diagnosticStartedAt ??= attempt.startedAt;
    history.attempts.push(attempt);
    await save(historyPath, history);
    return {
      number,
      startedAt: attempt.startedAt,
      directory,
      remainingMs(maximum) {
        const remaining = history.diagnosticStartedAt
          ? budgetMs - (now() - Date.parse(history.diagnosticStartedAt))
          : maximum;
        assert(remaining > 0, "diagnostic_time_budget_exhausted");
        return Math.min(maximum, remaining);
      },
      assertBudget() {
        if (history.diagnosticStartedAt)
          assert(
            now() - Date.parse(history.diagnosticStartedAt) < budgetMs,
            "diagnostic_time_budget_exhausted"
          );
      },
      async finish(receipt) {
        try {
          attempt.finishedAt = new Date(now()).toISOString();
          attempt.result = receipt.result;
          attempt.stage = receipt.stage;
          attempt.classification = receipt.classification;
          attempt.receipt = `attempt-${number}/receipt.json`;
          if (
            number === 1 &&
            deferDiagnosticClockUntilFailure &&
            receipt.result !== "passed"
          )
            history.diagnosticStartedAt = attempt.finishedAt;
          await save(path.join(directory, "receipt.json"), receipt);
          await save(path.join(output, "receipt.json"), receipt);
          await save(historyPath, history);
        } finally {
          await lock.close();
          await unlink(lockPath);
        }
      },
    };
  } catch (error) {
    await lock.close();
    await unlink(lockPath);
    throw error;
  }
}

function ownerFingerprint(pid) {
  const result = spawnSync(
    "ps",
    ["-p", String(pid), "-o", "lstart=", "-o", "command="],
    { encoding: "utf8", timeout: 1000 }
  );
  return result.status === 0 && result.stdout.trim()
    ? createHash("sha256").update(result.stdout.trim()).digest("hex")
    : null;
}

/** Semantic history is opt-in: existing runtime callers retain version-1 semantics. */
export async function beginNativeAttempt(options) {
  if (!options.identity) return beginLegacyAttempt(options);
  const { output, historyRoot, identity, renewal } = options;
  assert(path.isAbsolute(historyRoot ?? ""), "absolute_history_root_required");
  assert(
    identity.effort?.trim() && identity.scenario && identity.environment,
    "semantic_history_identity_required"
  );
  const key = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  if (options.registryRoot) {
    await mkdir(options.registryRoot, { recursive: true, mode: 0o700 });
    const registration = path.join(options.registryRoot, `${key}.json`);
    try {
      const file = await open(registration, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify({ historyRoot }));
      } finally {
        await file.close();
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const registered = JSON.parse(await readFile(registration, "utf8"));
    assert(
      registered.historyRoot === historyRoot,
      "registered_history_location_changed"
    );
  }
  const base = path.join(historyRoot, key);
  await mkdir(base, { recursive: true, mode: 0o700 });
  // An admission lock serializes inspection and transition. A dead admission
  // owner requires operator recovery; uncertainty never starts a second worker.
  const admissionPath = path.join(base, ".admission.lock");
  const admission = await open(admissionPath, "wx", 0o600);
  try {
    const identityPath = path.join(base, "identity.json");
    try {
      assert.deepEqual(
        JSON.parse(await readFile(identityPath, "utf8")),
        identity,
        "semantic_history_identity_mismatch"
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await save(identityPath, identity);
    }
    let generation = 0;
    let batchKind = "initial";
    let predecessor;
    let successorCandidate;
    let previous;
    try {
      previous = JSON.parse(
        await readFile(path.join(base, "current.json"), "utf8")
      );
      generation = previous.generation;
      batchKind =
        previous.batchKind ?? (generation > 0 ? "renewal" : "initial");
      predecessor = previous.predecessor;
      successorCandidate = previous.successorCandidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (options.importHistory?.length) {
      assert(!previous, "history_import_requires_unregistered_budget");
      const imported = {
        version: 1,
        scenario: options.scenario,
        diagnosticStartedAt: null,
        attempts: [],
        importedFrom: [],
      };
      const directory = path.join(base, "budget-0");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      for (const file of options.importHistory) {
        assert(path.isAbsolute(file), "absolute_legacy_history_required");
        const legacy = JSON.parse(await readFile(file, "utf8"));
        assert(
          legacy.version === 1 &&
            legacy.scenario === options.scenario &&
            Array.isArray(legacy.attempts) &&
            legacy.attempts.every((attempt) => attempt.result !== "running"),
          "legacy_history_invalid_or_active"
        );
        for (const attempt of legacy.attempts) {
          const number = imported.attempts.length + 1;
          await cp(
            path.join(path.dirname(file), `attempt-${attempt.number}`),
            path.join(directory, `attempt-${number}`),
            {
              recursive: true,
              dereference: true,
              errorOnExist: true,
              force: false,
            }
          );
          imported.attempts.push({
            ...attempt,
            number,
            receipt: `attempt-${number}/receipt.json`,
            importedFrom: { history: file, number: attempt.number },
          });
        }
        if (
          legacy.diagnosticStartedAt &&
          (!imported.diagnosticStartedAt ||
            Date.parse(legacy.diagnosticStartedAt) <
              Date.parse(imported.diagnosticStartedAt))
        )
          imported.diagnosticStartedAt = legacy.diagnosticStartedAt;
        imported.importedFrom.push(file);
      }
      const history = path.join(directory, "attempts.json");
      await save(history, imported);
      previous = { generation: 0, history };
      await save(path.join(base, "current.json"), previous);
    }
    if (options.successor) {
      assert(!renewal, "successor_and_renewal_are_distinct");
      const decision = JSON.parse(await readFile(options.successor, "utf8"));
      assert(
        previous &&
          decision.previousHistory === previous.history &&
          /^[a-f0-9]{40}$/.test(decision.candidateRevision ?? "") &&
          Array.isArray(decision.affectedScenarios) &&
          decision.affectedScenarios.includes(options.scenario) &&
          decision.reason?.trim(),
        "candidate_bound_successor_required"
      );
      const prior = JSON.parse(await readFile(previous.history, "utf8"));
      assert(
        prior.attempts.at(-1)?.result === "passed",
        "successor_requires_passed_history"
      );
      const priorReceipt = JSON.parse(
        await readFile(
          path.join(
            path.dirname(previous.history),
            prior.attempts.at(-1).receipt
          ),
          "utf8"
        )
      );
      assert(
        priorReceipt.candidate?.revision !== decision.candidateRevision,
        "successor_candidate_must_change"
      );
      predecessor = previous.history;
      successorCandidate = decision.candidateRevision;
      batchKind = "successor";
      generation += 1;
      await save(path.join(base, `successor-${generation}.json`), decision);
    }
    if (renewal) {
      const decision = JSON.parse(await readFile(renewal, "utf8"));
      assert(
        previous &&
          decision.previousHistory === previous.history &&
          typeof decision.reason === "string" &&
          decision.reason.trim() &&
          typeof decision.authorizedBy === "string" &&
          decision.authorizedBy.trim(),
        "renewal_must_reference_failed_history"
      );
      const prior = JSON.parse(await readFile(previous.history, "utf8"));
      assert(
        prior.attempts.length && prior.attempts.at(-1).result === "failed",
        "renewal_must_reference_failed_history"
      );
      assert(!prior.renewedBy, "renewal_already_consumed");
      assert(
        options.change?.trim() && options.expectation?.trim(),
        "changed_diagnosis_required"
      );
      assert(
        !prior.attempts.some(
          (attempt) => attempt.change === options.change.trim()
        ),
        "unchanged_diagnosis_refused"
      );
      prior.renewedBy = { decision, recordedAt: new Date().toISOString() };
      await save(previous.history, prior);
      generation += 1;
      batchKind = "renewal";
      predecessor = previous.history;
      successorCandidate = undefined;
      await save(path.join(base, `renewal-${generation}.json`), decision);
    }
    const directory = path.join(base, `budget-${generation}`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Interrupted workers preserve a failed receipt. A live or uncertain owner
    // is refused; do not infer safety from historical descendant snapshots.
    const activePath = path.join(directory, ".attempt.lock");
    try {
      const owner = JSON.parse(await readFile(activePath, "utf8"));
      let absent = false;
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        absent = error.code === "ESRCH";
      }
      if (!absent && owner.fingerprint) {
        const current = ownerFingerprint(owner.pid);
        absent = Boolean(current && current !== owner.fingerprint);
      }
      assert(absent, "diagnostic_attempt_active_or_ownership_uncertain");
      const historyPath = path.join(directory, "attempts.json");
      const history = JSON.parse(await readFile(historyPath, "utf8"));
      const interrupted = history.attempts.at(-1);
      if (interrupted.result === "running") {
        const finishedAt = new Date().toISOString();
        Object.assign(interrupted, {
          result: "failed",
          finishedAt,
          stage: "interrupted",
          classification: "unknown",
          receipt: `attempt-${interrupted.number}/receipt.json`,
        });
        history.diagnosticStartedAt ??= finishedAt;
        const receipt = {
          result: "failed",
          stage: "interrupted",
          classification: "unknown",
          reason: "runner_interrupted",
          recoveryAction:
            "verify current owned profile isolation before a changed diagnosis",
          finishedAt,
        };
        await save(path.join(directory, interrupted.receipt), receipt);
        await save(path.join(directory, "receipt.json"), receipt);
        await save(historyPath, history);
      }
      await unlink(activePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Refuse implicit import of unrelated legacy evidence. An explicit migration
    // must preserve that history and its old timing semantics.
    try {
      const stat = await lstat(path.join(output, "attempts.json"));
      assert(
        stat.isSymbolicLink() || path.resolve(output) === directory,
        "legacy_attempt_history_requires_explicit_migration"
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const history = path.join(directory, "attempts.json");
    await mkdir(output, { recursive: true, mode: 0o700 });
    await save(path.join(output, "history.json"), {
      identity,
      key,
      history,
      generation,
    });
    const attempt = await beginLegacyAttempt({
      ...options,
      output: directory,
      deferDiagnosticClockUntilFailure:
        batchKind !== "renewal"
          ? options.deferDiagnosticClockUntilFailure
          : false,
      diagnosticInitial: batchKind === "renewal",
    });
    await writeFile(
      activePath,
      JSON.stringify({
        pid: process.pid,
        fingerprint: ownerFingerprint(process.pid),
      }),
      {
        mode: 0o600,
      }
    );
    await save(path.join(base, "current.json"), {
      generation,
      history,
      batchKind,
      predecessor,
      successorCandidate,
    });
    for (const [name, target] of [
      ["attempts.json", history],
      [`attempt-${attempt.number}`, attempt.directory],
    ]) {
      const link = path.join(output, name);
      try {
        const existing = await lstat(link);
        assert(
          existing.isSymbolicLink() &&
            path.resolve(await readlink(link)).startsWith(base + path.sep),
          "output_history_alias_refused"
        );
        await unlink(link);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await symlink(target, link);
    }
    return {
      ...attempt,
      history,
      successorCandidate: attempt.number === 1 ? successorCandidate : undefined,
      async finish(receipt) {
        receipt.history = { key, generation, path: history, predecessor };
        await attempt.finish(receipt);
        await save(path.join(output, "receipt.json"), receipt);
      },
    };
  } finally {
    await admission.close();
    await unlink(admissionPath);
  }
}

/** Stable user state shared across linked checkouts and frozen independent clones. */
export function nativeAcceptanceStateRoot() {
  if (process.env.CLIPP_ACCEPTANCE_STATE_ROOT) {
    assert(
      path.isAbsolute(process.env.CLIPP_ACCEPTANCE_STATE_ROOT),
      "absolute_acceptance_state_root_required"
    );
    return process.env.CLIPP_ACCEPTANCE_STATE_ROOT;
  }
  const home = homedir();
  if (process.platform === "darwin")
    return path.join(
      home,
      "Library/Application Support/Clipp/Acceptance/native"
    );
  if (process.platform === "win32")
    return path.join(home, "AppData/Local/Clipp/Acceptance/native");
  return path.join(home, ".local/state/clipp/acceptance/native");
}
