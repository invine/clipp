import type { AutoSyncActionResult } from "../../core/runtime/autoSyncAction";
import { createNameEditSession } from "./nameEditSession";
import { createPairingSubmission } from "./pairingSubmission";
import { createPairingCodeTask } from "./pairingCodeTask";
import { createRelayEditSession } from "./relayEditSession";
import type { RelayActionResult } from "../../core/network/relayActions";
export type SessionTask = {
  kind:
    "device-name" | "alias" | "relay" | "pairing" | "paste" | "qr" | "clear";
  entity?: string;
  origin: string;
};
export type SessionContext = {
  search: string;
  timeFilter: "all" | "24h" | "7d" | "30d";
  sourceFilter: string;
  filterMode: "all" | "pinned";
  showNav: boolean;
  destination: "history" | "devices" | "settings" | "requests";
  tasks: SessionTask[];
  focusKey: string | null;
  scroll: Record<string, number>;
  autoSync: {
    pending: boolean;
    recoveryRequired: boolean;
    refreshed: boolean;
    feedback: AutoSyncActionResult | null;
  };
  taskNotice: string | null;
  relayMutationFeedback: Record<string, string>;
  relayActions: Record<
    string,
    { pending: boolean; result: RelayActionResult | null }
  >;
};
/** One document-lived UI owner. Runtime state and credentials never belong here. */
export function createUiSession() {
  const name = createNameEditSession(),
    alias = createNameEditSession(),
    relay = createRelayEditSession(),
    pairing = createPairingSubmission(),
    qr = createPairingCodeTask();
  let state: SessionContext = {
    search: "",
    timeFilter: "all",
    sourceFilter: "all",
    filterMode: "all",
    showNav: false,
    destination: "history",
    tasks: [],
    focusKey: null,
    scroll: {},
    autoSync: {
      pending: false,
      recoveryRequired: false,
      refreshed: false,
      feedback: null,
    },
    taskNotice: null,
    relayMutationFeedback: {},
    relayActions: {},
  };
  const listeners = new Set<() => void>();
  const update = (fields: Partial<SessionContext>) => {
    state = { ...state, ...fields };
    listeners.forEach((listener) => listener());
  };
  function dismissTask(task?: SessionTask) {
    if (task?.kind === "device-name") name.dismiss();
    if (task?.kind === "alias") alias.dismiss();
    if (task?.kind === "relay") relay.dismiss();
  }
  return {
    name,
    alias,
    relay,
    pairing,
    qr,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    open(task: SessionTask) {
      const current = state.tasks.at(-1);
      if (current?.kind === task.kind && current.entity === task.entity) return;
      const subtask =
        current?.kind === "pairing" &&
        (task.kind === "paste" || task.kind === "qr");
      if (!subtask) state.tasks.forEach(dismissTask);
      update({
        tasks: subtask ? [...state.tasks, task] : [task],
        focusKey: task.origin,
        taskNotice: null,
      });
    },
    back() {
      const task = state.tasks.at(-1);
      dismissTask(task);
      update({
        tasks: state.tasks.slice(0, -1),
        focusKey: task?.origin ?? state.focusKey,
      });
    },
    complete(kind: SessionTask["kind"], entity?: string) {
      const task = state.tasks.at(-1);
      if (task?.kind === kind && task.entity === entity) this.back();
    },
    close() {
      const task = state.tasks.at(-1);
      state.tasks.forEach(dismissTask);
      update({ tasks: [], focusKey: task?.origin ?? state.focusKey });
    },
    discard() {
      const task = state.tasks.at(-1);
      if (task?.kind === "device-name") name.cancel();
      if (task?.kind === "alias") alias.cancel();
      if (task?.kind === "relay") relay.discard();
      if (task?.kind === "paste" || task?.kind === "pairing") pairing.discard();
      this.back();
    },
    rotateIdentity() {
      name.clear();
      alias.clear();
      pairing.discard();
      qr.close();
      update({ tasks: state.tasks.filter((task) => task.kind === "relay") });
    },
    async saveAutoSync(
      action: () => Promise<AutoSyncActionResult | void> | void
    ) {
      if (state.autoSync.pending || state.autoSync.recoveryRequired) return;
      update({ autoSync: { ...state.autoSync, pending: true } });
      let feedback: AutoSyncActionResult | null = null;
      try {
        feedback = (await action()) ?? null;
        if (
          feedback &&
          !["applied", "partial", "rejected", "unconfirmed"].includes(
            feedback.status
          )
        )
          throw new Error("missing_result");
      } catch {
        feedback = {
          status: "unconfirmed",
          autoSync: false,
          error: "The Auto Sync Save result could not be confirmed.",
        };
      }
      update({
        autoSync: {
          pending: false,
          recoveryRequired:
            feedback?.status === "unconfirmed" ||
            feedback?.status === "partial",
          refreshed: false,
          feedback,
        },
      });
    },
    async refreshAutoSync(
      action: () => Promise<boolean | void> | boolean | void
    ) {
      if (state.autoSync.pending) return;
      update({ autoSync: { ...state.autoSync, pending: true } });
      let confirmed = false;
      try {
        confirmed = (await action()) === true;
      } catch {
        /* keep recovery visible */
      }
      update({
        autoSync: {
          ...state.autoSync,
          pending: false,
          recoveryRequired: !confirmed,
          refreshed: confirmed,
        },
      });
    },
    async relayAction(key: string, action: () => Promise<RelayActionResult>) {
      if (state.relayActions[key]?.pending) return;
      update({
        relayActions: {
          ...state.relayActions,
          [key]: { pending: true, result: null },
        },
      });
      let result: RelayActionResult;
      try {
        result = await action();
        if (
          !result ||
          ![
            "authenticated",
            "portal-opened",
            "retry-requested",
            "removed-local",
            "rejected",
            "unconfirmed",
          ].includes(result.status)
        )
          throw new Error("missing_result");
      } catch {
        result = {
          status: "unconfirmed",
          error:
            "The relay action result could not be confirmed. Check its current status before retrying.",
        };
      }
      update({
        relayActions: {
          ...state.relayActions,
          [key]: { pending: false, result },
        },
      });
    },
  };
}
export type UiSession = ReturnType<typeof createUiSession>;
