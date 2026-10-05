import React, { useState } from "react";
import { runManagedRelayAction } from "./managedRelayAction";
import type {
  RelayConfiguration,
  RelayState,
} from "../../core/network/managedRelays.js";

export type ManagedRelaySettingsProps = {
  configurations: RelayConfiguration[];
  states: RelayState[];
  onSetConfigurations(
    configurations: RelayConfiguration[]
  ): Promise<void> | void;
  onLogin?(key: string): Promise<void> | void;
  onManageAccount?(key: string): Promise<void> | void;
  onRetry?(key: string): Promise<void> | void;
};

const statusText: Record<RelayState["status"], string> = {
  connecting: "Connecting",
  login_needed: "Login needed",
  ready: "Ready",
  degraded: "Degraded: Rendezvous unavailable",
  refused: "Relay limit reached",
  retrying: "Retrying",
  conflict: "Peer ID conflict",
};

export function ManagedRelaySettings({
  configurations,
  states,
  onSetConfigurations,
  onLogin,
  onManageAccount,
  onRetry,
}: ManagedRelaySettingsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [kind, setKind] = useState<RelayConfiguration["kind"]>("managed");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [peerId, setPeerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runAction = (action: () => Promise<void> | void) => {
    setError(null);
    void runManagedRelayAction(action, setError);
  };
  const edit = (config?: RelayConfiguration) => {
    setEditing(config?.key ?? "new");
    setKind(config?.kind ?? "managed");
    setName(config?.name ?? "");
    setEndpoint(
      config?.kind === "managed"
        ? config.discoveryUrl
        : (config?.addresses.join("\n") ?? "")
    );
    setPeerId(config?.kind === "explicit" ? config.peerId : "");
    setError(null);
  };
  const save = async () => {
    if (!editing || busy) return;
    const key =
      editing === "new"
        ? (globalThis.crypto?.randomUUID?.() ?? `relay-${Date.now()}`)
        : editing;
    const config: RelayConfiguration =
      kind === "managed"
        ? { key, name: name.trim(), kind, discoveryUrl: endpoint.trim() }
        : {
            key,
            name: name.trim(),
            kind,
            peerId: peerId.trim(),
            addresses: endpoint
              .split(/\r?\n/)
              .map((value) => value.trim())
              .filter(Boolean),
          };
    setBusy(true);
    setError(null);
    try {
      await onSetConfigurations(
        editing === "new"
          ? [...configurations, config]
          : configurations.map((value) =>
              value.key === editing ? config : value
            )
      );
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save relay");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (key: string) => {
    setBusy(true);
    setError(null);
    try {
      await onSetConfigurations(
        configurations.filter((config) => config.key !== key)
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove relay"
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relay-settings" aria-label="Relay settings">
      <div className="nav-section-label">Relays</div>
      {configurations.length === 0 && (
        <div className="relay-empty">
          No relays configured. Direct connections remain available.
        </div>
      )}
      {configurations.map((config) => {
        const state = states.find((item) => item.key === config.key);
        return (
          <div className="relay-card managed-relay-card" key={config.key}>
            <div className="peer-meta">
              <div className="peer-name">
                {config.name ||
                  (config.kind === "managed"
                    ? config.discoveryUrl
                    : config.peerId)}
              </div>
              <div className="relay-status" role="status">
                {state ? statusText[state.status] : "Connecting"}
                {state?.reason ? `: ${state.reason}` : ""}
              </div>
              <div className="relay-address">
                {config.kind === "managed"
                  ? config.discoveryUrl
                  : `${config.peerId} · ${config.addresses.length} address(es)`}
              </div>
              {state?.warning && (
                <div className="relay-error">{state.warning}</div>
              )}
            </div>
            <div className="peer-actions">
              {config.kind === "managed" &&
                onLogin &&
                state?.status === "login_needed" && (
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={() => runAction(() => onLogin(config.key))}
                  >
                    Log in
                  </button>
                )}
              {config.kind === "managed" && onManageAccount && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => runAction(() => onManageAccount(config.key))}
                  title="Open the relay portal"
                >
                  Manage account
                </button>
              )}
              {onRetry &&
                (state?.status === "retrying" ||
                  state?.status === "degraded" ||
                  state?.status === "refused") && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => runAction(() => onRetry(config.key))}
                  >
                    Retry
                  </button>
                )}
              <button
                className="text-button"
                type="button"
                onClick={() => edit(config)}
                disabled={busy}
              >
                Edit
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => void remove(config.key)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
      {editing && (
        <div className="relay-card relay-card-editing managed-relay-editor">
          <label>
            Name{" "}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Type{" "}
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as RelayConfiguration["kind"]);
                setEndpoint("");
              }}
            >
              <option value="managed">Authenticated discovery</option>
              <option value="explicit">Unauthenticated Peer ID</option>
            </select>
          </label>
          {kind === "explicit" && (
            <label>
              Peer ID{" "}
              <input
                value={peerId}
                onChange={(event) => setPeerId(event.target.value)}
              />
            </label>
          )}
          <label>
            {kind === "managed"
              ? "HTTPS discovery URL"
              : "Complete multiaddrs, one per line"}
            <textarea
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </label>
          <div className="managed-relay-editor-actions">
            <button
              className="primary-button compact-button"
              type="button"
              onClick={() => void save()}
              disabled={busy}
            >
              Save
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="relay-error" role="alert">
          {error}
        </div>
      )}
      {!editing && (
        <button type="button" onClick={() => edit()} disabled={busy}>
          Add relay
        </button>
      )}
    </div>
  );
}
