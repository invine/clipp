import React from "react";
import type { projectConnectionSummary } from "../../core/runtime/connectionSummary";
import { TaskDialog } from "./TaskDialog";
import type { UiSession } from "./uiSession";

type Summary = ReturnType<typeof projectConnectionSummary>;
export function ConnectionStatusButton({
  summary,
  session,
}: {
  summary: Summary;
  session: UiSession;
}) {
  return (
    <button
      type="button"
      className={`connection-status connection-${summary.kind}`}
      data-session-focus="connections-summary"
      aria-label={`Connections: ${summary.label}`}
      title={summary.label}
      aria-haspopup="dialog"
      aria-expanded={session
        .getSnapshot()
        .tasks.some((task) => task.kind === "connections")}
      onClick={() =>
        session.open({ kind: "connections", origin: "connections-summary" })
      }
    >
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="4" cy="17" r="2.5" />
        <circle cx="20" cy="17" r="2.5" />
        {summary.kind === "direct" ? (
          <>
            <circle cx="12" cy="5" r="2.5" />
            <path d="m5.5 14.5 5-7m3 0 5 7M7 17h10" />
          </>
        ) : summary.kind === "attention" ? (
          <path d="m5.5 14.5 3-5m10 5-3-5M12 2v8m0 4h.01" />
        ) : summary.kind === "relay" ? (
          <path d="m6 14 4-6m4 0 4 6M12 2l3 3-3 3-3-3Z" />
        ) : summary.kind === "unknown" ? (
          <path d="M9 6a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01M7 17h10" />
        ) : (
          <>
            <circle cx="12" cy="5" r="2.5" />
            <path
              strokeDasharray={summary.kind === "offline" ? undefined : "1 3"}
              d="m6 14 3-4m6 0 3 4"
            />
            {summary.kind === "offline" && <path d="m3 3 18 18" />}
          </>
        )}
      </svg>
    </button>
  );
}
export function ConnectionsPanel({
  summary,
  session,
  autoSync,
}: {
  summary: Summary;
  session: UiSession;
  autoSync: boolean | null;
}) {
  const tasks = session.getSnapshot().tasks;
  const task = tasks[tasks.length - 1];
  const manage = (destination: "devices" | "settings") => {
    session.close();
    session.update({
      destination,
      ...(destination === "settings"
        ? { settingsCategory: "relays" as const }
        : {}),
      focusKey: `destination:${destination}`,
    });
  };
  return (
    <TaskDialog
      title="Connections"
      pending={false}
      originKey={task?.origin}
      onCancel={() => session.back()}
      onDismiss={() => session.back()}
      cancelLabel="Close connections"
    >
      <p>{summary.label}.</p>
      {summary.direct > 0 && (
        <p>
          {summary.direct} Trusted Device{summary.direct === 1 ? "" : "s"}{" "}
          connected directly.
        </p>
      )}
      {summary.relayed > 0 && (
        <p>
          {summary.relayed} Trusted Device{summary.relayed === 1 ? "" : "s"}{" "}
          connected through relay.
        </p>
      )}
      {summary.unknown > 0 && (
        <p>A Trusted Device is connected; its path is unknown.</p>
      )}
      <p>
        {summary.configured
          ? `${summary.ready} of ${summary.configured} configured relays ready.${summary.starting ? " Relay setup is in progress." : ""}`
          : "No relay configured."}
      </p>
      {summary.issues.length > 0 && (
        <p>
          A configured relay needs attention.{" "}
          {summary.direct + summary.relayed > 0
            ? "Available device connections remain usable. "
            : ""}
          Open Connections settings for recovery.
        </p>
      )}
      <p>
        Auto Sync: {autoSync === null ? "Unknown" : autoSync ? "On" : "Off"}.
        Connection availability does not confirm Clip delivery.
      </p>
      <button type="button" onClick={() => manage("devices")}>
        Open Devices
      </button>
      <button type="button" onClick={() => manage("settings")}>
        Open Connections settings
      </button>
    </TaskDialog>
  );
}
