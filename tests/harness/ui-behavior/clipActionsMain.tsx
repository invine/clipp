import React, { useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import type { ReuseClipOutcome } from "../../../packages/ui/src/clipboardActionFeedback";
import { browserUiHost } from "../../../packages/ui/src/runtimeAdapter";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

type Deferred<T> = {
  resolve(value: T): void;
  reject(reason: unknown): void;
};

const clips = [
  {
    id: "clip-1",
    type: "text" as const,
    content: "saved phrase",
    originPeerId: "scenario-device",
    capturedAt: 1_700_000_000_000,
    shareExpiresAt: 1_900_000_000_000,
  },
];
const session = createUiSession();
session.update({ destination: "history" });
const pendingReuse: Array<Deferred<ReuseClipOutcome>> = [];
const pendingShare: Array<Deferred<void>> = [];
let effects: string[] = [];
let publishEffects = () => {};

function createAdapter(label: string) {
  const unavailable = async (): Promise<never> => {
    throw new Error(`Unexpected scripted effect for ${label}`);
  };
  const props: ClipboardAppProps = {
    clips,
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
    onReuseClip: async (id) => {
      effects = [...effects, `${label}:reuse:${id}`];
      publishEffects();
      return await new Promise<ReuseClipOutcome>((resolve, reject) => {
        pendingReuse.push({ resolve, reject });
      });
    },
    onShareNow: async () => {
      effects = [...effects, `${label}:share-current`];
      publishEffects();
      return await new Promise<void>((resolve, reject) => {
        pendingShare.push({ resolve, reject });
      });
    },
    onSetPinned: unavailable,
    onClearAll: unavailable,
  };
  return createUiRuntimeStore(props, {
    copyText: async () => {
      throw new Error("Scripted action must not write the system clipboard");
    },
    confirm: async () => {
      throw new Error("Scripted action must not open a native confirmation");
    },
  });
}

const initialAdapter = createAdapter("first");

function ScenarioRoot() {
  const [adapter, setAdapter] = useState(initialAdapter);
  const [, updateEffects] = useReducer((value) => value + 1, 0);
  publishEffects = updateEffects;
  return (
    <>
      <nav aria-label="Scenario runtime controls">
        <button
          type="button"
          onClick={() => pendingReuse.shift()?.resolve("complete")}
        >
          Resolve reuse: complete
        </button>
        <button
          type="button"
          onClick={() => pendingReuse.shift()?.resolve("copied-without-clip")}
        >
          Resolve reuse: copied without Clip
        </button>
        <button
          type="button"
          onClick={() => pendingReuse.shift()?.resolve("unconfirmed")}
        >
          Resolve reuse: unconfirmed
        </button>
        <button
          type="button"
          onClick={() =>
            pendingShare.shift()?.reject({ code: "clipboard_read_failed" })
          }
        >
          Resolve Share Now: read failure
        </button>
        <button type="button" onClick={() => pendingShare.shift()?.resolve()}>
          Resolve Share Now: success
        </button>
        <button
          type="button"
          onClick={() => setAdapter(createAdapter("replacement"))}
        >
          Replace runtime adapter
        </button>
        <output data-testid="requested-effects">
          {JSON.stringify(effects)}
        </output>
      </nav>
      <ClipboardWorkspace
        adapter={adapter}
        session={session}
        pairingDiagnostics={<span>Clipboard action scripted scenario</span>}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<ScenarioRoot />);
