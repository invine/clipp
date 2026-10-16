/// <reference types="chrome" />
import React, { useEffect, useState } from "react";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import type { UiDestination } from "../../../packages/ui/src/uiDestination";
import type { Handoff } from "./chromeManagement";
export function navigateManagement(
  runtime: typeof chrome.runtime,
  id: string,
  destination: UiDestination
) {
  return new Promise<{ ok: boolean; status?: string; error?: string }>(
    (resolve) => {
      const unconfirmed = {
        ok: false,
        error:
          "Navigation acceptance could not be confirmed. Open Clipp again to check this handoff.",
      };
      const timer = setTimeout(() => resolve(unconfirmed), 15000);
      const finish = (response: {
        ok: boolean;
        status?: string;
        error?: string;
      }) => {
        clearTimeout(timer);
        resolve(response);
      };
      try {
        runtime.sendMessage(
          { type: "managementNavigate", handoff: { id, destination } },
          (response) => {
            finish(runtime.lastError ? unconfirmed : (response ?? unconfirmed));
          }
        );
      } catch {
        finish(unconfirmed);
      }
    }
  );
}
export function ManagementNavigation({
  runtime,
  session,
  surface,
}: {
  runtime: typeof chrome.runtime;
  session: UiSession;
  surface: "popup" | "page";
}) {
  const [records, setRecords] = useState<Handoff[]>([]),
    [error, setError] = useState<string | null>(null),
    [statusError, setStatusError] = useState(false),
    [pending, setPending] = useState(false);
  const refresh = () =>
    runtime.sendMessage({ type: "managementStatus" }, (response) => {
      if (runtime.lastError || !response?.ok) {
        setStatusError(true);
        return;
      }
      setStatusError(false);
      setRecords(response.records ?? []);
    });
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [runtime]);
  async function open() {
    if (pending) return;
    setPending(true);
    setError(null);
    const current = session.destinationAvailability().current;
    const state = session.getSnapshot();
    const destination: UiDestination =
      current.kind === "history"
        ? {
            kind: "history",
            context: {
              search: state.search,
              timeFilter: state.timeFilter,
              sourceFilter: state.sourceFilter,
              filterMode: state.filterMode,
            },
          }
        : current;
    const result = await navigateManagement(
      runtime,
      crypto.randomUUID(),
      destination
    );
    setPending(false);
    if (!result.ok)
      setError(
        result.error === "management_mailbox_full"
          ? "Earlier navigation needs attention. Retry or dismiss its notices."
          : result.error === "invalid_destination"
            ? "This destination cannot be opened. Return to History and try again."
            : result.error === "unauthorized_management"
              ? "This page cannot request full-page navigation."
              : "Navigation acceptance could not be confirmed. Open Clipp again to check this handoff."
      );
    refresh();
  }
  function act(type: "managementRetry" | "managementDismiss", id: string) {
    runtime.sendMessage({ type, id }, (response) => {
      if (runtime.lastError || !response?.ok)
        setError(
          "Navigation recovery could not be confirmed. Check this handoff again."
        );
      refresh();
    });
  }
  return (
    <div className="management-navigation" aria-label="Full-page Clipp">
      {surface === "popup" && (
        <button type="button" disabled={pending} onClick={() => void open()}>
          {pending ? "Opening Clipp…" : "Open full-page Clipp"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {statusError && (
        <div role="alert">
          <p>
            Navigation status could not be loaded. Earlier navigation may still
            need attention.
          </p>
          <button type="button" onClick={refresh}>
            Check navigation status
          </button>
        </div>
      )}
      {records
        .filter((record) => record.status !== "applied" || record.error)
        .map((record) => (
          <div
            key={record.id}
            role={
              record.status === "failed" || record.status === "unconfirmed"
                ? "alert"
                : "status"
            }
          >
            <span>
              {record.status === "pending"
                ? "Opening full-page Clipp…"
                : (record.error ?? "Navigation could not be confirmed.")}
            </span>
            {record.status !== "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => act("managementRetry", record.id)}
                >
                  Retry navigation
                </button>
                <button
                  type="button"
                  onClick={() => act("managementDismiss", record.id)}
                >
                  Dismiss navigation notice
                </button>
              </>
            )}
          </div>
        ))}
    </div>
  );
}
