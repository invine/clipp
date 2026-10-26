import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, win32 } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  classifyShareNowFeedback,
  parseClipboardAcceptanceArgs,
  persistentAttemptDirectory,
  raceAcceptanceOperation,
  verifyPopupHistorySearch,
} from "./clipboard-acceptance.mjs";
import extensionPackage from "../package.json" with { type: "json" };

test("classifies only the two fixed Share Now feedback messages", () => {
  assert.equal(
    classifyShareNowFeedback({ clipboardReadFailed: true, shareNowFailed: true }),
    "clipboard_read_failed"
  );
  assert.equal(
    classifyShareNowFeedback({ shareNowFailed: true }),
    "share_now_failed"
  );
  assert.equal(classifyShareNowFeedback(), undefined);
});

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
        "--expected-observation",
        "It should focus the owned history search field",
      ]),
    /changed_hypothesis_required/
  );
  assert.throws(
    () =>
      parseClipboardAcceptanceArgs([
        "--authorization-reference",
        "operational-reliability:D4:2026-10-25",
        "--attempt",
        "diagnostic",
        "--diagnostic-change",
        "increase service worker wait",
      ]),
    /expected_observation_required/
  );
  assert.deepEqual(
    parseClipboardAcceptanceArgs([
      "--authorization-reference",
      "operational-reliability:D4:2026-10-25",
      "--attempt",
      "diagnostic",
      "--diagnostic-change",
      "increase service worker wait",
      "--expected-observation",
      "The owned service worker will be ready before opening the popup",
    ]).expectedObservation,
    "The owned service worker will be ready before opening the popup"
  );
});

test("the package command never supplies a permanent authorization", () => {
  assert.equal(
    extensionPackage.scripts["test:clipboard"].includes(
      "operational-reliability:D4"
    ),
    false
  );
  assert.equal(
    extensionPackage.scripts["test:clipboard"].includes(
      "--authorization-reference"
    ),
    false
  );
});

test("retry history location and scenario cannot be overridden", async () => {
  const authorization = [
    "--authorization-reference",
    "operational-reliability:D4:2026-10-25",
  ];
  assert.throws(
    () =>
      parseClipboardAcceptanceArgs([...authorization, "--scenario", "fresh"]),
    /unknown_argument/
  );
  assert.throws(
    () =>
      parseClipboardAcceptanceArgs([
        ...authorization,
        "--state-dir",
        "/tmp/fresh",
      ]),
    /unknown_argument/
  );
  const runner = await readFile(
    new URL("./verify-clipboard-io.mjs", import.meta.url),
    "utf8"
  );
  assert.equal(runner.includes("CLIPP_ACCEPTANCE_STATE_DIR"), false);
});

test("attempt history defaults to durable user state outside the checkout", () => {
  const home = "/Users/example";
  assert.equal(
    persistentAttemptDirectory({ platform: "darwin", home, env: {} }),
    "/Users/example/Library/Application Support/Clipp/Acceptance/chrome"
  );
  assert.equal(
    persistentAttemptDirectory({
      platform: "linux",
      home,
    }),
    "/Users/example/.local/state/clipp/acceptance/chrome"
  );
  assert.equal(
    persistentAttemptDirectory({
      platform: "win32",
      home: "C:\\Users\\example",
    }),
    win32.join(
      "C:\\Users\\example",
      "AppData",
      "Local",
      "Clipp",
      "Acceptance",
      "chrome"
    )
  );
});

test("readiness succeeds only after popup search has a visible result", async () => {
  const calls = [];
  let input = "";
  const popup = {
    getByPlaceholder(value) {
      assert.equal(value, "Search history: text, URL, device");
      return {
        async fill(text) {
          calls.push("fill");
          input = text;
        },
        async inputValue() {
          calls.push("inputValue");
          return input;
        },
      };
    },
    getByText(text, options) {
      assert.equal(options.exact, true);
      return {
        async waitFor({ state, timeout }) {
          calls.push("waitFor");
          assert.equal(state, "visible");
          assert.equal(timeout, 15_000);
          if (text !== input) throw new Error("element_not_visible");
        },
      };
    },
  };
  const interaction = await verifyPopupHistorySearch(
    popup,
    "readiness-observed-result",
    (operation) => operation(),
    (maximum) => maximum
  );
  assert.deepEqual(calls, ["fill", "waitFor", "inputValue"]);
  assert.equal(
    interaction.effectObserved,
    "matching fixture appeared in the visible history list"
  );
  await assert.rejects(
    verifyPopupHistorySearch(
      {
        ...popup,
        getByText: () => ({
          async waitFor() {
            throw new Error("not visible");
          },
        }),
      },
      "missing-result",
      (operation) => operation(),
      (maximum) => maximum
    ),
    /not visible/
  );
});

