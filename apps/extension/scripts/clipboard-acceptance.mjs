import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const AUTHORIZATION_REFERENCE = "operational-reliability:D4:2026-10-25";

export function parseClipboardAcceptanceArgs(args) {
  const options = {
    attempt: "initial",
    scenario: "clipboard-io",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--validate-only") options.validateOnly = true;
    else if (["--authorization-reference", "--attempt"].includes(argument)) {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${argument.slice(2).replaceAll("-", "_")}_required`);
      if (argument === "--authorization-reference")
        options.authorizationReference = value;
      if (argument === "--attempt") options.attempt = value;
    } else {
      throw new Error("unknown_argument");
    }
  }
  if (options.attempt !== "initial" && options.attempt !== "diagnostic")
    throw new Error("invalid_attempt_kind");
  if (!options.authorizationReference)
    throw new Error("authorization_reference_required");
  if (options.authorizationReference !== AUTHORIZATION_REFERENCE)
    throw new Error("authorization_reference_not_applicable");
  if (
    options.attempt === "diagnostic" &&
    !process.env.CLIPP_DIAGNOSTIC_HYPOTHESIS?.trim()
  ) {
    throw new Error("changed_hypothesis_required");
  }
  return options;
}

export function recordDiagnosticAttempt(
  previous,
  { kind, startedAt, hypothesis }
) {
  const attempts =
    previous?.outcome?.status === "passed" ? [] : (previous?.attempts ?? []);
  if (kind === "initial" && attempts.length > 0)
    throw new Error("scenario_already_started");
  if (kind === "diagnostic") {
    if (attempts.length === 0) throw new Error("initial_attempt_required");
    if (attempts.length >= 3)
      throw new Error("diagnostic_attempt_limit_reached");
    if (!hypothesis?.trim()) throw new Error("changed_hypothesis_required");
    if (attempts.some((attempt) => attempt.hypothesis === hypothesis.trim()))
      throw new Error("changed_hypothesis_required");
    const first = Date.parse(attempts[0].startedAt);
    const current = Date.parse(startedAt);
    if (
      !Number.isFinite(first) ||
      !Number.isFinite(current) ||
      current - first > 20 * 60_000 ||
      current < first
    ) {
      throw new Error("diagnostic_time_budget_exceeded");
    }
  }
  return {
    attempts: [
      ...attempts,
      { kind, startedAt, hypothesis: hypothesis?.trim() ?? "" },
    ],
  };
}

export async function loadAttemptState(path, scenario) {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    return state.scenarios?.[scenario];
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error("attempt_history_unreadable");
  }
}

export async function saveAttemptState(path, scenario, attemptState, outcome) {
  let state = { schemaVersion: 1, scenarios: {} };
  try {
    state = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("attempt_history_unreadable");
  }
  state.scenarios ??= {};
  const priorScenario = state.scenarios[scenario];
  const attempts = attemptState.attempts.map((attempt) => {
    const prior = priorScenario?.attempts?.find(
      (entry) => entry.startedAt === attempt.startedAt
    );
    return {
      ...attempt,
      ...(prior?.outcome ? { outcome: prior.outcome } : {}),
    };
  });
  const latest = attempts.at(-1);
  if (latest) latest.outcome = outcome;
  state.scenarios[scenario] = { attempts, outcome };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
