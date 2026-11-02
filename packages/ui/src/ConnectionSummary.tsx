import React from "react";
import type { projectConnectionSummary } from "../../core/runtime/connectionSummary";
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
      aria-label={`Open Devices: ${summary.label}`}
      title={`${summary.label} · Open Devices`}
      onClick={() => {
        session.close();
        session.update({
          destination: "devices",
          showNav: false,
          focusKey: "destination:devices",
        });
      }}
    >
      <span className="connection-indicator" aria-hidden="true" />
      <span className="connection-label">{summary.label}</span>
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
