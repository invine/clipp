export type RelayAddressEditorState = {
  adding: boolean;
  editingIndex: number | null;
  draft: string;
  saving: boolean;
  error: string | null;
};

const empty: RelayAddressEditorState = {
  adding: false,
  editingIndex: null,
  draft: "",
  saving: false,
  error: null,
};

/** Owns the legacy address editor workflow and fences results to its runtime. */
export function createRelayAddressBehavior() {
  let state = empty;
  let owner: object | undefined;
  let action:
    | ((addresses: string[]) => void | string[] | Promise<void | string[]>)
    | undefined;
  let generation = 0;
  let draftVersion = 0;
  const listeners = new Set<() => void>();
  const publish = (next: RelayAddressEditorState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bind(
      nextOwner: object,
      nextAction?: (
        addresses: string[]
      ) => void | string[] | Promise<void | string[]>
    ) {
      if (owner !== nextOwner) {
        owner = nextOwner;
        generation++;
        draftVersion++;
        publish(empty);
      }
      action = nextAction;
    },
    beginAdd() {
      draftVersion++;
      publish({ ...empty, adding: true });
    },
    beginEdit(index: number, address: string) {
      draftVersion++;
      publish({ ...empty, editingIndex: index, draft: address });
    },
    change(draft: string) {
      draftVersion++;
      publish({ ...state, draft, error: null });
    },
    cancel() {
      generation++;
      draftVersion++;
      publish(empty);
    },
    async save(next: string[]) {
      if (!action || state.saving) return;
      const saveAction = action;
      const saveOwner = owner;
      const operation = ++generation;
      const version = draftVersion;
      publish({ ...state, saving: true, error: null });
      try {
        await saveAction(next);
        if (owner === saveOwner && generation === operation) {
          if (draftVersion === version) publish(empty);
          else publish({ ...state, saving: false });
        }
      } catch {
        if (owner === saveOwner && generation === operation)
          publish({
            ...state,
            saving: false,
            error:
              draftVersion === version ? "Failed to save relay changes." : null,
          });
      }
    },
    failValidation(error: string) {
      publish({ ...state, error });
    },
  };
}
