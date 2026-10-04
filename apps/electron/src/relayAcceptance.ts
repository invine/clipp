import path from "node:path";
import { realpathSync, lstatSync } from "node:fs";

export type RelayAcceptanceTransport = "tcp" | "wss" | "webrtc-direct";

// Resolve existing parents too, so a new profile below a symlink cannot alias
// normal storage. Broken links and inaccessible paths fail closed.
function physicalPath(value: string): string {
  const suffix: string[] = [];
  let cursor = path.resolve(value);
  for (;;) {
    try {
      return path.join(realpathSync(cursor), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("isolated_acceptance_profile_required");
      try {
        lstatSync(cursor);
        throw new Error("isolated_acceptance_profile_required");
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error("isolated_acceptance_profile_required");
      }
      suffix.unshift(path.basename(cursor));
      const parent = path.dirname(cursor);
      if (parent === cursor)
        throw new Error("isolated_acceptance_profile_required");
      cursor = parent;
    }
  }
}

/** Process-only test opt-in; never read this from renderer URLs or settings. */
export function electronRelayAcceptance(
  environment: NodeJS.ProcessEnv,
  normalProfile: string,
  protectedAppData: string
): { profile: string; transport: RelayAcceptanceTransport } | undefined {
  const transport = environment.CLIPP_RELAY_ACCEPTANCE_TRANSPORT;
  const profile = environment.CLIPP_RELAY_ACCEPTANCE_PROFILE;
  if (!transport && !profile) return undefined;
  if (!profile || !path.isAbsolute(profile))
    throw new Error("isolated_acceptance_profile_required");
  const resolved = physicalPath(profile);
  const protectedTrees = [normalProfile, protectedAppData].map(physicalPath);
  if (
    protectedTrees.some(
      (tree) =>
        resolved === tree ||
        resolved.startsWith(`${tree}${path.sep}`) ||
        tree.startsWith(`${resolved}${path.sep}`)
    )
  )
    throw new Error("isolated_acceptance_profile_required");
  if (
    transport !== "tcp" &&
    transport !== "wss" &&
    transport !== "webrtc-direct"
  )
    throw new Error("unsupported_acceptance_transport");
  return { profile: resolved, transport };
}

export function acceptanceTransportAllows(
  transport: RelayAcceptanceTransport,
  address: string
): boolean {
  if (transport === "webrtc-direct") return address.includes("/webrtc-direct/");
  const websocket = /\/(?:wss|tls\/ws)\/p2p\//.test(address);
  if (transport === "wss") return websocket;
  return /\/tcp\/\d+\/p2p\//.test(address);
}
