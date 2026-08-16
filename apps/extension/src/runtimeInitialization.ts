import {
  createIdentityManager,
  type IdentityManager,
} from "../../../packages/core/trust";
import {
  initialDeviceNameForPlatform,
  RUNTIME_CAPABILITIES,
} from "../../../packages/core/runtime";

type IdentityManagerOptions = Parameters<typeof createIdentityManager>[0];

export function createExtensionIdentityManager(
  options: Omit<IdentityManagerOptions, "initialDeviceName">
): IdentityManager {
  return createIdentityManager({
    ...options,
    initialDeviceName: initialDeviceNameForPlatform(
      RUNTIME_CAPABILITIES.chromeExtension.platform
    ),
  });
}

export async function startExtensionRuntimeServices(options: {
  initializeIdentity(): void | Promise<void>;
  startCapture(): void | Promise<void>;
  startNetworking(): void | Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onNetworkingFailure?(error: unknown): void | Promise<void>;
}): Promise<void> {
  await options.initializeIdentity();
  await options.startCapture();
  try {
    await options.startNetworking();
  } catch (error) {
    await options.onNetworkingFailure?.(error);
  }
}
