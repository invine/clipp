import { homedir } from "node:os";
import { join as posixJoin, win32 } from "node:path";

export const AUTHORIZATION_REFERENCE = "operational-reliability:D4:2026-10-25";

export async function raceAcceptanceOperation(operation, timeoutMs, label) {
  let timer;
  const task = Promise.resolve().then(operation);
  task.catch(() => {});
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("acceptance_operation_timeout");
          error.operation = label;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function parseClipboardAcceptanceArgs(args) {
  const options = { attempt: "initial" };
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--validate-only") options.validateOnly = true;
    else if (
      [
        "--authorization-reference",
        "--attempt",
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
  options.diagnosticChange = values.get("--diagnostic-change");
  options.expectedObservation = values.get("--expected-observation");

  if (options.attempt !== "initial" && options.attempt !== "diagnostic")
    throw new Error("invalid_attempt_kind");
  if (!options.authorizationReference)
    throw new Error("authorization_reference_required");
  if (options.authorizationReference !== AUTHORIZATION_REFERENCE)
    throw new Error("authorization_reference_not_applicable");
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
      join(home, "AppData", "Local"),
      "Clipp",
      "Acceptance",
      "chrome"
    );
  return join(join(home, ".local", "state"), "clipp", "acceptance", "chrome");
}

export function classifyShareNowFeedback({
  clipboardReadFailed = false,
  shareNowFailed = false,
} = {}) {
  if (clipboardReadFailed) return "clipboard_read_failed";
  if (shareNowFailed) return "share_now_failed";
  return undefined;
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
