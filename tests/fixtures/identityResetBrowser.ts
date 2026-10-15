import { Buffer } from "buffer";
import {
  ChromeStorageBackend,
  createChromeIdentityRotationCoordinator,
} from "../../apps/extension/src/chromeStorage";
import { IndexedDBHistoryBackend } from "../../packages/core/history/indexeddb";
import { createKVIdentityRepository } from "../../packages/core/trust/storage";
import {
  check,
  matchesResetCut,
  recoverResetStore,
  seedResetStore,
} from "./identityResetQualification";

(globalThis as any).Buffer = Buffer;
const scope = globalThis as any;
let armed = false;
let cut = "";
let candidatePeerId: string;
let generations: unknown;
const strictAcknowledgements: string[] = [];
const nativeTransaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (
  ...args: Parameters<IDBDatabase["transaction"]>
) {
  const tx = nativeTransaction.apply(this, args);
  if (args[2]?.durability === "strict")
    strictAcknowledgements.push(tx.durability);
  return tx;
};
class ObservedStorage extends ChromeStorageBackend {
  async get<T>(key: string): Promise<T | undefined> {
    scope.stage = `get:${key}`;
    const result = await super.get<T>(key);
    scope.stage = `read:${key}`;
    return result;
  }
  async set<T>(key: string, value: T) {
    scope.stage = `set:${key}`;
    await super.set(key, value);
    scope.stage = `wrote:${key}`;
    if (key === "manualIdentityReset")
      candidatePeerId = (value as any).candidate.deviceId;
    if (armed && matchesResetCut(key, value, cut)) await pause();
  }
  async remove(key: string) {
    scope.stage = `remove:${key}`;
    await super.remove(key);
    scope.stage = `removed:${key}`;
    if (armed && matchesResetCut(key, undefined, cut)) await pause();
  }
}
async function pause(): Promise<void> {
  scope.checkpoint = {
    phase: cut,
    candidatePeerId,
    generations,
    strictAcknowledgements,
  };
  await new Promise(() => undefined);
}
scope.qualify = async (request: {
  action: "begin" | "recover";
  phase: string;
  candidatePeerId?: string;
  generations?: unknown;
}) => {
  const storage = new ObservedStorage();
  const history = new IndexedDBHistoryBackend();
  const owner = createChromeIdentityRotationCoordinator({
    storage,
    history,
    repository: createKVIdentityRepository({ storage, key: "identity" }),
    identityKey: "identity",
    retry: false,
    shutdown: async () => undefined,
    // Synthetic isolation: this extension has no product runtime, ingress, clipboard or peers.
    lifecycle: {
      acquireFence: async () => ({ release: async () => undefined }),
      quiesce: async () => undefined,
    },
    ...(request.action === "recover"
      ? {
          generateKeyMaterial: async (): Promise<never> => {
            throw new Error("recovery must reuse candidate");
          },
        }
      : {}),
  });
  if (request.action === "begin") {
    const formerPeerId = await seedResetStore(storage, history);
    generations = await history.identityRotation.prepare("synthetic-backup");
    await history.identityRotation.commit(generations);
    await history.set("later-generation", {
      content: "synthetic generation content",
    });
    cut = request.phase;
    armed = true;
    await owner.beginIdentityReset({
      operationId: "synthetic-reset",
      reviewedPeerId: formerPeerId,
    });
    throw new Error("requested storage boundary was not reached");
  }
  check(request.candidatePeerId, "candidate missing");
  if (request.phase === "partial-deletion")
    await history.verifyIdentityResetDataCleared();
  scope.stage = "recover";
  const result = await recoverResetStore(
    owner,
    storage,
    history,
    request.candidatePeerId,
    request.phase
  );
  scope.stage = "verify-physical-history";
  await history.verifyIdentityResetDataCleared();
  await history.identityRotation.rollback(request.generations);
  check(
    (await history.getAll()).length === 0,
    "recovery generation resurrected old History"
  );
  await history.clearIdentityResetData();
  scope.stage = "verify-physical-history";
  await history.verifyIdentityResetDataCleared();
  await history.close();
  return { ...result, strictAcknowledgements };
};
scope.chrome.runtime.onMessage.addListener(() => undefined);
scope.fixtureIdentity = {
  name: "Clipp storage qualification only",
  productRuntime: false,
  clipboard: false,
  networkPeers: false,
};