test("operation timeouts retain only a static operation label", async () => {
  await assert.rejects(
    raceAcceptanceOperation(
      () => new Promise(() => {}),
      1,
      "confirm_offscreen_clipboard_write"
    ),
    (error) => {
      assert.equal(error.message, "acceptance_operation_timeout");
      assert.equal(error.operation, "confirm_offscreen_clipboard_write");
      return true;
    }
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

test("persists attempts through the shared native retry policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clipp-clipboard-history-"));
  try {
    const { beginNativeAttempt } =
      await import("../../../scripts/native-acceptance-attempts.mjs");
    const first = await beginNativeAttempt({
      output: directory,
      scenario: "clipboard-io",
    });
    assert.equal(first.number, 1);
    await first.finish({ result: "runner_failure", stage: "runner_setup" });
    const attempts = JSON.parse(
      await readFile(join(directory, "attempts.json"), "utf8")
    );
    assert.equal(attempts.attempts.length, 1);
    await assert.rejects(
      beginNativeAttempt({ output: directory, scenario: "clipboard-io" }),
      /changed_diagnosis_required/
    );
    const second = await beginNativeAttempt({
      output: directory,
      scenario: "clipboard-io",
      change: "increase service worker wait",
      expectation:
        "The owned service worker will be ready before opening the popup",
    });
    assert.equal(second.number, 2);
    await second.finish({ result: "passed", stage: "complete" });
    await assert.rejects(
      beginNativeAttempt({ output: directory, scenario: "clipboard-io" }),
      /scenario_already_passed/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the default diagnostic clock observes Date.now changes after attempt creation", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "clipp-clipboard-live-clock-")
  );
  const originalNow = Date.now;
  let attempt;
  try {
    const { beginNativeAttempt } =
      await import("../../../scripts/native-acceptance-attempts.mjs");
    attempt = await beginNativeAttempt({
      output: directory,
      scenario: "clipboard-live-clock",
    });
    const startedAt = Date.parse(attempt.startedAt);
    Date.now = () => startedAt + 5_000;
    assert.equal(attempt.remainingMs(20 * 60_000), 20 * 60_000 - 5_000);
  } finally {
    Date.now = originalNow;
    if (attempt) await attempt.finish({ result: "passed", stage: "complete" });
    await rm(directory, { recursive: true, force: true });
  }
});

test("diagnostic budget starts with attempt one and is checked mid-run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clipp-clipboard-deadline-"));
  const originalNow = Date.now;
  try {
    const { beginNativeAttempt } =
      await import("../../../scripts/native-acceptance-attempts.mjs");
    const first = await beginNativeAttempt({
      output: directory,
      scenario: "clipboard-deadline",
    });
    await first.finish({ result: "runner_failure", stage: "runner_setup" });
    const history = JSON.parse(
      await readFile(join(directory, "attempts.json"), "utf8")
    );
    const origin = Date.parse(history.diagnosticStartedAt);
    assert.equal(origin, Date.parse(history.attempts[0].startedAt));

    const second = await beginNativeAttempt({
      output: directory,
      scenario: "clipboard-deadline",
      change: "wait for popup ready event",
      expectation:
        "The owned popup becomes interactive before the acceptance deadline",
    });
    Date.now = () => origin + 20 * 60_000 + 1;
    assert.throws(
      () => second.assertBudget(),
      /diagnostic_time_budget_exhausted/
    );
    assert.throws(
      () => second.remainingMs(5_000),
      /diagnostic_time_budget_exhausted/
    );
    Date.now = originalNow;
    await second.finish({
      result: "runner_failure",
      stage: "interaction_preflight",
    });
  } finally {
    Date.now = originalNow;
    await rm(directory, { recursive: true, force: true });
  }
});

test("the same 20-minute deadline bounds the initial run and later retries", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "clipp-clipboard-initial-deadline-")
  );
  const originalNow = Date.now;
  try {
    const { beginNativeAttempt } =
      await import("../../../scripts/native-acceptance-attempts.mjs");
    const first = await beginNativeAttempt({
      output: directory,
      scenario: "clipboard-initial-deadline",
    });
    const history = JSON.parse(
      await readFile(join(directory, "attempts.json"), "utf8")
    );
    const origin = Date.parse(first.startedAt);
    assert.equal(Date.parse(history.diagnosticStartedAt), origin);
    Date.now = () => origin + 20 * 60_000 + 1;
    assert.throws(
      () => first.assertBudget(),
      /diagnostic_time_budget_exhausted/
    );
    assert.throws(
      () => first.remainingMs(30_000),
      /diagnostic_time_budget_exhausted/
    );
    Date.now = originalNow;
    await first.finish({ result: "runner_failure", stage: "runner_setup" });

    Date.now = () => origin + 20 * 60_000 + 1;
    await assert.rejects(
      beginNativeAttempt({
        output: directory,
        scenario: "clipboard-initial-deadline",
        change: "another changed hypothesis",
        expectation: "The observed state changes before the budget expires",
      }),
      /diagnostic_time_budget_exhausted/
    );
  } finally {
    Date.now = originalNow;
    await rm(directory, { recursive: true, force: true });
  }
});
