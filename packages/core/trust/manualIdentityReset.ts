import type { DeviceIdentity } from "./identity";
import type { KVStorageBackend } from "./storage";

export type IdentityResetReceipt = {
  receiptId: string;
  operationId: string;
  formerPeerId: string;
  generatedPeerId: string;
  completedAt: number;
};
export type IdentityResetCompletedOperation = {
  operationId: string;
  generatedPeerId: string;
};
export type IdentityResetError =
  | "storage_unavailable"
  | "invalid_reset_state"
  | "cleanup_failed"
  | "ports_unavailable";
export type IdentityResetState =
  | {
      phase: "idle";
      acceptance?: "not-accepted";
      receipt?: IdentityResetReceipt;
      completedOperation?: IdentityResetCompletedOperation;
    }
  | { phase: "checking"; operationId?: string; error: IdentityResetError }
  | {
      phase:
        "accepted" | "quiescing" | "cleaning" | "installing" | "finalizing";
      operationId: string;
      error?: IdentityResetError;
    }
  | {
      phase: "completed";
      operationId: string;
      receipt?: IdentityResetReceipt;
      completedOperation: IdentityResetCompletedOperation;
      restartRequired: true;
    };
export type IdentityResetResult =
  | {
      outcome: "rejected";
      code:
        | "unavailable"
        | "invalid_request"
        | "stale_identity"
        | "automatic_rotation_pending"
        | "reminder_pending"
        | "operation_mismatch"
        | "preparation_failed";
    }
  | {
      outcome: "accepted" | "completed" | "outcome-unconfirmed";
      state: IdentityResetState;
    };

/** These ports must acknowledge durable effects; fallback stores cannot enable reset. */
export type IdentityResetPorts = {
  storage: KVStorageBackend;
  acquireFence(): Promise<{ release(): Promise<void> }>;
  quiesce(): Promise<void>;
  clearIdentityBoundData(): Promise<void>;
  installIdentity(candidate: DeviceIdentity): Promise<void>;
  verifyCleanup(candidatePeerId: string): Promise<void>;
};

import {
  deriveIdentityKeyMaterial,
  type IdentityKeyMaterial,
  type IdentityRepository,
} from "./identity";

export const IDENTITY_RESET_JOURNAL_KEY = "manualIdentityReset";
export const IDENTITY_RESET_RECEIPT_KEY = "manualIdentityResetReceipt";
export const IDENTITY_RESET_COMPLETED_KEY = "manualIdentityResetCompleted";
type Journal = {
  version: 1;
  reason: "manual";
  operationId: string;
  formerPeerId: string;
  candidate: DeviceIdentity;
  phase: "accepted" | "quiescing" | "cleaning" | "installing" | "finalizing";
};

