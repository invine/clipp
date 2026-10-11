import React, { useState } from "react";
import type {
  Device,
  PairingError,
  PairingOutcome,
  PairingWaiting,
} from "./types";

/** Current runtime information alongside authoritative current Membership. */
export function PairingStatus({
  outcomes = [],
  waiting = [],
  errors = [],
  devices,
  onDismiss,
}: {
  outcomes?: PairingOutcome[];
  waiting?: PairingWaiting[];
  errors?: PairingError[];
  devices: Device[];
  onDismiss?(targetPeerId: string): Promise<boolean>;
}) {
  const [dismissError, setDismissError] = useState<string | null>(null);
  const targets = [
    ...new Set(
      [...outcomes, ...waiting, ...errors].map((entry) => entry.targetPeerId)
    ),
  ];
  if (!targets.length) return null;
  return (
    <div className="pairing-status" aria-label="Pairing status">
      {targets.map((target) => {
        const outcome = outcomes.find((entry) => entry.targetPeerId === target);
        const recovering =
          outcome?.recovering ||
          errors.some((entry) => entry.targetPeerId === target);
        const pending = waiting.some((entry) => entry.targetPeerId === target);
        const device = devices.find((entry) => entry.deviceId === target);
        return (
          <div
            key={target}
            className="pending-card"
            data-pairing-target={target}
          >
            <div className="peer-meta" style={{ overflowWrap: "anywhere" }}>
              <span className="peer-name">
                {device?.displayName || device?.deviceName || target}
              </span>
              <span className="peer-sub">{target}</span>
              {outcome?.response && (
                <p role="status">
                  {outcome.response === "accepted"
                    ? "Acceptance response received."
                    : "Rejection response received."}
                </p>
              )}
              {recovering && (
                <p role="status">
                  Retrying local membership storage automatically.
                </p>
              )}
              {pending && <p role="status">Waiting for approval.</p>}
              {outcome?.waitingEnded && !pending && (
                <p role="status">Waiting ended without observing a response.</p>
              )}
              <p>
                {device
                  ? "Currently paired."
                  : "Current membership has not confirmed this device."}
              </p>
              {outcome && !recovering && !pending && onDismiss && (
                <button
                  type="button"
                  aria-label={`Dismiss notice for ${target}`}
                  onClick={() => {
                    setDismissError(null);
                    void onDismiss(target).then(
                      (dismissed) => {
                        if (!dismissed)
                          setDismissError(
                            "This notice is still active. Refresh Pairing status and try again."
                          );
                      },
                      () =>
                        setDismissError(
                          "The dismissal could not be confirmed. The notice remains available."
                        )
                    );
                  }}
                >
                  Dismiss notice
                </button>
              )}
            </div>
          </div>
        );
      })}
      {outcomes.some((outcome) => !outcome.recovering) && (
        <p>Dismissing a notice does not cancel a signed request.</p>
      )}
      {dismissError && <p role="alert">{dismissError}</p>}
    </div>
  );
}
