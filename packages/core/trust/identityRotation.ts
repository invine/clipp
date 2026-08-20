import {
  historySuppressionKey,
  isClipSuppression,
  isHistoryItem,
  type HistoryStorageBackend,
} from "../history/types";
import { TRUST_KEY, type KVStorageBackend } from "./storage";
import {
  generateIdentityKeyMaterial,
  type DeviceIdentity,
  type IdentityKeyMaterial,
  type IdentityRepository,
} from "./identity";

export type IdentityRotationReason = "revoked" | "identity-loss";

export type IdentityRotationNotice = {
  reason: IdentityRotationReason;
  historyDeleted: true;
  pairingRequired: true;
};

export type IdentityRotationBackup = {
  backupId: string;
  identity: DeviceIdentity | undefined;
  storageEntries: Array<{ key: string; value: unknown }>;
  historyCheckpoint?: unknown;
};

export type IdentityRotationState = {
  version: 1;
  reason: IdentityRotationReason;
  candidate: DeviceIdentity;
  phase: "prepared" | "committing";
  backup?: IdentityRotationBackup;
};

export type IdentityRotationResult =
  | { rotated: false; identity: DeviceIdentity | undefined; recovery?: undefined }
  | {
      rotated: false;
      identity: DeviceIdentity | undefined;
      recovery: { code: "identity_rotation_recovery"; reason: IdentityRotationReason };
    }
  | { rotated: true; reason: IdentityRotationReason; identity: DeviceIdentity };

export type IdentityRotationStatus =
  | { kind: "idle" }
  | { kind: "recovering"; reason: IdentityRotationReason }
  | { kind: "rotated"; reason: IdentityRotationReason };

export type IdentityRotationCommitter = {
  prepare(backupId: string): Promise<IdentityRotationBackup>;
  commit(candidate: DeviceIdentity, notice: IdentityRotationNotice, backup: IdentityRotationBackup): Promise<void>;
  rollback(backup: IdentityRotationBackup): Promise<void>;
  finalize(backup: IdentityRotationBackup): Promise<void>;
};

export const IDENTITY_ROTATION_SCOPED_STORAGE_KEYS = [
  TRUST_KEY,
  "signedPeerRecords",
  "pairingPendingRequests",
  "runtimeApplicationState",
] as const;
export const IDENTITY_ROTATION_NOTICE_KEY = "identityRotationNotice";

function historyEntryKey(value: unknown): string {
  if (isHistoryItem(value)) return value.clip.id;
  if (isClipSuppression(value)) return historySuppressionKey(value.clipId);
  throw new Error("invalid_identity_rotation_history_entry");
}

const ROTATION_HISTORY_BACKUP_PREFIX = "__clipp_identity_rotation_backup__:";

type RotationHistoryBackupEntry = {
  kind: "identity-rotation-history-backup";
  backupId: string;
  storageKey: string;
  originalKey: string;
  value: unknown;
};

function isRotationHistoryBackupEntry(value: unknown): value is RotationHistoryBackupEntry {
  return Boolean(value)
    && typeof value === "object"
    && (value as Partial<RotationHistoryBackupEntry>).kind === "identity-rotation-history-backup"
    && typeof (value as Partial<RotationHistoryBackupEntry>).backupId === "string"
    && typeof (value as Partial<RotationHistoryBackupEntry>).storageKey === "string"
    && typeof (value as Partial<RotationHistoryBackupEntry>).originalKey === "string";
}

function rotationHistoryBackupKey(backupId: string, index: number): string {
  return `${ROTATION_HISTORY_BACKUP_PREFIX}${backupId}:${index}`;
}

/**
 * Composes stores that do not share a native transaction into a recoverable
 * transaction. The durable coordinator marker owns the backup until candidate
 * activation, which is deliberately the final externally visible commit step.
 */
