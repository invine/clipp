import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type {
  IdentityResetResult,
  IdentityResetState,
} from "../../../packages/core/trust/manualIdentityReset";
import type { Identity } from "../../../packages/ui/src/types";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./scenario.css";

type Bundle = ReturnType<typeof createBundle>;
let beginCount = 0;
let reconcileCount = 0;
let resumeCount = 0;
let copyEvents: string[] = [];
let pendingBegin: ((result: IdentityResetResult) => void) | null = null;
let reconcileResult: IdentityResetState = {
  phase: "quiescing",
  operationId: "reset-operation",
};

const session = createUiSession();
session.update({ destination: "settings", settingsCategory: "advanced" });
const baseIdentity: Identity = {
  deviceId: "former-peer",
  deviceName: "Former device",
};

function createBundle(identity: Identity, available: boolean) {
  let props: ClipboardAppProps = {
    clips: [],
    devices: [],
    pending: [],
    peers: [],
    identity,
    pinnedIds: [],
    session,
    manualIdentityResetAvailable: available,
    identityResetState: { phase: "idle" },
    identityResetActions: {
      begin: async (request) => {
        beginCount += 1;
        return await new Promise<IdentityResetResult>((resolve) => {
          pendingBegin = resolve;
          void request;
        });
      },
      reconcile: async () => {
        reconcileCount += 1;
        return reconcileResult;
      },
      resume: async () => {
        resumeCount += 1;
        return {
          outcome: "accepted",
          state: { phase: "cleaning", operationId: "reset-operation" },
        };
      },
      dismiss: async () => ({ phase: "idle" }),
    },
    onCopyFormerIdentity: async (receipt) => {
      copyEvents = [...copyEvents, receipt.formerPeerId];
    },
    onDeleteClip: async () => {},
    onUnpair: async () => {},
    onAccept: async () => ({ ok: true, admitted: true }),
    onReject: async () => ({ ok: true, admitted: false }),
    onPairText: async () => ({ ok: false, error: "outcome_unconfirmed" }),
    onRequestPairingCode: async () => null,
    onCopyPairingText: async () => ({ status: "copied" }),
    onReuseClip: async () => "complete" as const,
    onShareNow: async () => {},
    onSetPinned: async () => {},
    onClearAll: async () => {},
  };
  const adapter = createUiRuntimeStore(props, {
    copyText: async (text) => {
      copyEvents = [...copyEvents, text];
    },
    confirm: async () => true,
  });
  return {
    adapter,
    publish(fields: Partial<ClipboardAppProps>) {
      props = { ...props, ...fields };
      adapter.publish(props);
    },
  };
}

function ScenarioControls({ initial }: { initial: Bundle }) {
  const [owner, setOwner] = useState(initial);
  const sessionState = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const [observation, setObservation] = useState("idle");
  const [outputVersion, setOutputVersion] = useState(0);

  function resolveBegin(result: IdentityResetResult) {
    const resolve = pendingBegin;
    pendingBegin = null;
    resolve?.(result);
  }

  function nextReconcileState() {
    reconcileResult = { phase: "quiescing", operationId: "reset-operation" };
    setObservation("quiescing");
  }

  function publishPhase(phase: IdentityResetState) {
    owner.publish({ identityResetState: phase });
    setObservation(phase.phase);
  }

  function publishIdentity() {
    owner.publish({
      identity: { deviceId: "new-peer", deviceName: "New device" },
      identityResetState: {
        phase: "checking",
        operationId: "new-identity-operation",
        error: "storage_unavailable",
      },
    });
    setObservation("new identity checking");
  }

  function setNewIdentityContext() {
    session.update({ search: "new identity search" });
    setObservation("new identity context ready");
  }

  function replaceRuntimeOwner() {
    const replacement = createBundle(
      { deviceId: "former-peer", deviceName: "Former device" },
      true
    );
    replacement.publish({
      identityResetState: {
        phase: "checking",
        operationId: "replacement-operation",
        error: "storage_unavailable",
      },
    });
    setOwner(replacement);
    setObservation("replacement runtime published");
  }

  return (
    <>
      <ClipboardWorkspace adapter={owner.adapter} session={session} />
      <aside
        className="ui-scenario-controls"
        aria-label="Identity reset scenario controls"
      >
        <h1>Identity reset scenario</h1>
        <button
          type="button"
          onClick={() => owner.publish({ manualIdentityResetAvailable: true })}
        >
          Use scripted reset capability
        </button>
        <button type="button" onClick={nextReconcileState}>
          Set current reset phase: quiescing
        </button>
        <button
          type="button"
          onClick={() =>
            resolveBegin({
              outcome: "outcome-unconfirmed",
              state: {
                phase: "checking",
                operationId: "reset-operation",
                error: "invalid_reset_state",
              },
            })
          }
        >
          Resolve reset: unconfirmed
        </button>
        <button
          type="button"
          onClick={() =>
            resolveBegin({
              outcome: "accepted",
              state: { phase: "accepted", operationId: "reset-operation" },
            })
          }
        >
          Resolve reset: accepted
        </button>
        <button type="button" onClick={() => publishIdentity()}>
          Publish Identity Rotation
        </button>
        <button type="button" onClick={setNewIdentityContext}>
          Set new identity context
        </button>
        <button type="button" onClick={replaceRuntimeOwner}>
          Replace runtime owner
        </button>
        <button
          type="button"
          onClick={() =>
            publishPhase({
              phase: "completed",
              operationId: "reset-operation",
              completedOperation: {
                operationId: "reset-operation",
                generatedPeerId: "new-peer",
              },
              receipt: {
                receiptId: "reset-operation",
                operationId: "reset-operation",
                formerPeerId: "former-peer",
                generatedPeerId: "new-peer",
                completedAt: 1700000000000,
              },
              restartRequired: true,
            })
          }
        >
          Publish completed reset
        </button>
        <button
          type="button"
          onClick={() =>
            publishPhase({
              phase: "idle",
              receipt: {
                receiptId: "reset-operation",
                operationId: "reset-operation",
                formerPeerId: "former-peer",
                generatedPeerId: "new-peer",
                completedAt: 1700000000000,
              },
            })
          }
        >
          Publish previous identity reminder
        </button>
        <button
          type="button"
          onClick={() => setOutputVersion((version) => version + 1)}
        >
          Refresh scenario outputs
        </button>
        <output data-version={outputVersion} data-testid="reset-effects">
          {JSON.stringify({
            beginCount,
            reconcileCount,
            resumeCount,
            copyEvents,
          })}
        </output>
        <output data-testid="reset-observation">{observation}</output>
        <output data-testid="session-context">
          {JSON.stringify({
            search: sessionState.search,
            tasks: sessionState.tasks.length,
          })}
        </output>
      </aside>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <ScenarioControls initial={createBundle(baseIdentity, false)} />
);
