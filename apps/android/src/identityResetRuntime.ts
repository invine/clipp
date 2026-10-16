import { Capacitor, registerPlugin } from "@capacitor/core";
import { createIdentityBoundWorkFence } from "../../../packages/core/runtime/identityInitialization";

export type AndroidIdentityResetNative = {
  acquireFence(): Promise<void>;
  releaseFence(): Promise<void>;
  clearNativeQueues(): Promise<void>;
  verifyNativeQueues(): Promise<void>;
  openRuntime(): Promise<void>;
  restartRuntime(): Promise<void>;
};

const nativeReset = registerPlugin<AndroidIdentityResetNative>(
  "IdentityResetStorage"
);

/** Combines the shared writer barrier with WebView-independent native admission. */
export function createAndroidIdentityResetRuntime(options: {
  native?: AndroidIdentityResetNative;
  suspend(): Promise<void>;
}) {
  const workFence = createIdentityBoundWorkFence();
  const native = options.native ?? nativeReset;
  return {
    workFence,
    lifecycle: {
      async acquireFence() {
        const fence = await workFence.acquireFence();
        // A failed acknowledgement can still have committed. Keep admission closed.
        await native.acquireFence();
        return {
          async release() {
            await native.releaseFence();
            await fence.release();
          },
        };
      },
      async quiesce() {
        await options.suspend();
        await workFence.quiesce();
        await native.clearNativeQueues();
      },
    },
    verifyNativeCleanup: () => native.verifyNativeQueues(),
    restartRuntime: () => native.restartRuntime(),
    async openRuntime() {
      workFence.assertOpen();
      if (Capacitor.getPlatform() === "android" || options.native)
        await native.openRuntime();
    },
  };
}
