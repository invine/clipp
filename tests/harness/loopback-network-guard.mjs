import net from "node:net";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

/** External OS seams only. Never repairs an address or swallows a denied access. */
export function installLoopbackNetworkGuard() {
  const violations = [];
  const listeners = new Set();
  const originalListen = net.Server.prototype.listen;
  const originalConnect = net.Socket.prototype.connect;
  const originalDatagram = dgram.createSocket;
  const deny = (operation) => {
    violations.push(operation);
    const error = Error(`LOOPBACK_GUARD_BLOCK:${operation}`);
    // Report only the operation and call sites, never arguments/destinations.
    console.error(error.stack?.split("\n").slice(0, 7).join("\n"));
    throw error;
  };
  const hostOf = (args) => {
    const first = args[0];
    if (first && typeof first === "object") return first.host;
    return typeof args[1] === "string" ? args[1] : undefined;
  };
  net.Server.prototype.listen = function (...args) {
    if (hostOf(args) !== "127.0.0.1") return deny("non_loopback_listen");
    listeners.add(this);
    return originalListen.apply(this, args);
  };
  net.Socket.prototype.connect = function (...args) {
    // Node's public connect methods may forward their normalized [options, cb].
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    if (hostOf(normalized) !== "127.0.0.1") return deny("non_loopback_connect");
    return originalConnect.apply(this, args);
  };
  // Block before creating any UDP handle; this also forbids bind/send/mDNS.
  dgram.createSocket = () => deny("udp_socket");
  syncBuiltinESMExports();
  return {
    assertClean() {
      if (violations.length)
        throw Error(`LOOPBACK_GUARD_BLOCK:${violations.join(",")}`);
    },
    assertClosed() {
      if ([...listeners].some((server) => server.listening))
        throw Error("loopback_listener_not_closed");
    },
  };
}
