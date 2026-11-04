import { retireIdentityRuntime } from "../../../packages/core/runtime/identityRetirement";
import type { IdentityBoundWorkFence } from "../../../packages/core/runtime/identityInitialization";

/** Background-owned retirement port; offscreen shutdown stays host-specific. */
export function createChromeIdentityResetLifecycle(options: {
  workFence: IdentityBoundWorkFence;
  retireOffscreenOwnership(): void;
  stopRuntime(): Promise<void> | void;
  waitForOffscreenStartup(): Promise<void>;
  finalizeOffscreen(): Promise<void> | void;
  clearHostState(): Promise<void> | void;
}) {
  return {
    async acquireFence() {
      options.retireOffscreenOwnership();
      return options.workFence.acquireFence();
    },
    async quiesce() {
      await retireIdentityRuntime({
        stop: options.stopRuntime,
        drain: async () => {
          await options.workFence.quiesce();
          await options.waitForOffscreenStartup();
        },
        finalStop: async () => {
          await options.stopRuntime();
          await options.finalizeOffscreen();
          await options.clearHostState();
        },
      });
    },
  };
}
