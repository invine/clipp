import {
  OVERLAP_DEADLINE_MS,
  overlapBudgetObservation,
} from "./resetOverlapTiming";
import type { createResetOverlapPorts } from "./resetOverlapPorts";

type OverlapFailurePhase =
  | "await-start-gate"
  | "stage-start"
  | "begin"
  | "await-fence-gate"
  | "stage-fence"
  | "await-ingress"
  | "release-fence"
  | "release-start"
  | "await-start"
  | "await-reset";
type GateState = ReturnType<
  ReturnType<typeof createResetOverlapPorts>["startGate"]["state"]
>;
export type OverlapFailureWitness = {
  phase: OverlapFailurePhase;
  startGate: GateState;
  fenceGate: GateState;
  errorKind: "type-error" | "error" | "non-error";
};

/** Acceptance-only orchestration; ingress is performed by the independent native driver. */
export async function runResetOverlap<T>(options: {
  ports: ReturnType<typeof createResetOverlapPorts>;
  deadlineMs?: number;
  start(): Promise<unknown>;
  begin(): Promise<T>;
  ingress(): Promise<void>;
  failure?(witness: OverlapFailureWitness): void;
  stage(
    value: "start-held" | "provisional-fence-held",
    timing: ReturnType<typeof overlapBudgetObservation>
  ): void;
}): Promise<T> {
  const { ports } = options;
  const deadlineMs = options.deadlineMs ?? OVERLAP_DEADLINE_MS;
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > OVERLAP_DEADLINE_MS
  )
    throw new Error("invalid_overlap_deadline");
  ports.arm();
  const started = Promise.resolve().then(() => options.start());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const startedAt = performance.now();
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("overlap_deadline")), deadlineMs);
  });
  const startFailure = started.then(
    () => {
      throw new Error("overlap_start_completed_early");
    },
    (error: unknown) => {
      throw error;
    }
  );
  void startFailure.catch(() => {});
  let begun: Promise<T> | undefined;
  let phase: OverlapFailurePhase = "await-start-gate";
  try {
    if (!(await Promise.race([ports.startGate.ready, startFailure, deadline])))
      throw new Error("overlap_start_unavailable");
    phase = "stage-start";
    options.stage(
      "start-held",
      overlapBudgetObservation(startedAt, performance.now(), deadlineMs)
    );
    phase = "begin";
    begun = options.begin();
    const beginFailure = begun.then(
      () => {
        throw new Error("overlap_reset_completed_early");
      },
      (error: unknown) => {
        throw error;
      }
    );
    void beginFailure.catch(() => {});
    phase = "await-fence-gate";
    if (
      !(await Promise.race([
        ports.fenceGate.ready,
        startFailure,
        beginFailure,
        deadline,
      ]))
    )
      throw new Error("overlap_fence_unavailable");
    phase = "stage-fence";
    options.stage(
      "provisional-fence-held",
      overlapBudgetObservation(startedAt, performance.now(), deadlineMs)
    );
    phase = "await-ingress";
    await Promise.race([
      options.ingress(),
      startFailure,
      beginFailure,
      deadline,
    ]);
    phase = "release-fence";
    ports.fenceGate.release();
    phase = "release-start";
    ports.startGate.release();
    phase = "await-start";
    await Promise.race([started, deadline]);
    phase = "await-reset";
    return await Promise.race([begun, deadline]);
  } catch (error) {
    try {
      options.failure?.({
        phase,
        startGate: ports.startGate.state(),
        fenceGate: ports.fenceGate.state(),
        errorKind:
          error instanceof TypeError
            ? "type-error"
            : error instanceof Error
              ? "error"
              : "non-error",
      });
    } catch {
      /* Diagnostic must never replace the original failure. */
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (ports.fenceGate.state() === "held") ports.fenceGate.release();
    if (ports.startGate.state() === "held") ports.startGate.release();
    void started.catch(() => {});
    if (begun) void begun.catch(() => {});
  }
}
