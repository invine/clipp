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

function publishConnection(
  mode:
    | "unknown"
    | "offline"
    | "direct"
    | "relayed"
    | "attention"
    | "starting"
    | "waiting"
    | "idle"
) {
  const peer = "scenario-peer";
  const connected = mode === "direct" || mode === "relayed";
  const relay = {
    key: "scenario-relay",
    name: "Scenario relay",
    kind: "managed" as const,
    discoveryUrl: "https://relay.example.test/v1/relay",
  };
  const configured = ["attention", "starting", "waiting"].includes(mode);
  adapter.publish({
    ...props,
    devices: ["offline", "direct", "relayed", "attention"].includes(mode)
      ? [{ deviceId: peer, deviceName: "Scenario Peer" }]
      : [],
    peers: connected || mode === "attention" ? [peer] : [],
    connectionStateKnown: mode !== "unknown",
    peerConnections:
      mode === "direct" || mode === "attention"
        ? [
            {
              peerId: peer,
              path: "direct",
              hasDirect: true,
              hasRelay: false,
              addrs: [],
            },
          ]
        : mode === "relayed"
          ? [
              {
                peerId: peer,
                path: "relay",
                hasDirect: false,
                hasRelay: true,
                addrs: [],
              },
            ]
          : [],
    managedRelayConfigurations: configured ? [relay] : [],
    managedRelayStates:
      mode === "attention"
        ? [
            {
              key: relay.key,
              name: relay.name,
              kind: relay.kind,
              status: "degraded",
              warning: "Relay renewal needs attention",
            },
          ]
        : mode === "waiting"
          ? [
              {
                key: relay.key,
                name: relay.name,
                kind: relay.kind,
                status: "ready",
              },
            ]
          : [],
  });
}

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
    adapter.publish(props);
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
      <fieldset>
        <legend>Publish connection observation</legend>
        <button type="button" onClick={() => publishConnection("unknown")}>
          Unknown
        </button>
        <button type="button" onClick={() => publishConnection("offline")}>
          Offline
        </button>
        <button type="button" onClick={() => publishConnection("direct")}>
          Direct
        </button>
        <button type="button" onClick={() => publishConnection("relayed")}>
          Relayed
        </button>
        <button type="button" onClick={() => publishConnection("attention")}>
          Attention
        </button>
        <button type="button" onClick={() => publishConnection("starting")}>
          Starting
        </button>
        <button type="button" onClick={() => publishConnection("waiting")}>
          Waiting
        </button>
        <button type="button" onClick={() => publishConnection("idle")}>
          Idle
        </button>
      </fieldset>
      <nav aria-label="Scenario catalog">
        <h2>Open a scenario</h2>
        <ul>
          <li>
            <a href="/pairing-code.html">Pairing code and scanning</a>
          </li>
          <li>
            <a href="/clip-actions.html">Clip actions and Share Now</a>
          </li>
          <li>
            <a href="/history-mutations.html">History mutations</a>
          </li>
          <li>
            <a href="/device-management.html">Device naming and revocation</a>
          </li>
          <li>
            <a href="/relay-management.html">Relay management</a>
          </li>
          <li>
            <a href="/settings-recovery.html">Preferences and recovery</a>
          </li>
          <li>
            <a href="/notification-journeys.html">Notifications</a>
          </li>
          <li>
            <a href="/background-continuity.html">Background controls</a>
          </li>
          <li>
            <a href="/identity-reset.html">Identity reset and rotation</a>
          </li>
          <li>
            <a href="/trust-requests.html">Trust Requests</a>
          </li>
        </ul>
      </nav>
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
