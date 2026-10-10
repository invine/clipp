/** Immediate submission is not completed Pairing or remote receipt. */
export type PairingSubmissionResult =
  { ok: true } | { ok: false; error: string };

export type PairingApprovalResult =
  | { ok: true; admitted: boolean }
  | {
      ok: false;
      error:
        | "stale_request"
        | "decision_failed"
        | "cleanup_failed"
        | "outcome_unconfirmed";
      admitted: boolean | null;
    };

export function pairingSubmissionMessage(
  result: PairingSubmissionResult
): string {
  if (result.ok) return "Request submitted. Waiting for approval.";
  if (result.error === "outcome_unconfirmed")
    return "Submission outcome unconfirmed. Check Requests before retrying.";
  if (result.error === "invalid" || result.error === "invalid_pairing_target")
    return "Invalid pairing payload. Edit the text and try again.";
  return "Unable to submit pairing request. Check the device address and connection, then retry.";
}

export function pairingApprovalMessage(
  result: PairingApprovalResult,
  accepted: boolean
): string {
  if (result.ok)
    return accepted
      ? "Device admitted locally. Response delivery is not confirmed."
      : "Request rejected locally.";
  if (result.error === "cleanup_failed" && !accepted)
    return "Request rejected locally, but cleanup failed. Refresh Requests before retrying.";
  if (result.admitted)
    return "Device admitted locally, but request cleanup failed. Refresh Requests before retrying.";
  if (result.error === "outcome_unconfirmed")
    return "Decision outcome unconfirmed. Refresh Requests and Devices before retrying.";
  if (result.error === "stale_request")
    return "Request expired, changed or is unavailable. Refresh Requests and review it again.";
  return "Unable to decide this request. Refresh Requests and try again.";
}
