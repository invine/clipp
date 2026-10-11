import type { RelayState } from "./managedRelays";
export type RelayActionResult = {
  status:
    | "authenticated"
    | "portal-opened"
    | "retry-requested"
    | "removed-local"
    | "rejected"
    | "unconfirmed";
  state?: RelayState;
  error?: string;
};
export async function performRelayAction(
  status: "authenticated" | "portal-opened" | "retry-requested",
  action: () => Promise<RelayState | void>,
  reconcile: () => Promise<void>
): Promise<RelayActionResult> {
  let result: RelayActionResult;
  try {
    const state = await action();
    result = { status, ...(state ? { state } : {}) };
  } catch (error) {
    result = {
      status: "rejected",
      error: error instanceof Error ? error.message : "relay_action_failed",
    };
  }
  try {
    await reconcile();
  } catch {
    return {
      ...result,
      status: "unconfirmed",
      error:
        "The current relay state could not be refreshed. Check its status before retrying.",
    };
  }
  return result;
}
