import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";

type Options = Omit<
  Parameters<typeof createRuntimeClipboardService>[0],
  | "capabilities"
  | "pollIntervalMs"
  | "initiallyPollingEnabled"
  | "sharingLifetimeMs"
> & { appliedSharingLifetime(): number };
/** Android polling stays disabled until its actual native eligibility owner enables it. */
export function createAndroidClipboardService({
  appliedSharingLifetime,
  ...options
}: Options) {
  return createRuntimeClipboardService({
    ...options,
    sharingLifetimeMs: appliedSharingLifetime,
    capabilities: RUNTIME_CAPABILITIES.android,
    pollIntervalMs: 1500,
    initiallyPollingEnabled: false,
  });
}
