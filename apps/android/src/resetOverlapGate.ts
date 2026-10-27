/** Acceptance-only control for delaying a real native acknowledgement. */
export function createResetOverlapGate(deadlineMs: number) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10000)
    throw new Error("invalid_overlap_deadline");
  let state: "waiting-native" | "held" | "released" | "failed" = "waiting-native";
  let markReady!: (ready: boolean) => void;
  const ready = new Promise<boolean>((resolve) => { markReady = resolve; });
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  return {
    ready,
    state: () => state,
    release: () => {
      if (state !== "held") throw new Error("overlap_not_held");
      state = "released";
      release();
    },
    async observe(native: Promise<void>) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            await native;
            if (state !== "waiting-native") return;
            state = "held";
            markReady(true);
            await released;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("overlap_deadline")), deadlineMs);
          }),
        ]);
      } catch (error) {
        state = "failed";
        markReady(false);
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
