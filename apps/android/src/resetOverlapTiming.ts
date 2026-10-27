/** Acceptance-only monotonic timing, reported without user content. */
export const OVERLAP_DEADLINE_MS = 10000;
export function overlapBudgetObservation(
  start: number,
  now: number,
  deadlineMs = OVERLAP_DEADLINE_MS
) {
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > OVERLAP_DEADLINE_MS
  )
    throw new Error("overlap_clock_invalid");
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(now) ||
    start < 0 ||
    now < start
  )
    throw new Error("overlap_clock_invalid");
  const overlapElapsedMs = Math.floor(now - start);
  if (!Number.isSafeInteger(overlapElapsedMs))
    throw new Error("overlap_clock_invalid");
  return {
    overlapElapsedMs,
    overlapRemainingMs: Math.max(0, deadlineMs - overlapElapsedMs),
  };
}

/** Never publish arbitrary exception text from the native acceptance interval. */
export function overlapFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "unclassified";
  switch (error.message) {
    case "overlap_deadline":
      return "overlap-deadline";
    case "overlap_start_unavailable":
      return "start-unavailable";
    case "overlap_fence_unavailable":
      return "fence-unavailable";
    case "overlap_start_completed_early":
      return "start-completed-early";
    case "overlap_reset_completed_early":
      return "reset-completed-early";
    default:
      return "unclassified";
  }
}
