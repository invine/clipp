import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";
import type { RuntimeNotificationAvailability } from "../../../packages/core/runtime/notifications";
import type {
  NotificationAvailabilityBridge,
  NotificationAvailabilityControls,
} from "../../../packages/ui/src/useNotificationAvailability";

type Port = {
  send(message: unknown): Promise<unknown>;
  subscribe(listener: (message: unknown) => void): () => void;
};

/** Settings and notifications keep their own revisions and lifecycle owners. */
export function createExtensionUiControls(options: {
  settings: Port;
  notifications: NotificationAvailabilityBridge;
  subscribeReturn(listener: () => void): () => void;
  changed(): void;
}) {
  const settings = createSettingsClient(options.settings);
  let appearance = {
    ...settings.getState(),
    save: settings.save,
    refresh: settings.refresh,
  };
  let notificationState: RuntimeNotificationAvailability | null = null;
  let notificationPending = false;
  let notificationError = false;
  let alive = false;
  let generation = 0;
  let acting = false;
  let removeBridge: (() => void) | undefined;
  let removeReturn: (() => void) | undefined;
  let notifications: NotificationAvailabilityControls;

  function publishNotifications() {
    notifications = {
      state: notificationState,
      pending: notificationPending,
      error: notificationError,
      refresh: refreshNotifications,
      openSettings: options.notifications.openNotificationSettings
        ? () => act(() => options.notifications.openNotificationSettings!())
        : undefined,
      requestPermission: options.notifications.requestNotificationPermission
        ? () =>
            act(() => options.notifications.requestNotificationPermission!())
        : undefined,
    };
    options.changed();
  }

  async function refreshNotifications() {
    if (!alive) return;
    const expected = ++generation;
    try {
      const state = await options.notifications.getNotificationAvailability();
      if (!alive || expected !== generation) return;
      notificationState = state;
      notificationError = false;
    } catch {
      if (!alive || expected !== generation) return;
      notificationError = true;
    }
    publishNotifications();
  }

  async function act(action: () => Promise<unknown>) {
    if (!alive || acting) return;
    acting = true;
    notificationPending = true;
    notificationError = false;
    publishNotifications();
    try {
      await action();
      await refreshNotifications();
    } catch {
      if (alive) notificationError = true;
    } finally {
      acting = false;
      if (alive) {
        notificationPending = false;
        publishNotifications();
      }
    }
  }

  notifications = {
    state: null,
    pending: false,
    error: false,
    refresh: refreshNotifications,
  };

  return {
    settings,
    getAppearance: () => appearance,
    getNotifications: () => notifications,
    start() {
      if (alive) return;
      alive = true;
      removeBridge = options.notifications.onNotificationAvailabilityChanged?.(
        () => void refreshNotifications()
      );
      removeReturn = options.subscribeReturn(() => void refreshNotifications());
      void refreshNotifications();
      void settings.start((state) => {
        appearance = {
          ...state,
          save: settings.save,
          refresh: settings.refresh,
        };
        options.changed();
      });
    },
    stop() {
      alive = false;
      generation += 1;
      acting = false;
      notificationPending = false;
      removeBridge?.();
      removeReturn?.();
      removeBridge = removeReturn = undefined;
      settings.stop();
    },
  };
}
