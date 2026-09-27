import { canonicalDiscoveryUrl } from "../../../packages/core/network/managedRelays";

export const MANAGED_RELAY_PORT = "managed-relay-access-v1";

export type AccessRequest = { action: "accessToken"; discoveryUrl: string };
export type AccessReply =
  { accessToken: string | null; warning?: string } | { error: string };

export function parseAccessRequest(value: unknown): AccessRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (Object.keys(request).length !== 2 || request.action !== "accessToken")
    return null;
  try {
    return {
      action: "accessToken",
      discoveryUrl: canonicalDiscoveryUrl(request.discoveryUrl as string),
    };
  } catch {
    return null;
  }
}

export function authorizedManagedRelayPort(
  sender: { id?: string; url?: string } | undefined,
  extensionId: string,
  offscreenUrl: string,
  portName: string
): boolean {
  return (
    sender?.id === extensionId &&
    sender.url === offscreenUrl &&
    portName === MANAGED_RELAY_PORT
  );
}

export function parseAccessReply(value: unknown): AccessReply | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  if (
    Object.keys(reply).some(
      (key) => !["accessToken", "warning", "error"].includes(key)
    )
  )
    return null;
  if (typeof reply.error === "string" && Object.keys(reply).length === 1)
    return { error: reply.error };
  if (
    (typeof reply.accessToken === "string" || reply.accessToken === null) &&
    (reply.warning === undefined || typeof reply.warning === "string") &&
    !Object.prototype.hasOwnProperty.call(reply, "error")
  ) {
    return {
      accessToken: reply.accessToken as string | null,
      warning: reply.warning as string | undefined,
    };
  }
  return null;
}
