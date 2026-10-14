import type { ClipboardActionFeedback } from "./clipboardActionFeedback";
import type { AutoSyncActionResult } from "../../core/runtime/autoSyncAction";
import { createNameEditSession } from "./nameEditSession";
import { createPairingSubmission } from "./pairingSubmission";
import { createPairingCodeTask } from "./pairingCodeTask";
import { createRelayEditSession } from "./relayEditSession";
import type { RelayActionResult } from "../../core/network/relayActions";
export type SessionTask = {
  kind:
    | "device-name"
    | "alias"
    | "relay"
    | "pairing"
    | "paste"
    | "qr"
    | "clear"
    | "issues"
    | "pairing-recovery";
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
  historyAnchor: { clipId: string; offset: number } | null;
  autoSync: {
    pending: boolean;
    recoveryRequired: boolean;
    refreshed: boolean;
    feedback: AutoSyncActionResult | null;
  };
  taskNotice: string | null;
  historyActions: Record<
    string,
    { pending: boolean; feedback: ClipboardActionFeedback | null }
  >;
  recoveryAttempts: Record<string, { pending: boolean; error: boolean }>;
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
    historyAnchor: null,
    autoSync: {
      pending: false,
      recoveryRequired: false,
      refreshed: false,
      feedback: null,
    },
    historyActions: {},
    recoveryAttempts: {},
    taskNotice: null,
    relayMutationFeedback: {},
    relayActions: {},
  };
  let historyGeneration = 0;
  const historyRetries = new Map<
    string,
    () => Promise<ClipboardActionFeedback | null>
  >();
  const listeners = new Set<() => void>();
  const update = (fields: Partial<SessionContext>) => {
    state = { ...state, ...fields };
    listeners.forEach((listener) => listener());
  };
  function dismissTask(task?: SessionTask) {
    if (task?.kind === "device-name") name.dismiss();
    if (task?.kind === "alias") alias.dismiss();
    if (task?.kind === "relay") relay.dismiss();
    if (task?.kind === "qr") qr.close();
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
        (current?.kind === "pairing" &&
          (task.kind === "paste" || task.kind === "qr")) ||
        (current?.kind === "issues" && task.kind === "pairing-recovery");
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
      historyGeneration++;
      historyRetries.clear();
      name.clear();
      alias.clear();
      pairing.discard();
      qr.close();
      update({
        tasks: state.tasks.filter((task) => task.kind === "relay"),
        historyActions: {},
      });
    },
    async runHistoryAction(
      id: string,
      action: () => Promise<ClipboardActionFeedback | null>
    ) {
      if (state.historyActions[id]?.pending) return;
      const generation = historyGeneration;
      update({
        historyActions: {
          ...state.historyActions,
          [id]: {
            pending: true,
            feedback: state.historyActions[id]?.feedback ?? null,
          },
        },
      });
      let feedback: ClipboardActionFeedback | null;
      try {
        feedback = await action();
      } catch {
        feedback = {
          message:
            "The action result could not be confirmed. Check History before retrying.",
          action: "dismiss",
        };
      }
      if (generation !== historyGeneration) return;
      if (feedback?.action === "retry") historyRetries.set(id, action);
      else historyRetries.delete(id);
      const historyActions = { ...state.historyActions };
      if (feedback) historyActions[id] = { pending: false, feedback };
      else delete historyActions[id];
      update({ historyActions });
    },
    async retryHistoryAction(id: string) {
      const action = historyRetries.get(id);
      if (action) await this.runHistoryAction(id, action);
    },
    dismissHistoryAction(id: string) {
      if (
        state.historyActions[id]?.pending ||
        state.historyActions[id]?.feedback?.action !== "dismiss"
      )
        return;
      historyRetries.delete(id);
      const historyActions = { ...state.historyActions };
      delete historyActions[id];
      update({ historyActions });
    },
    async retryRecovery(
      id: string,
      action: () => boolean | void | Promise<boolean | void>
    ) {
      if (state.recoveryAttempts[id]?.pending) return;
      update({
        recoveryAttempts: {
          ...state.recoveryAttempts,
          [id]: { pending: true, error: false },
        },
      });
      let error = false;
      try {
        error = (await action()) === false;
      } catch {
        error = true;
      }
      update({
        recoveryAttempts: {
          ...state.recoveryAttempts,
          [id]: { pending: false, error },
        },
      });
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
