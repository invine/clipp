/// <reference types="chrome" />
import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import { IconButton } from "../../../packages/ui/src/controls";
import { createManagementNavigationConsumer } from "./managementNavigationConsumer";
export { navigateManagement } from "./managementNavigationConsumer";
export function ManagementNavigation({
  runtime,
  session,
}: {
  runtime: typeof chrome.runtime;
  session: UiSession;
}) {
  const consumer = useMemo(
    () => createManagementNavigationConsumer(runtime, session),
    [runtime, session]
  );
  useEffect(() => consumer.start(), [consumer]);
  return <ManagementNavigationView consumer={consumer} />;
}

export function ManagementNavigationView({
  consumer,
}: {
  consumer: ReturnType<typeof createManagementNavigationConsumer>;
}) {
  const { records, statusError, error, pending } = useSyncExternalStore(
    consumer.subscribe,
    consumer.getSnapshot,
    consumer.getSnapshot
  );
  const visibleRecords = records.filter(
    (record) => record.status !== "applied" || record.error
  );
  if (!error && !statusError && visibleRecords.length === 0) return null;
  return (
    <div className="management-navigation" aria-label="Full-page Clipp">
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
      {visibleRecords.map((record) => (
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

export function ManagementExpandControl({
  consumer,
}: {
  consumer: ReturnType<typeof createManagementNavigationConsumer>;
}) {
  const { pending, openUnconfirmed } = useSyncExternalStore(
    consumer.subscribe,
    consumer.getSnapshot,
    consumer.getSnapshot
  );
  return (
    <IconButton
      icon="openExternal"
      label="Open full-page Clipp"
      hint="Open full-page Clipp"
      className="popup-expand-control"
      disabled={pending || openUnconfirmed}
      aria-busy={pending}
      onClick={() => consumer.open()}
    />
  );
}
