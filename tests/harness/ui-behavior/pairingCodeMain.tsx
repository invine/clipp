import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { PairingSubmissionResult } from "../../../packages/core/pairing/results";
import type { PairingCode } from "../../../packages/core/pairing/qrCode";
import type { PayloadCopyResult } from "../../../packages/core/clipboard/payloadCopy";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import type {
  CameraPermissionState,
  PairingScanResult,
} from "../../../packages/ui/src/pairingScan";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./scenario.css";

type Deferred<T> = { resolve(value: T): void };

const session = createUiSession();
session.update({ destination: "devices" });
let identityGeneration = 0;
let permission: CameraPermissionState = "unknown";
const permissionListeners = new Set<() => void>();
const codeResults: Deferred<PairingCode | null>[] = [];
const copyResults: Deferred<PayloadCopyResult>[] = [];
const scanResults: Deferred<PairingScanResult>[] = [];
const pairingResults: Deferred<PairingSubmissionResult>[] = [];
const effectListeners = new Set<() => void>();
let effectVersion = 0;
const codeEffects: number[] = [];
const copyEffects: string[] = [];
const scanEffects: AbortSignal[] = [];
const pairingEffects: string[] = [];
function changed() {
  effectVersion++;
  effectListeners.forEach((listener) => listener());
}
function replaceIdentity() {
  identityGeneration++;
  adapter.publish({
    ...props,
    identity: {
      deviceId: `pairing-code-scenario-${identityGeneration}`,
      deviceName: "Scenario",
    },
  });
}

const props: ClipboardAppProps = {
  clips: [],
  devices: [],
  pending: [],
  peers: [],
  identity: { deviceId: "pairing-code-scenario-0", deviceName: "Scenario" },
  pinnedIds: [],
  session,
  onDeleteClip: async () => {
    throw new Error("unexpected effect");
  },
  onUnpair: async () => {
    throw new Error("unexpected effect");
  },
  onAccept: async () => {
    throw new Error("unexpected effect");
  },
  onReject: async () => {
    throw new Error("unexpected effect");
  },
  onPairText: async (text) => {
    pairingEffects.push(text);
    changed();
    return await new Promise<PairingSubmissionResult>((resolve) => {
      pairingResults.push({ resolve });
    });
  },
  onRequestPairingCode: async () => {
    codeEffects.push(codeEffects.length + 1);
    changed();
    return await new Promise<PairingCode | null>((resolve) => {
      codeResults.push({ resolve });
    });
  },
  onCopyPairingText: async (text) => {
    copyEffects.push(text);
    changed();
    return await new Promise<PayloadCopyResult>((resolve) => {
      copyResults.push({ resolve });
    });
  },
  onScanPairingCode: async ({ signal }) => {
    scanEffects.push(signal);
    changed();
    signal.addEventListener("abort", changed, { once: true });
    return await new Promise<PairingScanResult>((resolve) => {
      scanResults.push({ resolve });
    });
  },
  scanCameraPermission: {
    read: async () => permission,
    subscribeReturn(listener) {
      permissionListeners.add(listener);
      return () => permissionListeners.delete(listener);
    },
  },
  onReuseClip: async () => "complete" as const,
  onShareNow: async () => undefined,
  onSetPinned: async () => undefined,
  onClearAll: async () => undefined,
};
const adapter = createUiRuntimeStore(props);

