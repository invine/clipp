import { writeSync } from "node:fs";
import {
  openDatabase,
  SQLiteKVStore,
  SQLiteHistoryBackend,
  createSQLiteIdentityRotationCoordinator,
} from "../../apps/electron/src/storage";
import { createKVIdentityRepository } from "../../packages/core/trust/storage";
import {
  seedResetStore,
  matchesResetCut,
  recoverResetStore,
} from "./identityResetQualification";

const [action, filename, target, phase] = process.argv.slice(2);
const db = openDatabase(filename);
let armed = false;
let candidatePeerId: string;
class ObservedStorage extends SQLiteKVStore {
  async set<T>(key: string, value: T) {
    await super.set(key, value);
    if (key === "manualIdentityReset")
      candidatePeerId = (value as any).candidate.deviceId;
    if (armed && matchesResetCut(key, value, target)) await pause();
  }
  async remove(key: string) {
    await super.remove(key);
    if (armed && matchesResetCut(key, undefined, target)) await pause();
  }
}
async function pause(): Promise<void> {
  process.stdout.write(
    JSON.stringify({ phase: target, candidatePeerId }) + "\n"
  );
  // The parent kills this process while the public durable effect's reply is withheld.
  await new Promise(() => setInterval(() => undefined, 1000));
}
const storage = new ObservedStorage(db);
const history = new SQLiteHistoryBackend(db);
const owner = createSQLiteIdentityRotationCoordinator({
  db,
  storage,
  repository: createKVIdentityRepository({ storage, key: "identity" }),
  identityKey: "identity",
  retry: false,
  shutdown: async () => undefined,
  // Synthetic storage-only isolation: there are no runtime writers, clipboard or network services.
  lifecycle: {
    acquireFence: async () => ({ release: async () => undefined }),
    quiesce: async () => undefined,
  },
  ...(action === "recover"
    ? {
        generateKeyMaterial: async (): Promise<never> => {
          throw new Error("recovery must reuse the accepted candidate");
        },
      }
    : {}),
});
async function run() {
  if (action === "begin") {
    const formerPeerId = await seedResetStore(storage, history);
    if (target.endsWith("-transaction")) {
      db.function("pause_reset", () => {
        writeSync(1, JSON.stringify({ phase: target, candidatePeerId }) + "\n");
        // SIGKILL while SQLite's native transaction is open; no close/rollback handler runs.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        return 0;
      });
      const event =
        target === "cleanup-transaction"
          ? "AFTER DELETE ON history WHEN OLD.id = 'old-local'"
          : "AFTER INSERT ON kv WHEN NEW.key = 'identity'";
      db.exec(
        `CREATE TRIGGER pause_reset ${event} BEGIN SELECT pause_reset(); END`
      );
    }
    armed = true;
    await owner.beginIdentityReset({
      operationId: "synthetic-reset",
      reviewedPeerId: formerPeerId,
    });
    throw new Error("reset did not reach the requested crash boundary");
  }
  db.exec("DROP TRIGGER IF EXISTS pause_reset");
  if (phase === "cleanup-transaction" && (await history.getAll()).length !== 3)
    throw new Error(
      "interrupted cleanup transaction did not roll back History atomically"
    );
  if (
    phase === "candidate-transaction" &&
    (await storage.get("identity")) !== undefined
  )
    throw new Error(
      "interrupted candidate transaction did not roll back identity atomically"
    );
  const result = await recoverResetStore(
    owner,
    storage,
    history,
    target,
    phase
  );
  db.close();
  process.stdout.write(JSON.stringify(result) + "\n");
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
