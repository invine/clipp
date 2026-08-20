import { TRUST_KEY, type KVStorageBackend } from "./storage";
import {
  generateIdentityKeyMaterial,
  type DeviceIdentity,
  type IdentityKeyMaterial,
  type IdentityRepository,
} from "./identity";

export type IdentityRotationReason = "revoked" | "identity-loss";

export type IdentityRotationState = {
  version: 1;
  reason: IdentityRotationReason;
  candidate: DeviceIdentity;
};

export type IdentityRotationResult =
  | { rotated: false; identity: DeviceIdentity | undefined }
  | { rotated: true; reason: IdentityRotationReason; identity: DeviceIdentity };

export const IDENTITY_ROTATION_SCOPED_STORAGE_KEYS = [
  TRUST_KEY,
  "signedPeerRecords",
  "pairingPendingRequests",
  "runtimeApplicationState",
] as const;

export function createIdentityScopedStateCleanup(options: {
  storage: KVStorageBackend;
  history: { clearAll(): Promise<void> };
  storageKeys?: readonly string[];
}): () => Promise<void> {
  const storageKeys = options.storageKeys ?? IDENTITY_ROTATION_SCOPED_STORAGE_KEYS;
  return async () => {
    await options.history.clearAll();
    await Promise.all(storageKeys.map((key) => options.storage.remove(key)));
  };
}

export function createIdentityRotationCoordinator(options: {
  repository: IdentityRepository;
  storage: KVStorageBackend;
  stateKey?: string;
  noticeKey?: string;
  initialDeviceName: string;
  now?: () => number;
  generateKeyMaterial?: () => Promise<IdentityKeyMaterial>;
  shutdown: () => void | Promise<void>;
  clearIdentityScopedState: () => Promise<void>;
}) {
  const stateKey = options.stateKey ?? "identityRotation";
  const noticeKey = options.noticeKey ?? "identityRotationNotice";
  const now = options.now ?? Date.now;
  const generateKeyMaterial = options.generateKeyMaterial ?? generateIdentityKeyMaterial;
  let operation: Promise<IdentityRotationResult> | undefined;

  const validState = (value: unknown): value is IdentityRotationState => {
    if (!value || typeof value !== "object") return false;
    const state = value as Partial<IdentityRotationState>;
    const candidate = state.candidate;
    return state.version === 1
      && (state.reason === "revoked" || state.reason === "identity-loss")
      && Boolean(candidate)
      && typeof candidate?.deviceId === "string"
      && typeof candidate?.privateKey === "string"
      && typeof candidate?.publicKey === "string";
  };

  const createCandidate = async (): Promise<DeviceIdentity> => {
    const key = await generateKeyMaterial();
    return {
      deviceId: key.peerId,
      deviceName: options.initialDeviceName,
      nameRevision: 0,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      multiaddrs: [],
      createdAt: now(),
      membershipView: {
        admittedPeerIds: [key.peerId],
        revokedPeerIds: [],
      },
    };
  };

  const execute = async (reason?: IdentityRotationReason): Promise<IdentityRotationResult> => {
    const storedState = await options.storage.get<IdentityRotationState>(stateKey);
    if (storedState !== undefined && !validState(storedState)) {
      throw new Error("invalid_identity_rotation_state");
    }
    let state = storedState;
    const current = await options.repository.get();
    if (!state) {
      const selfRevoked = Boolean(
        current?.membershipView?.revokedPeerIds?.includes(current.deviceId),
      );
      const rotationReason = reason ?? (selfRevoked ? "revoked" : undefined);
      if (!rotationReason) return { rotated: false, identity: current };
      await options.shutdown();
      state = {
        version: 1,
        reason: rotationReason,
        candidate: await createCandidate(),
      };
      await options.storage.set(stateKey, state);
    } else {
      await options.shutdown();
    }

    await options.clearIdentityScopedState();
    await options.repository.upsert(state.candidate);
    await options.repository.clearInitializationError?.();
    await options.storage.remove(stateKey);
    await options.storage.set(noticeKey, {
      reason: state.reason,
      historyDeleted: true,
      pairingRequired: true,
    }).catch(() => undefined);
    return { rotated: true, reason: state.reason, identity: state.candidate };
  };

  const serialize = (reason?: IdentityRotationReason): Promise<IdentityRotationResult> => {
    if (!operation) operation = execute(reason).finally(() => { operation = undefined; });
    return operation;
  };

  return {
    recoverOrRotate: () => serialize(),
    rotate: (reason: IdentityRotationReason) => serialize(reason),
  };
}