function PairingCodeControls() {
  useSyncExternalStore(
    (listener) => {
      effectListeners.add(listener);
      return () => effectListeners.delete(listener);
    },
    () => effectVersion,
    () => 0
  );
  function returnFromPermissionSettings(next: CameraPermissionState) {
    permission = next;
    permissionListeners.forEach((listener) => listener());
  }
  return (
    <aside aria-label="Pairing code scenario controls">
      <h2>Pairing code diagnostics</h2>
      <button type="button" onClick={() => codeResults.shift()?.resolve(null)}>
        Resolve code: failure
      </button>
      <button
        type="button"
        onClick={() =>
          codeResults.shift()?.resolve({
            image: "data:image/png;base64,c2NlbmFyaW8=",
            text: "clipp://scenario-pairing-target",
          })
        }
      >
        Resolve code: success
      </button>
      <button
        type="button"
        onClick={() => copyResults.shift()?.resolve({ status: "rejected" })}
      >
        Resolve copy: rejected
      </button>
      <button
        type="button"
        onClick={() => copyResults.shift()?.resolve({ status: "unconfirmed" })}
      >
        Resolve copy: unconfirmed
      </button>
      <button
        type="button"
        onClick={() => scanResults.shift()?.resolve({ status: "cancelled" })}
      >
        Resolve scan: cancelled
      </button>
      <button
        type="button"
        onClick={() =>
          scanResults
            .shift()
            ?.resolve({ status: "failed", error: "camera_permission_denied" })
        }
      >
        Resolve scan: permission denied
      </button>
      <button
        type="button"
        onClick={() =>
          scanResults
            .shift()
            ?.resolve({ status: "failed", error: "camera_unavailable" })
        }
      >
        Resolve scan: camera failure
      </button>
      <button
        type="button"
        onClick={() =>
          scanResults
            .shift()
            ?.resolve({ status: "scanned", text: " scanned-target " })
        }
      >
        Resolve scan: target
      </button>
      <button
        type="button"
        onClick={() => returnFromPermissionSettings("granted")}
      >
        Return from permission settings: granted
      </button>
      <button
        type="button"
        onClick={() => pairingResults.shift()?.resolve({ ok: true })}
      >
        Resolve Pairing: success
      </button>
      <button type="button" onClick={replaceIdentity}>
        Replace Device Identity
      </button>
      <output data-testid="code-effects">{codeEffects.length}</output>
      <output data-testid="copy-effects">{JSON.stringify(copyEffects)}</output>
      <output data-testid="scan-effects">{scanEffects.length}</output>
      <output data-testid="scan-aborted">
        {String(scanEffects.at(-1)?.aborted ?? false)}
      </output>
      <output data-testid="pairing-effects">
        {JSON.stringify(pairingEffects)}
      </output>
    </aside>
  );
}

function LateScanControls({
  replaceRuntimeOwner,
}: {
  replaceRuntimeOwner(): void;
}) {
  useSyncExternalStore(
    (listener) => {
      effectListeners.add(listener);
      return () => effectListeners.delete(listener);
    },
    () => effectVersion,
    () => 0
  );
  return (
    <details data-testid="late-scan-controls">
      <summary>Late scan controls</summary>
      <button
        type="button"
        onClick={() =>
          scanResults
            .shift()
            ?.resolve({ status: "scanned", text: "late-target" })
        }
      >
        Resolve late scan after task close
      </button>
      <button type="button" onClick={replaceIdentity}>
        Replace Device Identity
      </button>
      <button type="button" onClick={replaceRuntimeOwner}>
        Replace runtime adapter
      </button>
      <button
        type="button"
        onClick={() =>
          codeResults.shift()?.resolve({
            image: "data:image/png;base64,c2NlbmFyaW8=",
            text: "clipp://obsolete-pairing-target",
          })
        }
      >
        Resolve late QR generation
      </button>
      <output data-testid="late-pairing-effects">
        {JSON.stringify(pairingEffects)}
      </output>
      <output data-testid="late-scan-aborted">
        {String(scanEffects.at(-1)?.aborted ?? false)}
      </output>
    </details>
  );
}

function PairingCodeScenario() {
  const [runtimeAdapter, setRuntimeAdapter] = useState(adapter);
  return (
    <ClipboardWorkspace
      adapter={runtimeAdapter}
      session={session}
      pairingDiagnostics={
        <LateScanControls
          replaceRuntimeOwner={() =>
            setRuntimeAdapter(createUiRuntimeStore(props))
          }
        />
      }
      pairingTaskDiagnostics={
        <details data-testid="pairing-code-controls">
          <summary>Pairing code diagnostics</summary>
          <PairingCodeControls />
        </details>
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<PairingCodeScenario />);
