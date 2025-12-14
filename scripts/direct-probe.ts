/**
 * Direct (non-relay) probe to test the clipboard pairing protocol.
 *
 * Modes:
 * - Listener (default): uses an optional static private key to keep a stable peerId,
 *   listens on a websocket multiaddr, accepts /clipboard/trust/1.0.0, and replies with trust-ack.
 * - Sender: if TARGET_ADDR (or PAIR_TARGET) is set, dials that multiaddr and sends
 *   a trust-request, waiting for a trust-ack.
 *
 * Env:
 *   PROBE_PRIVATE_KEY_BASE64 (optional)   - static private key to keep identity stable
 *   LISTEN_ADDR (optional)                - default /ip4/0.0.0.0/tcp/47900/ws
 *   TARGET_ADDR or PAIR_TARGET (sender)   - multiaddr of the listener
 *   DEVICE_NAME (optional)                - label used in payload (default "Probe Client")
 *   TIMEOUT_MS (optional)                 - wait time for ack (default 10s)
 */
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { defaultLogger } from "@libp2p/logger";
import { webSockets } from "@libp2p/websockets";
import { FaultTolerance } from "@libp2p/interface-transport";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import {
  registerClipboardHandler,
  sendTrustRequest,
  loadPrivateKeyFromEnv,
} from "./lib/probeUtils.js";

function env(name: string): string | undefined {
  const val = process.env[name];
  return val && val.trim().length > 0 ? val.trim() : undefined;
}

const targetAddr = env("TARGET_ADDR") || env("PAIR_TARGET");
const listenAddr = env("LISTEN_ADDR") || "/ip4/0.0.0.0/tcp/47900/ws";
const deviceName = env("DEVICE_NAME") || "Probe Client";
const timeoutMs = Number(env("TIMEOUT_MS") || 10_000);
let ackReceived = false;
let trustResponse: any = null;

async function main() {
  const privateKey = loadPrivateKeyFromEnv();
  const node = await createLibp2p({
    ...(privateKey ? { privateKey } : {}),
    addresses: {
      listen: targetAddr ? [] : [listenAddr],
    },
    logger: defaultLogger(),
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    connectionEncrypters: [noise()],
    streamMuxers: [withMuxerLogging(mplex(), "mplex")],
    transports: [webSockets()],
    services: {
      identify: identify(),
    },
  });

  await node.start();
  console.info("[direct-probe] node started", {
    mode: targetAddr ? "sender" : "listener",
    peer: node.peerId.toString(),
    listen: node.getMultiaddrs().map(String),
    privateKey: privateKey ? "provided" : "generated",
  });

  registerClipboardHandler(node, {
    allowLimited: true,
    onTrustRequest: async (msg, { stream }) => {
      if (targetAddr) return;
      const ack = {
        type: "trust-ack" as const,
        from: node.peerId.toString(),
        payload: {
          id: msg?.payload?.deviceId || msg?.from,
          accepted: true,
        },
        sentAt: Date.now(),
      };
      await stream.sink?.([new TextEncoder().encode(JSON.stringify(ack))]);
      console.info("[direct-probe] sent trust-ack", ack);
    },
    onTrustAck: (msg) => {
      ackReceived = true;
      trustResponse = msg;
      console.info("[direct-probe] received trust-ack", msg);
    },
  });

  const supported =
    (node as any)?.registrar?.getProtocols?.() ??
    (node as any)?.getProtocols?.() ??
    [];
  console.info("[direct-probe] supported protocols", supported);

  if (targetAddr) {
    await sendPairRequest(node, targetAddr);
    console.info("[direct-probe] waiting for trust-ack after sending request");
    await waitForResponses(timeoutMs, 1_000);
  } else {
    console.info("[direct-probe] waiting for incoming trust-requests");
    await waitForResponses(timeoutMs, 5_000);
  }

  console.info("[direct-probe] done", { ackReceived, trustResponse });
  await node.stop();
}

async function sendPairRequest(node: any, target: string) {
  const targetMa = multiaddr(target);
  const myAddrs = node.getMultiaddrs().map(String);
  if (myAddrs.length === 0) myAddrs.push(listenAddr);
  const deviceId = node.peerId.toString();
  const payload = {
    deviceId,
    deviceName,
    publicKey: "probe-public-key",
    multiaddrs: myAddrs,
    createdAt: Date.now(),
  };
  const ack = await sendTrustRequest(node, targetMa, payload, {
    allowLimited: true,
    logger: (...args: any[]) => console.info(...args),
  });
  if (ack) {
    ackReceived = true;
    trustResponse = ack;
  }
}

async function waitForResponses(totalMs: number, logIntervalMs: number) {
  let elapsed = 0;
  while (elapsed < totalMs) {
    await delay(logIntervalMs);
    elapsed += logIntervalMs;
    console.info("[direct-probe] waiting", { elapsedMs: elapsed, ackReceived });
    if (ackReceived) break;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[direct-probe] fatal error", err);
  process.exit(1);
});

function withMuxerLogging(factory: any, name: string) {
  return (components: any) => {
    const f = factory(components);
    const orig = f.createStreamMuxer?.bind(f);
    if (!orig) return f;
    f.createStreamMuxer = (maConn: any) => {
      console.info(`[direct-muxer-${name}] createStreamMuxer called`, {
        argType: typeof maConn,
        argKeys: maConn ? Object.keys(maConn) : null,
        argCtor: maConn?.constructor?.name,
      });
      if (!maConn) {
        console.warn(`[direct-muxer-${name}] missing maConn`, {
          stack: new Error().stack,
        });
      } else if (!maConn.log) {
        console.warn(`[direct-muxer-${name}] maConn.log is missing; injecting default logger`, {
          maConnKeys: Object.keys(maConn || {}),
        });
        maConn.log = components?.logger ?? defaultLogger();
      }
      try {
        return orig(maConn);
      } catch (err: any) {
        console.error(`[direct-muxer-${name}] createStreamMuxer failed`, {
          error: err?.message || err,
          stack: err?.stack,
          hasMaConn: !!maConn,
          hasLog: !!maConn?.log,
        });
        throw err;
      }
    };
    return f;
  };
}
