import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
export type ExtensionRecoveryState = Pick<
  ClipboardAppProps,
  | "identity"
  | "devices"
  | "pending"
  | "waiting"
  | "pairingErrors"
  | "pairingState"
  | "connectionStateKnown"
  | "peers"
  | "peerConnections"
  | "clipboardHistoryError"
  | "historyPolicyError"
  | "identityRotationRecovery"
  | "identityRotationNotice"
  | "managedRelayConfigurations"
  | "managedRelayStates"
>;
type Runtime = {
  lastError?: { message?: string };
  sendMessage(message: unknown, callback: (reply: any) => void): void;
};
function request(runtime: Runtime, type: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("runtime_outcome_unconfirmed")),
      10_000
    );
    try {
      runtime.sendMessage({ type }, (reply) => {
        clearTimeout(timeout);
        if (runtime.lastError || !reply)
          reject(
            new Error(
              runtime.lastError?.message ?? "runtime_outcome_unconfirmed"
            )
          );
        else resolve(reply);
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
export async function readExtensionRecoveryState(
  runtime: Runtime
): Promise<ExtensionRecoveryState> {
  const reply = await request(runtime, "getRuntimeState");
  if (!reply.state || !("identity" in reply.state))
    throw new Error(reply.error ?? "runtime_state_unavailable");
  return reply.state;
}
export async function probeExtensionInitialization(
  runtime: Runtime
): Promise<{ code: string } | null> {
  const reply = await request(runtime, "getInitializationError");
  if (reply.error && typeof reply.error !== "object")
    throw new Error("initialization_state_unavailable");
  return reply.error ?? null;
}
export async function retryExtensionInitialization(
  runtime: Runtime
): Promise<void> {
  const reply = await request(runtime, "retryIdentityInitialization");
  if (reply.ok !== true)
    throw new Error(reply.error ?? "initialization_retry_unconfirmed");
}

/** Fresh handshake through the current background worker, independent of a publication. */
export async function readExtensionRuntimeAuthority(
  runtime: Runtime
): Promise<string> {
  const reply = await request(runtime, "getRuntimeAuthority");
  if (typeof reply.sessionId !== "string" || !reply.sessionId)
    throw new Error(reply.error ?? "runtime_authority_unavailable");
  return reply.sessionId;
}
