import { startWebsocketRelayFromEnv } from "../packages/core/network/relay/server.js";

const relay = await startWebsocketRelayFromEnv();

console.info(
  "[relay-cli] announce these multiaddrs to clients",
  relay.node.getMultiaddrs().map(String)
);

async function shutdown(signal: string) {
  console.info(`[relay-cli] received ${signal}, shutting down...`);
  await relay.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
