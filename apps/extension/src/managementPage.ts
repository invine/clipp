/// <reference types="chrome" />
import { MANAGEMENT_PORT, type Handoff } from "./chromeManagement";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import { parseUiDestination } from "../../../packages/ui/src/uiDestination";
export type ManagementAuthority = {
  ready: boolean;
  identityId?: string;
  clipIds: string[];
  requestIds: string[];
};
/** Document owner reconnects independently of the worker and retains its original UiSession. */
export function bindManagementPage(options: {
  connect(): chrome.runtime.Port;
  session: UiSession;
  authority(): ManagementAuthority;
  subscribeAuthority(listener: () => void): () => void;
  schedule?(listener: () => void): () => void;
}) {
  let reconciling = false;
  let identityId: string | undefined;
  let disposed = false,
    port: chrome.runtime.Port | undefined,
    cancelReconnect: (() => void) | undefined;
  const pending = new Map<string, Handoff>();
  const post = (value: unknown) => {
    try {
      port?.postMessage(value);
    } catch {
      /* reconnect owns redelivery */
    }
  };
  function reconcile() {
    if (disposed || !port || reconciling) return;
    reconciling = true;
    try {
      const authority = options.authority();
      if (authority.identityId && identityId !== authority.identityId) {
        if (identityId !== undefined) {
          pending.clear();
          options.session.rotateIdentity();
        }
        identityId = authority.identityId;
      }
      for (const handoff of pending.values()) {
        const result = options.session.acceptDestination(
          handoff.id,
          handoff.destination,
          authority
        );
        if (result === "waiting") continue;
        pending.delete(handoff.id);
        post({ type: "ack", id: handoff.id, status: result });
      }
      post({
        type: "ready",
        ready: authority.ready,
        ...options.session.destinationAvailability(),
      });
    } finally {
      reconciling = false;
    }
  }
  function connect() {
    if (disposed) return;
    try {
      port = options.connect();
    } catch {
      reconnect();
      return;
    }
    const active = port;
    active.onMessage.addListener((value) => {
      if (disposed || port !== active) return;
      if (value?.type === "identity-reset") {
        pending.clear();
        options.session.rotateIdentity();
        return;
      }
      if (value?.type !== "destination") return;
      const destination = parseUiDestination(value.handoff?.destination);
      if (!destination || typeof value.handoff.id !== "string") return;
      pending.set(value.handoff.id, { ...value.handoff, destination });
      reconcile();
    });
    active.onDisconnect.addListener(() => {
      if (port !== active || disposed) return;
      port = undefined;
      reconnect();
    });
    reconcile();
  }
  function reconnect() {
    cancelReconnect?.();
    cancelReconnect = options.schedule
      ? options.schedule(connect)
      : (() => {
          const timer = setTimeout(connect, 500);
          return () => clearTimeout(timer);
        })();
  }
  const unsubscribe = options.session.subscribe(reconcile),
    unsubscribeAuthority = options.subscribeAuthority(reconcile);
  connect();
  return () => {
    disposed = true;
    cancelReconnect?.();
    unsubscribe();
    unsubscribeAuthority();
    port?.disconnect();
    pending.clear();
  };
}
export const connectManagementPage = (runtime: typeof chrome.runtime) =>
  runtime.connect({ name: MANAGEMENT_PORT });
