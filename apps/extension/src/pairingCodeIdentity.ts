import type { Identity } from "../../../packages/ui/src/types";
import { createPopupNameState } from "./popupNameState";

type IdentityState = { identity?: Identity | null };
export function subscribePairingCodeIdentity(
  port: {
    send(
      message: { type: string },
      receive: (reply?: { state?: IdentityState }) => void
    ): void;
    subscribe(
      receive: (message: { type?: string; state?: IdentityState }) => void
    ): () => void;
  },
  receive: (identity: Identity | null) => void
) {
  const state = createPopupNameState<Identity, never>(receive, () => undefined);
  let active = true;
  const unsubscribe = port.subscribe((message) => {
    if (
      active &&
      message.type === "runtimeState" &&
      message.state &&
      "identity" in message.state
    )
      state.publish(message.state);
  });
  const requestedRevision = state.revision();
  port.send({ type: "getRuntimeState" }, (reply) => {
    if (active && reply?.state)
      state.readPublished(requestedRevision, reply.state);
  });
  return () => {
    active = false;
    unsubscribe();
  };
}
