import { sameUiDestination, type UiDestination } from "./uiDestination";
import type { ClipboardActionFeedback } from "./clipboardActionFeedback";
import type { AutoSyncActionResult } from "../../core/runtime/autoSyncAction";
import { createNameEditSession } from "./nameEditSession";
import { createPairingSubmission } from "./pairingSubmission";
import { createPairingCodeTask } from "./pairingCodeTask";
import {
  createInitialUiSessionNavigationState,
  reduceUiSessionNavigation,
  type NotificationReturn,
  type SessionTask,
  type UiSessionNavigationEvent,
  type UiSessionNavigationState,
} from "./uiSessionReducer";
import { createRelayEditSession } from "./relayEditSession";
import type { RelayActionResult } from "../../core/network/relayActions";
export type { SessionTask } from "./uiSessionReducer";

export type SessionContext = UiSessionNavigationState & {
  autoSync: {
    pending: boolean;
    recoveryRequired: boolean;
    refreshed: boolean;
    feedback: AutoSyncActionResult | null;
  };
  pairingImport: { pending: boolean; error: string | null };
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
    ...createInitialUiSessionNavigationState(),
    autoSync: {
      pending: false,
      recoveryRequired: false,
      refreshed: false,
      feedback: null,
    },
    historyActions: {},
    recoveryAttempts: {},
    taskNotice: null,
    pairingImport: { pending: false, error: null },
    relayMutationFeedback: {},
    relayActions: {},
  };
  const activity = new Set<string>();
  const appliedDestinations = new Map<string, "applied" | "unavailable">();
  let historyGeneration = 0;
  let historyActionGeneration = 0;
  let retryPairingImport: (() => Promise<void>) | undefined;
  let pairingImportOperation: { submitted: boolean } | undefined;
  const historyRetries = new Map<
    string,
    () => Promise<ClipboardActionFeedback | null>
  >();
  const listeners = new Set<() => void>();
  const update = (fields: Partial<SessionContext>) => {
    state = fields.destination
      ? reduceUiSessionNavigation(state, {
          type: "select-destination",
          fields: { ...fields, destination: fields.destination },
          canReplace: true,
        })
      : reduceUiSessionNavigation(state, { type: "patch", fields });
    listeners.forEach((listener) => listener());
  };
  const transition = (event: UiSessionNavigationEvent) => {
    const next = reduceUiSessionNavigation(state, event);
    if (next === state) return false;
    state = next;
    listeners.forEach((listener) => listener());
    return true;
  };
  // Destination registration must observe editor work even while its task is suspended.
  for (const owner of [name, alias, relay, pairing, qr])
    owner.subscribe(() => update({}));
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
      state.pairingImport.pending ||
      state.pairingImport.error ||
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
      authority: { ready: boolean; clipIds: string[]; requestIds: string[] },
      source?: "notification"
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
      const notification =
        source === "notification" && destination.kind === "requests";
      if (occupied() && !matching && !notification) return "declined" as const;
      if (
        notification &&
        (state.destination !== "requests" || state.tasks.length)
      ) {
        const {
          destination: previousDestination,
          tasks,
          focusKey,
          showNav,
          settingsCategory,
          taskNotice,
        } = state;
        // Suspend presentation only. Drafts and in-flight operations retain their
        // existing owners, and their completions can still update this context.
        transition({
          type: "suspend-for-notification",
          destination,
          context: {
            destination: previousDestination,
            tasks: tasks.map((task) =>
              task.kind === "relay"
                ? {
                    ...task,
                    relayEdit: task.entity ? relay.retain(task.entity) : null,
                  }
                : task
            ),
            focusKey,
            showNav,
            settingsCategory,
            taskNotice,
          },
          requestAvailable:
            !destination.entity ||
            authority.requestIds.includes(destination.entity),
        });
      }
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
          update({ destination: "history", ...destination.context });
          if (authority.clipIds.includes(destination.entity))
            this.open({
              kind: "clip-details",
              entity: destination.entity,
              origin: `details:${destination.entity}`,
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
            taskNotice: null,
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
        else
          update({
            destination: "devices",
            showNav: false,
            focusKey: "destination:devices",
          });
      }
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
    async importPairing(
      read: () => Promise<string>,
      submit: (text: string) => Promise<void>
    ) {
      if (state.pairingImport.pending || pairing.getSnapshot().pending) return;
      const generation = historyGeneration;
      const originalInput = pairing.getSnapshot().raw;
      const operation = { submitted: false };
      pairingImportOperation = operation;
      const isCurrent = () =>
        generation === historyGeneration &&
        pairingImportOperation === operation;
      retryPairingImport = () => this.importPairing(read, submit);
      update({ pairingImport: { pending: true, error: null } });
      try {
        const text = await read();
        if (!isCurrent()) return;
        if (
          pairing.getSnapshot().raw !== originalInput ||
          pairing.getSnapshot().pending
        )
          throw new Error(
            "Pairing input changed while importing. Choose the input again to replace it."
          );
        operation.submitted = true;
        await submit(text);
        if (!isCurrent()) return;
        pairingImportOperation = undefined;
        retryPairingImport = undefined;
        update({ pairingImport: { pending: false, error: null } });
      } catch (error) {
        if (!isCurrent()) return;
        pairingImportOperation = undefined;
        update({
          pairingImport: {
            pending: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to import pairing text. Try again.",
          },
        });
      }
    },
    async retryPairingImport() {
      await retryPairingImport?.();
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    open(task: SessionTask) {
      const next = reduceUiSessionNavigation(state, {
        type: "open-task",
        task,
      });
      if (next === state) return;
      if (next.tasks.length <= state.tasks.length)
        state.tasks.forEach(dismissTask);
      transition({ type: "open-task", task });
    },
    back() {
      if (!state.tasks.length && state.notificationReturn) {
        const { previous, ...returning } = state.notificationReturn;
        const tasks = returning.tasks.flatMap((retained, index) => {
          const { relayEdit, ...original } = retained;
          let task = original;
          if (task.kind === "relay") {
            const key = relayEdit?.resume();
            if (!key) return [];
            task = { ...task, entity: key };
          }
          const owner =
            task.kind === "device-name"
              ? name
              : task.kind === "alias"
                ? alias
                : null;
          if (owner && (!task.entity || !owner.resume(task.entity))) return [];
          return [
            index === returning.tasks.length - 1
              ? {
                  ...task,
                  initialFocusKey: returning.focusKey ?? task.initialFocusKey,
                }
              : task,
          ];
        });
        transition({
          type: "return-from-notification",
          context: { ...returning, tasks, previous },
        });
        return;
      }
      const task = state.tasks[state.tasks.length - 1];
      if (!task) return;
      dismissTask(task);
      transition({ type: "back-task" });
    },
    complete(kind: SessionTask["kind"], entity?: string) {
      const task = state.tasks[state.tasks.length - 1];
      if (task?.kind === kind && task.entity === entity) this.back();
      if (state.notificationReturn) {
        const completeReturn = (
          context: NotificationReturn
        ): NotificationReturn => {
          const tasks = context.tasks;
          const suspended = tasks[tasks.length - 1];
          return {
            ...context,
            tasks:
              suspended?.kind === kind && suspended.entity === entity
                ? tasks.slice(0, -1)
                : tasks,
            previous: context.previous
              ? completeReturn(context.previous)
              : null,
          };
        };
        update({
          notificationReturn: completeReturn(state.notificationReturn),
        });
      }
    },
    close() {
      const task = state.tasks[state.tasks.length - 1];
      state.tasks.forEach(dismissTask);
      transition({
        type: "close-tasks",
        focusKey: task?.origin ?? state.focusKey,
      });
    },
    discard() {
      const task = state.tasks[state.tasks.length - 1];
      if (task?.kind === "device-name") name.cancel();
      if (task?.kind === "alias") alias.cancel();
      if (task?.kind === "relay") relay.discard();
      if (task?.kind === "paste" || task?.kind === "pairing") {
        if (
          !pairing.getSnapshot().pending &&
          !pairingImportOperation?.submitted
        ) {
          pairingImportOperation = undefined;
          pairing.discard();
          retryPairingImport = undefined;
          update({ pairingImport: { pending: false, error: null } });
        }
      }
      this.back();
    },
    rotateIdentity() {
      historyGeneration++;
      historyActionGeneration++;
      historyRetries.clear();
      appliedDestinations.clear();
      for (
        let context = state.notificationReturn;
        context;
        context = context.previous
      )
        context.tasks.forEach(dismissTask);
      update({ notificationReturn: null });
      pairingImportOperation = undefined;
      retryPairingImport = undefined;
      name.clear();
      alias.clear();
      pairing.discard();
      qr.close();
      update({
        tasks: state.tasks.filter((task) => task.kind === "relay"),
        historyActions: {},
        pairingImport: { pending: false, error: null },
        search: "",
        sourceFilter: "all",
        historyAnchor: null,
        scroll: {},
        focusKey: "workspace",
        taskNotice: null,
      });
    },
    retireHistoryActions() {
      historyActionGeneration++;
      historyRetries.clear();
      if (Object.keys(state.historyActions).length)
        update({ historyActions: {} });
    },
    async runHistoryAction(
      id: string,
      action: () => Promise<ClipboardActionFeedback | null>
    ) {
      if (
        state.historyActions[id]?.pending ||
        state.historyActions[id]?.feedback?.requiresAcknowledgement
      )
        return;
      const generation = historyActionGeneration;
      update({
        historyActions: {
          ...state.historyActions,
          [id]: {
            pending: true,
            feedback:
              state.historyActions[id]?.feedback?.status === "success"
                ? null
                : (state.historyActions[id]?.feedback ?? null),
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
      if (generation !== historyActionGeneration) return;
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
