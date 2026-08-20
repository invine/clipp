import {
  createIdentityManager,
  createIdentityRotationCoordinator,
  type IdentityManager,
} from "../trust";
import { initialDeviceNameForPlatform } from "./capabilities";
import type { RuntimeCapabilities } from "./contract";

type IdentityManagerOptions = Parameters<typeof createIdentityManager>[0];

export function createRuntimeIdentityManager(
  options: Omit<IdentityManagerOptions, "initialDeviceName"> & {
    capabilities: Pick<RuntimeCapabilities, "platform">;
  }
): IdentityManager {
  const { capabilities, ...identityOptions } = options;
  return createIdentityManager({
    ...identityOptions,
    initialDeviceName: initialDeviceNameForPlatform(capabilities.platform),
  });
}

type IdentityRotationOptions = Parameters<typeof createIdentityRotationCoordinator>[0];

export function createRuntimeIdentityRotationCoordinator(
  options: Omit<IdentityRotationOptions, "initialDeviceName"> & {
    capabilities: Pick<RuntimeCapabilities, "platform">;
  }
) {
  const { capabilities, ...rotationOptions } = options;
  return createIdentityRotationCoordinator({
    ...rotationOptions,
    initialDeviceName: initialDeviceNameForPlatform(capabilities.platform),
  });
}

export async function startIdentityBoundRuntimeServices(options: {
  initializeIdentity(): unknown | Promise<unknown>;
  startLocalServices(): void | Promise<void>;
  startNetworkServices(): void | Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onNetworkingFailure?(error: unknown): void | Promise<void>;
}): Promise<void> {
  const initialization = await options.initializeIdentity();
  await options.startLocalServices();
  if (
    typeof initialization === "object"
    && initialization !== null
    && "networkingEnabled" in initialization
    && initialization.networkingEnabled === false
  ) return;
  try {
    await options.startNetworkServices();
  } catch (error) {
    await options.onNetworkingFailure?.(error);
  }
}
