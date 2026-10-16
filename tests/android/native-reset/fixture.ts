import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  LocalStorageBackend,
  IDENTITY_RESET_NATIVE_AUTHORITY_KEY,
  type AndroidDurablePreferences,
} from "../../../apps/android/src/storage";
import { createAndroidIdentityRotationOwner } from "../../../apps/android/src/identityResetStorage";
import { IndexedDBHistoryBackend } from "../../../packages/core/history/indexeddb";
import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import {
  deriveIdentityKeyMaterial,
  generateIdentityKeyMaterial,
  type DeviceIdentity,
} from "../../../packages/core/trust/identity";
import {
  createKVIdentityRepository,
  IDENTITY_KEY,
} from "../../../packages/core/trust/storage";
import { identityResetStorageKeys } from "../../../packages/core/trust/identityResetStorage";
import {
  IDENTITY_RESET_JOURNAL_KEY as JOURNAL,
  IDENTITY_RESET_RECEIPT_KEY as RECEIPT,
  IDENTITY_RESET_COMPLETED_KEY as GUARD,
} from "../../../packages/core/trust/manualIdentityReset";

// Bundled only into the explicitly opted-in acceptance APK. No application client is started.
const PREFIX = "clipp-android:";
const META = "native-webview-reset-fixture";
const WEB_SEED_CANARY = PREFIX + "native-webview-durable-seed";
const scoped = identityResetStorageKeys(IDENTITY_KEY);
const preserved = {
  theme: "dark",
  sharingLifetimeMs: 600000,
  localRetentionMs: 3600000,
  autoSyncEnabled: false,
  managedRelayConfigurations: [{ id: "synthetic-preserved-relay" }],
};
const boundaries = new Set([
  "accepted",
  "quiescence-checkpoint",
  "history-cleared",
  "partial-deletion",
  "candidate-installed",
  "receipt-written",
  "guard-written",
  "journal-sanitized",
  "history-unavailable",
]);
type FixtureMeta = {
  caseId: string;
  operationId: string;
  formerPeerId: string;
  candidatePeerId?: string;
  pausePid?: number;
  boundary?: string;
  historyCheckpoint: unknown;
  webSeedCanary: string;
  seedOrigin: string;
  seedPid: number;
};
type Command = {
  action: "seed" | "park" | "recover";
  caseId: string;
  boundary?: string;
  processId: number;
};
type SafeStatus = { state: string; [key: string]: string | number | boolean };
const fixture = { status: { state: "ready" } as SafeStatus, run };
Object.assign(globalThis, { __identityResetAcceptance: fixture });
const native = registerPlugin<AndroidDurablePreferences>(
  "IdentityResetStorage"
);
const history = new IndexedDBHistoryBackend();
const activeHistory = new InMemoryHistoryBackend();
const unavailablePreferences = {
  get: async (): Promise<never> => {
    throw new Error("synthetic_unavailable_preferences");
  },
  set: async (): Promise<never> => {
    throw new Error("synthetic_unavailable_preferences");
  },
  remove: async (): Promise<never> => {
    throw new Error("synthetic_unavailable_preferences");
  },
};
const memoryStorage = new LocalStorageBackend(PREFIX, unavailablePreferences, {
  native,
  isNative: () => false,
});
let target: string | undefined;
let commandPid = 0;
let fenceHeld = false;
let quiesced = false;
let running = false;
let publicRecoveryDiagnostic: SafeStatus = { state: "running" };

