import type { ClipboardAppProps } from "./ClipboardApp";

type ActionName = {
  [Key in keyof ClipboardAppProps]-?: Key extends `on${string}` ? Key : never;
}[keyof ClipboardAppProps];

export type UiRuntimeActions = Pick<
  ClipboardAppProps,
  ActionName | "identityResetActions" | "scanCameraPermission"
>;
export type UiRuntimeSnapshot = Omit<
  ClipboardAppProps,
  | keyof UiRuntimeActions
  | "session"
  | "taskInput"
  | "pairingDiagnostics"
  | "historyDiagnostics"
  | "pairingTaskDiagnostics"
  | "backgroundContinuityDiagnostics"
  | "pairingImport"
  | "host"
  | "runtimeOwner"
>;

/** Optional effects are explicit host capabilities at the adapter boundary. */
export type UiRuntimeCapabilities = Readonly<{
  actions: readonly ActionName[];
  identityReset: boolean;
  cameraScanning: boolean;
  notifications: Readonly<{
    openSettings: boolean;
    requestPermission: boolean;
  }>;
}>;

export type UiHostEffects = {
  copyText(text: string): Promise<void>;
  confirm(message: string): boolean | Promise<boolean>;
};

/** One document's authoritative observations, actions and optional lifecycle. */
export type UiRuntimeAdapter = {
  getSnapshot(): UiRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  actions: UiRuntimeActions;
  capabilities: UiRuntimeCapabilities;
  host?: UiHostEffects;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
};

export function createUiRuntimeStore(
  initial: ClipboardAppProps,
  host?: UiHostEffects
) {
  let current = initial;
  let snapshot = projectSnapshot(initial);
  const listeners = new Set<() => void>();
  const actionKeys = Object.keys(initial).filter((key) =>
    key.startsWith("on")
  ) as ActionName[];
  const actions = Object.fromEntries(
    actionKeys.map((key) => [
      key,
      (...args: unknown[]) => {
        const action = current[key];
        if (typeof action !== "function")
          throw new Error(`Unavailable UI runtime action: ${String(key)}`);
        return Reflect.apply(action, current, args);
      },
    ])
  );
  Object.defineProperties(actions, {
    identityResetActions: {
      enumerable: true,
      get: () => current.identityResetActions,
    },
    scanCameraPermission: {
      enumerable: true,
      get: () => current.scanCameraPermission,
    },
  });
  const typedActions = actions as unknown as UiRuntimeActions;
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: typedActions,
    get capabilities() {
      return getUiRuntimeCapabilities(current);
    },
    host,
    publish(next: ClipboardAppProps) {
      current = next;
      snapshot = projectSnapshot(next);
      listeners.forEach((listener) => listener());
    },
  };
}

export function getUiRuntimeCapabilities(
  props: Partial<ClipboardAppProps>
): UiRuntimeCapabilities {
  const values = props as Record<string, unknown>;
  const actions = Object.keys(props).filter(
    (key): key is ActionName =>
      key.startsWith("on") && typeof values[key] === "function"
  );
  const notificationControls = values.notificationControls as
    ClipboardAppProps["notificationControls"] | undefined;
  return Object.freeze({
    actions: Object.freeze(actions),
    identityReset: values.identityResetActions !== undefined,
    cameraScanning: values.scanCameraPermission !== undefined,
    notifications: Object.freeze({
      openSettings: typeof notificationControls?.openSettings === "function",
      requestPermission:
        typeof notificationControls?.requestPermission === "function",
    }),
  });
}

function projectSnapshot(props: ClipboardAppProps): UiRuntimeSnapshot {
  const snapshot = cloneObservation(props) as Partial<ClipboardAppProps>;
  for (const key of Object.keys(props)) {
    if (
      key.startsWith("on") ||
      key === "identityResetActions" ||
      key === "scanCameraPermission"
    ) {
      delete snapshot[key as keyof ClipboardAppProps];
    }
  }
  delete snapshot.session;
  delete snapshot.taskInput;
  delete snapshot.pairingDiagnostics;
  delete snapshot.historyDiagnostics;
  delete snapshot.pairingTaskDiagnostics;
  delete snapshot.backgroundContinuityDiagnostics;
  delete snapshot.pairingImport;
  delete snapshot.host;
  delete snapshot.runtimeOwner;
  return snapshot as UiRuntimeSnapshot;
}

function cloneObservation<T>(
  value: T,
  seen = new WeakMap<object, object>()
): T {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing) return existing as T;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneObservation(item, seen));
    return copy as T;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value))
    copy[key] = cloneObservation(item, seen);
  return copy as T;
}

/** Production browser hosts opt into clipboard and confirmation effects explicitly. */
export const browserUiHost: UiHostEffects = {
  copyText: (text) => navigator.clipboard.writeText(text),
  confirm: (message) => globalThis.confirm(message),
};
