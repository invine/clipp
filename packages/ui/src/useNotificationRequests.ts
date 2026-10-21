import { useEffect, useRef } from "react";
import {
  bindNotificationRequests,
  type NotificationRequestsBridge,
} from "./notificationRequests";
import type { UiSession } from "./uiSession";

export function useNotificationRequests(
  bridge: NotificationRequestsBridge,
  session: UiSession,
  authority: { ready: boolean; clipIds: string[]; requestIds: string[] }
) {
  const latest = useRef(authority);
  latest.current = authority;
  const consumer = useRef<ReturnType<typeof bindNotificationRequests> | null>(
    null
  );
  useEffect(() => {
    const bound = bindNotificationRequests(
      bridge,
      session,
      () => latest.current
    );
    consumer.current = bound;
    return () => {
      consumer.current = null;
      bound.dispose();
    };
  }, [bridge, session]);
  useEffect(() => {
    void consumer.current?.refresh();
  }, [authority.ready, authority.requestIds]);
}