export function createIdentityRotationCommitter(options: {
  repository: IdentityRepository;
  storage: KVStorageBackend;
  history: Pick<
    HistoryStorageBackend,
    | "getAll"
    | "set"
    | "remove"
    | "identityRotation"
  >;
  storageKeys?: readonly string[];
}): IdentityRotationCommitter {
  const noticeKey = IDENTITY_ROTATION_NOTICE_KEY;
  const storageKeys = options.storageKeys ?? IDENTITY_ROTATION_SCOPED_STORAGE_KEYS;
  const backupKeys = [...new Set([...storageKeys, noticeKey])];
  const historyRotation = options.history.identityRotation;

  const restoreValue = async (key: string, value: unknown): Promise<void> => {
    if (value === undefined) await options.storage.remove(key);
    else await options.storage.set(key, value);
  };

  const storedBackupEntries = async (backupId: string): Promise<RotationHistoryBackupEntry[]> =>
    (await options.history.getAll())
      .filter((value): value is RotationHistoryBackupEntry =>
        isRotationHistoryBackupEntry(value) && value.backupId === backupId);

  const removeStoredBackup = async (backupId: string): Promise<void> => {
    const entries = await storedBackupEntries(backupId);
    await Promise.all(entries.map((entry) => options.history.remove(entry.storageKey)));
  };

  const rollback = async (backup: IdentityRotationBackup): Promise<void> => {
    if (backup.historyCheckpoint !== undefined && historyRotation) {
      await historyRotation.rollback(backup.historyCheckpoint);
    } else {
      const allValues = await options.history.getAll();
      const backupEntries = allValues.filter((value): value is RotationHistoryBackupEntry =>
        isRotationHistoryBackupEntry(value) && value.backupId === backup.backupId);
      const currentEntries = allValues.filter((value) => !isRotationHistoryBackupEntry(value));
      await Promise.all(currentEntries.map((value) => options.history.remove(historyEntryKey(value))));
      for (const entry of backupEntries) await options.history.set(entry.originalKey, entry.value);
    }
    for (const entry of backup.storageEntries) await restoreValue(entry.key, entry.value);
    if (backup.identity) await options.repository.upsert(backup.identity);
  };

  return {
    async prepare(backupId): Promise<IdentityRotationBackup> {
      if (!historyRotation) await removeStoredBackup(backupId);
      const [identity, historyValues, ...storageValues] = await Promise.all([
        options.repository.get(),
        historyRotation ? Promise.resolve([]) : options.history.getAll(),
        ...backupKeys.map((key) => options.storage.get(key)),
      ]);
      const historyEntries = historyValues
        .filter((value) => !isRotationHistoryBackupEntry(value))
        .map((value) => ({ originalKey: historyEntryKey(value), value }));
      const historyCheckpoint = historyRotation
        ? await historyRotation.prepare(backupId)
        : undefined;
      if (!historyRotation) {
        for (const [index, entry] of historyEntries.entries()) {
          const storageKey = rotationHistoryBackupKey(backupId, index);
          await options.history.set(storageKey, {
            kind: "identity-rotation-history-backup",
            backupId,
            storageKey,
            ...entry,
          } satisfies RotationHistoryBackupEntry);
        }
      }
      return {
        backupId,
        identity,
        storageEntries: backupKeys.map((key, index) => ({ key, value: storageValues[index] })),
        ...(historyCheckpoint === undefined ? {} : { historyCheckpoint }),
      };
    },
    async commit(candidate, notice, backup): Promise<void> {
      if (backup.historyCheckpoint !== undefined && historyRotation) {
        await historyRotation.commit(backup.historyCheckpoint);
      } else {
        const historyEntries = await storedBackupEntries(backup.backupId);
        await Promise.all(historyEntries.map((entry) => options.history.remove(entry.originalKey)));
      }
      await Promise.all(storageKeys.map((key) => options.storage.remove(key)));
      await options.repository.clearInitializationError?.();
      // Candidate activation is last: observing it proves cleanup completed.
      await options.repository.upsert(candidate);
      // The rotation notice is informational and must never block recovery.
      await options.storage.set(noticeKey, notice).catch(() => undefined);
    },
    rollback,
    finalize: async (backup) => {
      if (backup.historyCheckpoint !== undefined && historyRotation) {
        await historyRotation.finalize(backup.historyCheckpoint);
      } else {
        await removeStoredBackup(backup.backupId);
      }
    },
  };
}

