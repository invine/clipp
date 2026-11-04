import {
  createSettingsClient,
  type SettingsClientState,
} from "../../../packages/core/runtime/settingsClient";
import type { RuntimeNotificationAvailability } from "../../../packages/core/runtime/notifications";
import { createNotificationAvailabilityOwner } from "../../../packages/ui/src/notificationAvailabilityOwner";
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
  let appearance: SettingsClientState = settings.getState();
  let notificationState: RuntimeNotificationAvailability | null = null;
  let notificationPending = false;
  let notificationError = false;
  let alive = false;
  let removeBridge: (() => void) | undefined;
  let removeReturn: (() => void) | undefined;
  let notifications: NotificationAvailabilityControls;

  function publishNotifications() {
    notifications = {
      state: notificationState,
      pending: notificationPending,
      error: notificationError,
      refresh: notificationOwner.refresh,
      openSettings: options.notifications.openNotificationSettings
        ? () =>
            notificationOwner.run(() =>
              options.notifications.openNotificationSettings!()
            )
        : undefined,
      requestPermission: options.notifications.requestNotificationPermission
        ? () =>
            notificationOwner.run(() =>
              options.notifications.requestNotificationPermission!()
            )
        : undefined,
    };
    options.changed();
  }

  const notificationOwner = createNotificationAvailabilityOwner({
    read: () => options.notifications.getNotificationAvailability(),
    setState: (state) => {
      notificationState = state;
    },
    setPending: (pending) => {
      notificationPending = pending;
    },
    setError: (error) => {
      notificationError = error;
    },
    publish: publishNotifications,
  });

  notifications = {
    state: null,
    pending: false,
    error: false,
    refresh: () => notificationOwner.refresh(),
  };

  return {
    settings,
    getAppearance: () => appearance,
    getNotifications: () => notifications,
    start() {
      if (alive) return;
      alive = true;
      notificationOwner.start();
      removeBridge = options.notifications.onNotificationAvailabilityChanged?.(
        () => void notificationOwner.refresh()
      );
      removeReturn = options.subscribeReturn(
        () => void notificationOwner.refresh()
      );
      void notificationOwner.refresh();
      void settings.start((state) => {
        appearance = state;
        options.changed();
      });
    },
    stop() {
      alive = false;
      notificationOwner.stop();
      removeBridge?.();
      removeReturn?.();
      removeBridge = removeReturn = undefined;
      settings.stop();
    },
  };
}
