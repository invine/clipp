import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";
import type {
  RuntimeSettings,
  SettingsSnapshot,
} from "../../../packages/core/runtime/settingsAuthority";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

const initial: SettingsSnapshot = {
  sessionId: "settings-scenario",
  revision: 1,
  state: {
    theme: "system",
    autoSync: true,
    logLevel: "info",
    localRetentionMs: 30 * 86400000,
    sharingLifetimeMs: 86400000,
    retentionError: "cleanup_failed",
  },
};

const session = createUiSession();
session.update({ destination: "settings" });

function createScenario() {
  let authoritative = initial;
  let failNextRead = false;
  let pendingWrite: ((result: unknown) => void) | undefined;
  let pendingAutoSync:
    | ((result: {
        status: "unconfirmed";
        autoSync: boolean;
        error: string;
      }) => void)
    | undefined;
  let pendingHistoryRecovery:
    { resolve(): void; reject(error: Error): void } | undefined;
  const effects: string[] = [];
  let effectListener = () => {};
  const client = createSettingsClient({
    async send(message) {
      if (message.type === "getSettings") {
        if (failNextRead) {
          failNextRead = false;
          throw new Error("settings_refresh_offline");
        }
        return { ok: true, snapshot: authoritative };
      }
      effects.push(JSON.stringify(message.settings));
      effectListener();
      return await new Promise((resolve) => {
        pendingWrite = resolve;
      });
    },
    subscribe: () => () => {},
  });

  const withSettings = (state = client.getState()): ClipboardAppProps => ({
    clips: [],
    devices: [],
    pending: [],
    peers: [],
    identity: { deviceId: "scenario-device", deviceName: "Scenario Device" },
    pinnedIds: [],
    appearanceSettings: {
      ...state,
      save: client.save,
      refresh: client.refresh,
    },
    autoSync: true,
    autoSyncKnown: true,
    onDeleteClip: unavailable,
    onUnpair: unavailable,
    onAccept: unavailable,
    onReject: unavailable,
    onPairText: unavailable,
    onRequestPairingCode: unavailable,
    onCopyPairingText: unavailable,
    onReuseClip: unavailable,
    onShareNow: unavailable,
    onSetPinned: unavailable,
    onClearAll: unavailable,
    onRetryHistoryCleanup: async () => {
      effects.push("retry-history-cleanup");
      effectListener();
      await new Promise<void>((resolve, reject) => {
        pendingHistoryRecovery = { resolve, reject };
      });
    },
    onSetAutoSync: async (enabled) => {
      effects.push(`auto-sync:${enabled}`);
      effectListener();
      return await new Promise((resolve) => {
        pendingAutoSync = resolve;
      });
    },
    onRetryAutoSync: async () => true,
  });
  const adapter = createUiRuntimeStore(withSettings(), {
    copyText: async () => {},
    confirm: () => true,
  });
  return {
    client,
    adapter,
    effects,
    setEffectListener(listener: () => void) {
      effectListener = listener;
    },
    publishSettings() {
      adapter.publish(withSettings());
    },
    failNextRefresh() {
      failNextRead = true;
    },
    resolveUnconfirmed() {
      const finish = pendingWrite;
      pendingWrite = undefined;
      finish?.({
        status: "unconfirmed",
        error: "write_outcome_unconfirmed",
        snapshot: authoritative,
      });
    },
    resolveRejected() {
      const finish = pendingWrite;
      pendingWrite = undefined;
      finish?.({
        status: "rejected",
        error: "retention_rejected",
        failureOrigin: "localRetention",
        snapshot: authoritative,
      });
    },
    resolveStaleDarkApplied() {
      const finish = pendingWrite;
      pendingWrite = undefined;
      finish?.({
        status: "applied",
        snapshot: {
          ...initial,
          state: { ...initial.state, theme: "dark" },
        },
      });
    },
    resolveAutoSyncUnconfirmed() {
      const finish = pendingAutoSync;
      pendingAutoSync = undefined;
      finish?.({
        status: "unconfirmed",
        autoSync: false,
        error: "auto_sync_write_unconfirmed",
      });
    },
    resolveHistoryRecovery(succeeded: boolean) {
      const pending = pendingHistoryRecovery;
      pendingHistoryRecovery = undefined;
      if (succeeded)
        authoritative = {
          ...authoritative,
          revision: authoritative.revision + 1,
          state: { ...authoritative.state, retentionError: null },
        };
      if (succeeded) pending?.resolve();
      else pending?.reject(new Error("history_cleanup_offline"));
    },
    updateAuthoritative(patch: Partial<RuntimeSettings>) {
      authoritative = {
        ...authoritative,
        revision: authoritative.revision + 1,
        state: { ...authoritative.state, ...patch },
      };
    },
  };
}

const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected effect in settings scenario");
};

function ScenarioControls({
  scenario,
}: {
  scenario: ReturnType<typeof createScenario>;
}) {
  const [effectVersion, setEffectVersion] = useState(0);
  useEffect(() => {
    scenario.setEffectListener(() => setEffectVersion((value) => value + 1));
    void scenario.client.start(() => scenario.publishSettings());
    return () => scenario.client.stop();
  }, [scenario]);
  return (
    <aside aria-label="Preferences scenario controls">
      <h1>Preferences and recovery scenario</h1>
      <button type="button" onClick={scenario.failNextRefresh}>
        Fail next settings refresh
      </button>
      <button type="button" onClick={scenario.resolveUnconfirmed}>
        Resolve settings save as unconfirmed
      </button>
      <button type="button" onClick={scenario.resolveRejected}>
        Resolve settings save as rejected
      </button>
      <button type="button" onClick={scenario.resolveStaleDarkApplied}>
        Resolve settings save as stale dark applied
      </button>
      <button type="button" onClick={scenario.resolveAutoSyncUnconfirmed}>
        Resolve Auto Sync save as unconfirmed
      </button>
      <button onClick={() => scenario.resolveHistoryRecovery(false)}>
        Resolve history cleanup as failed
      </button>
      <button onClick={() => scenario.resolveHistoryRecovery(true)}>
        Resolve history cleanup as recovered
      </button>
      <button
        type="button"
        onClick={() => {
          scenario.updateAuthoritative({ theme: "light" });
          void scenario.client.refresh();
        }}
      >
        Refresh to authoritative light appearance
      </button>
      <output data-testid="settings-effects" aria-live="polite">
        {effectVersion >= 0 ? JSON.stringify(scenario.effects) : ""}
      </output>
    </aside>
  );
}

function SettingsScenario() {
  const scenario = useMemo(createScenario, []);
  return (
    <>
      <ClipboardWorkspace adapter={scenario.adapter} session={session} />
      <ScenarioControls scenario={scenario} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<SettingsScenario />);
