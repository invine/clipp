import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ManagedRelaySettings } from "../../../packages/ui/src/ManagedRelaySettings";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays";
import type { RelayMutation } from "../../../packages/core/network/relayMutations";
import type { RelayActionResult } from "../../../packages/core/network/relayActions";
import type { RelayMutationResult } from "../../../packages/core/network/relayMutations";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

type DeferredAction = {
  kind: string;
  resolve(value: unknown): void;
};
const deferredActions: DeferredAction[] = [];
const effectListeners = new Set<() => void>();
let requestedEffects: string[] = [];
function notifyEffects() {
  effectListeners.forEach((listener) => listener());
}
function request<T>(kind: string, detail: unknown): Promise<T> {
  requestedEffects = [...requestedEffects, JSON.stringify({ kind, detail })];
  notifyEffects();
  return new Promise<T>((resolve) =>
    deferredActions.push({ kind, resolve: (value) => resolve(value as T) })
  );
}
const relayA: RelayConfiguration = {
  key: "relay-a",
  name: "Relay A",
  kind: "managed",
  discoveryUrl: "https://relay.example/v1/relay",
};
const relayB: RelayConfiguration = {
  key: "relay-b",
  name: "Explicit Relay",
  kind: "explicit",
  peerId: "12D3KooWRelayPeer",
  addresses: ["/ip4/192.0.2.2/tcp/4001/p2p/12D3KooWRelayPeer"],
};

function Scenario() {
  const [session] = useState(() => {
    const current = createUiSession();
    current.update({ destination: "settings", settingsCategory: "relays" });
    return current;
  });
  const sessionState = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const [configurations, setConfigurations] = useState<RelayConfiguration[]>(
    []
  );
  const [states, setStates] = useState<RelayState[]>([]);
  const effects = useSyncExternalStore(
    (listener) => {
      effectListeners.add(listener);
      return () => effectListeners.delete(listener);
    },
    () => requestedEffects,
    () => requestedEffects
  );

  const onMutate = (mutation: RelayMutation) =>
    request<RelayMutationResult>("mutation", mutation);
  const onLogin = (key: string) => request<RelayActionResult>("login", { key });
  const onManageAccount = (key: string) =>
    request<RelayActionResult>("account", { key });
  const onRetry = (key: string) => request<RelayActionResult>("retry", { key });
  const onRefresh = () =>
    request<RelayConfiguration[]>("refresh", { configurations });

  function publishManagedRelay() {
    setConfigurations([relayA]);
    setStates([
      {
        key: relayA.key,
        name: relayA.name,
        kind: relayA.kind,
        status: "login_needed",
      },
    ]);
  }
  function publishDegradedRelay() {
    setStates([
      {
        key: relayA.key,
        name: relayA.name,
        kind: relayA.kind,
        status: "degraded",
        reason: "rendezvous_unavailable",
      },
    ]);
  }
  function publishExplicitRelay() {
    setConfigurations([relayB]);
    setStates([
      {
        key: relayB.key,
        name: relayB.name,
        kind: relayB.kind,
        status: "ready",
      },
    ]);
  }
  function resolveNext(kind: string, value: unknown) {
    const index = deferredActions.findIndex((action) => action.kind === kind);
    if (index < 0) return;
    deferredActions.splice(index, 1)[0].resolve(value);
  }
  return (
    <main>
      {sessionState.destination === "settings" ? (
        <ManagedRelaySettings
          configurations={configurations}
          states={states}
          session={session}
          onMutate={onMutate}
          onRefresh={onRefresh}
          onLogin={onLogin}
          onManageAccount={onManageAccount}
          onRetry={onRetry}
        />
      ) : (
        <section aria-label="Requests page">
          <h2>Requests</h2>
          <button type="button" onClick={() => session.back()}>
            Return to relay editor
          </button>
        </section>
      )}
      <aside aria-label="Relay scenario controls">
        <h1>Relay management scenario</h1>
        <button type="button" onClick={publishManagedRelay}>
          Publish managed relay
        </button>
        <button type="button" onClick={publishExplicitRelay}>
          Publish explicit relay
        </button>
        <button type="button" onClick={publishDegradedRelay}>
          Publish degraded relay status
        </button>
        <button
          type="button"
          onClick={() =>
            session.acceptDestination(
              `notification-${Date.now()}`,
              { kind: "requests" },
              { ready: true, clipIds: [], requestIds: [] },
              "notification"
            )
          }
        >
          Open Requests notification
        </button>
        <button
          type="button"
          onClick={() =>
            resolveNext("mutation", {
              status: "rejected",
              configurations,
              configurationApplied: false,
              credentialsRemoved: [],
              error: "relay edit was rejected",
            })
          }
        >
          Resolve pending effect: rejected
        </button>
        <button
          type="button"
          onClick={() => resolveNext("login", { status: "authenticated" })}
        >
          Resolve pending effect: authenticated
        </button>
        <button
          type="button"
          onClick={() => resolveNext("account", { status: "portal-opened" })}
        >
          Resolve pending effect: portal opened
        </button>
        <button
          type="button"
          onClick={() =>
            resolveNext("retry", {
              status: "rejected",
              error: "retry rejected",
            })
          }
        >
          Resolve pending effect: retry rejected
        </button>
        <button
          type="button"
          onClick={() =>
            resolveNext("mutation", {
              status: "unconfirmed",
              configurations,
              configurationApplied: false,
              credentialsRemoved: [],
              error: "Check the current relay list before retrying.",
            })
          }
        >
          Resolve pending effect: unconfirmed
        </button>
        <button
          type="button"
          onClick={() => {
            setConfigurations([]);
            resolveNext("mutation", {
              status: "applied",
              configurations: [],
              configurationApplied: true,
              credentialsRemoved: [],
            });
          }}
        >
          Resolve pending effect: removed
        </button>
        <h2>Requested runtime effects</h2>
        <output data-testid="relay-effects">{JSON.stringify(effects)}</output>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Scenario />);
