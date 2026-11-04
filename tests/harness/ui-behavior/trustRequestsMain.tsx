import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { PairingApprovalResult } from "../../../packages/core/pairing/results";
import type { PayloadCopyResult } from "../../../packages/core/clipboard/payloadCopy";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { PendingRequest } from "../../../packages/ui/src/types";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

const initialRequest: PendingRequest = {
  deviceId: "peer-one",
  deviceName: "Peer One",
  requestVersion: "request-v1",
};
const effects: string[] = [];
const outcomeQueue: Array<(result: PairingApprovalResult) => void> = [];
const listeners = new Set<() => void>();
function publishEffects(next: string) {
  effects.push(next);
  listeners.forEach((listener) => listener());
}
function subscribeEffects(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function makeAdapter(
  identityId: string,
  pending: PendingRequest[] = [initialRequest]
) {
  let current: ClipboardAppProps = {
    clips: [],
    devices: [],
    pending,
    peers: [],
    identity: { deviceId: identityId, deviceName: "Scenario Device" },
    pinnedIds: [],
    onDeleteClip: async () => {},
    onUnpair: async () => {},
    onAccept: async (request) => {
      publishEffects(`accept:${request.deviceId}:${request.requestVersion}`);
      return await new Promise<PairingApprovalResult>((resolve) =>
        outcomeQueue.push(resolve)
      );
    },
    onReject: async (request) => {
      publishEffects(`reject:${request.deviceId}:${request.requestVersion}`);
      return await new Promise<PairingApprovalResult>((resolve) =>
        outcomeQueue.push(resolve)
      );
    },
    onPairText: async () => ({ ok: false, error: "unexpected_pairing_effect" }),
    onRequestPairingCode: async () => null,
    onCopyPairingText: async (): Promise<PayloadCopyResult> => ({
      status: "rejected",
    }),
    onReuseClip: async () => "complete" as const,
    onShareNow: async () => {},
    onSetPinned: async () => {},
    onClearAll: async () => {},
  };
  const store = createUiRuntimeStore(current);
  return {
    ...store,
    publish(next: Partial<ClipboardAppProps>) {
      current = { ...current, ...next };
      store.publish(current);
    },
  };
}

const session = createUiSession();
session.update({ destination: "requests" });

function ScenarioControls({
  adapter,
  replaceAdapter,
}: {
  adapter: ReturnType<typeof makeAdapter>;
  replaceAdapter(adapter: ReturnType<typeof makeAdapter>): void;
}) {
  const requested = useSyncExternalStore(
    subscribeEffects,
    () => effects.join(","),
    () => effects.join(",")
  );
  const [revision, setRevision] = useState(0);
  const [navigationResult, setNavigationResult] = useState("none");
  const settle = (result: PairingApprovalResult) => {
    outcomeQueue.shift()?.(result);
    setRevision((value) => value + 1);
  };
  return (
    <aside aria-label="Trust Request scenario controls">
      <output data-testid="trust-effects">{requested}</output>
      <output data-testid="scenario-revision">{revision}</output>
      <button
        type="button"
        onClick={() => settle({ ok: true, admitted: true })}
      >
        Resolve Accept: admitted locally
      </button>
      <button
        type="button"
        onClick={() => settle({ ok: true, admitted: false })}
      >
        Resolve Reject: rejected locally
      </button>
      <button
        type="button"
        onClick={() =>
          settle({ ok: false, error: "outcome_unconfirmed", admitted: null })
        }
      >
        Resolve decision: unconfirmed
      </button>
      <button
        type="button"
        onClick={() =>
          adapter.publish({
            pending: [{ ...initialRequest, requestVersion: "request-v2" }],
          })
        }
      >
        Publish replacement request
      </button>
      <button
        type="button"
        onClick={() => adapter.publish({ requestsLoading: true })}
      >
        Publish Requests loading
      </button>
      <button
        type="button"
        onClick={() =>
          adapter.publish({ requestsLoading: false, requestsUnavailable: true })
        }
      >
        Publish Requests unavailable
      </button>
      <button
        type="button"
        onClick={() =>
          adapter.publish({
            requestsLoading: false,
            requestsUnavailable: false,
          })
        }
      >
        Publish Requests ready
      </button>
      <button
        type="button"
        onClick={() => replaceAdapter(makeAdapter("identity-one"))}
      >
        Replace runtime owner
      </button>
      <button
        type="button"
        onClick={() =>
          adapter.publish({
            identity: { deviceId: "identity-two", deviceName: "New Identity" },
          })
        }
      >
        Rotate identity
      </button>
      <button type="button" onClick={() => adapter.publish({ pending: [] })}>
        Publish no pending requests
      </button>
      <button
        type="button"
        onClick={() =>
          setNavigationResult(
            session.acceptDestination(
              `scenario-settings-${revision}`,
              { kind: "settings", category: "general" },
              { ready: true, clipIds: [], requestIds: [] }
            )
          )
        }
      >
        Attempt Settings navigation
      </button>
      <output data-testid="navigation-result">{navigationResult}</output>
    </aside>
  );
}

function Scenario() {
  const [adapter, setAdapter] = useState(() => makeAdapter("identity-one"));
  return (
    <>
      <ScenarioControls adapter={adapter} replaceAdapter={setAdapter} />
      <ClipboardWorkspace adapter={adapter} session={session} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Scenario />);
