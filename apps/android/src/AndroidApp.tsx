import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./android-host.css";
import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import type { AndroidAppState, createAndroidRuntime } from "./client";
import { bindAndroidHostGeometry } from "./hostGeometryNative";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import {
  createHostTaskInput,
  bindHostOverlayKeyboard,
} from "../../../packages/ui/src/hostTaskInput";
import { bindAndroidHostTaskInput } from "./hostTaskInputNative";
import { createAndroidPairingScanner } from "./pairingScannerHost";
import { createAndroidUiRuntimeAdapter } from "./uiRuntimeAdapter";

export type AndroidAppRuntime = Pick<
  ReturnType<typeof createAndroidRuntime>,
  "client" | "start" | "stop" | "identityReset"
>;

export function AndroidApp({ runtime }: { runtime: AndroidAppRuntime }) {
  const session = useMemo(() => createUiSession(), []);
  const taskInput = useMemo(() => createHostTaskInput(session), [session]);
  const pairingScanner = useMemo(
    () => createAndroidPairingScanner(taskInput),
    [taskInput]
  );
  useEffect(() => () => pairingScanner.dispose(), [pairingScanner]);
  useEffect(() => {
    const unbindNative = bindAndroidHostTaskInput(taskInput);
    const unbindKeyboard = bindHostOverlayKeyboard(taskInput, document);
    return () => {
      unbindKeyboard();
      unbindNative();
    };
  }, [taskInput]);
  useEffect(() => bindAndroidHostGeometry(), []);
  const adapter = useMemo(
    () =>
      createAndroidUiRuntimeAdapter(
        runtime,
        session,
        taskInput,
        pairingScanner
      ),
    [runtime, session, taskInput, pairingScanner]
  );
  const state = useSyncExternalStore(
    adapter.subscribe,
    adapter.getAndroidState,
    adapter.getAndroidState
  );

  return (
    <div className="android-host">
      <ClipboardWorkspace
        adapter={adapter}
        taskInput={taskInput}
        session={session}
        pairingDiagnostics={
          <PairingDiagnosticsPanel
            attempt={state.diagnostics?.lastPairingAttempt || null}
          />
        }
      />
    </div>
  );
}

function PairingDiagnosticsPanel({
  attempt,
}: {
  attempt: NonNullable<AndroidAppState["diagnostics"]>["lastPairingAttempt"];
}) {
  if (!attempt) return null;

  return (
    <div
      style={{
        maxWidth: "100%",
        maxHeight: "25dvh",
        overflow: "auto",
        overflowWrap: "anywhere",
        margin: 0,
        padding: 12,
        borderRadius: 12,
        border:
          attempt.status === "failed"
            ? "1px solid var(--clipp-danger)"
            : "1px solid var(--clipp-border)",
        background: "var(--clipp-surface-raised)",
        color: "var(--clipp-text)",
        fontSize: ".875rem",
      }}
    >
      <p style={{ fontWeight: 700 }}>
        Pairing diagnostics: {attempt.status} ({attempt.attemptId})
      </p>
      <pre
        style={{
          marginTop: 10,
          maxHeight: "15dvh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--clipp-text-muted)",
        }}
      >
        {JSON.stringify(attempt, null, 2)}
      </pre>
    </div>
  );
}
