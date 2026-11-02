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
