import type { ClipHistoryStore, HistorySnapshot } from "./store";

/** Keeps the last authoritative History projection available through a failed read. */
export function createHistoryStateReader(
  history: Pick<ClipHistoryStore, "snapshot">
): {
  read(): Promise<{
    clips: HistorySnapshot["clips"];
    pinnedIds: HistorySnapshot["pinnedIds"];
    historyUnavailable: boolean;
    historyRefreshError: boolean;
  }>;
} {
  let lastSnapshot: HistorySnapshot | null = null;

  return {
    async read() {
      let historyRefreshError = false;
      try {
        lastSnapshot = await history.snapshot();
      } catch {
        historyRefreshError = true;
      }
      return {
        clips: lastSnapshot?.clips ?? [],
        pinnedIds: lastSnapshot?.pinnedIds ?? [],
        historyUnavailable: lastSnapshot === null,
        historyRefreshError,
      };
    },
  };
}
