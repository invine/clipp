import type {
  PairingApprovalResult,
  PairingSubmissionResult,
} from "../../../packages/core/pairing/results";
import type { PendingRequest } from "../../../packages/ui/src/types";

type Runtime = {
  lastError?: { message?: string };
  sendMessage(message: unknown, callback: (reply: any) => void): void;
};

function request(runtime: Runtime, message: unknown): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 15000);
    const finish = (response: unknown) => {
      clearTimeout(timer);
      resolve(response);
    };
    try {
      runtime.sendMessage(message, (response) =>
        finish(runtime.lastError ? null : response)
      );
    } catch {
      finish(null);
    }
  });
}

export async function submitExtensionPairing(
  runtime: Runtime,
  text: string
): Promise<PairingSubmissionResult> {
  const result = await request(runtime, {
    type: "pairDevice",
    pairingText: text,
  });
  if (result?.ok === true) return { ok: true };
  if (result?.ok === false)
    return {
      ok: false,
      error:
        typeof result.error === "string" ? result.error : "submission_failed",
    };
  return { ok: false, error: "outcome_unconfirmed" };
}

export async function decideExtensionPairing(
  runtime: Runtime,
  device: PendingRequest,
  accept: boolean
): Promise<PairingApprovalResult> {
  const result = await request(runtime, {
    type: "respondTrust",
    id: device.deviceId,
    accept,
    device,
  });
  if (typeof result?.ok === "boolean" && typeof result?.admitted === "boolean")
    return result;
  return { ok: false, error: "outcome_unconfirmed", admitted: null };
}

export async function dismissExtensionPairingOutcome(
  runtime: Runtime,
  targetPeerId: string,
  expected: { sessionId: string; revision: number }
): Promise<boolean> {
  const reply = await request(runtime, {
    type: "dismissPairingOutcome",
    targetPeerId,
    expected,
  });
  if (typeof reply?.dismissed !== "boolean")
    throw new Error("outcome_unconfirmed");
  return reply.dismissed;
}
