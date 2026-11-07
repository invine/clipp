import React, { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const connected = summary.direct + summary.relayed;
  const description =
    summary.kind === "direct"
      ? `${summary.direct} Trusted Device${summary.direct === 1 ? " is" : "s are"} connected directly.`
      : summary.kind === "relay"
        ? `${summary.relayed} Trusted Device${summary.relayed === 1 ? " is" : "s are"} connected through a relay.`
        : summary.kind === "attention"
          ? `${connected} Trusted Device${connected === 1 ? " has" : "s have"} a working connection. One or more configured relays need attention.`
          : summary.kind === "unknown"
            ? "Clipp cannot confirm the current connection state. Check Devices for the latest available information."
            : summary.kind === "starting"
              ? `Clipp is trying to connect to ${summary.configured} configured relay${summary.configured === 1 ? "" : "s"}.`
              : summary.kind === "waiting"
                ? `${summary.ready} of ${summary.configured} configured relay${summary.configured === 1 ? " is" : "s are"} ready. No Trusted Devices are currently connected.`
                : summary.kind === "idle"
                  ? "No Trusted Devices or managed relays are set up. Add or pair a device to use Clipp across devices."
                  : `${summary.trustedDevices} Trusted Device${summary.trustedDevices === 1 ? " is" : "s are"} available, but none are connected right now.`;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      if (restoreFocus.current) triggerRef.current?.focus();
      restoreFocus.current = false;
    };
  }, [open]);

  const close = (returnFocus = false) => {
    restoreFocus.current = returnFocus;
    setOpen(false);
  };

  return (
    <div className={`connection-control connection-${summary.kind}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="connection-status"
        data-session-focus="connections-summary"
        aria-label={summary.label}
        title={summary.label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="connection-summary-panel"
        onClick={() => setOpen((value) => !value)}
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
      {open && (
        <section
          id="connection-summary-panel"
          className="connection-summary-popover"
          role="dialog"
          aria-label="Connection summary"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
        >
          <div className="connection-summary-heading">
            <h2>{summary.label}</h2>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close connection summary"
              onClick={() => close(true)}
            >
              ×
            </button>
          </div>
          <p>{description}</p>
          {summary.issues.length > 0 && (
            <ul className="connection-summary-issues">
              {summary.issues.map((issue) => (
                <li key={issue.id}>{issue.message}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="text-button connection-summary-devices"
            onClick={() => {
              close(false);
              session.close();
              session.update({
                destination: "devices",
                showNav: false,
                focusKey: "destination:devices",
              });
            }}
          >
            Open Devices
          </button>
        </section>
      )}
    </div>
  );
}
