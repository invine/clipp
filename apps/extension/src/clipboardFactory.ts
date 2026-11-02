import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";

type Options = Omit<
  Parameters<typeof createRuntimeClipboardService>[0],
  "capabilities" | "sharingLifetimeMs"
> & { appliedSharingLifetime(): number };
/** Chrome's production explicit-input composition; the caller retains popup authorization. */
export function createExtensionClipboardService({
  appliedSharingLifetime,
  ...options
}: Options) {
  return createRuntimeClipboardService({
    ...options,
    sharingLifetimeMs: appliedSharingLifetime,
    capabilities: RUNTIME_CAPABILITIES.chromeExtension,
  });
}
