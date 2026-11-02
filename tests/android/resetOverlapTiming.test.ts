import {
  overlapBudgetObservation,
  overlapFailureReason,
} from "../../apps/android/src/resetOverlapTiming";

test("stage timing reports elapsed and bounded remaining budget without extending it", () => {
  expect(overlapBudgetObservation(100, 2100)).toEqual({
    overlapElapsedMs: 2000,
    overlapRemainingMs: 8000,
  });
  expect(overlapBudgetObservation(100, 10500)).toEqual({
    overlapElapsedMs: 10400,
    overlapRemainingMs: 0,
  });
  expect(() => overlapBudgetObservation(100, 99)).toThrow(
    "overlap_clock_invalid"
  );
  expect(() => overlapBudgetObservation(100, Number.NaN)).toThrow(
    "overlap_clock_invalid"
  );
});

test("overlap failures expose only a finite reason code", () => {
  expect(overlapFailureReason(new Error("overlap_deadline"))).toBe(
    "overlap-deadline"
  );
  expect(overlapFailureReason(new Error("overlap_start_unavailable"))).toBe(
    "start-unavailable"
  );
  expect(overlapFailureReason(new Error("overlap_fence_unavailable"))).toBe(
    "fence-unavailable"
  );
  expect(overlapFailureReason(new Error("PRIVATE_SENTINEL"))).toBe(
    "unclassified"
  );
  expect(overlapFailureReason("PRIVATE_SENTINEL")).toBe("unclassified");
});

test("known acceptance gate and background errors use finite reason codes", () => {
  expect(overlapFailureReason(new Error("overlap_not_held"))).toBe(
    "gate-not-held"
  );
  expect(overlapFailureReason(new Error("overlap_already_armed"))).toBe(
    "already-armed"
  );
  expect(
    overlapFailureReason(new Error("background_persistence_unknown"))
  ).toBe("background-persistence-unknown");
  expect(
    overlapFailureReason(new Error("background_continuity_unavailable"))
  ).toBe("background-unavailable");
});
