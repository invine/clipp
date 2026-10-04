import { resolve } from "node:path";

// Only build output owned by this fixture; never select an installed extension
// or a personal profile. The browser scripts always create their own profile.
export function relayAcceptanceFixture(extensionDirectory) {
  const transport = process.env.CLIPP_EXTENSION_FIXTURE_TRANSPORT;
  if (transport && transport !== "wss" && transport !== "webrtc-direct")
    throw new Error("unsupported_fixture_transport");
  return {
    transport,
    extensionPath: transport
      ? resolve(extensionDirectory, ".local", "relay-acceptance", transport)
      : resolve(extensionDirectory, "dist"),
  };
}
