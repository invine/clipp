import { openDatabase, SQLiteHistoryBackend } from "../../apps/electron/src/storage";
import { runHistoryBackendConformance } from "../core/history/backendConformance";

const sqliteBindingAvailable = (() => {
  try {
    const database = openDatabase(":memory:");
    database.close();
    return true;
  } catch (error) {
    if (String(error).includes("NODE_MODULE_VERSION")) return false;
    throw error;
  }
})();

const describeWithSQLite = sqliteBindingAvailable ? describe : describe.skip;

runHistoryBackendConformance(
  "SQLite",
  () => {
    const database = openDatabase(":memory:");
    return {
      backend: new SQLiteHistoryBackend(database),
      close: () => database.close(),
    };
  },
  describeWithSQLite,
);
