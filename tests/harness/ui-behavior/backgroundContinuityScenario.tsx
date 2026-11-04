import React, { useMemo, useState } from "react";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import type { UiRuntimeAdapter } from "../../../packages/ui/src/runtimeAdapter";
import type { BackgroundContinuityState } from "../../../packages/ui/src/types";

type Deferred<T> = {
  label: string;
  resolve(value: T): void;
  reject(): void;
};

const retiredActions: Deferred<void>[] = [];

const initialContinuity: BackgroundContinuityState = {
  available: true,
  backgroundEnabled: false,
  service: "stopped",
  connection: "disconnected",
  connectedTrustedDeviceCount: 0,
  notificationAvailability: "blocked",
  autoSync: false,
  controlPending: false,
  controlStateKnown: true,
  controlError: null,
  observedBackgroundFailureCount: 0,
  supportState: "unqualified",
  batteryOptimizationGuidance: false,
};

function createScenario(generation: number) {
  const session = createUiSession();
  session.update({ destination: "settings", settingsCategory: "connections" });
  let continuity = { ...initialContinuity };
  let adapter: UiRuntimeAdapter & { publish(next: ClipboardAppProps): void };
  const effects: string[] = [];
  const confirmations: Deferred<boolean>[] = [];
  const actions: Deferred<void>[] = [];

  function record(name: string) {
    effects.push(name);
    for (const output of document.querySelectorAll<HTMLOutputElement>(
      "[data-testid='continuity-effects']"
    ))
      output.replaceChildren(document.createTextNode(JSON.stringify(effects)));
  }
  function deferAction(name: string) {
    record(name);
    return new Promise<void>((resolve, reject) => {
      actions.push({ label: name, resolve, reject });
    });
  }

  const props: ClipboardAppProps = {
    clips: [],
    devices: [],
    pending: [],
    peers: [],
    identity: {
      deviceId: `continuity-${generation}`,
      deviceName: "Scenario Device",
    },
    pinnedIds: [],
    backgroundContinuity: continuity,
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
    onPairText: async () => {
      throw new Error("unexpected effect");
    },
    onRequestPairingCode: async () => {
      throw new Error("unexpected effect");
    },
    onCopyPairingText: async () => {
      throw new Error("unexpected effect");
    },
    onReuseClip: async () => {
      throw new Error("unexpected effect");
    },
    onShareNow: async () => {
      throw new Error("unexpected effect");
    },
    onSetPinned: async () => {
      throw new Error("unexpected effect");
    },
    onClearAll: async () => {
      throw new Error("unexpected effect");
    },
    onSetAutoSync: async () => {
      throw new Error("unexpected effect");
    },
    onSetBackgroundContinuity: async (enabled) => {
      await deferAction(`set-background:${enabled}`);
      continuity = {
        ...continuity,
        backgroundEnabled: enabled,
        service: enabled ? "running" : "stopped",
        connection: enabled ? "waiting" : "disconnected",
        controlError: null,
      };
      adapter.publish({ ...props, backgroundContinuity: continuity });
    },
    onRefreshBackgroundContinuity: async () => {
      await deferAction("refresh-background");
      continuity = { ...continuity, controlError: null };
      adapter.publish({ ...props, backgroundContinuity: continuity });
    },
    onOpenBackgroundNotificationSettings: () =>
      deferAction("notification-settings"),
    onExportBackgroundContinuityDiagnostics: () =>
      deferAction("export-diagnostics"),
    session,
  };
  adapter = createUiRuntimeStore(props, {
    copyText: async () => {
      throw new Error("unexpected clipboard effect");
    },
    confirm: (message) => {
      record(`confirm:${message}`);
      return new Promise<boolean>((resolve, reject) => {
        confirmations.push({ label: message, resolve, reject });
      });
    },
  });
  return { adapter, session, effects, confirmations, actions, record };
}

function ScenarioControls({
  scenario,
  replace: onReplace,
}: {
  scenario: ReturnType<typeof createScenario>;
  replace(): void;
}) {
  function confirm(value: boolean) {
    scenario.confirmations.shift()?.resolve(value);
  }
  function settle(success: boolean) {
    const action = scenario.actions.shift();
    if (!action) return;
    if (success) action.resolve();
    else action.reject();
  }
  function replace() {
    retiredActions.push(...scenario.actions.splice(0));
    onReplace();
  }
  return (
    <aside aria-label="Scenario controls" className="relay-settings">
      <h1>Background Continuity scenario</h1>
      <button type="button" onClick={() => confirm(false)}>
        Resolve confirmation: cancel
      </button>
      <button type="button" onClick={() => confirm(true)}>
        Resolve confirmation: accept
      </button>
      <button type="button" onClick={() => settle(true)}>
        Resolve action: success
      </button>
      <button type="button" onClick={() => settle(false)}>
        Resolve action: failure
      </button>
      <button type="button" onClick={replace}>
        Replace scripted runtime
      </button>
      <button type="button" onClick={() => retiredActions.shift()?.resolve()}>
        Resolve retired action
      </button>
      <output data-testid="continuity-effects" aria-live="polite">
        {JSON.stringify(scenario.effects)}
      </output>
    </aside>
  );
}

export function BackgroundContinuityScenario() {
  const [generation, setGeneration] = useState(0);
  const scenario = useMemo(() => createScenario(generation), [generation]);
  return (
    <ClipboardWorkspace
      key={generation}
      adapter={scenario.adapter}
      session={scenario.session}
      backgroundContinuityDiagnostics={
        <ScenarioControls
          scenario={scenario}
          replace={() => setGeneration((value) => value + 1)}
        />
      }
    />
  );
}
