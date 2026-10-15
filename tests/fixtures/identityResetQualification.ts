import { generateIdentityKeyMaterial } from "../../packages/core/trust/identity";
import type { KVStorageBackend } from "../../packages/core/trust/storage";
import type { HistoryStorageBackend } from "../../packages/core/history/types";
import type { IdentityResetResult } from "../../packages/core/trust/manualIdentityReset";

export const resetPreferences = {
  autoSync: false,
  theme: "dark",
  localRetentionMs: 1000,
  sharingLifetimeMs: 2000,
  backgroundMode: true,
  managedRelayConfigurations: [{ id: "synthetic-relay" }],
  managedRelayCredentials: { token: "synthetic-preserved" },
};
const scopedKeys = [
  "trustedDevices",
  "signedPeerRecords",
  "pairingPendingRequests",
  "runtimeApplicationState",
  "identityRotationNotice",
  "identity:initializationError",
];
export function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function seedResetStore(
  storage: KVStorageBackend,
  history: HistoryStorageBackend
) {
  const material = await generateIdentityKeyMaterial();
  await storage.set("identity", {
    deviceId: material.peerId,
    privateKey: material.privateKey,
    publicKey: material.publicKey,
    deviceName: "Synthetic former device",
    nameRevision: 3,
    createdAt: 1,
    multiaddrs: [],
    membershipView: {
      admittedPeerIds: [material.peerId, "synthetic-remote"],
      revokedPeerIds: [],
    },
    remoteDeviceNames: {
      "synthetic-remote": { deviceName: "Former remote", nameRevision: "1" },
    },
    localDeviceAliases: { "synthetic-remote": "Former alias" },
  });
  for (const key of scopedKeys)
    await storage.set(key, { synthetic: "former-state" });
  for (const [key, value] of Object.entries(resetPreferences))
    await storage.set(key, value);
  await history.set("old-local", { content: "synthetic local", pinned: true });
  await history.set("old-remote", { content: "synthetic remote" });
  await history.set("__clipp_suppression__:old", { suppressed: true });
  return material.peerId;
}

export function matchesResetCut(key: string, value: unknown, phase: string) {
  const journal = value as { phase?: string } | undefined;
  return (
    (key === "manualIdentityReset" &&
      journal?.phase ===
        (
          {
            intent: "accepted",
            cleanup: "installing",
            candidate: "finalizing",
          } as Record<string, string>
        )[phase]) ||
    (phase === "receipt" && key === "manualIdentityResetReceipt") ||
    (phase === "guard" && key === "manualIdentityResetCompleted") ||
    (phase === "sanitization" &&
      key === "manualIdentityReset" &&
      value === undefined)
  );
}

type Owner = {
  beginIdentityReset(request: {
    operationId: string;
    reviewedPeerId: string;
  }): Promise<IdentityResetResult>;
  resumeIdentityReset(request: {
    operationId: string;
  }): Promise<IdentityResetResult>;
  dismissIdentityResetReminder(request: {
    receiptId: string;
  }): Promise<unknown>;
};
export async function recoverResetStore(
  owner: Owner,
  storage: KVStorageBackend,
  history: HistoryStorageBackend,
  candidatePeerId: string,
  phase: string
) {
  const journal = await storage.get<any>("manualIdentityReset");
  const receiptBefore = await storage.get("manualIdentityResetReceipt");
  const guardBefore = await storage.get("manualIdentityResetCompleted");
  check(
    Boolean(receiptBefore) ===
      ["receipt", "guard", "sanitization"].includes(phase),
    "receipt boundary changed after process death"
  );
  check(
    Boolean(guardBefore) === ["guard", "sanitization"].includes(phase),
    "guard boundary changed after process death"
  );
  check(
    phase === "sanitization"
      ? journal === undefined
      : journal?.candidate.deviceId === candidatePeerId,
    "accepted candidate or journal sanitization was lost"
  );
  const result = await owner.resumeIdentityReset({
    operationId: "synthetic-reset",
  });
  check(
    result.outcome === "completed",
    "accepted reset did not complete after reopening"
  );
  const identity = await storage.get<any>("identity");
  check(
    identity?.deviceId === candidatePeerId,
    "recovery changed the accepted candidate"
  );
  check(
    identity.nameRevision === 0 &&
      ["Desktop", "Extension"].includes(identity.deviceName),
    "former presentation survived"
  );
  check(
    JSON.stringify(identity.membershipView) ===
      JSON.stringify({
        admittedPeerIds: [candidatePeerId],
        revokedPeerIds: [],
      }),
    "former membership survived"
  );
  check(
    !identity.remoteDeviceNames && !identity.localDeviceAliases,
    "former presentation references survived"
  );
  check((await history.getAll()).length === 0, "former History survived");
  for (const key of scopedKeys)
    check(
      (await storage.get(key)) === undefined,
      "former scoped storage survived"
    );
  for (const [key, value] of Object.entries(resetPreferences))
    check(
      JSON.stringify(await storage.get(key)) === JSON.stringify(value),
      "installation preference changed"
    );
  check(
    (await storage.get("manualIdentityReset")) === undefined,
    "private journal survived completion"
  );
  const receipt = await storage.get<any>("manualIdentityResetReceipt");
  const guard = await storage.get<any>("manualIdentityResetCompleted");
  check(
    receipt?.generatedPeerId === candidatePeerId &&
      receipt?.operationId === "synthetic-reset",
    "mandatory receipt missing"
  );
  check(
    Object.keys(receipt).sort().join(",") ===
      "completedAt,formerPeerId,generatedPeerId,operationId,receiptId",
    "receipt leaked private data"
  );
  check(
    guard?.operationId === "synthetic-reset" &&
      guard?.generatedPeerId === candidatePeerId &&
      Object.keys(guard).sort().join(",") === "generatedPeerId,operationId",
    "mandatory replay guard missing"
  );
  const replay = await owner.beginIdentityReset({
    operationId: "synthetic-reset",
    reviewedPeerId: receipt.formerPeerId,
  });
  check(
    replay.outcome === "completed",
    "lost completion reply caused another reset"
  );
  await owner.dismissIdentityResetReminder({ receiptId: "synthetic-reset" });
  check(
    (await storage.get("manualIdentityResetReceipt")) === undefined,
    "receipt dismissal was not persisted"
  );
  const dismissedReplay = await owner.beginIdentityReset({
    operationId: "synthetic-reset",
    reviewedPeerId: receipt.formerPeerId,
  });
  check(
    dismissedReplay.outcome === "completed",
    "dismissal removed the independent replay guard"
  );
  return {
    outcome: result.outcome,
    candidatePeerId,
    replay: replay.outcome,
    dismissedReplay: dismissedReplay.outcome,
  };
}
