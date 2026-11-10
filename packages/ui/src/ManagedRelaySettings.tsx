import React, { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TaskDialog } from "./TaskDialog";
import { Icon } from "./controls";
import { RelayEmptyState } from "./RelayEmptyState";
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
  taskPresentation?: boolean;
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
  taskPresentation = false,
  onRefresh,
  onMutate,
  onLogin,
  onManageAccount,
  onRetry,
}: ManagedRelaySettingsProps) {
  const [session] = useState(() => providedSession ?? createUiSession());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
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
  const activeTask = context.tasks[context.tasks.length - 1];
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
    const tasks = session.getSnapshot().tasks;
    const task = tasks[tasks.length - 1];
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
  const edit = (config?: RelayConfiguration, origin?: string) => {
    session.open({
      kind: "relay",
      entity: config?.key ?? "new",
      origin: origin ?? `relay:${config?.key ?? "add"}`,
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
      const feedback = { ...session.getSnapshot().relayMutationFeedback };
      if (result.status === "applied") delete feedback[key];
      else feedback[key] = relayMutationMessage(result);
      session.update({ relayMutationFeedback: feedback });
      return result.status === "applied"
        ? { status: "removed-local" }
        : { status: "unconfirmed", error: relayMutationMessage(result) };
    });
  };
  const dismiss = () => {
    session.relay.dismiss();
    session.back();
  };
  function renderEditor() {
    return (
      <div
        className="relay-card relay-card-editing managed-relay-editor"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }
        }}
      >
        {!taskPresentation && <h3>Relay editor</h3>}
        {!taskPresentation && (
          <>
            <button type="button" onClick={dismiss}>
              Close relay editor
            </button>
          </>
        )}
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
          {!taskPresentation && (
            <>
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
            </>
          )}
        </div>
      </div>
    );
  }
  function renderFeedback() {
    return (
      <>
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
      </>
    );
  }
  return (
    <div className="relay-settings" aria-label="Relay settings">
      {!taskPresentation && <div className="nav-section-label">Relays</div>}
      {configurations.length === 0 &&
        (taskPresentation ? (
          <RelayEmptyState onAdd={() => edit(undefined, "relay:empty-add")} />
        ) : (
          <div className="relay-empty">No relays configured.</div>
        ))}
      {configurations.map((config) => {
        const state = states.find((item) => item.key === config.key);
        return (
          <div className="managed-relay-item" key={config.key}>
            <div className="relay-identity">
              <div className="peer-name">
                {config.name ||
                  (config.kind === "managed"
                    ? config.discoveryUrl
                    : config.peerId)}
              </div>
              <span
                className="relay-address"
                title={
                  config.kind === "managed"
                    ? config.discoveryUrl
                    : config.peerId
                }
              >
                {config.kind === "managed"
                  ? config.discoveryUrl
                  : config.peerId}
              </span>
            </div>
            <span className="relay-kind">
              {config.kind === "managed"
                ? "Authenticated discovery"
                : "Unauthenticated Peer ID"}
            </span>
            <div
              className={`relay-status relay-status-${state?.status ?? "unknown"}`}
              role="status"
              title={state?.warning || undefined}
            >
              <span className="relay-status-dot" aria-hidden="true" />
              {state ? statusText[state.status] : "Status unknown"}
              {state?.reason ? `: ${state.reason}` : ""}
            </div>
            <div className="relay-row-actions">
              {taskPresentation &&
                config.kind === "managed" &&
                onLogin &&
                (!state || state.status === "login_needed") && (
                  <button
                    className="text-button relay-quick-login"
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
              <details
                className="device-action-menu relay-action-menu"
                onToggle={(event) => {
                  const menu = event.currentTarget;
                  if (menu.open)
                    document
                      .querySelectorAll<HTMLDetailsElement>(
                        ".device-action-menu[open]"
                      )
                      .forEach((other) => {
                        if (other !== menu) other.open = false;
                      });
                  setOpenMenu((current) =>
                    menu.open
                      ? config.key
                      : current === config.key
                        ? null
                        : current
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }}
              >
                <summary
                  role="button"
                  aria-expanded={openMenu === config.key}
                  aria-label={`${config.name || (config.kind === "managed" ? config.discoveryUrl : config.peerId)} actions`}
                  data-session-focus={`relay:${config.key}`}
                >
                  <Icon name="more" />
                </summary>
                <div
                  className="device-action-popover"
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "button:not(:disabled)"
                      )
                    )
                      event.currentTarget.closest("details")!.open = false;
                  }}
                >
                  {config.kind === "managed" &&
                    onLogin &&
                    (!state || state.status === "login_needed") && (
                      <button
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
                    >
                      Manage account
                    </button>
                  )}
                  {onRetry &&
                    (state?.status === "retrying" ||
                      state?.status === "degraded" ||
                      state?.status === "refused") && (
                      <button
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
                    type="button"
                    onClick={() => edit(config)}
                    disabled={
                      context.relayActions[config.key]?.pending ||
                      (draft?.key === config.key && draft.pending)
                    }
                  >
                    Edit
                  </button>
                  <button
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
              </details>
            </div>
          </div>
        );
      })}
      {editing &&
        (taskPresentation
          ? createPortal(
              <TaskDialog
                title="Relay configuration"
                pending={busy}
                initialFocusKey="relay:name"
                originKey={activeTask?.origin}
                returnLabel="Close relay editor"
                onDismiss={dismiss}
                cancelLabel="Cancel relay edit"
                onCancel={() => {
                  session.relay.discard();
                  session.back();
                }}
              >
                {renderEditor()}
                {renderFeedback()}
              </TaskDialog>,
              document.body
            )
          : renderEditor())}
      {(!taskPresentation || !editing) && renderFeedback()}
      {!editing && !taskPresentation && (
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
