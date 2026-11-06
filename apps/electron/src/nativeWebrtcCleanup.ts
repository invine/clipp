import { createRequire } from "node:module";
import path from "node:path";

/** Process-wide cleanup belongs to final Quit, never a transport restart. */
export function cleanupNativeWebRtc(mainDirectory: string): void {
  const mainRequire = createRequire(path.join(mainDirectory, "main.cjs"));
  // libp2p can use a different version from the workspace's direct dependency.
  // Resolve from its entry so cleanup reaches the native library it actually used.
  const transportRequire = createRequire(mainRequire.resolve("@libp2p/webrtc"));
  const native: Pick<typeof import("node-datachannel"), "cleanup"> =
    transportRequire("node-datachannel");
  native.cleanup();
}
