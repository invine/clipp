import React from "react";
import type { BackgroundContinuityActionRunner } from "./backgroundContinuityBehavior";
import type { BackgroundContinuityState } from "./types";

export function BackgroundContinuityControls({
  state,
  behavior,
  scenarioControls,
  setEnabled,
  setAutoSync,
  refresh,
  refreshAutoSync,
  help,
  openNotificationSettings,
  autoSyncPending = false,
  autoSyncRecoveryRequired = false,
}: {
  state: BackgroundContinuityState;
  behavior: BackgroundContinuityActionRunner;
  scenarioControls?: React.ReactNode;
  setEnabled(enabled: boolean): Promise<void>;
  setAutoSync(enabled: boolean): Promise<unknown>;
  refresh?(): Promise<unknown>;
  refreshAutoSync?(): Promise<unknown>;
  help(): void;
  openNotificationSettings?(): Promise<void>;
  autoSyncPending?: boolean;
  autoSyncRecoveryRequired?: boolean;
}) {
  const busy =
    behavior.state.pendingAction !== null ||
    state.controlPending ||
    autoSyncPending;
  return (
    <div className="relay-settings">
      <p className="peer-sub">Experimental background continuity</p>
      <p className="peer-sub">
        Tries to keep Clipp connected while its Android runtime is alive. Uses a
        visible notification and extra battery. Clipboard capture requires a
        focused Clipp window.
      </p>
      <p className="peer-sub" role="status">
        {!state.available
          ? "Available on Android 12 and later."
          : !state.controlStateKnown
            ? "Background state is unknown. Refresh before changing it."
            : !state.backgroundEnabled
              ? "Background mode is disabled."
              : state.service === "stopped"
                ? "Background mode is stopped."
                : state.connection === "connected"
                  ? `Connected to ${state.connectedTrustedDeviceCount} Trusted Device${state.connectedTrustedDeviceCount === 1 ? "" : "s"}.`
                  : `Background mode is ${state.connection}.`}
      </p>
      {state.available && state.controlStateKnown && (
        <>
          {state.service === "stopped" && (
            <button
              type="button"
              className="text-button labelled-control"
              disabled={busy}
              onClick={() => {
                void behavior.perform(
                  "Enabling background mode",
                  () => setEnabled(true),
                  !state.backgroundEnabled
                    ? "Enable experimental background continuity? Clipp holds a partial CPU wake lock and uses extra battery and network while Android keeps its current runtime alive. Clipboard capture still requires a focused Clipp window."
                    : undefined
                );
              }}
            >
              {state.backgroundEnabled
                ? "Start background mode"
                : "Enable background mode"}
            </button>
          )}
          {state.backgroundEnabled &&
            state.service === "running" &&
            state.autoSync !== null && (
              <button
                type="button"
                className="text-button labelled-control"
                disabled={busy || autoSyncRecoveryRequired}
                onClick={() =>
                  void behavior.perform("Updating Auto Sync", () =>
                    setAutoSync(!state.autoSync)
                  )
                }
              >
                {state.autoSync ? "Pause Auto Sync" : "Resume Auto Sync"}
              </button>
            )}
        </>
      )}
      {state.available &&
        (state.backgroundEnabled || state.service === "running") && (
          <button
            type="button"
            className="text-button labelled-control"
            disabled={busy}
            onClick={() =>
              void behavior.perform("Stopping background mode", () =>
                setEnabled(false)
              )
            }
          >
            Stop background mode
          </button>
        )}
      {autoSyncRecoveryRequired && (
        <>
          <p role="status" className="peer-sub">
            Auto Sync needs a confirmed refresh before Pause or Resume.
          </p>
          {refreshAutoSync && (
            <button
              type="button"
              className="text-button labelled-control"
              disabled={busy}
              onClick={() =>
                void behavior.perform("Refreshing Auto Sync", refreshAutoSync)
              }
            >
              Refresh Auto Sync
            </button>
          )}
        </>
      )}
      {behavior.state.pendingAction && (
        <p role="status" className="peer-sub">
          Updating background controls…
        </p>
      )}
      {(behavior.state.error || state.controlError) && (
        <p role="status" className="peer-sub">
          {state.controlError || behavior.state.error}
        </p>
      )}
      {state.available && state.notificationAvailability === "blocked" && (
        <p role="status" className="peer-sub">
          Notifications are blocked. Background mode remains available;
          reconnect alerts may not appear.
        </p>
      )}
      {state.available && state.notificationAvailability === "unknown" && (
        <p role="status" className="peer-sub">
          Notification availability is unknown.
        </p>
      )}
      {state.available && openNotificationSettings && (
        <button
          type="button"
          className="text-button labelled-control"
          disabled={busy}
          onClick={() =>
            void behavior.perform(
              "Opening notification settings",
              openNotificationSettings
            )
          }
        >
          Notification settings
        </button>
      )}
      {refresh && (
        <button
          type="button"
          className="text-button labelled-control"
          disabled={busy}
          onClick={() =>
            void behavior.perform("Refreshing background state", refresh)
          }
        >
          Refresh background state
        </button>
      )}
      <button
        type="button"
        className="text-button labelled-control"
        data-session-focus="continuity-help"
        onClick={help}
      >
        Background help and recovery
      </button>
      {scenarioControls}
    </div>
  );
}

export function BackgroundContinuityHelp({
  state,
  behavior,
  scenarioControls,
  exportDiagnostics,
}: {
  state: BackgroundContinuityState;
  behavior: BackgroundContinuityActionRunner;
  scenarioControls?: React.ReactNode;
  exportDiagnostics?(): void | Promise<void>;
}) {
  return (
    <section>
      <p>
        Background continuity is best effort. Android may interrupt the
        Activity-owned WebView and network during Doze, OEM process management,
        process pressure, task removal, Task Manager stop, force-stop or reboot.
        Reopen Clipp after an explicit stop or reconnect alert.
      </p>
      <p>
        Pause or Resume changes Auto Sync. Stop disables background mode and
        preserves Auto Sync. Explicit SEND and PROCESS_TEXT actions can be
        queued or accepted locally; that does not confirm delivery to another
        device.
      </p>
      {state.supportState === "limited" && (
        <p>
          This configuration is limited: Clipp observed{" "}
          {state.observedBackgroundFailureCount} background runtime
          interruptions. Background connectivity is not reliable on this
          configuration.
        </p>
      )}
      {state.batteryOptimizationGuidance && (
        <p>
          Troubleshooting: check Android Settings → Apps → Clipp → Battery and
          allow background use, then collect another diagnostic run. Clipp does
          not request a battery exemption during onboarding.
        </p>
      )}
      {behavior.state.pendingAction && (
        <p role="status">{behavior.state.pendingAction}…</p>
      )}
      {state.available && exportDiagnostics && (
        <>
          <button
            type="button"
            className="text-button labelled-control"
            disabled={behavior.state.pendingAction !== null}
            onClick={() =>
              void behavior.perform(
                "Exporting privacy-safe diagnostics",
                exportDiagnostics
              )
            }
          >
            Export privacy-safe diagnostics
          </button>
          {behavior.state.error && <p role="status">{behavior.state.error}</p>}
        </>
      )}
      {scenarioControls}
    </section>
  );
}
