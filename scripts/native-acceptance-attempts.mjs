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
      // Interrupted attempts have no finish timestamp; their original start is
      // the conservative clock origin. Invoking again never resets the budget.
      history.diagnosticStartedAt ??=
        history.attempts[0].finishedAt ?? history.attempts[0].startedAt;
      assert(
        Number.isFinite(Date.parse(history.diagnosticStartedAt)),
        "attempt_history_invalid"
      );
      assert(
        Date.now() - Date.parse(history.diagnosticStartedAt) < budgetMs,
        "diagnostic_time_budget_exhausted"
      );
    }
    const number = history.attempts.length + 1;
    const directory = path.join(output, `attempt-${number}`);
    await mkdir(directory, { mode: 0o700 });
    const attempt = {
      number,
      startedAt: new Date().toISOString(),
      result: "running",
      ...(number > 1
        ? { change: change.trim(), expectation: expectation.trim() }
        : {}),
    };
    history.attempts.push(attempt);
    await save(historyPath, history);
    return {
      number,
      directory,
      remainingMs(maximum) {
        const remaining = history.diagnosticStartedAt
          ? budgetMs - (Date.now() - Date.parse(history.diagnosticStartedAt))
          : maximum;
        assert(remaining > 0, "diagnostic_time_budget_exhausted");
        return Math.min(maximum, remaining);
      },
      assertBudget() {
        if (history.diagnosticStartedAt)
          assert(
            Date.now() - Date.parse(history.diagnosticStartedAt) < budgetMs,
            "diagnostic_time_budget_exhausted"
          );
      },
      async finish(receipt) {
        try {
          attempt.finishedAt = new Date().toISOString();
          attempt.result = receipt.result;
          attempt.stage = receipt.stage;
          attempt.classification = receipt.classification;
          attempt.receipt = `attempt-${number}/receipt.json`;
          if (receipt.result !== "passed")
            history.diagnosticStartedAt ??= attempt.finishedAt;
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