/** Internal execution engine. The rotation coordinator owns all serialization. */
export function createManualIdentityReset(options: {
  repository: IdentityRepository;
  storage: KVStorageBackend;
  ports?: IdentityResetPorts;
  deriveKeyMaterial?: (privateKey: string) => Promise<IdentityKeyMaterial>;
  createCandidate(): Promise<DeviceIdentity>;
  initialDeviceName: string;
  automaticSignal(): number;
  automaticPending(): Promise<boolean>;
  now(): number;
  publish(state: IdentityResetState): void;
}) {
  let sealed = false;
  let acceptedOperationId: string | undefined;
  let pendingOperationId: string | undefined;
  let fence: { release(): Promise<void> } | undefined;
  let state: IdentityResetState = { phase: "idle" };
  const publish = (next: IdentityResetState): IdentityResetState => {
    const previous = state;
    state = structuredClone(next);
    if (
      next.phase !== "idle" ||
      next.acceptance === "not-accepted" ||
      next.receipt ||
      next.completedOperation ||
      previous.phase !== "idle"
    )
      options.publish(structuredClone(next));
    return structuredClone(next);
  };
  const validId = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value;
  const object = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const exactFields = (value: object, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));
  const validGuard = (
    value: unknown
  ): value is IdentityResetCompletedOperation =>
    object(value) &&
    validId(value.operationId) &&
    validId(value.generatedPeerId) &&
    exactFields(value, ["operationId", "generatedPeerId"]);
  const validReceipt = (value: unknown): value is IdentityResetReceipt =>
    object(value) &&
    validId(value.receiptId) &&
    value.receiptId === value.operationId &&
    validId(value.formerPeerId) &&
    validId(value.generatedPeerId) &&
    value.formerPeerId !== value.generatedPeerId &&
    typeof value.completedAt === "number" &&
    Number.isFinite(value.completedAt) &&
    exactFields(value, [
      "receiptId",
      "operationId",
      "formerPeerId",
      "generatedPeerId",
      "completedAt",
    ]);
  const invalid = () => new Error("invalid_reset_state");
  const validCandidate = async (candidate: unknown): Promise<boolean> => {
    if (
      !object(candidate) ||
      !validId(candidate.deviceId) ||
      !validId(candidate.privateKey) ||
      !validId(candidate.publicKey) ||
      candidate.deviceName !== options.initialDeviceName ||
      candidate.nameRevision !== 0 ||
      !Array.isArray(candidate.multiaddrs) ||
      candidate.multiaddrs.length !== 0 ||
      typeof candidate.createdAt !== "number" ||
      !Number.isFinite(candidate.createdAt) ||
      !object(candidate.membershipView) ||
      !Array.isArray(candidate.membershipView.admittedPeerIds) ||
      candidate.membershipView.admittedPeerIds.length !== 1 ||
      candidate.membershipView.admittedPeerIds[0] !== candidate.deviceId ||
      !exactFields(candidate.membershipView, [
        "admittedPeerIds",
        "revokedPeerIds",
      ]) ||
      !Array.isArray(candidate.membershipView.revokedPeerIds) ||
      candidate.membershipView.revokedPeerIds.length !== 0 ||
      !exactFields(candidate, [
        "deviceId",
        "deviceName",
        "nameRevision",
        "publicKey",
        "privateKey",
        "multiaddrs",
        "createdAt",
        "membershipView",
      ])
    )
      return false;
    try {
      const derived = await (
        options.deriveKeyMaterial ?? deriveIdentityKeyMaterial
      )(candidate.privateKey);
      return (
        derived.peerId === candidate.deviceId &&
        derived.publicKey === candidate.publicKey &&
        derived.privateKey === candidate.privateKey
      );
    } catch {
      return false;
    }
  };
  const read = async () => {
    const [journal, receipt, completedOperation] = await Promise.all([
      options.storage.get<Journal>(IDENTITY_RESET_JOURNAL_KEY),
      options.storage.get<IdentityResetReceipt>(IDENTITY_RESET_RECEIPT_KEY),
      options.storage.get<IdentityResetCompletedOperation>(
        IDENTITY_RESET_COMPLETED_KEY
      ),
    ]);
    if (receipt !== undefined && !validReceipt(receipt)) throw invalid();
    if (completedOperation !== undefined && !validGuard(completedOperation))
      throw invalid();
    if (journal !== undefined) {
      if (
        !object(journal) ||
        journal.version !== 1 ||
        journal.reason !== "manual" ||
        !validId(journal.operationId) ||
        !validId(journal.formerPeerId) ||
        ![
          "accepted",
          "quiescing",
          "cleaning",
          "installing",
          "finalizing",
        ].includes(journal.phase) ||
        !exactFields(journal, [
          "version",
          "reason",
          "operationId",
          "formerPeerId",
          "candidate",
          "phase",
        ]) ||
        !(await validCandidate(journal.candidate)) ||
        journal.formerPeerId === journal.candidate.deviceId
      )
        throw invalid();
      if (
        receipt &&
        (receipt.operationId !== journal.operationId ||
          receipt.generatedPeerId !== journal.candidate.deviceId ||
          receipt.formerPeerId !== journal.formerPeerId ||
          journal.phase !== "finalizing")
      )
        throw invalid();
      if (
        completedOperation?.operationId === journal.operationId &&
        (completedOperation.generatedPeerId !== journal.candidate.deviceId ||
          journal.phase !== "finalizing")
      )
        throw invalid();
    } else if (
      receipt &&
      (!completedOperation ||
        receipt.operationId !== completedOperation.operationId ||
        receipt.generatedPeerId !== completedOperation.generatedPeerId)
    )
      throw invalid();
    return { journal, receipt, completedOperation };
  };
  const reconcile = async (): Promise<IdentityResetState> => {
    try {
      const records = await read();
      if (records.journal) {
        if (
          acceptedOperationId &&
          acceptedOperationId !== records.journal.operationId
        )
          throw invalid();
        acceptedOperationId = records.journal.operationId;
        sealed = true;
        pendingOperationId = undefined;
        return publish({
          phase: records.journal.phase,
          operationId: records.journal.operationId,
        });
      }
      const wasChecking =
        state.phase === "checking" || Boolean(pendingOperationId);
      if (
        pendingOperationId &&
        records.completedOperation?.operationId !== pendingOperationId
      ) {
        await fence?.release();
        fence = undefined;
        pendingOperationId = undefined;
        sealed = false;
      }
      if (sealed) {
        if (
          !records.completedOperation ||
          records.completedOperation.operationId !== acceptedOperationId
        )
          throw invalid();
        return publish({
          phase: "completed",
          operationId: records.completedOperation.operationId,
          ...(records.receipt ? { receipt: records.receipt } : {}),
          completedOperation: records.completedOperation,
          restartRequired: true,
        });
      }
      return publish({
        phase: "idle",
        ...(wasChecking ? { acceptance: "not-accepted" as const } : {}),
        ...(records.receipt ? { receipt: records.receipt } : {}),
        ...(records.completedOperation
          ? { completedOperation: records.completedOperation }
          : {}),
      });
    } catch (error) {
      return publish({
        phase: "checking",
        ...(pendingOperationId ? { operationId: pendingOperationId } : {}),
        error:
          error instanceof Error && error.message === "invalid_reset_state"
            ? "invalid_reset_state"
            : "storage_unavailable",
      });
    }
  };
  const resume = async (operationId: string): Promise<IdentityResetResult> => {
    const inspected = await reconcile();
    if (inspected.phase === "checking")
      return { outcome: "outcome-unconfirmed", state: inspected };
    try {
      const records = await read();
      let journal = records.journal;
      if (!journal && records.completedOperation?.operationId === operationId)
        return { outcome: "completed", state: inspected };
      if (!journal || journal.operationId !== operationId)
        return { outcome: "rejected", code: "operation_mismatch" };
      if (!options.ports)
        return {
          outcome: "accepted",
          state: publish({
            phase: journal.phase,
            operationId,
            error: "ports_unavailable",
          }),
        };
      sealed = true;
      const advance = async (phase: Journal["phase"]) => {
        journal = { ...journal!, phase };
        await options.storage.set(IDENTITY_RESET_JOURNAL_KEY, journal);
        publish({ phase, operationId });
      };
      fence ??= await options.ports.acquireFence();
      if (journal.phase === "accepted") await advance("quiescing");
      await options.ports.quiesce();
      if (journal.phase === "accepted" || journal.phase === "quiescing")
        await advance("cleaning");
      if (journal.phase === "cleaning") {
        await options.ports.clearIdentityBoundData();
        await advance("installing");
      }
      if (journal.phase === "installing") {
        await options.ports.installIdentity(journal.candidate);
        await advance("finalizing");
      }
      await options.ports.verifyCleanup(journal.candidate.deviceId);
      const installed = await options.repository.get();
      if (
        !(await validCandidate(installed)) ||
        installed?.privateKey !== journal.candidate.privateKey ||
        installed?.deviceId !== journal.candidate.deviceId
      )
        throw invalid();
      const receipt: IdentityResetReceipt = records.receipt ?? {
        receiptId: operationId,
        operationId,
        formerPeerId: journal.formerPeerId,
        generatedPeerId: journal.candidate.deviceId,
        completedAt: options.now(),
      };
      const completedOperation = {
        operationId,
        generatedPeerId: journal.candidate.deviceId,
      };
      await options.storage.set(IDENTITY_RESET_RECEIPT_KEY, receipt);
      await options.storage.set(
        IDENTITY_RESET_COMPLETED_KEY,
        completedOperation
      );
      const completion = await read();
      if (
        completion.receipt?.operationId !== operationId ||
        completion.completedOperation?.operationId !== operationId
      )
        throw invalid();
      await options.storage.remove(IDENTITY_RESET_JOURNAL_KEY);
      const finalized = await read();
      if (
        finalized.journal ||
        finalized.receipt?.operationId !== operationId ||
        finalized.completedOperation?.operationId !== operationId
      )
        throw invalid();
      return {
        outcome: "completed",
        state: publish({
          phase: "completed",
          operationId,
          receipt,
          completedOperation,
          restartRequired: true,
        }),
      };
    } catch {
      const recovered = await reconcile();
      if (recovered.phase === "checking")
        return { outcome: "outcome-unconfirmed", state: recovered };
      if (recovered.phase === "completed")
        return { outcome: "completed", state: recovered };
      if (recovered.phase === "idle")
        return {
          outcome: "outcome-unconfirmed",
          state: publish({
            phase: "checking",
            operationId,
            error: "invalid_reset_state",
          }),
        };
      return {
        outcome: "accepted",
        state: publish({ ...recovered, error: "cleanup_failed" }),
      };
    }
  };
  return {
    reconcile,
    resume,
    async begin(request: {
      operationId: string;
      reviewedPeerId: string;
    }): Promise<IdentityResetResult> {
      if (!validId(request.operationId) || !validId(request.reviewedPeerId))
        return { outcome: "rejected", code: "invalid_request" };
      const inspected = await reconcile();
      if (inspected.phase === "checking")
        return { outcome: "outcome-unconfirmed", state: inspected };
      if (inspected.phase === "completed" || inspected.phase === "idle") {
        if (inspected.completedOperation?.operationId === request.operationId)
          return { outcome: "completed", state: inspected };
        if (inspected.receipt)
          return { outcome: "rejected", code: "reminder_pending" };
        if (inspected.phase === "completed")
          return { outcome: "rejected", code: "unavailable" };
      } else return { outcome: "accepted", state: inspected };
      if (!options.ports) return { outcome: "rejected", code: "unavailable" };
      const signal = options.automaticSignal();
      try {
        const current = await options.repository.get();
        if (current?.deviceId !== request.reviewedPeerId)
          return { outcome: "rejected", code: "stale_identity" };
        const eligible = async (): Promise<boolean> => {
          if (
            signal !== options.automaticSignal() ||
            (await options.automaticPending())
          )
            return false;
          const identity = await options.repository.get();
          if (
            !identity ||
            identity.deviceId !== request.reviewedPeerId ||
            identity.membershipView?.revokedPeerIds.includes(
              identity.deviceId
            ) ||
            !identity.privateKey
          )
            return false;
          try {
            const key = await (
              options.deriveKeyMaterial ?? deriveIdentityKeyMaterial
            )(identity.privateKey);
            return (
              key.peerId === identity.deviceId &&
              key.publicKey === identity.publicKey
            );
          } catch {
            return false;
          }
        };
        if (!(await eligible()))
          return { outcome: "rejected", code: "automatic_rotation_pending" };
        const candidate = await options.createCandidate();
        if (
          !(await validCandidate(candidate)) ||
          candidate.deviceId === request.reviewedPeerId
        )
          return { outcome: "rejected", code: "preparation_failed" };
        if (!(await eligible()))
          return { outcome: "rejected", code: "automatic_rotation_pending" };
        fence = await options.ports.acquireFence();
        if (!(await eligible()) || signal !== options.automaticSignal()) {
          await fence.release();
          fence = undefined;
          return { outcome: "rejected", code: "automatic_rotation_pending" };
        }
        const journal: Journal = {
          version: 1,
          reason: "manual",
          operationId: request.operationId,
          formerPeerId: request.reviewedPeerId,
          candidate,
          phase: "accepted",
        };
        pendingOperationId = request.operationId;
        try {
          await options.storage.set(IDENTITY_RESET_JOURNAL_KEY, journal);
        } catch {
          const recovered = await reconcile();
          if (recovered.phase === "checking")
            return { outcome: "outcome-unconfirmed", state: recovered };
          if (recovered.phase === "idle")
            return { outcome: "rejected", code: "preparation_failed" };
          if (recovered.phase === "completed")
            return { outcome: "completed", state: recovered };
          return resume(request.operationId);
        }
        sealed = true;
        acceptedOperationId = request.operationId;
        pendingOperationId = undefined;
        publish({ phase: "accepted", operationId: request.operationId });
        return resume(request.operationId);
      } catch {
        if (sealed || pendingOperationId) {
          const recovered = await reconcile();
          return {
            outcome:
              recovered.phase === "completed"
                ? "completed"
                : recovered.phase === "checking"
                  ? "outcome-unconfirmed"
                  : "accepted",
            state: recovered,
          };
        }
        try {
          await fence?.release();
          fence = undefined;
        } catch {
          return {
            outcome: "outcome-unconfirmed",
            state: publish({
              phase: "checking",
              operationId: request.operationId,
              error: "ports_unavailable",
            }),
          };
        }
        return { outcome: "rejected", code: "preparation_failed" };
      }
    },
    async dismiss(receiptId: string): Promise<IdentityResetState> {
      try {
        const records = await read();
        if (!records.journal && records.receipt?.receiptId === receiptId)
          await options.storage.remove(IDENTITY_RESET_RECEIPT_KEY);
      } catch {
        /* Required deletion is reconciled before another begin. */
      }
      return reconcile();
    },
    get state() {
      return structuredClone(state);
    },
  };
}
