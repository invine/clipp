import {
  createClosableRuntimeNotifications,
  createRuntimeNotificationStatus,
} from "../../../packages/core/runtime/notifications";
import type { IdentityBoundWorkFence } from "../../../packages/core/runtime/identityInitialization";

type NativeNotification = {
  close(): void;
  show(): void;
  on(
    event: "click" | "close" | "show" | "failed",
    listener: (...args: any[]) => void
  ): unknown;
};
export type ElectronNativeNotification = {
  isSupported(): boolean;
  new (options: {
    title: string;
    body: string;
    silent: boolean;
  }): NativeNotification;
};
/** The production native Notification seam; shared core owns selection policy. */
export function createElectronNotifications(
  native: ElectronNativeNotification,
  work: IdentityBoundWorkFence
) {
  const active = new Set<NativeNotification>();
  const status = createRuntimeNotificationStatus({
    // isSupported and a native error do not establish OS authorization.
    inspect: async () => ({
      app: native.isSupported() ? "unknown" : "unsupported",
      channel: "not-applicable",
    }),
  });
  const notifications = createClosableRuntimeNotifications({
    create(message, events) {
      work.assertOpen();
      if (!native.isSupported()) {
        void status.refresh();
        return undefined;
      }
      const notification = new native({
        title: message.title,
        body: message.body,
        silent: false,
      });
      active.add(notification);
      notification.on("close", () => {
        active.delete(notification);
        events.closed();
      });
      notification.on("click", () => {
        if (!work.isFenced()) events.select();
      });
      notification.on("failed", (_event, error) => status.failed(error));
      notification.on("show", () => status.shown());
      try {
        notification.show();
      } catch (error) {
        status.failed(error);
        throw error;
      }
      return { close: () => notification.close() };
    },
  });
  return {
    notifications,
    status,
    closeAll() {
      notifications.clearSelections?.();
      for (const notification of active) notification.close();
      active.clear();
    },
  };
}
