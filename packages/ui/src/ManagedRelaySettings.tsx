import React, { useState, useEffect, useSyncExternalStore } from "react";
import { createUiSession, type UiSession } from "./uiSession";
import { relayMutationMessage } from "./relayEditSession";
import type {
  RelayMutation,
  RelayMutationResult,
} from "../../core/network/relayMutations";
import type { RelayActionResult } from "../../core/network/relayActions";
import type {
  RelayConfiguration,
  RelayState,
} from "../../core/network/managedRelays.js";

export type ManagedRelaySettingsProps = {
  configurations: RelayConfiguration[];
  states: RelayState[];
  session?: UiSession;
  onRefresh?(): Promise<RelayConfiguration[]>;
  onMutate(mutation: RelayMutation): Promise<RelayMutationResult>;
  onLogin?(key: string): Promise<RelayActionResult>;
  onManageAccount?(key: string): Promise<RelayActionResult>;
  onRetry?(key: string): Promise<RelayActionResult>;
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
  session: providedSession,
  onRefresh,
  onMutate,
  onLogin,
  onManageAccount,
  onRetry,
}: ManagedRelaySettingsProps) {
  const [session] = useState(() => providedSession ?? createUiSession());
  const draft = useSyncExternalStore(
    session.relay.subscribe,
    session.relay.getSnapshot,
    session.relay.getSnapshot
  );
  const context = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const editing = draft?.active ? draft.key : null;
  const {
    kind = "managed",
    name = "",
    endpoint = "",
    peerId = "",
  } = draft?.raw ?? {};
  const busy = Boolean(draft?.pending);
  useEffect(() => {
    session.relay.reconcile(configurations);
  }, [session, configurations]);
  useEffect(() => {
    const task = session.getSnapshot().tasks.at(-1);
    if (
      draft &&
      task?.kind === "relay" &&
      task.entity === "new" &&
      draft.key !== "new"
    )
      session.update({
        tasks: [
          ...session.getSnapshot().tasks.slice(0, -1),
          { ...task, entity: draft.key },
        ],
      });
  }, [session, draft?.key]);
  const edit = (config?: RelayConfiguration) => {
    session.open({
      kind: "relay",
      entity: config?.key ?? "new",
      origin: `relay:${config?.key ?? "add"}`,
    });
    session.relay.begin(config);
  };
  const save = async () => {
    const key = draft?.key;
    await session.relay.save(onMutate);
    if (!session.relay.getSnapshot()) session.complete("relay", key);
  };
  const remove = async (key: string) => {
    await session.relayAction(key, async () => {
      let result: RelayMutationResult;
      try {
        result = await onMutate({ type: "remove", key });
      } catch {
        return {
          status: "unconfirmed",
          error:
            "Remove could not be confirmed. Check the current relay list before retrying.",
        };
      }
      session.update({
        relayMutationFeedback: {
          ...session.getSnapshot().relayMutationFeedback,
          [key]: relayMutationMessage(result),
        },
      });
      return result.status === "applied"
        ? { status: "removed-local" }
        : { status: "unconfirmed", error: relayMutationMessage(result) };
    });
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
            {context.relayActions[config.key]?.pending && (
              <p role="status">Relay action pending…</p>
            )}
            {context.relayActions[config.key]?.result && (
              <p
                role={
                  context.relayActions[config.key]?.result?.error
                    ? "alert"
                    : "status"
                }
              >
                {context.relayActions[config.key]?.result?.error ??
                  (context.relayActions[config.key]?.result?.status ===
                  "portal-opened"
                    ? "Relay portal opened. Its browser account may differ from Clipp's account."
                    : context.relayActions[config.key]?.result?.status ===
                        "authenticated"
                      ? "Relay authentication completed. Current connection status is shown above."
                      : context.relayActions[config.key]?.result?.status ===
                          "removed-local"
                        ? "Local relay configuration removed."
                        : "Retry requested. Current connection status is shown above.")}
              </p>
            )}
            <div className="peer-actions">
              {config.kind === "managed" && onLogin && (
                <button
                  className="primary-button compact-button"
                  type="button"
                  onClick={() =>
                    void session.relayAction(config.key, () =>
                      onLogin(config.key)
                    )
                  }
                  disabled={
                    context.relayActions[config.key]?.pending ||
                    (draft?.key === config.key && draft.pending)
                  }
                >
                  Log in
                </button>
              )}
              {config.kind === "managed" && onManageAccount && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    void session.relayAction(config.key, () =>
                      onManageAccount(config.key)
                    )
                  }
                  disabled={
                    context.relayActions[config.key]?.pending ||
                    (draft?.key === config.key && draft.pending)
                  }
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
                    onClick={() =>
                      void session.relayAction(config.key, () =>
                        onRetry(config.key)
                      )
                    }
                    disabled={
                      context.relayActions[config.key]?.pending ||
                      (draft?.key === config.key && draft.pending)
                    }
                  >
                    Retry
                  </button>
                )}
              <button
                className="text-button"
                type="button"
                data-session-focus={`relay:${config.key}`}
                onClick={() => edit(config)}
                disabled={
                  context.relayActions[config.key]?.pending ||
                  (draft?.key === config.key && draft.pending)
                }
              >
                Edit
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => void remove(config.key)}
                disabled={
                  context.relayActions[config.key]?.pending ||
                  (draft?.key === config.key && draft.pending)
                }
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
      {editing && (
        <div
          className="relay-card relay-card-editing managed-relay-editor"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              session.relay.dismiss();
              session.back();
            }
          }}
        >
          <h3>Relay editor</h3>
          <button
            type="button"
            onClick={() => {
              session.relay.dismiss();
              session.back();
            }}
          >
            Close relay editor
          </button>
          <label>
            Name{" "}
            <input
              data-session-focus="relay:name"
              value={name}
              onChange={(event) =>
                session.relay.change("name", event.target.value)
              }
            />
          </label>
          <label>
            Type{" "}
            <select
              data-session-focus="relay:kind"
              value={kind}
              onChange={(event) => {
                session.relay.change("kind", event.target.value);
                session.relay.change("endpoint", "");
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
                data-session-focus="relay:peer-id"
                value={peerId}
                onChange={(event) =>
                  session.relay.change("peerId", event.target.value)
                }
              />
            </label>
          )}
          <label>
            {kind === "managed"
              ? "HTTPS discovery URL"
              : "Complete multiaddrs, one per line"}
            <textarea
              data-session-focus="relay:endpoint"
              value={endpoint}
              onChange={(event) =>
                session.relay.change("endpoint", event.target.value)
              }
            />
          </label>
          <div className="managed-relay-editor-actions">
            <button
              className="primary-button compact-button"
              type="button"
              onClick={() => void save()}
              disabled={
                busy ||
                draft?.unavailable ||
                draft?.recoveryRequired ||
                (editing ? context.relayActions[editing]?.pending : false)
              }
            >
              Save
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                session.relay.discard();
                session.back();
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {draft?.recoveryRequired && onRefresh && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void session.relay.refresh(onRefresh)}
        >
          Refresh relay configuration
        </button>
      )}
      {draft?.error && (
        <div className="relay-error" role="alert">
          {draft.error}
        </div>
      )}
      {Object.entries(context.relayMutationFeedback).map(([key, message]) => (
        <p role="status" key={key}>
          {message}
        </p>
      ))}
      <p>
        Remove deletes this local configuration, its resources and local
        credential. It does not revoke the relay account or remove other routes.
      </p>
      {!editing && (
        <button
          type="button"
          data-session-focus="relay:add"
          onClick={() => edit()}
        >
          Add relay
        </button>
      )}
    </div>
  );
}