function requireProof(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`native_reset_${code}`);
}
async function raw<T>(key: string): Promise<T | undefined> {
  const { value } = await native.get({ key: PREFIX + key });
  return value === null ? undefined : (JSON.parse(value) as T);
}
async function saveMeta(meta: FixtureMeta): Promise<void> {
  await native.set({ key: PREFIX + META, value: JSON.stringify(meta) });
}
async function memoryOnly<T>(action: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  requireProof(
    Reflect.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: undefined,
    }),
    "memory_seam_unavailable"
  );
  try {
    return await action();
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}
async function candidateProof(meta: FixtureMeta) {
  const journal = await raw<{ candidate: DeviceIdentity; operationId: string }>(
    JOURNAL
  );
  const candidate =
    journal?.candidate ?? (await raw<DeviceIdentity>(IDENTITY_KEY));
  requireProof(candidate?.privateKey, "candidate_missing");
  const actual = await deriveIdentityKeyMaterial(candidate.privateKey);
  requireProof(
    actual.peerId === candidate.deviceId &&
      actual.publicKey === candidate.publicKey,
    "candidate_invalid"
  );
  requireProof(
    candidate.deviceName === "Mobile" &&
      candidate.nameRevision === 0 &&
      candidate.membershipView?.admittedPeerIds.length === 1 &&
      candidate.membershipView.admittedPeerIds[0] === candidate.deviceId &&
      candidate.membershipView.revokedPeerIds.length === 0,
    "candidate_not_singleton"
  );
  requireProof(
    !journal || journal.operationId === meta.operationId,
    "operation_changed"
  );
  requireProof(
    candidate.deviceId !== meta.formerPeerId,
    "former_identity_retained"
  );
  requireProof(
    !meta.candidatePeerId || candidate.deviceId === meta.candidatePeerId,
    "candidate_changed"
  );
  return candidate.deviceId;
}
async function preservedProof() {
  for (const [key, expected] of Object.entries(preserved))
    requireProof(
      JSON.stringify(await raw(key)) === JSON.stringify(expected),
      "preference_changed"
    );
}
async function pause(boundary: string): Promise<void> {
  if (target !== boundary) return;
  const meta = await raw<FixtureMeta>(META);
  requireProof(meta, "metadata_missing");
  const candidatePeerId = await candidateProof(meta);
  await preservedProof();
  if (
    [
      "candidate-installed",
      "receipt-written",
      "guard-written",
      "journal-sanitized",
    ].includes(boundary)
  ) {
    await history.verifyIdentityResetDataCleared();
    requireProof(
      (await activeHistory.getAll()).length === 0,
      "live_memory_history_remaining"
    );
    for (const key of scoped) {
      if (key !== IDENTITY_KEY)
        requireProof(
          (await raw(key)) === undefined,
          "live_native_scope_remaining"
        );
      requireProof(
        localStorage.getItem(PREFIX + key) === null,
        "live_web_scope_remaining"
      );
      requireProof(
        (await memoryOnly(() => memoryStorage.get(key))) === undefined,
        "live_memory_scope_remaining"
      );
    }
  }
  await saveMeta({ ...meta, candidatePeerId, pausePid: commandPid, boundary });
  fixture.status = {
    state: "paused",
    boundary,
    operationId: meta.operationId,
    candidatePeerId,
    validCandidate: true,
    sameCandidate: true,
    webSeedReopened: true,
    processId: commandPid,
  };
  // Never resolve: root kills the live WebView process at this acknowledged production effect.
  await new Promise<void>(() => {});
}
const interceptedNative: AndroidDurablePreferences = {
  get: (options) => native.get(options),
  set: async (options) => {
    await native.set(options);
    const key = options.key.slice(PREFIX.length);
    if (key === JOURNAL) {
      const phase = (JSON.parse(options.value) as { phase: string }).phase;
      if (phase === "accepted") await pause("accepted");
      if (phase === "cleaning") {
        requireProof(fenceHeld && quiesced, "cleanup_before_quiescence");
        await pause("quiescence-checkpoint");
      }
    }
    if (key === IDENTITY_KEY) await pause("candidate-installed");
    if (key === RECEIPT) await pause("receipt-written");
    if (key === GUARD) await pause("guard-written");
  },
  remove: async (options) => {
    await native.remove(options);
    if (options.key === PREFIX + "trustedDevices")
      await pause("partial-deletion");
    if (options.key === PREFIX + JOURNAL) await pause("journal-sanitized");
  },
};
const storage = new LocalStorageBackend(PREFIX, Preferences, {
  native: interceptedNative,
  isNative: () => Capacitor.getPlatform() === "android",
});
const repository = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
const actualClear = history.clearIdentityResetData.bind(history);
history.clearIdentityResetData = async () => {
  requireProof(fenceHeld && quiesced, "history_before_quiescence");
  await actualClear();
  await pause("history-cleared");
};
function owner(allowCandidateGeneration = false) {
  return createAndroidIdentityRotationOwner({
    storage,
    repository,
    history: activeHistory,
    shutdown: async () => {},
    retry: false,
    generateKeyMaterial: async () => {
      requireProof(allowCandidateGeneration, "replacement_regenerated");
      return generateIdentityKeyMaterial();
    },
    reset: {
      storage,
      persistentHistory: history,
      lifecycle: {
        acquireFence: async () => {
          fenceHeld = true;
          return {
            release: async () => {
              fenceHeld = false;
            },
          };
        },
        quiesce: async () => {
          requireProof(fenceHeld, "quiescence_without_fixture_fence");
          quiesced = true;
        },
      },
    },
  });
}
async function seed(caseId: string) {
  // Only this guarded synthetic acceptance installation is touched; never clear an operator profile.
  for (const key of [
    ...scoped,
    JOURNAL,
    RECEIPT,
    GUARD,
    "identityRotation",
    META,
    IDENTITY_RESET_NATIVE_AUTHORITY_KEY,
  ])
    await native.remove({ key: PREFIX + key });
  for (const key of [...scoped, JOURNAL, RECEIPT, GUARD, "identityRotation"])
    localStorage.removeItem(PREFIX + key);
  await actualClear();
  const former = await generateIdentityKeyMaterial();
  const identity: DeviceIdentity = {
    deviceId: former.peerId,
    publicKey: former.publicKey,
    privateKey: former.privateKey,
    deviceName: "Synthetic former device",
    multiaddrs: [],
    createdAt: 1,
    membershipView: { admittedPeerIds: [former.peerId], revokedPeerIds: [] },
  };
  // Legacy fixtures predate reset authority. Use the actual native primitive directly;
  // the real owner supplies the first strict reset effects, never synthetic setup.
  await native.set({
    key: PREFIX + IDENTITY_KEY,
    value: JSON.stringify(identity),
  });
  for (const key of scoped) {
    if (key !== IDENTITY_KEY)
      await native.set({
        key: PREFIX + key,
        value: JSON.stringify({ syntheticFormerScope: key }),
      });
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify(key === IDENTITY_KEY ? identity : { staleWebScope: key })
    );
    await memoryOnly(() =>
      memoryStorage.set(
        key,
        key === IDENTITY_KEY ? identity : { staleMemoryScope: key }
      )
    );
  }
  for (const [key, value] of Object.entries(preserved))
    await storage.identityResetStorage.set(key, value);
  // Written last to the same origin/area. Java waits for observed own-file bytes,
  // then the next process must still read every original value through WebView.
  const webSeedCanary = `native-reset-web-seed-${caseId}-${crypto.randomUUID()}`;
  localStorage.setItem(WEB_SEED_CANARY, webSeedCanary);
  await history.set("synthetic-legacy-clip", {
    syntheticHistory: "legacy",
    pinned: true,
  });
  const historyCheckpoint = await history.identityRotation.prepare(caseId);
  await history.identityRotation.commit(historyCheckpoint);
  await history.set("synthetic-generation-clip", {
    syntheticHistory: "generation",
    pinned: true,
  });
  await history.set("__clipp_suppression__:synthetic", {
    syntheticSuppression: true,
  });
  await activeHistory.set("synthetic-memory-clip", {
    syntheticHistory: "memory",
  });
  await saveMeta({
    caseId,
    operationId: `native-owner-${caseId}`,
    formerPeerId: former.peerId,
    historyCheckpoint,
    webSeedCanary,
    seedOrigin: location.origin,
    seedPid: commandPid,
  });
  const derived = await deriveIdentityKeyMaterial(identity.privateKey!);
  requireProof(derived.peerId === identity.deviceId, "former_identity_invalid");
  fixture.status = {
    state: "seeded",
    validFormerIdentity: true,
    webSeedCanary,
    processId: commandPid,
  };
}
async function park(caseId: string, boundary: string | undefined) {
  requireProof(boundary && boundaries.has(boundary), "boundary_invalid");
  target = boundary;
  const meta = await raw<FixtureMeta>(META);
  requireProof(meta?.caseId === caseId, "wrong_case");
  requireProof(meta.seedPid !== commandPid, "seed_process_not_restarted");
  requireProof(meta.seedOrigin === location.origin, "seed_origin_changed");
  requireProof(
    localStorage.getItem(WEB_SEED_CANARY) === meta.webSeedCanary,
    "seed_web_canary_missing"
  );
  const former = await raw<DeviceIdentity>(IDENTITY_KEY);
  requireProof(former?.deviceId === meta.formerPeerId, "seed_identity_changed");
  for (const key of scoped) {
    requireProof((await raw(key)) !== undefined, "seed_native_scope_missing");
    requireProof(
      localStorage.getItem(PREFIX + key) ===
        JSON.stringify(key === IDENTITY_KEY ? former : { staleWebScope: key }),
      "seed_web_scope_changed"
    );
  }
  requireProof((await history.getAll()).length === 2, "seed_history_missing");
  // Recreate active process memory fallbacks so their deletion is observed in this actual owner run.
  for (const key of scoped)
    await memoryOnly(() =>
      memoryStorage.set(
        key,
        key === IDENTITY_KEY ? former : { staleMemoryScope: key }
      )
    );
  await activeHistory.set("synthetic-memory-clip", {
    syntheticHistory: "memory",
  });
  if (boundary === "history-unavailable") await history.close();
  const transition = owner(true);
  const result = await transition.beginIdentityReset({
    operationId: meta.operationId,
    reviewedPeerId: meta.formerPeerId,
  });
  if (boundary === "history-unavailable") {
    requireProof(
      result.outcome === "accepted" &&
        "state" in result &&
        result.state.phase === "cleaning" &&
        "error" in result.state &&
        result.state.error === "cleanup_failed",
      "inaccessible_history_not_refused"
    );
    const independent = new IndexedDBHistoryBackend();
    requireProof(
      (await independent.getAll()).length === 2,
      "inaccessible_history_claimed_empty"
    );
    await independent.close();
    requireProof(
      (await raw(RECEIPT)) === undefined && (await raw(GUARD)) === undefined,
      "inaccessible_history_completed"
    );
    await pause("history-unavailable");
  }
  throw new Error("native_reset_boundary_not_reached");
}
async function recover(caseId: string) {
  const meta = await raw<FixtureMeta>(META);
  requireProof(
    meta?.caseId === caseId && meta.pausePid && meta.candidatePeerId,
    "recovery_metadata_missing"
  );
  requireProof(meta.pausePid !== commandPid, "process_not_restarted");
  await candidateProof(meta);
  requireProof(
    meta.seedOrigin === location.origin &&
      localStorage.getItem(WEB_SEED_CANARY) === meta.webSeedCanary,
    "durable_web_baseline_lost"
  );
  const transition = owner();
  const startup = await transition.recoverOrRotate();
  if (meta.boundary !== "journal-sanitized")
    requireProof(
      !startup.rotated &&
        startup.recovery?.code === "manual_identity_reset_recovery" &&
        !startup.identity,
      "startup_did_not_seal"
    );
  const result = await transition.resumeIdentityReset({
    operationId: meta.operationId,
  });
  if (result.outcome !== "completed") {
    // Public coordinator state and counts only. No candidate/journal contents or values.
    publicRecoveryDiagnostic = {
      state: "running",
      resultOutcome: result.outcome,
    };
    if ("state" in result) {
      publicRecoveryDiagnostic.resultPhase = result.state.phase;
      if ("error" in result.state && result.state.error)
        publicRecoveryDiagnostic.resultError = result.state.error;
    }
    try {
      let count = 0;
      for (const key of scoped)
        if (key !== IDENTITY_KEY && (await raw(key)) !== undefined) count++;
      publicRecoveryDiagnostic.nativeRemainingScopeCount = count;
    } catch {
      publicRecoveryDiagnostic.nativeScopeReadUnavailable = true;
    }
    try {
      publicRecoveryDiagnostic.webRemainingScopeCount = scoped.filter(
        (key) => localStorage.getItem(PREFIX + key) !== null
      ).length;
    } catch {
      publicRecoveryDiagnostic.webScopeReadUnavailable = true;
    }
    try {
      await history.verifyIdentityResetDataCleared();
      publicRecoveryDiagnostic.historyCheck = "cleared";
    } catch {
      publicRecoveryDiagnostic.historyCheck = "failed";
    }
  }
  requireProof(result.outcome === "completed", "recovery_incomplete");
  requireProof(
    (await candidateProof(meta)) === meta.candidatePeerId,
    "candidate_changed"
  );
  const receipt = await raw<{
    formerPeerId: string;
    generatedPeerId: string;
    operationId: string;
  }>(RECEIPT);
  const guard = await raw<{ generatedPeerId: string; operationId: string }>(
    GUARD
  );
  requireProof(
    receipt?.formerPeerId === meta.formerPeerId &&
      receipt.generatedPeerId === meta.candidatePeerId &&
      receipt.operationId === meta.operationId &&
      guard?.operationId === meta.operationId &&
      guard.generatedPeerId === meta.candidatePeerId,
    "completion_metadata_invalid"
  );
  requireProof((await raw(JOURNAL)) === undefined, "private_journal_remaining");
  for (const key of scoped) {
    if (key !== IDENTITY_KEY)
      requireProof((await raw(key)) === undefined, "native_scope_remaining");
    requireProof(
      localStorage.getItem(PREFIX + key) === null,
      "web_scope_remaining"
    );
    requireProof(
      (await memoryOnly(() => memoryStorage.get(key))) === undefined,
      "memory_scope_remaining"
    );
  }
  requireProof(
    (await activeHistory.getAll()).length === 0,
    "memory_history_remaining"
  );
  await history.verifyIdentityResetDataCleared();
  await history.identityRotation.rollback(meta.historyCheckpoint);
  requireProof(
    (await history.getAll()).length === 0,
    "history_generation_resurrected"
  );
  await history.verifyIdentityResetDataCleared();
  await preservedProof();
  requireProof(
    (
      await transition.beginIdentityReset({
        operationId: meta.operationId,
        reviewedPeerId: meta.formerPeerId,
      })
    ).outcome === "completed",
    "completion_replay_failed"
  );
  await transition.dismissIdentityResetReminder({
    receiptId: meta.operationId,
  });
  requireProof(
    (await raw(RECEIPT)) === undefined &&
      (await raw<{ operationId: string }>(GUARD))?.operationId ===
        meta.operationId,
    "dismissal_lost_replay_guard"
  );
  transition.stop();
  const fresh = owner();
  requireProof(
    (
      await fresh.beginIdentityReset({
        operationId: meta.operationId,
        reviewedPeerId: meta.formerPeerId,
      })
    ).outcome === "completed",
    "dismissed_replay_failed"
  );
  const stale = await fresh.beginIdentityReset({
    operationId: `stale-${caseId}`,
    reviewedPeerId: meta.formerPeerId,
  });
  requireProof(
    stale.outcome === "rejected" && stale.code === "stale_identity",
    "stale_review_admitted"
  );
  fresh.stop();
  fixture.status = {
    state: "completed",
    operationId: meta.operationId,
    candidatePeerId: meta.candidatePeerId,
    newProcess: true,
    sameCandidate: true,
    validCandidate: true,
    physicalHistoryEmpty: true,
    nativeScopesEmpty: true,
    webScopesEmpty: true,
    memoryScopesEmpty: true,
    preferencesPreserved: true,
    replayProtected: true,
  };
}
async function run(command: Command): Promise<void> {
  if (running) return;
  running = true;
  fixture.status = { state: "running" };
  try {
    requireProof(
      Capacitor.getPlatform() === "android",
      "native_platform_required"
    );
    requireProof(
      /^[a-z0-9-]{1,64}$/.test(command.caseId) &&
        Number.isInteger(command.processId),
      "command_invalid"
    );
    commandPid = command.processId;
    if (command.action === "seed") await seed(command.caseId);
    else if (command.action === "park")
      await park(command.caseId, command.boundary);
    else if (command.action === "recover") await recover(command.caseId);
    else throw new Error("native_reset_action_invalid");
  } catch (error) {
    const code =
      error instanceof Error && /^native_reset_[a-z_]+$/.test(error.message)
        ? error.message
        : "native_reset_unexpected_failure";
    fixture.status = { ...publicRecoveryDiagnostic, state: "failed", code };
  } finally {
    running = false;
  }
}