export function createIdentityRotationCoordinator(options: {
  repository: IdentityRepository;
  storage: KVStorageBackend;
  committer: IdentityRotationCommitter;
  stateKey?: string;
  initialDeviceName: string;
  now?: () => number;
  generateKeyMaterial?: () => Promise<IdentityKeyMaterial>;
  shutdown: () => void | Promise<void>;
  retry?: false | { baseMs?: number; maxMs?: number };
}) {
  const stateKey = options.stateKey ?? "identityRotation";
  const now = options.now ?? Date.now;
  const generateKeyMaterial = options.generateKeyMaterial ?? generateIdentityKeyMaterial;
  let operation: Promise<IdentityRotationResult> | undefined;
  // A failed first marker write has no durable state to resume from, but the
  // current process must still retry the same candidate rather than churn Peer
  // IDs while storage recovers.
  let unstoredState: IdentityRotationState | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempt = 0;
  const statusListeners = new Set<(status: IdentityRotationStatus) => void>();

  const publishStatus = (status: IdentityRotationStatus): void => {
    statusListeners.forEach((listener) => listener(status));
  };

  const validState = (value: unknown): value is IdentityRotationState => {
    if (!value || typeof value !== "object") return false;
    const state = value as Partial<IdentityRotationState>;
    const candidate = state.candidate;
    return state.version === 1
      && (state.reason === "revoked" || state.reason === "identity-loss")
      && (state.phase === "prepared" || state.phase === "committing")
      && (state.phase !== "committing" || Boolean(state.backup))
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
    let state = storedState ?? unstoredState;
    if (storedState) unstoredState = undefined;
    let current = await options.repository.get();
    const selfRevoked = Boolean(current?.membershipView?.revokedPeerIds?.includes(current.deviceId));
    const rotationReason = state?.reason ?? reason ?? (selfRevoked ? "revoked" : undefined);
    if (!rotationReason) return { rotated: false, identity: current };
    await options.shutdown();
    if (state && current?.deviceId === state.candidate.deviceId) {
      if (state.backup) await options.committer.finalize(state.backup);
      await options.storage.remove(stateKey);
      return { rotated: true, reason: state.reason, identity: state.candidate };
    }
    if (state?.phase === "committing") {
      await options.committer.rollback(state.backup!);
      state = { ...state, phase: "prepared", backup: undefined };
      await options.storage.set(stateKey, state);
      current = await options.repository.get();
    }
    if (!state) {
      state = {
        version: 1,
        reason: rotationReason,
        phase: "prepared",
        candidate: await createCandidate(),
      };
      unstoredState = state;
      await options.storage.set(stateKey, state);
      unstoredState = undefined;
    }

    const backup = await options.committer.prepare(state.candidate.deviceId);
    state = { ...state, phase: "committing", backup };
    await options.storage.set(stateKey, state);
    try {
      await options.committer.commit(state.candidate, {
        reason: state.reason,
        historyDeleted: true,
        pairingRequired: true,
      }, backup);
    } catch (error) {
      try {
        await options.committer.rollback(backup);
        const prepared: IdentityRotationState = { ...state, phase: "prepared", backup: undefined };
        await options.storage.set(stateKey, prepared);
      } catch {
        // Keep the durable committing marker and backup so the next retry can
        // finish rollback before attempting cleanup again.
      }
      throw error;
    }
    await options.committer.finalize(backup);
    await options.storage.remove(stateKey);
    return { rotated: true, reason: state.reason, identity: state.candidate };
  };

  const scheduleRetry = (reason: IdentityRotationReason): void => {
    if (options.retry === false || retryTimer) return;
    const baseMs = options.retry?.baseMs ?? 1_000;
    const maxMs = options.retry?.maxMs ?? 60_000;
    const delay = Math.min(baseMs * 2 ** retryAttempt, maxMs);
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void serialize(reason);
    }, delay);
    (retryTimer as ReturnType<typeof setTimeout> & { unref?(): void }).unref?.();
  };

  const attempt = async (reason?: IdentityRotationReason): Promise<IdentityRotationResult> => {
    try {
      const result = await execute(reason);
      if (result.rotated) {
        retryAttempt = 0;
        publishStatus({ kind: "rotated", reason: result.reason });
      } else {
        publishStatus({ kind: "idle" });
      }
      return result;
    } catch (error) {
      const state = await options.storage.get<IdentityRotationState>(stateKey).catch(() => undefined);
      if (state !== undefined && !validState(state)) throw error;
      const identity = await options.repository.get().catch(() => undefined);
      const recoveryReason = state?.reason
        ?? reason
        ?? (identity?.membershipView?.revokedPeerIds?.includes(identity.deviceId) ? "revoked" : undefined);
      if (!recoveryReason) throw error;
      publishStatus({ kind: "recovering", reason: recoveryReason });
      scheduleRetry(recoveryReason);
      return {
        rotated: false,
        identity,
        recovery: { code: "identity_rotation_recovery", reason: recoveryReason },
      };
    }
  };

  const serialize = (reason?: IdentityRotationReason): Promise<IdentityRotationResult> => {
    if (!operation) operation = attempt(reason).finally(() => { operation = undefined; });
    return operation;
  };

  return {
    recoverOrRotate: () => serialize(),
    rotate: (reason: IdentityRotationReason) => serialize(reason),
    onStatusChanged(listener: (status: IdentityRotationStatus) => void): () => void {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    recoveryState: async () => {
      const state = await options.storage.get<IdentityRotationState>(stateKey);
      return state && validState(state)
        ? { code: "identity_rotation_recovery" as const, reason: state.reason }
        : undefined;
    },
    notice: () => options.storage.get<IdentityRotationNotice>(IDENTITY_ROTATION_NOTICE_KEY),
    stop(): void {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      statusListeners.clear();
    },
  };
}
