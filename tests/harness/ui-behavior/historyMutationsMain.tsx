import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import type { Clip } from "../../../packages/core/models/Clip";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

type Deferred = {
  kind: string;
  resolve(value?: unknown): void;
  reject(error: Error): void;
};

const deferred: Deferred[] = [];
let nextClip = true;
const listeners = new Set<() => void>();
let requestedEffects: string[] = [];
const session = createUiSession();
session.update(
  window.location.search.includes("history")
    ? { destination: "history" }
    : { destination: "settings", settingsCategory: "advanced" }
);

function notify() {
  listeners.forEach((listener) => listener());
}

function request(kind: string): Promise<unknown> {
  requestedEffects = [...requestedEffects, kind];
  notify();
  return new Promise((resolve, reject) => {
    deferred.push({ kind, resolve, reject });
  });
}

const clip: Clip = {
  id: "clip-one",
  type: "text",
  content: "History mutation target",
  originPeerId: "scenario-device",
  capturedAt: 1,
  shareExpiresAt: 2,
};

const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected runtime effect in History scenario");
};

function ScenarioControls() {
  const effects = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requestedEffects,
    () => requestedEffects
  );
  function resolveNext(kind: string, value?: unknown) {
    const index = deferred.findIndex((action) => action.kind === kind);
    if (index >= 0) deferred.splice(index, 1)[0].resolve(value);
  }
  function rejectNext(kind: string) {
    const index = deferred.findIndex((action) => action.kind === kind);
    if (index >= 0)
      deferred.splice(index, 1)[0].reject(new Error(`${kind} failed`));
  }
  function confirmHistoryRefresh() {
    const index = deferred.findIndex((action) => action.kind === "refresh");
    if (index < 0) return;
    const action = deferred.splice(index, 1)[0];
    nextClip = false;
    historyStore.publish({ ...props, clips: nextClip ? [clip] : [] });
    action.resolve(true);
  }
  return (
    <aside aria-label="History scenario controls">
      <h1>History mutations scenario</h1>
      <button type="button" onClick={() => rejectNext("clear")}>
        Resolve Clear: uncertain
      </button>
      <button type="button" onClick={() => resolveNext("clear")}>
        Resolve Clear: success
      </button>
      <button type="button" onClick={() => rejectNext("refresh")}>
        Resolve Refresh: failure
      </button>
      <button type="button" onClick={confirmHistoryRefresh}>
        Resolve Refresh: confirmed
      </button>
      <button type="button" onClick={() => rejectNext("pin")}>
        Resolve Pin: failure
      </button>
      <button type="button" onClick={() => resolveNext("pin")}>
        Resolve Pin: success
      </button>
      <button type="button" onClick={() => rejectNext("delete")}>
        Resolve Delete: failure
      </button>
      <button type="button" onClick={() => resolveNext("delete")}>
        Resolve Delete: success
      </button>
      <output data-testid="history-effects">{JSON.stringify(effects)}</output>
    </aside>
  );
}

const props: ClipboardAppProps = {
  clips: [clip],
  devices: [],
  pending: [],
  peers: [],
  identity: { deviceId: "scenario-device", deviceName: "Scenario Device" },
  pinnedIds: [],
  session,
  onDeleteClip: async () => {
    await request("delete");
  },
  onUnpair: unavailable,
  onAccept: unavailable,
  onReject: unavailable,
  onPairText: async () => ({ ok: false, error: "outcome_unconfirmed" }),
  onRequestPairingCode: unavailable,
  onCopyPairingText: unavailable,
  onReuseClip: unavailable,
  onShareNow: unavailable,
  onSetPinned: async () => {
    await request("pin");
  },
  onClearAll: async () => {
    await request("clear");
  },
  onRetryHistoryRefresh: async () => {
    return (await request("refresh")) as boolean;
  },
};
const historyStore = createUiRuntimeStore(props);
const adapter = {
  ...historyStore,
  subscribe(listener: () => void) {
    return historyStore.subscribe(listener);
  },
  publish(next: ClipboardAppProps) {
    historyStore.publish(next);
  },
};

createRoot(document.getElementById("root")!).render(
  <ClipboardWorkspace
    adapter={adapter}
    session={session}
    pairingDiagnostics={
      window.location.search.includes("history") ? (
        <ScenarioControls />
      ) : undefined
    }
    historyDiagnostics={<ScenarioControls />}
  />
);
