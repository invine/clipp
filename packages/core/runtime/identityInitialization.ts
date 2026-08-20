import {
  createIdentityManager,
  createIdentityRotationCoordinator,
  type IdentityManager,
  type IdentityRotationReason,
  type IdentityRotationResult,
  type IdentityRotationStatus,
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

export type IdentityBoundRuntimeInitialization = {
  networkingEnabled: boolean;
};

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

export type RuntimeIdentityRotationPort = {
  recoverOrRotate(): Promise<IdentityRotationResult>;
  rotate(reason: IdentityRotationReason): Promise<IdentityRotationResult>;
  onStatusChanged(listener: (status: IdentityRotationStatus) => void): () => void;
};

export function createRuntimeIdentityRotationLifecycle(options: {
  rotation: RuntimeIdentityRotationPort;
  loadIdentity(): Promise<unknown>;
  restart(): void;
  startLocalRecovery(): void;
  publishState(): void | Promise<void>;
  onRecoveryChanged?(recovering: boolean): void;
}) {
  let recovering = false;
  let restartRequested = false;

  const setRecovering = (next: boolean): void => {
    recovering = next;
    options.onRecoveryChanged?.(next);
  };
  const requestRestart = (): void => {
    if (restartRequested) return;
    restartRequested = true;
    options.restart();
  };
  const unsubscribe = options.rotation.onStatusChanged((status) => {
    if (status.kind === "rotated") {
      requestRestart();
      return;
    }
    setRecovering(status.kind === "recovering");
    if (recovering) options.startLocalRecovery();
    void Promise.resolve(options.publishState());
  });

  return {
    async initialize(): Promise<IdentityBoundRuntimeInitialization> {
      const result = await options.rotation.recoverOrRotate();
      if (result.rotated) {
        requestRestart();
        throw new Error("identity_rotated_restart_required");
      }
      setRecovering(Boolean(result.recovery));
      await options.loadIdentity();
      return { networkingEnabled: !recovering };
    },
    async rotateRevoked(): Promise<void> {
      const result = await options.rotation.rotate("revoked");
      if (result.rotated) requestRestart();
    },
    isRecovering: (): boolean => recovering,
    startLocalOnlyIfRecovering(): boolean {
      if (!recovering) return false;
      options.startLocalRecovery();
      return true;
    },
    dispose(): void {
      unsubscribe();
    },
  };
}

export async function startIdentityBoundRuntimeServices(options: {
  initializeIdentity(): void | IdentityBoundRuntimeInitialization | Promise<void | IdentityBoundRuntimeInitialization>;
  startLocalServices(): void | Promise<void>;
  startNetworkServices(): void | Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onNetworkingFailure?(error: unknown): void | Promise<void>;
}): Promise<void> {
  const initialization = await options.initializeIdentity();
  await options.startLocalServices();
  if (initialization?.networkingEnabled === false) return;
  try {
    await options.startNetworkServices();
  } catch (error) {
    await options.onNetworkingFailure?.(error);
  }
}

export async function stopIdentityBoundRuntimeServices(
  steps: ReadonlyArray<() => void | Promise<void>>,
): Promise<void> {
  const results = await Promise.allSettled(steps.map((step) => Promise.resolve().then(step)));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}
