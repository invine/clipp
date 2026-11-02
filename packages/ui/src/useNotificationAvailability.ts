import { useEffect, useRef, useState } from "react";
import type { RuntimeNotificationAvailability } from "../../core/runtime/notifications";
export type NotificationAvailabilityBridge = {
  getNotificationAvailability(): Promise<RuntimeNotificationAvailability>;
  openNotificationSettings?(): Promise<void>;
  requestNotificationPermission?(): Promise<RuntimeNotificationAvailability>;
  onNotificationAvailabilityChanged?(listener: () => void): () => void;
};
export type NotificationAvailabilityControls = {
  state: RuntimeNotificationAvailability | null;
  pending: boolean;
  error: boolean;
  refresh(): Promise<void>;
  openSettings?: () => Promise<void>;
  requestPermission?: () => Promise<void>;
};
/** Deliberate permission action; returning focus refreshes current app/channel state. */
export function useNotificationAvailability(
  bridge: NotificationAvailabilityBridge
): NotificationAvailabilityControls {
  const [state, setState] = useState<RuntimeNotificationAvailability | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(false);
  const acting = useRef(false);
  const generation = useRef(0);
  const refresh = async () => {
    const expected = ++generation.current;
    try {
      const next = await bridge.getNotificationAvailability();
      if (alive.current && expected === generation.current) {
        setState(next);
        setError(false);
      }
    } catch {
      if (alive.current && expected === generation.current) setError(true);
    }
  };
  useEffect(() => {
    alive.current = true;
    const unbind = bridge.onNotificationAvailabilityChanged?.(() => {
      void refresh();
    });
    const returned = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    void refresh();
    return () => {
      alive.current = false;
      generation.current++;
      unbind?.();
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [bridge]);
  async function act(action: () => Promise<unknown>) {
    if (acting.current) return;
    acting.current = true;
    setPending(true);
    setError(false);
    try {
      await action();
      await refresh();
    } catch {
      if (alive.current) setError(true);
    } finally {
      acting.current = false;
      if (alive.current) setPending(false);
    }
  }
  return {
    state,
    pending,
    error,
    refresh,
    openSettings: bridge.openNotificationSettings
      ? () => act(() => bridge.openNotificationSettings!())
      : undefined,
    requestPermission: bridge.requestNotificationPermission
      ? () => act(() => bridge.requestNotificationPermission!())
      : undefined,
  };
}
