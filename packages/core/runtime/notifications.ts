import type { RuntimeNotification, RuntimeNotifications } from "./contract";

export function createRuntimeNotificationSelection() {
  const handlers = new Set<(id: string) => void | Promise<void>>();
  return {
    onSelect(handler: (id: string) => void | Promise<void>) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(id: string) {
      handlers.forEach((handler) => void handler(id));
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
  ): ClosableNativeNotification | undefined | Promise<ClosableNativeNotification | undefined>;
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
        select: () => selection.emit(notification.id),
        closed: () => {
          if (!nativeNotification) {
            closedBeforeRegistration = true;
            return;
          }
          if (active.get(notification.id) === nativeNotification) active.delete(notification.id);
        },
      });
      if (nativeNotification && !closedBeforeRegistration) active.set(notification.id, nativeNotification);
    },
    dismiss,
    onSelect: selection.onSelect,
  };
}
