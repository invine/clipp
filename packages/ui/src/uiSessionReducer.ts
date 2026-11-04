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
  initialFocusKey?: string;
};

export type RelayTaskResume = { resume(): string | null };

export type NotificationReturn = {
  destination: "history" | "devices" | "settings" | "requests";
  focusKey: string | null;
  showNav: boolean;
  settingsCategory?:
    "general" | "connections" | "advanced" | "appearance" | "clips" | "relays";
  taskNotice: string | null;
  tasks: (SessionTask & { relayEdit?: RelayTaskResume | null })[];
  previous: NotificationReturn | null;
};

export type UiSessionNavigationState = {
  notificationReturn: NotificationReturn | null;
  search: string;
  timeFilter: "all" | "24h" | "7d" | "30d";
  sourceFilter: string;
  filterMode: "all" | "pinned" | "links";
  showNav: boolean;
  destination: "history" | "devices" | "settings" | "requests";
  tasks: SessionTask[];
  focusKey: string | null;
  scroll: Record<string, number>;
  historyAnchor: { clipId: string; offset: number } | null;
  navigationVersion?: number;
  settingsCategory?: NotificationReturn["settingsCategory"];
  taskNotice: string | null;
};

export type UiSessionNavigationEvent =
  | { type: "patch"; fields: Partial<UiSessionNavigationState> }
  | { type: "open-task"; task: SessionTask }
  | { type: "back-task" }
  | { type: "close-tasks"; focusKey?: string | null }
  | {
      type: "suspend-for-notification";
      destination: { kind: "requests"; entity?: string };
      context: Omit<NotificationReturn, "previous">;
      requestAvailable: boolean;
    }
  | {
      type: "return-from-notification";
      context: NotificationReturn;
    }
  | {
      type: "select-destination";
      fields: Partial<UiSessionNavigationState> & {
        destination: UiSessionNavigationState["destination"];
      };
      canReplace: boolean;
    };

export function createInitialUiSessionNavigationState(): UiSessionNavigationState {
  return {
    notificationReturn: null,
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
    taskNotice: null,
  };
}

const isSubtask = (parent: SessionTask, child: SessionTask) =>
  (parent.kind === "pairing" &&
    (child.kind === "paste" || child.kind === "qr")) ||
  (parent.kind === "issues" && child.kind === "pairing-recovery");

/** Pure workflow transitions for the document-lived UI navigation owner. */
export function reduceUiSessionNavigation<T extends UiSessionNavigationState>(
  state: T,
  event: UiSessionNavigationEvent
): T {
  switch (event.type) {
    case "patch":
      return { ...state, ...event.fields };
    case "open-task": {
      const current = state.tasks[state.tasks.length - 1];
      if (
        current?.kind === event.task.kind &&
        current.entity === event.task.entity
      )
        return state;
      const append = Boolean(current && isSubtask(current, event.task));
      return {
        ...state,
        tasks: append ? [...state.tasks, event.task] : [event.task],
        focusKey: event.task.origin,
        taskNotice: null,
      };
    }
    case "back-task": {
      const task = state.tasks[state.tasks.length - 1];
      if (!task) return state;
      return {
        ...state,
        tasks: state.tasks
          .slice(0, -1)
          .map((parent, index) =>
            index === state.tasks.length - 2
              ? { ...parent, initialFocusKey: task.origin }
              : parent
          ),
        focusKey: task.origin,
      };
    }
    case "close-tasks": {
      if (!state.tasks.length && event.focusKey === state.focusKey)
        return state;
      const task = state.tasks[state.tasks.length - 1];
      return {
        ...state,
        tasks: [],
        focusKey: event.focusKey ?? task?.origin ?? state.focusKey,
      };
    }
    case "suspend-for-notification": {
      const notificationReturn: NotificationReturn = {
        ...event.context,
        previous: state.notificationReturn,
      };
      const hasRequest = Boolean(event.destination.entity);
      return {
        ...state,
        notificationReturn,
        tasks: [],
        destination: "requests",
        taskNotice:
          hasRequest && !event.requestAvailable
            ? "This Request is no longer available. Open Requests."
            : null,
        showNav: false,
        focusKey: event.destination.entity
          ? `request:${event.destination.entity}`
          : "destination:requests",
      };
    }
    case "return-from-notification": {
      const { previous, ...context } = event.context;
      return {
        ...state,
        ...context,
        notificationReturn: previous,
        navigationVersion: (state.navigationVersion ?? 0) + 1,
      };
    }
    case "select-destination":
      if (!event.canReplace) return state;
      return { ...state, ...event.fields };
  }
}
