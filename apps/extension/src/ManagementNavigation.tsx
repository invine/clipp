/// <reference types="chrome" />
import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import { createManagementNavigationConsumer } from "./managementNavigationConsumer";
export { navigateManagement } from "./managementNavigationConsumer";
export function ManagementNavigation({
  runtime,
  session,
  surface,
}: {
  runtime: typeof chrome.runtime;
  session: UiSession;
  surface: "popup" | "page";
}) {
  const consumer = useMemo(
    () => createManagementNavigationConsumer(runtime, session),
    [runtime, session]
  );
  useEffect(() => consumer.start(), [consumer]);
  return <ManagementNavigationView consumer={consumer} surface={surface} />;
}

export function ManagementNavigationView({
  consumer,
  surface,
}: {
  consumer: ReturnType<typeof createManagementNavigationConsumer>;
  surface: "popup" | "page";
}) {
  const { records, statusError, error, pending, openUnconfirmed } =
    useSyncExternalStore(
      consumer.subscribe,
      consumer.getSnapshot,
      consumer.getSnapshot
    );
  return (
    <div className="management-navigation" aria-label="Full-page Clipp">
      {surface === "popup" && (
        <button
          type="button"
          disabled={pending || openUnconfirmed}
          onClick={consumer.open}
        >
          {pending ? "Navigation in progress…" : "Open full-page Clipp"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {statusError && (
        <div role="alert">
          <p>
            Navigation status could not be loaded. Earlier navigation may still
            need attention.
          </p>
          <button type="button" disabled={pending} onClick={consumer.refresh}>
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
                  disabled={pending}
                  onClick={() => consumer.act("managementRetry", record.id)}
                >
                  Retry navigation
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => consumer.act("managementDismiss", record.id)}
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
