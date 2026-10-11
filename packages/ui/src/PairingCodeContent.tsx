import React from "react";
import { Icon } from "./controls";
import type { PairingCodeTaskState } from "./pairingCodeTask";

export function PairingCodeContent({
  state,
  onRetry,
  onCopy,
  buttonClassName = "primary-button",
}: {
  state: PairingCodeTaskState;
  onRetry(): void;
  onCopy(): void;
  buttonClassName?: string;
}) {
  if (state.generation === "pending")
    return (
      <div role="status" className="qr-modal-status">
        Creating QR code...
      </div>
    );
  if (state.generation === "error")
    return (
      <>
        <div role="alert" className="qr-modal-error">
          Unable to create a pairing QR code. Try again.
        </div>
        <button className={buttonClassName} onClick={onRetry}>
          Retry QR generation
        </button>
      </>
    );
  if (state.generation !== "ready" || !state.code) return null;
  return (
    <>
      {state.code.image ? (
        <div className="qr-code-frame" style={{ maxWidth: "100%" }}>
          <img
            src={state.code.image}
            alt="Pairing QR"
            className="qr-modal-image"
            style={{ width: 320, maxWidth: "100%", height: "auto" }}
          />
        </div>
      ) : (
        <div className="qr-modal-status">
          This pairing target is too large for a QR code. Copy the pairing text
          and paste it on your other device.
        </div>
      )}
      <button
        className={`${buttonClassName} qr-modal-copy`}
        disabled={state.copy === "pending"}
        onClick={onCopy}
      >
        <Icon name="copy" />
        {state.copy === "pending"
          ? "Copying..."
          : state.copy === "unconfirmed"
            ? "Copy again"
            : state.copy === "rejected"
              ? "Retry Copy"
              : "Copy pairing text"}
      </button>
      {state.copy === "copied" && (
        <div role="status">
          Pairing text copied. Paste it on your other device to start Pairing.
        </div>
      )}
      {state.copy === "rejected" && (
        <div role="alert">Could not copy pairing text. Retry Copy.</div>
      )}
      {state.copy === "unconfirmed" && (
        <div role="alert">
          Pairing text may have been copied, but the write could not be
          confirmed. Check your clipboard before choosing Copy again.
        </div>
      )}
    </>
  );
}
