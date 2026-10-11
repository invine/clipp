export type NameEditSnapshot = Readonly<{
  active: boolean;
  targetId: string | null;
  raw: string;
  pending: boolean;
  error: string | null;
}>;

export function nameSaveErrorMessage(error: string, alias: boolean): string {
  if (
    error.includes("invalid_device_name") ||
    error.includes("invalid_device_alias")
  ) {
    return `${alias ? "Alias" : "Device Name"} must contain 1–64 characters without control or line breaks. Edit and Save again.`;
  }
  if (error.includes("device_unavailable")) {
    return "This device is no longer available. Your edit was not applied.";
  }
  if (
    error.includes("rename_outcome_unconfirmed") ||
    error.includes("rename_state_unconfirmed")
  ) {
    return "The Save result could not be confirmed. Check the current name before saving again.";
  }
  return `${alias ? "Alias" : "Device Name"} Save was not confirmed. Your edit is still here; check the current value before saving again.`;
}

export function createNameEditSession() {
  type Draft = { state: NameEditSnapshot; base: string; version: number };
  const drafts = new Map<string, Draft>();
  const empty: NameEditSnapshot = {
    active: false,
    targetId: null,
    raw: "",
    pending: false,
    error: null,
  };
  let snapshot = empty;
  const listeners = new Set<() => void>();
  function publish(next: NameEditSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function update(draft: Draft, next: NameEditSnapshot) {
    draft.state = next;
    if (snapshot.targetId === next.targetId) publish(next);
  }
  function cancel() {
    if (snapshot.targetId) drafts.delete(snapshot.targetId);
    publish(empty);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    begin(targetId: string, value: string) {
      let draft = drafts.get(targetId);
      if (!draft) {
        draft = {
          base: value,
          version: 0,
          state: {
            active: true,
            targetId,
            raw: value,
            pending: false,
            error: null,
          },
        };
        drafts.set(targetId, draft);
      } else {
        if (draft.state.raw === draft.base && !draft.state.pending)
          draft.state = { ...draft.state, raw: value };
        draft.base = value;
      }
      draft.state = { ...draft.state, active: true };
      publish(draft.state);
    },
    change(raw: string) {
      const draft = snapshot.targetId ? drafts.get(snapshot.targetId) : null;
      if (!draft) return;
      draft.version += 1;
      update(draft, { ...draft.state, raw, error: null });
    },
    authoritativeValue(targetId: string, value: string) {
      const draft = drafts.get(targetId);
      if (!draft) return;
      if (draft.state.raw === draft.base && !draft.state.pending)
        update(draft, { ...draft.state, raw: value });
      draft.base = value;
    },
    dismiss() {
      const draft = snapshot.targetId ? drafts.get(snapshot.targetId) : null;
      if (draft) update(draft, { ...draft.state, active: false });
    },
    cancel,
    clear() {
      drafts.clear();
      publish(empty);
    },
    removeTarget(targetId: string) {
      drafts.delete(targetId);
      if (snapshot.targetId === targetId) publish(empty);
    },
    retainTargets(targetIds: string[]) {
      for (const id of drafts.keys())
        if (!targetIds.includes(id)) this.removeTarget(id);
    },
    async save<Result extends { deviceId: string }>(
      action: (targetId: string, raw: string) => Promise<Result | null>
    ): Promise<void> {
      const targetId = snapshot.targetId;
      const draft = targetId ? drafts.get(targetId) : null;
      if (!targetId || !draft || draft.state.pending) return;
      const raw = draft.state.raw;
      const version = draft.version;
      update(draft, { ...draft.state, pending: true, error: null });
      try {
        const result = await action(targetId, raw);
        if (drafts.get(targetId) !== draft) return;
        if (!result || result.deviceId !== targetId)
          throw new Error("device_unavailable");
        if (draft.version === version) {
          drafts.delete(targetId);
          if (snapshot.targetId === targetId) publish(empty);
        } else {
          draft.base = raw;
          update(draft, { ...draft.state, pending: false });
        }
      } catch (error) {
        if (drafts.get(targetId) !== draft) return;
        update(draft, {
          ...draft.state,
          pending: false,
          error: error instanceof Error ? error.message : "name_save_failed",
        });
      }
    },
  };
}

export function saveNonEmptyAlias<Result extends { deviceId: string }>(
  session: ReturnType<typeof createNameEditSession>,
  action: (targetId: string, raw: string) => Promise<Result | null>
): Promise<void> {
  return session.save((targetId, raw) => {
    if (raw.trim() === "") throw new Error("invalid_device_alias");
    return action(targetId, raw);
  });
}
