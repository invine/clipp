import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  loadAttemptState,
  parseClipboardAcceptanceArgs,
  recordDiagnosticAttempt,
  saveAttemptState,
} from "./clipboard-acceptance.mjs";

test("public runner refuses missing or unrelated authorization before launch", () => {
  const runner = new URL("./verify-clipboard-io.mjs", import.meta.url);
  const missing = spawnSync(
    process.execPath,
    [runner.pathname, "--validate-only"],
    { encoding: "utf8" }
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /authorization_reference_required/);
  const unrelated = spawnSync(
    process.execPath,
    [
      runner.pathname,
      "--validate-only",
      "--authorization-reference",
      "unrelated",
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(unrelated.status, 0);
  assert.match(unrelated.stderr, /authorization_reference_not_applicable/);
});

test("requires a changed-hypothesis record for diagnostic CLI attempts", () => {
  assert.throws(
    () =>
      parseClipboardAcceptanceArgs([
        "--authorization-reference",
        "operational-reliability:D4:2026-10-25",
        "--attempt",
        "diagnostic",
      ]),
    /changed_hypothesis_required/
  );
});

test("requires effort-scoped authorization for host clipboard writes", () => {
  assert.throws(
    () => parseClipboardAcceptanceArgs([]),
    /authorization_reference_required/
  );
  assert.throws(
    () =>
      parseClipboardAcceptanceArgs([
        "--authorization-reference",
        "unrelated-use",
      ]),
    /authorization_reference_not_applicable/
  );
  assert.equal(
    parseClipboardAcceptanceArgs([
      "--authorization-reference",
      "operational-reliability:D4:2026-10-25",
    ]).authorizationReference,
    "operational-reliability:D4:2026-10-25"
  );
});

test("persists attempt history and bounds changed-hypothesis diagnostics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clipp-clipboard-history-"));
  const path = join(directory, "attempts.json");
  try {
    const first = recordDiagnosticAttempt(undefined, {
      kind: "initial",
      startedAt: "2026-10-25T12:00:00.000Z",
      hypothesis: "initial acceptance run",
    });
    await saveAttemptState(path, "clipboard-io", first, {
      status: "runner_failure",
    });
    const loaded = await loadAttemptState(path, "clipboard-io");
    assert.equal(loaded.attempts.length, 1);
    assert.throws(
      () =>
        recordDiagnosticAttempt(loaded, {
          kind: "diagnostic",
          startedAt: "2026-10-25T12:01:00.000Z",
          hypothesis: "initial acceptance run",
        }),
      /changed_hypothesis_required/
    );

    const second = recordDiagnosticAttempt(loaded, {
      kind: "diagnostic",
      startedAt: "2026-10-25T12:01:00.000Z",
      hypothesis: "service worker was not ready",
    });
    const third = recordDiagnosticAttempt(second, {
      kind: "diagnostic",
      startedAt: "2026-10-25T12:02:00.000Z",
      hypothesis: "candidate rebuild needed",
    });
    assert.equal(third.attempts.length, 3);
    assert.throws(
      () =>
        recordDiagnosticAttempt(third, {
          kind: "diagnostic",
          startedAt: "2026-10-25T12:03:00.000Z",
          hypothesis: "another changed hypothesis",
        }),
      /diagnostic_attempt_limit_reached/
    );
    assert.throws(
      () =>
        recordDiagnosticAttempt(loaded, {
          kind: "diagnostic",
          startedAt: "2026-10-25T12:21:00.000Z",
          hypothesis: "different hypothesis",
        }),
      /diagnostic_time_budget_exceeded/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
