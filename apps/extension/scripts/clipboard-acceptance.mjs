import { homedir } from "node:os";
import { join as posixJoin, win32 } from "node:path";

export const AUTHORIZATION_REFERENCE = "operational-reliability:D4:2026-10-25";

export function parseClipboardAcceptanceArgs(args) {
  const options = {
    attempt: "initial",
    scenario: "chrome-clipboard",
  };
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--validate-only") options.validateOnly = true;
    else if (
      [
        "--authorization-reference",
        "--attempt",
        "--scenario",
        "--diagnostic-change",
        "--expected-observation",
      ].includes(argument)
    ) {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${argument.slice(2).replaceAll("-", "_")}_required`);
      values.set(argument, value.trim());
    } else {
      throw new Error("unknown_argument");
    }
  }
  options.authorizationReference = values.get("--authorization-reference");
  options.attempt = values.get("--attempt") ?? "initial";
  options.scenario = values.get("--scenario") ?? options.scenario;
  options.diagnosticChange = values.get("--diagnostic-change");
  options.expectedObservation = values.get("--expected-observation");

  if (options.attempt !== "initial" && options.attempt !== "diagnostic")
    throw new Error("invalid_attempt_kind");
  if (!options.authorizationReference)
    throw new Error("authorization_reference_required");
  if (options.authorizationReference !== AUTHORIZATION_REFERENCE)
    throw new Error("authorization_reference_not_applicable");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(options.scenario))
    throw new Error("invalid_scenario");
  if (options.attempt === "diagnostic") {
    if (!options.diagnosticChange)
      throw new Error("changed_hypothesis_required");
    if (!options.expectedObservation)
      throw new Error("expected_observation_required");
  } else if (options.diagnosticChange || options.expectedObservation) {
    throw new Error("diagnostic_context_requires_diagnostic_attempt");
  }
  return options;
}

export function persistentAttemptDirectory({
  platform = process.platform,
  home = homedir(),
  env = process.env,
} = {}) {
  const join = platform === "win32" ? win32.join : posixJoin;
  if (platform === "darwin")
    return join(
      home,
      "Library",
      "Application Support",
      "Clipp",
      "Acceptance",
      "chrome"
    );
  if (platform === "win32")
    return join(
      env.LOCALAPPDATA ?? join(home, "AppData", "Local"),
      "Clipp",
      "Acceptance",
      "chrome"
    );
  return join(
    env.XDG_STATE_HOME ?? join(home, ".local", "state"),
    "clipp",
    "acceptance",
    "chrome"
  );
}

export async function verifyPopupHistorySearch(
  popup,
  text,
  withinBudget,
  remainingMs
) {
  const search = popup.getByPlaceholder("Search history: text, URL, device");
  await withinBudget(() => search.fill(text));
  await withinBudget(() =>
    popup.getByText(text, { exact: true }).waitFor({
      state: "visible",
      timeout: remainingMs(15_000),
    })
  );
  const inputValue = await withinBudget(() => search.inputValue());
  if (inputValue !== text) throw new Error("popup_search_value_mismatch");
  return {
    action:
      "filtered visible clip history through the extension popup search field",
    effectObserved: "matching fixture appeared in the visible history list",
  };
}
