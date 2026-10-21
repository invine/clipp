import type { RuntimeApprovalSelection } from "../../core/runtime/contract";
import type { UiSession } from "./uiSession";

export type NotificationRequestsBridge = {
  getApprovalEntries(): Promise<RuntimeApprovalSelection[]>;
  acknowledgeApprovalEntry(id: string): Promise<void>;
  onApprovalEntriesChanged(listener: () => void): () => void;
};
/** Reuse the session's destination owner after current runtime authority is ready.
 * Undelivered intent stays with the host, including across renderer replacement. */
export function bindNotificationRequests(
  bridge: NotificationRequestsBridge,
  session: UiSession,
  authority: () => { ready: boolean; clipIds: string[]; requestIds: string[] }
) {
  let disposed = false;
  let running: Promise<void> | undefined;
  let again = false;
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        const entries = await bridge.getApprovalEntries();
        if (disposed) return;
        for (const entry of entries) {
          if (disposed) return;
          const result = session.acceptDestination(
            entry.id,
            { kind: "requests", entity: entry.requestId },
            authority(),
            "notification"
          );
          if (result === "applied" || result === "unavailable")
            await bridge.acknowledgeApprovalEntry(entry.id);
        }
      } while (again && !disposed);
    })()
      .catch(() => {
        /* Retain host intent for an explicit authority/readiness retry. */
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  }
  const unsubscribe = bridge.onApprovalEntriesChanged(() => {
    void refresh();
  });
  void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}
