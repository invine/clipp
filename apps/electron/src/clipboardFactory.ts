import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard.js";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities.js";

type Options = Omit<
  Parameters<typeof createRuntimeClipboardService>[0],
  "capabilities" | "pollIntervalMs" | "sharingLifetimeMs"
> & { appliedSharingLifetime(): number };
/** Electron's production polling composition, with one capture-time installation preference. */
export function createElectronClipboardService({
  appliedSharingLifetime,
  ...options
}: Options) {
  return createRuntimeClipboardService({
    ...options,
    sharingLifetimeMs: appliedSharingLifetime,
    capabilities: RUNTIME_CAPABILITIES.electron,
    pollIntervalMs: 1200,
  });
}
