import type { createResetOverlapPorts } from "./resetOverlapPorts";

/** Acceptance-only orchestration; ingress is performed by the independent native driver. */
export async function runResetOverlap<T>(options: {
  ports: ReturnType<typeof createResetOverlapPorts>;
  deadlineMs?: number;
  start(): Promise<unknown>;
  begin(): Promise<T>;
  ingress(): Promise<void>;
  stage(value: "start-held" | "provisional-fence-held"): void;
}): Promise<T> {
  const { ports } = options;
  const deadlineMs = options.deadlineMs ?? 10000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10000)
    throw new Error("invalid_overlap_deadline");
  ports.arm();
  const started = Promise.resolve().then(() => options.start());
  let timer: ReturnType<typeof setTimeout> | undefined;
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
  try {
    if (!(await Promise.race([ports.startGate.ready, startFailure, deadline])))
      throw new Error("overlap_start_unavailable");
    options.stage("start-held");
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
    if (
      !(await Promise.race([
        ports.fenceGate.ready,
        startFailure,
        beginFailure,
        deadline,
      ]))
    )
      throw new Error("overlap_fence_unavailable");
    options.stage("provisional-fence-held");
    await Promise.race([
      options.ingress(),
      startFailure,
      beginFailure,
      deadline,
    ]);
    ports.fenceGate.release();
    ports.startGate.release();
    await Promise.race([started, deadline]);
    return await Promise.race([begun, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    if (ports.fenceGate.state() === "held") ports.fenceGate.release();
    if (ports.startGate.state() === "held") ports.startGate.release();
    void started.catch(() => {});
    if (begun) void begun.catch(() => {});
  }
}
