import {
  createIdentityManager,
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

export async function startIdentityBoundRuntimeServices(options: {
  initializeIdentity(): unknown | Promise<unknown>;
  startLocalServices(): void | Promise<void>;
  startNetworkServices(): void | Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onNetworkingFailure?(error: unknown): void | Promise<void>;
}): Promise<void> {
  await options.initializeIdentity();
  await options.startLocalServices();
  try {
    await options.startNetworkServices();
  } catch (error) {
    await options.onNetworkingFailure?.(error);
  }
}

export function createRuntimeStartupGate(): {
  ready: Promise<void>;
  open(): void;
} {
  let open: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    ready,
    open() {
      open?.();
      open = undefined;
    },
  };
}
