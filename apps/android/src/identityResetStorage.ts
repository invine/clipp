import { createRuntimeIdentityRotationCoordinator } from "../../../packages/core/runtime/identityInitialization";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { createIdentityRotationCommitter } from "../../../packages/core/trust/identityRotation";
import {
  identityResetStorageKeys,
  type IdentityResetLifecycle,
} from "../../../packages/core/trust/identityResetStorage";
import {
  IDENTITY_KEY,
  createKVIdentityRepository,
  type KVStorageBackend,
} from "../../../packages/core/trust/storage";
import type { IdentityResetPorts } from "../../../packages/core/trust/manualIdentityReset";
import type { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import type { HistoryStorageBackend } from "../../../packages/core/history/types";
import type { LocalStorageBackend } from "./storage";

type OwnerOptions = Omit<
  Parameters<typeof createRuntimeIdentityRotationCoordinator>[0],
  "committer" | "manualReset" | "capabilities"
> & {
  history: HistoryStorageBackend;
  reset?: {
    storage: LocalStorageBackend;
    persistentHistory: IndexedDBHistoryBackend;
    lifecycle: IdentityResetLifecycle;
    verifyNativeCleanup?(): Promise<void>;
  };
};

/** The existing owner is the sole transition coordinator.
 * Package 29 must supply admission/drain/native-queue barriers and rebuild cached owners after completion.
 * The production client omits reset until those barriers exist; startup still inspects native metadata.
 */
export function createAndroidIdentityRotationOwner(options: OwnerOptions) {
  const { history, reset, ...owner } = options;
  if (reset && owner.storage !== reset.storage)
    throw new Error("identity_reset_storage_owner_mismatch");
  const strict = reset?.storage.identityResetStorage;
  // Admission must inspect the same durable identity and automatic marker as cleanup.
  const storage: KVStorageBackend = strict
    ? {
        get: <T>(key: string) =>
          key === (owner.stateKey ?? "identityRotation")
            ? strict.get<T>(key)
            : owner.storage.get<T>(key),
        set: (key, value) => owner.storage.set(key, value),
        remove: (key) => owner.storage.remove(key),
      }
    : owner.storage;
  const repository = strict
    ? {
        ...owner.repository,
        get: createKVIdentityRepository({ storage: strict, key: IDENTITY_KEY })
          .get,
      }
    : owner.repository;
  const keys = identityResetStorageKeys(IDENTITY_KEY);
  const assertAutomaticSettled = async () => {
    if ((await strict!.get("identityRotation")) !== undefined)
      throw new Error("automatic_rotation_pending");
  };
  const manualReset: IdentityResetPorts | undefined =
    reset && strict
      ? {
          storage: strict,
          acquireFence: () => reset.lifecycle.acquireFence(),
          quiesce: () => reset.lifecycle.quiesce(),
          clearIdentityBoundData: async () => {
            await assertAutomaticSettled();
            // History's active memory fallback does not prove that its persistent generations are empty.
            await reset.persistentHistory.clearIdentityResetData();
            if (history !== reset.persistentHistory) await history.clearAll();
            for (const key of keys) await strict.remove(key);
          },
          installIdentity: (candidate) => strict.set(IDENTITY_KEY, candidate),
          verifyCleanup: async (candidatePeerId) => {
            await assertAutomaticSettled();
            await reset.verifyNativeCleanup?.();
            await reset.persistentHistory.verifyIdentityResetDataCleared();
            if ((await history.getAll()).length !== 0)
              throw new Error("identity_reset_history_remaining");
            for (const key of keys) {
              if (key !== IDENTITY_KEY && (await strict.get(key)) !== undefined)
                throw new Error("identity_reset_scoped_data_remaining");
            }
            const candidate = await strict.get<{ deviceId: string }>(
              IDENTITY_KEY
            );
            if (candidate?.deviceId !== candidatePeerId)
              throw new Error("identity_reset_candidate_mismatch");
          },
        }
      : undefined;
  return createRuntimeIdentityRotationCoordinator({
    ...owner,
    storage,
    repository,
    capabilities: RUNTIME_CAPABILITIES.android,
    manualReset,
    committer: createIdentityRotationCommitter({
      repository,
      // Automatic notice persistence retains its existing best-effort semantics.
      storage: owner.storage,
      history,
    }),
  });
}
