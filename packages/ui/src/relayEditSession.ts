import type { RelayConfiguration } from "../../core/network/managedRelays";
import type {
  RelayFields,
  RelayMutation,
  RelayMutationResult,
} from "../../core/network/relayMutations";
/** A retained edit keeps its identity when an Add adopts its saved key. */
export type RelayEditHandle = { resume(): string | null };
export type RelayDraft = {
  key: string;
  active: boolean;
  raw: {
    name: string;
    kind: "managed" | "explicit";
    endpoint: string;
    peerId: string;
  };
  dirty: string[];
  pending: boolean;
  error: string | null;
  unavailable: boolean;
  recoveryRequired: boolean;
};
function rawFields(config?: RelayConfiguration): RelayDraft["raw"] {
  return {
    name: config?.name ?? "",
    kind: config?.kind ?? "managed",
    endpoint:
      config?.kind === "managed"
        ? config.discoveryUrl
        : (config?.addresses.join("\n") ?? ""),
    peerId: config?.kind === "explicit" ? config.peerId : "",
  };
}
export function relayMutationMessage(result: RelayMutationResult): string {
  if (result.status === "applied") return "Relay configuration applied.";
  if (result.credentialsRemoved.length)
    return `Local credentials were removed, but the relay change was not completed. The current configuration may need Log in again. ${result.error ?? ""}`;
  if (result.configurationApplied)
    return `The relay configuration was saved, but resource setup or state refresh was not confirmed. Check its current status. ${result.error ?? ""}`;
  return `The relay change was not confirmed. Your edit is retained. ${result.error ?? "Check the current configuration before saving again."}`;
}
export function createRelayEditSession() {
  type Draft = {
    state: RelayDraft;
    version: number;
    fieldVersions: Record<string, number>;
    newKey?: string;
  };
  const drafts = new Map<string, Draft>();
  let state: RelayDraft | null = null;
  const listeners = new Set<() => void>();
  let errors: readonly { key: string; error: string }[] = [];
  function notify() {
    const next = [...drafts.values()].flatMap((draft) =>
      draft.state.error
        ? [{ key: draft.state.key, error: draft.state.error }]
        : []
    );
    if (
      next.length !== errors.length ||
      next.some(
        (value, index) =>
          value.key !== errors[index].key || value.error !== errors[index].error
      )
    )
      errors = next;
    listeners.forEach((listener) => listener());
  }
  const publish = (next: RelayDraft | null) => {
    state = next;
    notify();
  };
  function update(draft: Draft, next: RelayDraft) {
    draft.state = next;
    if (state?.key === next.key) state = next;
    notify();
  }
  function adoptKey(draft: Draft, key: string) {
    const previous = draft.state.key;
    if (previous === key) return;
    drafts.delete(previous);
    drafts.set(key, draft);
    draft.state = { ...draft.state, key };
    if (state?.key === previous) state = { ...state, key };
  }
  function resumeDraft(draft: Draft): string | null {
    if (drafts.get(draft.state.key) !== draft) return null;
    draft.state = { ...draft.state, active: true };
    publish(draft.state);
    return draft.state.key;
  }
  return {
    hasWork: () =>
      [...drafts.values()].some(
        (draft) =>
          draft.state.pending ||
          draft.state.error ||
          draft.state.dirty.length ||
          draft.state.recoveryRequired
      ),
    getSnapshot: () => state,
    /** Retain the existing edit, never whichever later edit reuses its old key. */
    retain(key: string): RelayEditHandle | null {
      const draft = drafts.get(key);
      return draft ? { resume: () => resumeDraft(draft) } : null;
    },
    getErrors: () => errors,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin(config?: RelayConfiguration) {
      const key = config?.key ?? "new";
      let draft = drafts.get(key);
      if (!draft) {
        draft = {
          version: 0,
          fieldVersions: {},
          state: {
            key,
            active: true,
            raw: rawFields(config),
            dirty: [],
            pending: false,
            error: null,
            unavailable: false,
            recoveryRequired: false,
          },
        };
        drafts.set(key, draft);
      }
      draft.state = { ...draft.state, active: true };
      publish(draft.state);
    },
    change(field: keyof RelayDraft["raw"], value: string) {
      const draft = state ? drafts.get(state.key) : null;
      if (!draft) return;
      draft.version++;
      draft.fieldVersions[field] = draft.version;
      update(draft, {
        ...draft.state,
        raw: { ...draft.state.raw, [field]: value },
        dirty: [...new Set([...draft.state.dirty, field])],
        error: draft.state.recoveryRequired ? draft.state.error : null,
      });
    },
    dismiss() {
      const draft = state ? drafts.get(state.key) : null;
      if (draft) update(draft, { ...draft.state, active: false });
    },
    discard() {
      if (state) drafts.delete(state.key);
      publish(null);
    },
    clear() {
      drafts.clear();
      publish(null);
    },
    reconcile(configs: RelayConfiguration[]) {
      for (const draft of drafts.values()) {
        if (draft.state.key === "new") continue;
        const config = configs.find((config) => config.key === draft.state.key);
        if (!config) {
          update(draft, {
            ...draft.state,
            unavailable: true,
            error:
              "This relay was removed. Close to return to the relay list; Save cannot recreate it.",
          });
          continue;
        }
        const raw = rawFields(config);
        for (const field of Object.keys(raw) as (keyof typeof raw)[])
          if (draft.state.dirty.includes(field))
            Object.assign(raw, { [field]: draft.state.raw[field] });
        update(draft, { ...draft.state, raw });
      }
    },
    async refresh(action: () => Promise<RelayConfiguration[]>) {
      const draft = state ? drafts.get(state.key) : null;
      if (!draft || draft.state.pending) return;
      update(draft, { ...draft.state, pending: true });
      try {
        const configurations = await action();
        if (drafts.get(draft.state.key) !== draft) return;
        if (
          draft.state.key === "new" &&
          draft.newKey &&
          configurations.some((config) => config.key === draft.newKey)
        )
          adoptKey(draft, draft.newKey);
        this.reconcile(configurations);
        update(draft, {
          ...draft.state,
          pending: false,
          recoveryRequired: false,
          error: draft.state.unavailable
            ? draft.state.error
            : "Current relay configuration refreshed. Review its current status before saving again.",
        });
      } catch {
        if (drafts.get(draft.state.key) === draft)
          update(draft, {
            ...draft.state,
            pending: false,
            recoveryRequired: true,
            error:
              "The relay configuration could not be refreshed. Your draft is retained; refresh before saving again.",
          });
      }
    },
    async save(
      action: (mutation: RelayMutation) => Promise<RelayMutationResult>
    ) {
      const draft = state ? drafts.get(state.key) : null;
      if (
        !draft ||
        draft.state.pending ||
        draft.state.unavailable ||
        draft.state.recoveryRequired
      )
        return;
      const { key, raw, dirty } = draft.state;
      const version = draft.version;
      const submittedVersions = { ...draft.fieldVersions };
      const newKey =
        key === "new"
          ? (draft.newKey ??=
              globalThis.crypto?.randomUUID?.() ?? `relay-${Date.now()}`)
          : key;
      const config: RelayConfiguration =
        raw.kind === "managed"
          ? {
              key: newKey,
              name: raw.name.trim(),
              kind: raw.kind,
              discoveryUrl: raw.endpoint.trim(),
            }
          : {
              key: newKey,
              name: raw.name.trim(),
              kind: raw.kind,
              peerId: raw.peerId.trim(),
              addresses: raw.endpoint
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter(Boolean),
            };
      const fields: RelayFields = {};
      if (dirty.includes("name")) fields.name = config.name;
      if (dirty.includes("kind")) {
        fields.kind = config.kind;
        Object.assign(
          fields,
          config.kind === "managed"
            ? { discoveryUrl: config.discoveryUrl }
            : { peerId: config.peerId, addresses: config.addresses }
        );
      } else {
        if (dirty.includes("endpoint"))
          Object.assign(
            fields,
            raw.kind === "managed"
              ? { discoveryUrl: raw.endpoint.trim() }
              : {
                  addresses: raw.endpoint
                    .split(/\r?\n/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                }
          );
        if (dirty.includes("peerId") && config.kind === "explicit")
          fields.peerId = config.peerId;
      }
      update(draft, { ...draft.state, pending: true, error: null });
      let result: RelayMutationResult;
      try {
        result = await action(
          key === "new"
            ? { type: "add", configuration: config }
            : { type: "edit", key, fields }
        );
      } catch {
        result = {
          status: "unconfirmed",
          configurations: [],
          configurationApplied: false,
          credentialsRemoved: [],
          error: "Outcome unconfirmed; check the relay list before retrying.",
        };
      }
      if (
        !result ||
        !["applied", "rejected", "partial", "unconfirmed"].includes(
          result.status
        ) ||
        typeof result.configurationApplied !== "boolean" ||
        !Array.isArray(result.credentialsRemoved) ||
        !Array.isArray(result.configurations)
      )
        result = {
          status: "unconfirmed",
          configurations: [],
          configurationApplied: false,
          credentialsRemoved: [],
          error: "Outcome unconfirmed; check the relay list before retrying.",
        };
      if (drafts.get(key) !== draft) return;
      if (result.configurationApplied) {
        if (key === "new") adoptKey(draft, newKey);
        if (result.status === "applied" && draft.version === version) {
          drafts.delete(draft.state.key);
          if (state?.key === draft.state.key) publish(null);
          else notify();
        } else {
          update(draft, {
            ...draft.state,
            pending: false,
            recoveryRequired: false,
            dirty: draft.state.dirty.filter(
              (field) => draft.fieldVersions[field] !== submittedVersions[field]
            ),
            error:
              result.status === "applied" ? null : relayMutationMessage(result),
          });
          this.reconcile(result.configurations);
        }
      } else
        update(draft, {
          ...draft.state,
          pending: false,
          recoveryRequired: result.status === "unconfirmed",
          error: relayMutationMessage(result),
        });
    },
  };
}
