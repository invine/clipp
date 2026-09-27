import {
  normalizeRelayConfigurations,
  type RelayConfiguration,
} from "../../../packages/core/network/managedRelays";

export type ManagedRelayControlMessage =
  | { action: "init"; configurations: RelayConfiguration[] }
  | { action: "setManagedRelays"; configurations: RelayConfiguration[] }
  | { action: "retryManagedRelay"; key: string }
  | { action: "shutdown" };

export function authorizedBackgroundControl(
  sender: { id?: string; url?: string } | undefined,
  extensionId: string,
  backgroundUrl: string
): boolean {
  return sender?.id === extensionId && sender.url === backgroundUrl;
}

export function isManagedRelayControlAction(action: unknown): boolean {
  return (
    action === "init" ||
    action === "setManagedRelays" ||
    action === "retryManagedRelay" ||
    action === "shutdown"
  );
}

export function parseManagedRelayControlMessage(
  value: unknown
): ManagedRelayControlMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.target !== "offscreen") return null;
  const keys = Object.keys(raw);
  const only = (allowed: string[]) =>
    keys.every((key) => allowed.includes(key));
  try {
    if (
      raw.action === "init" &&
      only(["target", "action", "relays", "managedConfigurations"]) &&
      Array.isArray(raw.relays) &&
      raw.relays.length === 0
    ) {
      return {
        action: "init",
        configurations: normalizeRelayConfigurations(
          raw.managedConfigurations ?? []
        ),
      };
    }
    if (
      raw.action === "setManagedRelays" &&
      only(["target", "action", "configurations"])
    ) {
      return {
        action: "setManagedRelays",
        configurations: normalizeRelayConfigurations(raw.configurations),
      };
    }
    if (
      raw.action === "retryManagedRelay" &&
      only(["target", "action", "key"]) &&
      typeof raw.key === "string" &&
      raw.key.length > 0
    ) {
      return { action: "retryManagedRelay", key: raw.key };
    }
    if (raw.action === "shutdown" && only(["target", "action"]))
      return { action: "shutdown" };
  } catch {
    /* Invalid configuration is rejected as an invalid control message. */
  }
  return null;
}
