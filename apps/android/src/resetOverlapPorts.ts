import { createResetOverlapGate } from "./resetOverlapGate";

/** Used only by the explicitly selected reset-overlap acceptance build. */
export function createResetOverlapPorts(deadlineMs: number) {
  const startGate = createResetOverlapGate(deadlineMs);
  const fenceGate = createResetOverlapGate(deadlineMs);
  let armed = false;
  let startUsed = false;
  let fenceUsed = false;
  return {
    arm() {
      if (armed) throw new Error("overlap_already_armed");
      armed = true;
    },
    startGate,
    fenceGate,
    wrapBackground<
      T extends { start(autoSync: boolean | null): Promise<void> },
    >(actual: T): T {
      return {
        ...actual,
        start: (autoSync: boolean | null) => {
          if (!armed) return actual.start(autoSync);
          if (startUsed)
            return startGate.state() === "released"
              ? actual.start(autoSync)
              : Promise.reject(new Error("overlap_start_already_used"));
          startUsed = true;
          return startGate.observe(actual.start(autoSync));
        },
      };
    },
    wrapReset<T extends { acquireFence(): Promise<void> }>(actual: T): T {
      return new Proxy(actual, {
        get(target, key, receiver) {
          if (key !== "acquireFence") return Reflect.get(target, key, receiver);
          return () => {
            if (!armed) return actual.acquireFence();
            if (fenceUsed)
              return fenceGate.state() === "released"
                ? actual.acquireFence()
                : Promise.reject(new Error("overlap_fence_already_used"));
            fenceUsed = true;
            return fenceGate.observe(actual.acquireFence());
          };
        },
      });
    },
  };
}
