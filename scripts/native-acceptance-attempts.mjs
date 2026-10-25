/** Persistent diagnostic policy for the maintained native acceptance commands. */
import assert from "node:assert/strict";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const budgetMs = 20 * 60 * 1000;
async function save(file, value) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(`${file}.tmp`, file);
}

// output is the durable scenario directory, reused across invocations. Diagnostic
// prose is private evidence: consumers must not copy it into public receipts.
export async function beginNativeAttempt({
  output,
  scenario,
  change,
  expectation,
  deferDiagnosticClockUntilFailure = false,
  now = Date.now,
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
    assert(history.attempts.length < 3, "diagnostic_attempt_budget_exhausted");
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
      ...(number > 1
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
