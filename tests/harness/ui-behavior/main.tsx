import React, { useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createScriptedUiRuntimeAdapter } from "../../../packages/ui/src/scriptedUiRuntimeAdapter";
import type { PairingSubmissionResult } from "../../../packages/core/pairing/results";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./scenario.css";

const session = createUiSession();
session.update({ destination: "devices" });

const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected runtime effect in scripted Pairing scenario");
};
const props: ClipboardAppProps = {
  clips: [],
  devices: [],
  pending: [],
  peers: [],
  identity: { deviceId: "scenario-device", deviceName: "Scenario Device" },
  pinnedIds: [],
  session,
  onDeleteClip: unavailable,
  onUnpair: unavailable,
  onAccept: unavailable,
  onReject: unavailable,
  onPairText: async () => ({ ok: false, error: "outcome_unconfirmed" }),
  onRequestPairingCode: unavailable,
  onCopyPairingText: unavailable,
  onReuseClip: unavailable,
  onShareNow: unavailable,
  onSetPinned: unavailable,
  onClearAll: unavailable,
};
const adapter = createScriptedUiRuntimeAdapter(props);

function ScenarioControls() {
  const [navigationResult, setNavigationResult] = useState("none");
  const navigationSequence = useRef(0);
  const effects = useSyncExternalStore(
    adapter.subscribeEffects,
    adapter.getEffects,
    adapter.getEffects
  );
  function settle(result: PairingSubmissionResult) {
    adapter.completeNext(result);
  }
  function reset() {
    session.close();
    session.pairing.discard();
    session.update({ destination: "devices" });
    adapter.clearEffects();
    setNavigationResult("none");
  }
  return (
    <aside aria-label="Scenario controls">
      <h1>Pairing submission scenario</h1>
      <button
        type="button"
        onClick={() =>
          settle({ ok: false, error: "transport_policy_rejected" })
        }
      >
        Resolve Pairing: failure
      </button>
      <button type="button" onClick={() => settle({ ok: true })}>
        Resolve Pairing: success
      </button>
      <button type="button" onClick={reset}>
        Reset scenario
      </button>
      <button
        type="button"
        onClick={() =>
          setNavigationResult(
            session.acceptDestination(
              `scenario-settings-${++navigationSequence.current}`,
              { kind: "settings", category: "general" },
              { ready: true, clipIds: [], requestIds: [] }
            )
          )
        }
      >
        Attempt Settings navigation
      </button>
      <button
        type="button"
        onClick={() =>
          setNavigationResult(
            session.acceptDestination(
              `scenario-notification-${++navigationSequence.current}`,
              { kind: "requests" },
              { ready: true, clipIds: [], requestIds: [] },
              "notification"
            )
          )
        }
      >
        Open Requests notification
      </button>
      <output data-testid="navigation-result">{navigationResult}</output>
      <h2>Requested Pairing effects</h2>
      <output data-testid="pairing-effects" aria-live="polite">
        {JSON.stringify(effects)}
      </output>
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(
  <ClipboardWorkspace
    adapter={adapter}
    session={session}
    pairingDiagnostics={<ScenarioControls />}
  />
);
