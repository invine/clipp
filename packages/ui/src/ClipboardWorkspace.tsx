import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ClipboardApp, type ClipboardAppProps } from "./ClipboardApp";
import { createUiSession } from "./uiSession";
import type { UiRuntimeAdapter } from "./runtimeAdapter";
import { useDocumentTheme } from "./useRuntimeSettings";

/** Production and scripted entry point for the real shared UI. */
export function ClipboardWorkspace({
  adapter,
  session: suppliedSession,
  taskInput,
  pairingDiagnostics,
  historyDiagnostics,
  pairingTaskDiagnostics,
  backgroundContinuityDiagnostics,
  pairingImport,
  headerActions,
}: {
  adapter: UiRuntimeAdapter;
} & Pick<
  ClipboardAppProps,
  | "session"
  | "taskInput"
  | "pairingDiagnostics"
  | "historyDiagnostics"
  | "pairingTaskDiagnostics"
  | "pairingImport"
  | "headerActions"
  | "backgroundContinuityDiagnostics"
>) {
  const session = useMemo(
    () => suppliedSession ?? createUiSession(),
    [adapter, suppliedSession]
  );
  const snapshot = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot
  );
  const [failure, setFailure] = useState<{
    owner: UiRuntimeAdapter;
    message: string;
  } | null>(null);
  useDocumentTheme(snapshot.appearanceSettings?.snapshot?.state.theme);
  useEffect(() => {
    let active = true;
    try {
      Promise.resolve(adapter.start?.()).catch(() => {
        if (active)
          setFailure({
            owner: adapter,
            message:
              "Runtime could not be started. Retry opening this workspace.",
          });
      });
    } catch {
      setFailure({
        owner: adapter,
        message: "Runtime could not be started. Retry opening this workspace.",
      });
    }
    return () => {
      active = false;
      try {
        Promise.resolve(adapter.stop?.()).catch(() => {});
      } catch {
        // Closing a document must not revive a stopped runtime owner.
      }
    };
  }, [adapter]);
  return (
    <ClipboardApp
      {...snapshot}
      {...adapter.actions}
      taskInput={taskInput}
      pairingDiagnostics={pairingDiagnostics}
      historyDiagnostics={historyDiagnostics}
      pairingTaskDiagnostics={pairingTaskDiagnostics}
      backgroundContinuityDiagnostics={backgroundContinuityDiagnostics}
      pairingImport={pairingImport}
      headerActions={headerActions}
      session={session}
      runtimeError={
        failure?.owner === adapter ? failure.message : snapshot.runtimeError
      }
      host={adapter.host}
      runtimeOwner={adapter}
    />
  );
}
