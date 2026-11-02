import type { RuntimeNotification, RuntimeNotifications } from "./contract";

/** Bounded native ingress until the owning Pairing consumer has subscribed. */
export function createRuntimeNotificationSelection() {
  type Handler = (id: string, instance?: string) => void | Promise<void>;
  const handlers = new Set<Handler>();
  const pending = new Map<string, { id: string; instance?: string }>();
  const delivering = new Map<string, Promise<void>>();
  let generation = 0;
  function flush() {
    if (!handlers.size) return Promise.resolve();
    const expected = generation;
    for (const [key, selection] of pending) {
      if (delivering.has(key)) continue;
      const delivery = Promise.allSettled(
        [...handlers].map((handler) =>
          Promise.resolve().then(() => {
            if (generation === expected && handlers.has(handler))
              return handler(selection.id, selection.instance);
          })
        )
      ).then(() => {
        if (pending.get(key) === selection) pending.delete(key);
        if (delivering.get(key) === delivery) delivering.delete(key);
      });
      delivering.set(key, delivery);
    }
    return Promise.all([...delivering.values()]).then(() => undefined);
  }
  return {
    onSelect(handler: Handler) {
      handlers.add(handler);
      void flush();
      return () => handlers.delete(handler);
    },
    emit(id: string, instance?: string) {
      const key = `${id}:${instance ?? ""}`;
      if (!pending.has(key)) pending.set(key, { id, instance });
      if (pending.size > 32) pending.delete(pending.keys().next().value!);
      return flush();
    },
    clear() {
      generation++;
      pending.clear();
      delivering.clear();
    },
  };
}

export type ClosableNativeNotification = {
  close(): void | Promise<void>;
};

export function createClosableRuntimeNotifications(options: {
  create(
    notification: RuntimeNotification,
    events: { select(): void; closed(): void }
  ):
    | ClosableNativeNotification
    | undefined
    | Promise<ClosableNativeNotification | undefined>;
}): RuntimeNotifications {
  const selection = createRuntimeNotificationSelection();
  const active = new Map<string, ClosableNativeNotification>();

  const dismiss = async (id: string) => {
    const notification = active.get(id);
    if (!notification) return;
    active.delete(id);
    await notification.close();
  };

  return {
    async show(notification) {
      await dismiss(notification.id);
      let closedBeforeRegistration = false;
      let nativeNotification: ClosableNativeNotification | undefined;
      nativeNotification = await options.create(notification, {
        select: () => selection.emit(notification.id, notification.instance),
        closed: () => {
          if (!nativeNotification) {
            closedBeforeRegistration = true;
            return;
          }
          if (active.get(notification.id) === nativeNotification)
            active.delete(notification.id);
        },
      });
      if (nativeNotification && !closedBeforeRegistration)
        active.set(notification.id, nativeNotification);
    },
    dismiss,
    onSelect: selection.onSelect,
    clearSelections: selection.clear,
  };
}

/** The host retains selection until its current document acknowledges entry.
 * This carries destination intent only; UiSession owns navigation and drafts. */
export function createRuntimeApprovalEntries() {
  const pending = new Map<
    string,
    import("./contract").RuntimeApprovalSelection
  >();
  const listeners = new Set<() => void>();
  return {
    select(selection: import("./contract").RuntimeApprovalSelection) {
      pending.set(selection.id, selection);
      if (pending.size > 32) pending.delete(pending.keys().next().value!);
      listeners.forEach((listener) => listener());
    },
    read: () => [...pending.values()],
    acknowledge(id: string) {
      pending.delete(id);
    },
    onChanged(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      pending.clear();
    },
  };
}

export type NotificationAvailability =
  "available" | "blocked" | "unknown" | "unsupported";
export type RuntimeNotificationAvailability = {
  app: NotificationAvailability;
  channel: NotificationAvailability | "not-applicable";
  displayError: string | null;
};
/** Availability is independent of request persistence and Android continuity.
 * Inspection never prompts. Permission/settings recovery is always deliberate. */
export function createRuntimeNotificationStatus(options: {
  inspect(): Promise<Omit<RuntimeNotificationAvailability, "displayError">>;
  openSettings?(): Promise<void>;
  requestPermission?(): Promise<void>;
}) {
  let state: RuntimeNotificationAvailability = {
    app: "unknown",
    channel: "unknown",
    displayError: null,
  };
  let revision = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<RuntimeNotificationAvailability>) => {
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          state[key as keyof RuntimeNotificationAvailability] === value
      )
    )
      return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  async function refresh() {
    const expected = ++revision;
    try {
      const availability = await options.inspect();
      if (expected === revision) update(availability);
    } catch {
      if (expected === revision) update({ app: "unknown", channel: "unknown" });
    }
    return state;
  }
  return {
    read: () => state,
    refresh,
    async openSettings() {
      if (!options.openSettings)
        throw new Error("notification_settings_unavailable");
      await options.openSettings();
    },
    async requestPermission() {
      if (!options.requestPermission)
        throw new Error("notification_permission_unavailable");
      await options.requestPermission();
      return refresh();
    },
    failed(error: unknown) {
      update({
        displayError: (error instanceof Error
          ? error.message
          : String(error)
        ).slice(0, 512),
      });
    },
    shown() {
      update({ displayError: null });
    },
    onChanged(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
