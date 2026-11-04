import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import type { Device } from "../../../packages/ui/src/types";
import type {
  UiHostEffects,
  UiRuntimeAdapter,
} from "../../../packages/ui/src/runtimeAdapter";
import type {
  PairingApprovalResult,
  PairingSubmissionResult,
} from "../../../packages/core/pairing/results";
import type { PayloadCopyResult } from "../../../packages/core/clipboard/payloadCopy";
import type { ReuseClipOutcome } from "../../../packages/ui/src/clipboardActionFeedback";
import type { PairingCode } from "../../../packages/core/pairing/qrCode";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./device-management.css";

type Deferred = {
  kind: string;
  resolve(value?: unknown): void;
  reject(error: Error): void;
};

const device: Device = {
  deviceId: "peer-one",
  deviceName: "Remote Device",
  displayName: "Remote Device",
  localAlias: "",
};
const identity = { deviceId: "local-one", deviceName: "Local Device" };
const session = createUiSession();
session.update({ destination: "devices" });
let effects: readonly string[] = [];
const effectListeners = new Set<() => void>();
const pending: Deferred[] = [];
const confirmations: Array<(result: boolean) => void> = [];
let confirmationCount = 0;
let copyShouldFail = true;
function notify() {
  effectListeners.forEach((listener) => listener());
}
function record(kind: string, value: unknown) {
  effects = [...effects, JSON.stringify({ kind, value })];
  notify();
}
function request<T>(kind: string, value: unknown): Promise<T> {
  record(kind, value);
  return new Promise<T>((resolve, reject) =>
    pending.push({ kind, resolve: (result) => resolve(result as T), reject })
  );
}
function resolve(kind: string, value: unknown) {
  const index = pending.findIndex((operation) => operation.kind === kind);
  if (index >= 0) pending.splice(index, 1)[0].resolve(value);
}
function reject(kind: string, message: string) {
  const index = pending.findIndex((operation) => operation.kind === kind);
  if (index >= 0) pending.splice(index, 1)[0].reject(new Error(message));
}
const host: UiHostEffects = {
  copyText: async (text) => {
    record("copy", text);
    if (copyShouldFail) throw new Error("clipboard unavailable");
  },
  confirm: async (message) => {
    confirmationCount += 1;
    record("confirm", message);
    return await new Promise<boolean>((resolve) => confirmations.push(resolve));
  },
};

function createAdapter(devices: Device[] = [device]): UiRuntimeAdapter & {
  publish(next: ClipboardAppProps): void;
} {
  const initial: ClipboardAppProps = {
    clips: [],
    devices,
    pending: [],
    peers: [],
    connectionStateKnown: true,
    identity,
    pinnedIds: [],
    onDeleteClip: async () => {},
    onUnpair: async (id) => request("unpair", id),
    onAccept: async (): Promise<PairingApprovalResult> => ({
      ok: true,
      admitted: true,
    }),
    onReject: async (): Promise<PairingApprovalResult> => ({
      ok: true,
      admitted: false,
    }),
    onPairText: async (): Promise<PairingSubmissionResult> => ({ ok: true }),
    onRenameIdentity: async (name, expectedDeviceId) => {
      record("rename-identity-request", { name, expectedDeviceId });
      return await request("rename-identity", {
        deviceId: expectedDeviceId,
        deviceName: name,
      });
    },
    onRenameDevice: async (id, name) => {
      record("rename-device-request", { id, name });
      return await request("rename-device", {
        ...device,
        deviceId: id,
        localAlias: name,
      });
    },
    onRequestPairingCode: async (): Promise<PairingCode | null> => null,
    onCopyPairingText: async (): Promise<PayloadCopyResult> => ({
      status: "copied",
    }),
    onReuseClip: async (): Promise<ReuseClipOutcome> => "complete",
    onSetPinned: async () => {},
    onClearAll: async () => {},
  };
  return createUiRuntimeStore(initial, host) as UiRuntimeAdapter & {
    publish(next: ClipboardAppProps): void;
  };
}

function ScenarioControls({
  adapter,
  replaceAdapter,
}: {
  adapter: ReturnType<typeof createAdapter>;
  replaceAdapter(next: ReturnType<typeof createAdapter>): void;
}) {
  const observedEffects = useSyncExternalStore(
    (listener) => {
      effectListeners.add(listener);
      return () => effectListeners.delete(listener);
    },
    () => effects,
    () => effects
  );
  function publishDevices(devices: Device[]) {
    const current = adapter.getSnapshot() as ClipboardAppProps;
    adapter.publish({ ...current, devices });
  }
  function resolveConfirmation(value: boolean) {
    confirmations.shift()?.(value);
    notify();
  }
  return (
    <aside aria-label="Device management scenario controls">
      <h1>Device management scenario</h1>
      <button
        type="button"
        onClick={() =>
          resolve("rename-device", {
            ...device,
            deviceName: "Observed name",
            localAlias: "Saved alias",
          })
        }
      >
        Resolve alias save: success
      </button>
      <button type="button" onClick={() => reject("rename-device", "offline")}>
        Resolve alias save: failure
      </button>
      <button
        type="button"
        onClick={() =>
          resolve("rename-identity", {
            ...identity,
            deviceName: "Saved local name",
          })
        }
      >
        Resolve local name save: success
      </button>
      <button
        type="button"
        onClick={() => {
          copyShouldFail = false;
          notify();
        }}
      >
        Allow clipboard writes
      </button>
      <button
        type="button"
        onClick={() =>
          publishDevices([
            {
              ...device,
              deviceName: "Updated device name",
              localAlias: "Updated alias",
            },
          ])
        }
      >
        Publish updated device observation
      </button>
      <button type="button" onClick={() => publishDevices([])}>
        Remove device observation
      </button>
      <button
        type="button"
        onClick={() =>
          session.acceptDestination(
            "device-notification",
            { kind: "requests" },
            { ready: true, clipIds: [], requestIds: [] },
            "notification"
          )
        }
      >
        Open Requests notification
      </button>
      <button type="button" onClick={() => session.back()}>
        Return to device editor
      </button>
      <button type="button" onClick={() => resolveConfirmation(true)}>
        Confirm scripted revocation
      </button>
      <button type="button" onClick={() => resolveConfirmation(false)}>
        Cancel scripted confirmation
      </button>
      <button type="button" onClick={() => reject("unpair", "offline")}>
        Resolve revocation: failure
      </button>
      <button
        type="button"
        onClick={() => {
          copyShouldFail = false;
          replaceAdapter(createAdapter());
        }}
      >
        Replace runtime owner
      </button>
      <output data-testid="confirmation-count">{confirmationCount}</output>
      <output data-testid="device-effects">
        {JSON.stringify(observedEffects)}
      </output>
    </aside>
  );
}

function Scenario() {
  const [adapter, setAdapter] = useState(() => createAdapter());
  const controls = (
    <ScenarioControls adapter={adapter} replaceAdapter={setAdapter} />
  );
  return (
    <ClipboardWorkspace
      adapter={adapter}
      session={session}
      pairingDiagnostics={controls}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Scenario />);
