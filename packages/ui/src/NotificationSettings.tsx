import React from "react";
import type { NotificationAvailabilityControls } from "./useNotificationAvailability";
export function NotificationSettings({
  controls,
}: {
  controls: NotificationAvailabilityControls;
}) {
  const { state, pending, error } = controls;
  const labels = {
    available: "Allowed",
    blocked: "Blocked",
    unknown: "Not confirmed",
    unsupported: "Unavailable",
    "not-applicable": "Not applicable",
  };
  return (
    <section
      className="settings-group"
      aria-label="Pairing notifications"
      data-session-focus="settings:notifications"
      tabIndex={-1}
    >
      <h4>Pairing notifications</h4>
      <p>
        App notifications: {labels[state?.app ?? "unknown"]}.
        {state?.channel !== "not-applicable" && (
          <> Request channel: {labels[state?.channel ?? "unknown"]}.</>
        )}
      </p>
      <p>You can always review pending Requests in Clipp.</p>
      {state?.displayError && (
        <p role="alert">
          Notification display failed. Open Devices to review pending requests.
        </p>
      )}
      {error && (
        <p role="alert">
          Notification settings could not be confirmed. Check your system
          notification settings for Clipp, then return and refresh.
        </p>
      )}
      {controls.requestPermission && state?.app !== "available" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void controls.requestPermission!()}
        >
          Allow Pairing notifications
        </button>
      )}
      {controls.openSettings && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void controls.openSettings!()}
        >
          Open notification settings
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => void controls.refresh()}
      >
        Refresh notification availability
      </button>
      <p>
        In system settings, allow notifications for Clipp
        {state?.channel !== "not-applicable" ? " and its request channel" : ""}.
        Return to Clipp to check availability.
      </p>
    </section>
  );
}
