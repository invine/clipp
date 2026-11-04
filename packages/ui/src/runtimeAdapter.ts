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
  | "pairingImport"
  | "host"
  | "runtimeOwner"
>;

export type UiHostEffects = {
  copyText(text: string): Promise<void>;
  confirm(message: string): boolean | Promise<boolean>;
};

/** One document's authoritative observations, actions and optional lifecycle. */
export type UiRuntimeAdapter = {
  getSnapshot(): UiRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  actions: UiRuntimeActions;
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
    host,
    publish(next: ClipboardAppProps) {
      current = next;
      snapshot = projectSnapshot(next);
      listeners.forEach((listener) => listener());
    },
  };
}

function projectSnapshot(props: ClipboardAppProps): UiRuntimeSnapshot {
  const snapshot = { ...props } as Partial<ClipboardAppProps>;
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
  delete snapshot.pairingImport;
  delete snapshot.host;
  delete snapshot.runtimeOwner;
  return snapshot as UiRuntimeSnapshot;
}

/** Production browser hosts opt into clipboard and confirmation effects explicitly. */
export const browserUiHost: UiHostEffects = {
  copyText: (text) => navigator.clipboard.writeText(text),
  confirm: (message) => globalThis.confirm(message),
};
