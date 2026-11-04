import { useCallback, useEffect, useReducer, useRef } from "react";

export type BackgroundContinuityBehaviorState = {
  pendingAction: string | null;
  error: string | null;
};

type Event =
  | { type: "start"; id: number; action: string }
  | { type: "success"; id: number }
  | { type: "failure"; id: number }
  | { type: "retire" };

const initialState: BackgroundContinuityBehaviorState = {
  pendingAction: null,
  error: null,
};

function reducer(
  state: BackgroundContinuityBehaviorState & { operationId?: number },
  event: Event
): BackgroundContinuityBehaviorState & { operationId?: number } {
  if (event.type === "retire") return initialState;
  if (event.type === "start")
    return {
      operationId: event.id,
      pendingAction: event.action,
      error: null,
    };
  if (event.id !== state.operationId) return state;
  return event.type === "failure"
    ? {
        operationId: event.id,
        pendingAction: null,
        error:
          "The action could not be confirmed. Open background help and recovery.",
      }
    : { operationId: event.id, pendingAction: null, error: null };
}

export type BackgroundContinuityActionRunner = {
  state: BackgroundContinuityBehaviorState;
  perform(
    action: string,
    effect: () => unknown | Promise<unknown>,
    confirmation?: string
  ): Promise<boolean>;
};

/** Owns deterministic feedback while effects stay with the runtime/host. */
export function useBackgroundContinuityBehavior(
  owner: object,
  confirm: (message: string) => boolean | Promise<boolean>
): BackgroundContinuityActionRunner {
  const [state, dispatch] = useReducer(reducer, initialState);
  const currentOwner = useRef(owner);
  const active = useRef<{ id: number; owner: object } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    currentOwner.current = owner;
    active.current = null;
    dispatch({ type: "retire" });
    return () => {
      if (currentOwner.current === owner) {
        currentOwner.current = {};
        active.current = null;
        dispatch({ type: "retire" });
      }
    };
  }, [owner]);

  const perform = useCallback(
    async (
      action: string,
      effect: () => unknown | Promise<unknown>,
      confirmation?: string
    ) => {
      if (active.current || currentOwner.current !== owner) return false;
      const operation = { id: ++nextId.current, owner };
      active.current = operation;
      dispatch({ type: "start", id: operation.id, action });
      try {
        if (confirmation && !(await confirm(confirmation))) {
          if (active.current === operation)
            dispatch({ type: "success", id: operation.id });
          return true;
        }
        if (active.current !== operation || currentOwner.current !== owner)
          return false;
        await effect();
        if (active.current !== operation || currentOwner.current !== owner)
          return false;
        dispatch({ type: "success", id: operation.id });
        return true;
      } catch {
        if (active.current === operation && currentOwner.current === owner)
          dispatch({ type: "failure", id: operation.id });
        return false;
      } finally {
        if (active.current === operation) active.current = null;
      }
    },
    [confirm, owner]
  );

  return { state, perform };
}
