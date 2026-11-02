import React, { useEffect, useRef, useState } from "react";
import type {
  IdentityResetResult,
  IdentityResetReceipt,
  IdentityResetState,
} from "../../core/trust/manualIdentityReset";

export type ManualIdentityResetActions = {
  begin(request: {
    operationId: string;
    reviewedPeerId: string;
  }): Promise<IdentityResetResult>;
  reconcile(): Promise<IdentityResetState>;
  resume(request: { operationId: string }): Promise<IdentityResetResult>;
  dismiss(receiptId: string): Promise<IdentityResetState>;
};

export function ManualIdentityResetSettings({
  peerId,
  state,
  available = false,
  actions,
  onPair,
  onCopyFormerPeerId,
  onAccepted,
}: {
  peerId?: string;
  state?: IdentityResetState;
  available?: boolean;
  actions?: ManualIdentityResetActions;
  onPair?(): void;
  onCopyFormerPeerId?(receipt: IdentityResetReceipt): Promise<void>;
  onAccepted?(): void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingAction = useRef(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localState, setLocalState] = useState(state);
  const clearedOperations = useRef(new Set<string>());
  useEffect(() => setLocalState(state), [state]);
  const current: IdentityResetState = localState ?? { phase: "idle" };
  const operationId =
    current.phase === "idle"
      ? current.completedOperation?.operationId
      : current.phase === "checking" || current.phase === "completed"
        ? current.operationId
        : current.operationId;
  useEffect(() => {
    const acceptedOperationId =
      "operationId" in current && typeof current.operationId === "string"
        ? current.operationId
        : undefined;
    if (
      [
        "accepted",
        "quiescing",
        "cleaning",
        "installing",
        "finalizing",
        "completed",
      ].includes(current.phase) &&
      acceptedOperationId &&
      !clearedOperations.current.has(acceptedOperationId)
    ) {
      clearedOperations.current.add(acceptedOperationId);
      onAccepted?.();
    }
  }, [current, onAccepted]);
  async function run(action: () => Promise<unknown>) {
    if (pendingAction.current) return;
    pendingAction.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const result = await action();
      if (result && typeof result === "object") {
        const value = result as {
          phase?: unknown;
          outcome?: unknown;
          state?: unknown;
        };
        if (typeof value.phase === "string")
          setLocalState(result as IdentityResetState);
        else if (value.state && typeof value.state === "object")
          setLocalState(value.state as IdentityResetState);
        else if (value.outcome === "rejected")
          setFeedback(
            `The reset was not started (${"code" in value ? String((value as { code: unknown }).code) : "rejected"}).`
          );
        const acceptedState =
          typeof value.phase === "string"
            ? (result as IdentityResetState)
            : value.state && typeof value.state === "object"
              ? (value.state as IdentityResetState)
              : undefined;
        const operation =
          acceptedState && "operationId" in acceptedState
            ? acceptedState.operationId
            : undefined;
        if (
          operation &&
          acceptedState &&
          [
            "accepted",
            "quiescing",
            "cleaning",
            "installing",
            "finalizing",
            "completed",
          ].includes(acceptedState.phase) &&
          !clearedOperations.current.has(operation)
        ) {
          clearedOperations.current.add(operation);
          onAccepted?.();
        }
      }
    } catch {
      setFeedback(
        "The action could not be confirmed. Check the current reset status before retrying."
      );
    } finally {
      pendingAction.current = false;
      setPending(false);
    }
  }

  return (
    <div className="relay-settings" aria-labelledby="manual-reset-heading">
      <h3 id="manual-reset-heading">Device identity</h3>
      <p>
        Reset this device’s identity to start pairing as a new device. This
        removes local identity-bound connections and session work. It does not
        revoke access on other devices.
      </p>
      {!actions ? (
        <p role="status">
          Manual identity reset is unavailable on this installation.
        </p>
      ) : (
        <>
          {current.phase === "idle" && current.completedOperation && (
            <section role="status">
              <p>
                This device is ready to pair with its new Peer ID{" "}
                {current.completedOperation.generatedPeerId}.
              </p>
              {onPair && (
                <button type="button" onClick={onPair}>
                  Pair this device
                </button>
              )}
            </section>
          )}
          {current.phase === "idle" && current.receipt && (
            <section aria-label="Previous device identity reminder">
              <p>
                This device was previously known as{" "}
                {current.receipt.formerPeerId}. Dismissing this reminder does
                not revoke that identity on other devices.
              </p>
              {onCopyFormerPeerId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(() => onCopyFormerPeerId(current.receipt!))
                  }
                >
                  Copy previous Peer ID
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(() => actions.dismiss(current.receipt!.receiptId))
                }
              >
                Dismiss reminder
              </button>
            </section>
          )}
          {current.phase === "idle" &&
            !current.receipt &&
            !current.completedOperation &&
            !reviewing && (
              <>
                <button
                  type="button"
                  disabled={!available || !peerId}
                  onClick={() => setReviewing(true)}
                >
                  Reset device identity
                </button>
                {!available && (
                  <p role="status">
                    Manual identity reset is unavailable on this installation.
                  </p>
                )}
              </>
            )}
          {reviewing && current.phase === "idle" && (
            <section aria-label="Review device identity reset">
              {pending && <p role="status">Submitting the reset request…</p>}
              <p>
                Current Peer ID: <code>{peerId ?? "Unavailable"}</code>
              </p>
              <p>
                Reset removes this device’s local pairing membership and pending
                identity-bound tasks and session work. Other devices may retain
                the former Peer ID.
              </p>
              <button
                type="button"
                disabled={pending || !peerId}
                onClick={() => setReviewing(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!available || pending || !peerId}
                onClick={() =>
                  void run(async () => {
                    const result = await actions.begin({
                      operationId: crypto.randomUUID(),
                      reviewedPeerId: peerId!,
                    });
                    if (result.outcome === "outcome-unconfirmed")
                      setLocalState(await actions.reconcile());
                    setReviewing(false);
                  })
                }
              >
                Start reset
              </button>
            </section>
          )}
          {current.phase !== "idle" && current.phase !== "completed" && (
            <section role="status" aria-live="polite">
              <p>
                {current.phase === "checking"
                  ? "Checking reset status…"
                  : `Reset status: ${current.phase}.`}
              </p>
              {current.error && (
                <p role="alert">The reset needs attention ({current.error}).</p>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => void run(() => actions.reconcile())}
              >
                Check status
              </button>
              {operationId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(() => actions.resume({ operationId }))
                  }
                >
                  Continue reset
                </button>
              )}
            </section>
          )}
          {current.phase === "completed" && (
            <section role="status">
              <p>
                Identity reset completed. Restart this app before pairing with
                the new identity.
              </p>
              {current.receipt && (
                <p>
                  Former Peer ID: <code>{current.receipt.formerPeerId}</code>
                </p>
              )}
              {current.receipt && onCopyFormerPeerId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(() => onCopyFormerPeerId(current.receipt!))
                  }
                >
                  Copy previous Peer ID
                </button>
              )}
              <p role="status">Restart required</p>
            </section>
          )}
          {feedback && <p role="alert">{feedback}</p>}
        </>
      )}
    </div>
  );
}
