import {
  deriveIdentityKeyMaterial,
  createIdentityManager,
  createIdentityRotationCoordinator,
  type IdentityManager,
  type IdentityResetState,
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

type IdentityRotationOptions = Parameters<
  typeof createIdentityRotationCoordinator
>[0];

export type IdentityBoundRuntimeInitialization = {
  networkingEnabled: boolean;
  localServicesEnabled?: boolean;
};

export function createRuntimeIdentityRotationCoordinator(
  options: Omit<IdentityRotationOptions, "initialDeviceName"> & {
    capabilities: Pick<RuntimeCapabilities, "platform">;
  }
) {
  const { capabilities, ...rotationOptions } = options;
  return createIdentityRotationCoordinator({
    ...rotationOptions,
    deriveKeyMaterial:
      rotationOptions.deriveKeyMaterial ?? deriveIdentityKeyMaterial,
    initialDeviceName: initialDeviceNameForPlatform(capabilities.platform),
  });
}

export type RuntimeIdentityRotationPort = {
  recoverOrRotate(): Promise<IdentityRotationResult>;
  rotate(reason: IdentityRotationReason): Promise<IdentityRotationResult>;
  onStatusChanged(
    listener: (status: IdentityRotationStatus) => void
  ): () => void;
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
  let manualSuspended = false;
  let manualAccepted = false;
  let recoveryReason: IdentityRotationReason | undefined;
  let restartRequested = false;

  const setRecovering = (next: boolean): void => {
    recovering = manualSuspended || next;
    options.onRecoveryChanged?.(recovering);
  };
  const requestRestart = (): void => {
    if (restartRequested) return;
    restartRequested = true;
    options.restart();
  };
  const startLocalRecovery = (): void => {
    if (!manualSuspended && recoveryReason === "revoked")
      options.startLocalRecovery();
  };
  const applyManualState = (state: IdentityResetState): void => {
    if (state.phase === "idle") {
      if (state.acceptance === "not-accepted" && !manualAccepted) {
        manualSuspended = false;
        setRecovering(false);
      }
      return;
    }
    if (state.phase !== "checking") manualAccepted = true;
    // A cached identity manager belongs to the former runtime. Only a fresh
    // lifecycle after restart may admit ordinary work again.
    manualSuspended = true;
    recoveryReason = undefined;
    setRecovering(true);
    if (state.phase === "completed") {
      // Completion remains true even when the host cannot restart immediately.
      try {
        requestRestart();
      } catch {
        /* Keep the former runtime sealed. */
      }
    }
  };
  const suspendedInitialization = (): IdentityBoundRuntimeInitialization => ({
    networkingEnabled: false,
    localServicesEnabled: false,
  });
  const unsubscribe = options.rotation.onStatusChanged((status) => {
    if (status.kind === "manual-reset") {
      if (
        status.state.phase === "idle" &&
        status.state.acceptance !== "not-accepted"
      )
        return;
      applyManualState(status.state);
      void Promise.resolve()
        .then(() => options.publishState())
        .catch(() => undefined);
      return;
    }
    if (status.kind === "rotated") {
      requestRestart();
      return;
    }
    recoveryReason = status.kind === "recovering" ? status.reason : undefined;
    setRecovering(status.kind === "recovering");
    if (recovering) startLocalRecovery();
    void Promise.resolve(options.publishState()).catch(() => undefined);
  });

  return {
    async initialize(): Promise<IdentityBoundRuntimeInitialization> {
      const result = await options.rotation.recoverOrRotate();
      if (
        !result.rotated &&
        result.recovery?.code === "manual_identity_reset_recovery"
      ) {
        applyManualState(result.recovery.state);
        if (result.recovery.state.phase === "completed") {
          throw new Error("manual_identity_reset_restart_required");
        }
        return suspendedInitialization();
      }
      if (manualSuspended) return suspendedInitialization();
      if (result.rotated) {
        requestRestart();
        throw new Error("identity_rotated_restart_required");
      }
      setRecovering(Boolean(result.recovery));
      recoveryReason = result.recovery?.reason;
      if (recovering) return { networkingEnabled: false };
      await options.loadIdentity();
      return manualSuspended
        ? suspendedInitialization()
        : { networkingEnabled: !recovering };
    },
    async rotateRevoked(): Promise<void> {
      const result = await options.rotation.rotate("revoked");
      if (result.rotated) requestRestart();
    },
    isRecovering: (): boolean => recovering,
    startLocalOnlyIfRecovering(): boolean {
      if (!recovering) return false;
      startLocalRecovery();
      return true;
    },
    dispose(): void {
      unsubscribe();
    },
  };
}

export async function startIdentityBoundRuntimeServices(options: {
  initializeIdentity():
    | void
    | IdentityBoundRuntimeInitialization
    | Promise<void | IdentityBoundRuntimeInitialization>;
  startLocalServices(): void | Promise<void>;
  startNetworkServices(): void | Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onNetworkingFailure?(error: unknown): void | Promise<void>;
}): Promise<void> {
  const initialization = await options.initializeIdentity();
  if (initialization?.localServicesEnabled === false) return;
  await options.startLocalServices();
  if (initialization?.networkingEnabled === false) return;
  try {
    await options.startNetworkServices();
  } catch (error) {
    await options.onNetworkingFailure?.(error);
  }
}

export async function stopIdentityBoundRuntimeServices(
  steps: ReadonlyArray<() => void | Promise<void>>
): Promise<void> {
  const results = await Promise.allSettled(
    steps.map((step) => Promise.resolve().then(step))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure) throw failure.reason;
}
