import type { IdentityResetState } from "../../../packages/core/trust";
import type { IdentityBoundWorkFence } from "../../../packages/core/runtime/identityInitialization";

/** Cold worker admission must retire a surviving former offscreen context before readiness. */
export async function prepareChromeIdentityRuntime(options: {
  reconcileIdentityReset(): Promise<IdentityResetState>;
  workFence: IdentityBoundWorkFence;
  retireOffscreen(): Promise<void>;
}): Promise<IdentityResetState> {
  const state = await options.reconcileIdentityReset();
  if (state.phase !== "idle") {
    if (!options.workFence.isFenced()) await options.workFence.acquireFence();
    await options.retireOffscreen();
  }
  return state;
}
