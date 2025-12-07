import { startWebsocketRelayFromEnv } from "../packages/core/network/relay/server.js";

const relay = await startWebsocketRelayFromEnv();
let stopping = false;

console.info(
  "[relay-cli] announce these multiaddrs to clients",
  relay.node.getMultiaddrs().map(String)
);

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[relay-cli] received ${signal}, shutting down...`);
  const killTimer = setTimeout(() => {
    console.warn("[relay-cli] force exiting after timeout");
    process.exit(1);
  }, 5000).unref();
  try {
    await relay.stop();
  } catch (err: any) {
    console.error("[relay-cli] error during shutdown", err?.message || err);
  } finally {
    clearTimeout(killTimer);
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGQUIT", () => {
  void shutdown("SIGQUIT");
});
process.on("uncaughtException", (err) => {
  console.error("[relay-cli] uncaught exception", err);
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[relay-cli] unhandled rejection", reason);
  void shutdown("unhandledRejection");
});
