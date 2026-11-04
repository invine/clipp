import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PairingApprovalResult } from "../../core/pairing/results";
import { pairingApprovalMessage } from "./pairingFeedback";
import type { PendingRequest } from "./types";

type Feedback = {
  key: string;
  deviceId: string;
  requestVersion: string;
  identityId: string;
  owner: object;
  message: string;
};

export type TrustRequestBehaviorState = {
  pendingKeys: readonly string[];
  feedback: readonly Feedback[];
};

type Event =
  | { type: "start"; key: string; deviceId: string }
  | { type: "finish"; key: string; feedback: Feedback }
  | { type: "settle"; key: string }
  | { type: "reset" };

const initialState: TrustRequestBehaviorState = {
  pendingKeys: [],
  feedback: [],
};

export function trustRequestKey(
  request: Pick<PendingRequest, "deviceId" | "requestVersion">
) {
  return JSON.stringify([request.deviceId, request.requestVersion]);
}

export function trustRequestBehaviorReducer(
  state: TrustRequestBehaviorState,
  event: Event
): TrustRequestBehaviorState {
  if (event.type === "reset") return initialState;
  if (event.type === "start")
    return {
      pendingKeys: state.pendingKeys.includes(event.key)
        ? state.pendingKeys
        : [...state.pendingKeys, event.key],
      feedback: state.feedback.filter(
        (item) => item.deviceId !== event.deviceId
      ),
    };
  if (event.type === "settle")
    return {
      ...state,
      pendingKeys: state.pendingKeys.filter((key) => key !== event.key),
    };
  return {
    pendingKeys: state.pendingKeys.filter((key) => key !== event.key),
    feedback: [
      ...state.feedback.filter(
        (item) => item.deviceId !== event.feedback.deviceId
      ),
      event.feedback,
    ],
  };
}

type Context = {
  owner: object;
  identityId: string | undefined;
  ready: boolean;
  loading: boolean;
  unavailable: boolean;
  pending: readonly PendingRequest[];
  onAccept(request: PendingRequest): Promise<PairingApprovalResult>;
  onReject(request: PendingRequest): Promise<PairingApprovalResult>;
};

export type TrustRequestBehavior = {
  state: TrustRequestBehaviorState;
  decide(request: PendingRequest, accepted: boolean): Promise<void>;
  isPending(request: PendingRequest): boolean;
  visibleFeedback: readonly Feedback[];
};

function normalizeResult(
  result: PairingApprovalResult | null | undefined
): PairingApprovalResult {
  if (!result || typeof result.ok !== "boolean")
    return { ok: false, error: "outcome_unconfirmed", admitted: null };
  return result;
}

/** Owns Trust Request pending work and feedback for one runtime/identity owner. */
export function useTrustRequestBehavior(
  context: Context
): TrustRequestBehavior {
  const [state, dispatch] = useReducer(
    trustRequestBehaviorReducer,
    initialState
  );
  const latest = useRef(context);
  latest.current = context;
  const active = useRef(new Map<string, object>());
  const liveOwner = useRef<object>({});

  useEffect(() => {
    const lifecycle = {};
    liveOwner.current = lifecycle;
    return () => {
      if (liveOwner.current === lifecycle) {
        liveOwner.current = {};
        active.current.clear();
        dispatch({ type: "reset" });
      }
    };
  }, [context.owner, context.identityId]);

  const decide = useCallback(
    async (request: PendingRequest, accepted: boolean) => {
      const current = latest.current;
      const key = trustRequestKey(request);
      const selected = current.pending.find(
        (item) => item.deviceId === request.deviceId
      );
      if (
        !current.ready ||
        current.loading ||
        current.unavailable ||
        !selected ||
        selected.requestVersion !== request.requestVersion ||
        active.current.has(key)
      )
        return;

      const operation = {};
      const lifecycle = liveOwner.current;
      active.current.set(key, operation);
      dispatch({ type: "start", key, deviceId: request.deviceId });
      let result: PairingApprovalResult;
      try {
        result = normalizeResult(
          await (accepted
            ? current.onAccept(request)
            : current.onReject(request))
        );
      } catch {
        result = { ok: false, error: "outcome_unconfirmed", admitted: null };
      }

      const after = latest.current;
      const currentRequest = after.pending.find(
        (item) => item.deviceId === request.deviceId
      );
      const stillSameContext =
        after.ready &&
        !after.loading &&
        !after.unavailable &&
        liveOwner.current === lifecycle &&
        after.owner === current.owner &&
        after.identityId === current.identityId &&
        (!currentRequest ||
          currentRequest.requestVersion === request.requestVersion);
      if (active.current.get(key) === operation) {
        if (stillSameContext) {
          dispatch({
            type: "finish",
            key,
            feedback: {
              key,
              deviceId: request.deviceId,
              requestVersion: request.requestVersion,
              identityId: current.identityId ?? "",
              owner: current.owner,
              message: pairingApprovalMessage(result, accepted),
            },
          });
        } else dispatch({ type: "settle", key });
        active.current.delete(key);
      }
    },
    []
  );

  const visibleFeedback = state.feedback.filter((item) => {
    const current = latest.current;
    const replacement = current.pending.find(
      (request) => request.deviceId === item.deviceId
    );
    return (
      item.owner === current.owner &&
      item.identityId === (current.identityId ?? "") &&
      (!replacement || replacement.requestVersion === item.requestVersion)
    );
  });

  return {
    state,
    decide,
    isPending(request) {
      return state.pendingKeys.includes(trustRequestKey(request));
    },
    visibleFeedback,
  };
}
