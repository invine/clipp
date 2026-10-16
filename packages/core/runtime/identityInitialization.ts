import {
  deriveIdentityKeyMaterial,
  createIdentityManager,
  createIdentityRotationCoordinator,
  type IdentityManager,
  type KVStorageBackend,
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
  workFence?: IdentityBoundWorkFence;
}) {
  let recovering = false;
  let manualSuspended = false;
  let manualAccepted = false;
  let coldManualRecovery = false;
  let recoveryReason: IdentityRotationReason | undefined;
  let restartRequested = false;
  let recoveryFence: Promise<{ release(): Promise<void> }> | undefined;

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
        if (coldManualRecovery) {
          // No ordinary owners were started. A fresh bootstrap rebuilds them;
          // restart failure must not make this suspended process appear ready.
          try {
            requestRestart();
          } catch {
            /* Keep this runtime sealed. */
          }
          return;
        }
        void recoveryFence?.then((fence) => fence.release());
        recoveryFence = undefined;
        manualSuspended = false;
        setRecovering(false);
      }
      return;
    }
    if (state.phase !== "checking") manualAccepted = true;
    // A cached identity manager belongs to the former runtime. Only a fresh
    // lifecycle after restart may admit ordinary work again.
    if (options.workFence) recoveryFence ??= options.workFence.acquireFence();
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
  const suspendedInitialization = (): IdentityBoundRuntimeInitialization => {
    coldManualRecovery = true;
    return { networkingEnabled: false, localServicesEnabled: false };
  };
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

/** Admission and drain barrier for one cached runtime; durable transition ownership stays in rotation. */
export function createIdentityBoundWorkFence() {
  const session = globalThis.crypto.randomUUID();
  let revision = 0;
  let suspended = false;
  let activeFence: { release(): Promise<void> } | undefined;
  const admitted = new Set<Promise<unknown>>();
  const generation = () => `${session}:${revision}`;
  const assertOpen = (expectedGeneration?: string): void => {
    if (suspended) throw new Error("identity_runtime_suspended");
    if (expectedGeneration !== undefined && expectedGeneration !== generation())
      throw new Error("identity_runtime_retired");
  };
  const run = <T>(operation: () => T): T => {
    assertOpen();
    const result = operation();
    if (
      result &&
      typeof (result as unknown as PromiseLike<unknown>).then === "function"
    ) {
      const pending = Promise.resolve(result);
      admitted.add(pending);
      void pending.then(
        () => admitted.delete(pending),
        () => admitted.delete(pending)
      );
    }
    return result;
  };
  return {
    generation,
    assertOpen,
    isFenced: () => suspended,
    run,
    async acquireFence() {
      if (activeFence) return activeFence;
      suspended = true;
      revision += 1;
      const acquiredRevision = revision;
      activeFence = {
        async release() {
          if (revision !== acquiredRevision) return;
          suspended = false;
          revision += 1;
          activeFence = undefined;
        },
      };
      return activeFence;
    },
    async quiesce(): Promise<void> {
      while (admitted.size) await Promise.allSettled([...admitted]);
    },
    /** Pairing stop must read pending work to dismiss it; every write still uses admission. */
    protectStorageWrites(storage: KVStorageBackend): KVStorageBackend {
      return {
        get: <Value>(key: string) => storage.get<Value>(key),
        set: <Value>(key: string, value: Value) =>
          run(() => storage.set(key, value)),
        remove: (key: string) => run(() => storage.remove(key)),
      };
    },
    protect<T extends object>(owner: T): T {
      return new Proxy(owner, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) =>
            run(() => Reflect.apply(value, target, args));
        },
      });
    },
  };
}
export type IdentityBoundWorkFence = ReturnType<
  typeof createIdentityBoundWorkFence
>;
