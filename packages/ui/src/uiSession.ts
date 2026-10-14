import { sameUiDestination, type UiDestination } from "./uiDestination";
import type { ClipboardActionFeedback } from "./clipboardActionFeedback";
import type { AutoSyncActionResult } from "../../core/runtime/autoSyncAction";
import { createNameEditSession } from "./nameEditSession";
import { createPairingSubmission } from "./pairingSubmission";
import { createPairingCodeTask } from "./pairingCodeTask";
import { createRelayEditSession } from "./relayEditSession";
import type { RelayActionResult } from "../../core/network/relayActions";
export type SessionTask = {
  kind:
    | "clip-details"
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
  navigationVersion?: number;
  settingsCategory?: "general" | "appearance" | "clips" | "relays";
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
  const activity = new Set<string>();
  const appliedDestinations = new Map<string, "applied" | "unavailable">();
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
  const currentDestination = (): UiDestination => {
    const task = state.tasks[0];
    if (task?.kind === "pairing") return { kind: "pairing" };
    if (task?.kind === "clip-details" && task.entity)
      return { kind: "clip-details", entity: task.entity };
    if (state.destination === "settings")
      return { kind: "settings", category: state.settingsCategory };
    return { kind: state.destination };
  };
  const occupied = () =>
    Boolean(
      activity.size ||
      state.tasks.length ||
      name.hasWork() ||
      alias.hasWork() ||
      relay.hasWork() ||
      pairing.getSnapshot().raw ||
      pairing.getSnapshot().pending ||
      pairing.getSnapshot().result?.ok === false ||
      state.autoSync.pending ||
      Object.values(state.historyActions).some((a) => a.pending) ||
      Object.values(state.relayActions).some((a) => a.pending)
    );
  return {
    setActivity(key: string, pending: boolean) {
      if (activity.has(key) === pending) return;
      if (pending) activity.add(key);
      else activity.delete(key);
      update({});
    },
    destinationAvailability: () => ({
      idle: !occupied(),
      current: currentDestination(),
    }),
    acceptDestination(
      id: string,
      destination: UiDestination,
      authority: { ready: boolean; clipIds: string[]; requestIds: string[] }
    ) {
      const previous = appliedDestinations.get(id);
      if (previous) return previous;
      if (!authority.ready) return "waiting" as const;
      const current = currentDestination();
      // Matching current task can be focused without replacing its context or draft.
      const matching =
        state.tasks[0]?.kind === destination.kind &&
        (destination.kind === "pairing" ||
          destination.kind === "clip-details") &&
        sameUiDestination(current, destination);
      if (occupied() && !matching) return "declined" as const;
      let result: "applied" | "unavailable" = "applied";
      if (!matching) {
        if (destination.kind === "history")
          update({
            destination: "history",
            ...destination.context,
            showNav: false,
          });
        else if (destination.kind === "pairing") {
          update({ destination: "devices" });
          this.open({ kind: "pairing", origin: "destination:devices" });
        } else if (destination.kind === "clip-details") {
          update({ destination: "history" });
          if (authority.clipIds.includes(destination.entity))
            this.open({
              kind: "clip-details",
              entity: destination.entity,
              origin: `more:${destination.entity}`,
            });
          else {
            result = "unavailable";
            update({
              taskNotice: "This Clip is no longer available. Open History.",
            });
          }
        } else if (destination.kind === "requests") {
          update({
            destination: "requests",
            showNav: false,
            focusKey: destination.entity
              ? `request:${destination.entity}`
              : "destination:requests",
          });
          if (
            destination.entity &&
            !authority.requestIds.includes(destination.entity)
          ) {
            result = "unavailable";
            update({
              taskNotice: "This Request is no longer available. Open Requests.",
            });
          }
        } else if (destination.kind === "settings")
          update({
            destination: "settings",
            settingsCategory: destination.category,
            showNav: false,
            focusKey: destination.category
              ? `settings:${destination.category}`
              : "destination:settings",
          });
        else update({ destination: "devices", showNav: false });
      }
      if (!matching)
        update({ navigationVersion: (state.navigationVersion ?? 0) + 1 });
      appliedDestinations.set(id, result);
      if (appliedDestinations.size > 64)
        appliedDestinations.delete(appliedDestinations.keys().next().value!);
      return result;
    },
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
