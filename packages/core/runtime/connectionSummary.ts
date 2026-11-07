import type { RelayState } from "../network/managedRelays";
import { composeRecoveryIssues } from "./recoveryIssues";

/** Observed public connection facts; absence of a read is never an offline observation. */
export type ConnectionFacts = {
  devices: { deviceId: string }[];
  peers: string[];
  peerConnections?: { peerId: string; hasDirect: boolean; hasRelay: boolean }[];
  connectionStateKnown?: boolean;
  managedRelayConfigurations?: { key: string }[];
  managedRelayStates?: RelayState[];
};
export function projectConnectionSummary(facts: ConnectionFacts) {
  const trusted = new Set(facts.devices.map((device) => device.deviceId));
  const connected = new Set(
    facts.connectionStateKnown === true
      ? facts.peers.filter((peer) => trusted.has(peer))
      : []
  );
  const paths = new Map(
    facts.peerConnections?.map((path) => [path.peerId, path])
  );
  let direct = 0,
    relayed = 0,
    unknown = 0;
  for (const peer of connected) {
    const path = paths.get(peer);
    if (path?.hasDirect) direct++;
    else if (path?.hasRelay) relayed++;
    else unknown++;
  }
  const configured = new Set(
    facts.managedRelayConfigurations?.map((relay) => relay.key)
  );
  const relays = (facts.managedRelayStates ?? []).filter((relay) =>
    configured.has(relay.key)
  );
  const issues = composeRecoveryIssues({ managedRelayStates: relays });
  const ready = relays.filter((relay) => relay.status === "ready").length;
  const starting =
    configured.size > relays.length ||
    relays.some((relay) => relay.status === "connecting");
  const kind = issues.length
    ? "attention"
    : direct
      ? "direct"
      : relayed
        ? "relay"
        : unknown || facts.connectionStateKnown !== true
          ? "unknown"
          : starting
            ? "starting"
            : ready
              ? "waiting"
              : !facts.devices.length && !configured.size
                ? "idle"
                : "offline";
  const label = {
    idle: "No Trusted Devices yet",
    attention: "Connections need attention",
    direct: "Direct Connection",
    relay: "Relayed Connection",
    unknown: "Connection status unknown",
    starting: "Connections starting",
    waiting: "Relay ready · no Trusted Devices",
    offline: "No device connection available",
  }[kind];
  const currentPath = direct ? "Direct Connection" : relayed ? "Relayed Connection" : null;
  const visibleLabel =
    kind === "attention" && currentPath
      ? `${currentPath} · relay needs attention`
      : label;
  return {
    kind,
    label: visibleLabel,
    trustedDevices: trusted.size,
    direct,
    relayed,
    unknown,
    ready,
    configured: configured.size,
    starting,
    issues,
  };
}
