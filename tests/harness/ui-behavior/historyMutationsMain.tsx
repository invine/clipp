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
const targetListeners = new Set<() => void>();
let requestedEffects: string[] = [];
let requestedTargets: string[] = [];
const session = createUiSession();
session.update(
  window.location.search.includes("history")
    ? { destination: "history" }
    : { destination: "settings", settingsCategory: "advanced" }
);

function notify() {
  listeners.forEach((listener) => listener());
}

function noteTarget(target: string) {
  requestedTargets = [...requestedTargets, target];
  targetListeners.forEach((listener) => listener());
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
const otherClip: Clip = {
  id: "clip-two",
  type: "url",
  content: "https://example.test/remote-clip",
  originPeerId: "remote-device",
  capturedAt: 2,
  shareExpiresAt: 3,
};
const atLocalTime = (hours: number, minutes: number) => {
  const capturedAt = new Date();
  capturedAt.setHours(hours, minutes, 0, 0);
  return capturedAt.getTime();
};
clip.capturedAt = atLocalTime(11, 22);
otherClip.capturedAt = atLocalTime(11, 14);
clip.shareExpiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
otherClip.shareExpiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;

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
  const targets = useSyncExternalStore(
    (listener) => {
      targetListeners.add(listener);
      return () => targetListeners.delete(listener);
    },
    () => JSON.stringify(requestedTargets),
    () => JSON.stringify(requestedTargets)
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
      <button type="button" onClick={() => rejectNext("copy")}>
        Resolve Copy: failure
      </button>
      <button type="button" onClick={() => resolveNext("copy", "complete")}>
        Resolve Copy: success
      </button>
      <button type="button" onClick={() => rejectNext("delete")}>
        Resolve Delete: failure
      </button>
      <button type="button" onClick={() => resolveNext("delete")}>
        Resolve Delete: success
      </button>
      <output data-testid="history-effects">{JSON.stringify(effects)}</output>
      <output data-testid="history-targets">{targets}</output>
    </aside>
  );
}

let dynamicProps: ClipboardAppProps;
const previewConnection = new URLSearchParams(window.location.search).get("connection");
const connectedPreview = previewConnection === "direct" || previewConnection === "relay";
const props: ClipboardAppProps = {
  clips: [clip, otherClip],
  devices: [{ deviceId: "remote-device", deviceName: connectedPreview ? "Pixel 9" : "Remote Device" }],
  pending: [],
  peers: connectedPreview ? ["remote-device"] : [],
  ...(connectedPreview
    ? {
        connectionStateKnown: true,
        peerConnections: [
          { peerId: "remote-device", path: previewConnection === "direct" ? "direct" : "relay", hasDirect: previewConnection === "direct", hasRelay: previewConnection === "relay", addrs: [] },
        ],
      }
    : {}),
  identity: { deviceId: "scenario-device", deviceName: connectedPreview ? "Desktop" : "Scenario Device" },
  pinnedIds: connectedPreview ? ["clip-one"] : [],
  session,
  onDeleteClip: async (id) => {
    noteTarget(`delete:${id}`);
    await request("delete");
    dynamicProps = {
      ...dynamicProps,
      clips: dynamicProps.clips.filter((item) => item.id !== id),
      pinnedIds: dynamicProps.pinnedIds.filter((pinnedId) => pinnedId !== id),
    };
    historyStore.publish(dynamicProps);
  },
  onUnpair: unavailable,
  onAccept: unavailable,
  onReject: unavailable,
  onPairText: async () => ({ ok: false, error: "outcome_unconfirmed" }),
  onRequestPairingCode: unavailable,
  onCopyPairingText: unavailable,
  onReuseClip: async (id) => {
    noteTarget(`copy:${id}`);
    return (await request("copy")) as "complete";
  },
  onShareNow: unavailable,
  onSetPinned: async (id, pinned) => {
    noteTarget(`pin:${id}`);
    await request("pin");
    const pinnedIds = new Set(dynamicProps.pinnedIds);
    if (pinned) pinnedIds.add(id);
    else pinnedIds.delete(id);
    dynamicProps = { ...dynamicProps, pinnedIds: [...pinnedIds] };
    historyStore.publish(dynamicProps);
  },
  onClearAll: async () => {
    await request("clear");
  },
  onRetryHistoryRefresh: async () => {
    return (await request("refresh")) as boolean;
  },
};
dynamicProps = props;
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
