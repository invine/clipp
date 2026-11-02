import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  createIdentityBoundWorkFence,
  type IdentityBoundWorkFence,
} from "../../../packages/core/runtime/identityInitialization";
import { createKVPendingTrustRequestStore } from "../../../packages/core/pairing/pending";
import type { KVStorageBackend } from "../../../packages/core/trust/storage";

/** Teardown must list pending notification IDs after admission closes; mutations remain fenced. */
export function createAndroidPendingTrustRequestStore(
  storage: KVStorageBackend,
  workFence: IdentityBoundWorkFence
) {
  return createKVPendingTrustRequestStore({
    key: "pairingPendingRequests",
    storage: workFence.protectStorageWrites(storage),
  });
}

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
        // An admitted start can complete after the first stop; reap its resulting owners.
        await options.suspend();
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
