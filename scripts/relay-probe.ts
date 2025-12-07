/**
 * Minimal rendezvous probe:
 * - dials the relay
 * - registers on a rendezvous topic
 * - lists peers on that topic
 *
 * Env:
 *   RELAY_ADDR (required) e.g. /ip4/127.0.0.1/tcp/47891/ws/p2p/<relay-id>
 *   RENDEZVOUS_TOPIC (optional, default "default")
 */
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { defaultLogger } from "@libp2p/logger";
import { webSockets } from "@libp2p/websockets";
import { tcp } from "@libp2p/tcp";
import { FaultTolerance } from "@libp2p/interface-transport";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import { dcutr } from "@libp2p/dcutr";
import { ping } from "@libp2p/ping";
import { fromString as u8FromString } from "uint8arrays/from-string";
import { toString as u8ToString } from "uint8arrays/to-string";
import { sendTrustRequest, registerClipboardHandler, loadPrivateKeyFromEnv, safeStat, safeConnStat, getStreamIterable, writeStream, describeStream } from "../packages/core/network/probeUtils.js";

function env(name: string): string | undefined {
  const val = process.env[name];
  return val && val.trim().length > 0 ? val.trim() : undefined;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const v = env(name);
  if (v === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function patchConsoleTimestamps() {
  const ts = () => new Date().toISOString();
  const wrap =
    (fn: (...args: any[]) => void) =>
    (...args: any[]) =>
      fn(`[${ts()}]`, ...args);
  console.info = wrap(console.info.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
  if (console.debug) {
    console.debug = wrap(console.debug.bind(console));
  }
}

const relayAddr = env("RELAY_ADDR");
const rendezvousTopic = env("RENDEZVOUS_TOPIC") || "default";
const pairTarget = env("PAIR_TARGET") || env("TARGET_ADDR");
const relayOnlyListen = ["1", "true", "yes", "on"].includes(
  (process.env.PROBE_LISTEN_RELAY_ONLY || "").toLowerCase()
);
const skipDirectDial = ["1", "true", "yes", "on"].includes(
  (process.env.PROBE_SKIP_DIRECT_DIAL || "").toLowerCase()
);
const disableDCUTR = ["1", "true", "yes", "on"].includes(
  (process.env.PROBE_DISABLE_DCUTR || "").toLowerCase()
);
const enableTcp = envBool("PROBE_ENABLE_TCP", true);
let ackReceived = false;
let trustResponse: any = null;
const peerAddrHints: Record<string, string[]> = {};

patchConsoleTimestamps();

if (!relayAddr) {
  console.error(
    "RELAY_ADDR is required, e.g. /dns4/localhost/tcp/47891/ws/p2p/<relay-id>"
  );
  process.exit(1);
}

async function main() {
  const circuitAddr = toCircuitAddr(relayAddr);
  const privateKey = loadPrivateKeyFromEnv();
  const wsListen = defaultWsListen(relayAddr);
  const tcpListen = defaultTcpListen(relayAddr);
  const webrtcListen = defaultWebRTCListen(relayAddr);
  const enableWebRTC = envBool("PROBE_ENABLE_WEBRTC", true);

  const node = await createLibp2p({
    ...(privateKey ? { privateKey } : {}),
    addresses: {
      // Listen on relay circuit; optionally add a local websocket addr for potential direct upgrade.
      listen: relayOnlyListen
        ? [circuitAddr]
        : enableTcp
        ? [circuitAddr, wsListen, tcpListen, ...(enableWebRTC ? webrtcListen : [])]
        : [circuitAddr, wsListen, ...(enableWebRTC ? webrtcListen : [])],
    },
    logger: defaultLogger(),
    transportManager: {
      faultTolerance: FaultTolerance.NO_FATAL,
    },
    connectionEncrypters: [noise()],
    // Prefer mplex to avoid muxer log issues.
    streamMuxers: [withMuxerLogging(mplex(), "mplex")],
    transports: [
      withLogger(webSockets()),
      ...(enableTcp ? [withLogger(tcp())] : []),
      ...(enableWebRTC ? await loadWebRTCTransports() : []),
      withLogger(circuitRelayTransport()),
    ],
    services: {
      identify: identify(),
      ping: ping(),
      ...(enableTcp && !disableDCUTR ? { dcutr: dcutr() } : {}),
    },
  });

  try {
    await node.start();
  } catch (err: any) {
    console.error("[probe] node.start failed", {
      error: err?.message || err,
      stack: err?.stack,
    });
    throw err;
  }

  if (enableWebRTC) {
    console.info("[probe] requested WebRTC listen addrs", webrtcListen.map((a: any) => a.toString()));
  }
  console.info("[probe] node started and listening for pairing requests", {
    peer: node.peerId.toString(),
    circuitListen: toCircuitAddr(relayAddr).toString(),
    privateKey: privateKey ? "provided" : "generated",
    listenAddrs: node.getMultiaddrs().map(String),
  });
  if (enableWebRTC) {
    const boundWebRTC = node
      .getMultiaddrs()
      .map(String)
      .filter((a) => a.includes("/webrtc"));
    if (boundWebRTC.length === 0) {
      console.warn("[probe] WebRTC transport enabled but no /webrtc addresses bound. Enable LIBP2P_DEBUG=libp2p:webrtc:* to see binding errors.");
    } else {
      console.info("[probe] WebRTC bound addrs", boundWebRTC);
    }
  }

  // Connection/stream lifecycle logging to see if we ever reach the target.
  node.addEventListener("peer:connect", (evt: any) => {
    console.info("[probe] peer:connect", {
      peer: evt.detail?.toString?.() || evt.detail?.id?.toString?.(),
    });
  });
  node.addEventListener("peer:disconnect", (evt: any) => {
    console.info("[probe] peer:disconnect", {
      peer: evt.detail?.toString?.() || evt.detail?.id?.toString?.(),
    });
  });
  node.addEventListener("connection:open", (evt: any) => {
    const c = evt.detail;
    console.info("[probe] connection:open", {
      peer: c?.remotePeer?.toString?.(),
      addr: c?.remoteAddr?.toString?.(),
      stat: safeConnStat(c),
      limits: (c as any)?.limits,
    });
  });
  node.addEventListener("connection:close", (evt: any) => {
    const c = evt.detail;
    console.info("[probe] connection:close", {
      peer: c?.remotePeer?.toString?.(),
      addr: c?.remoteAddr?.toString?.(),
      stat: safeConnStat(c),
      limits: (c as any)?.limits,
    });
  });
  node.addEventListener("stream:open", (evt: any) => {
    const s = evt.detail;
    console.info("[probe] stream:open", {
      protocol: s?.stat?.protocol,
      direction: s?.stat?.direction,
      connPeer: s?.connection?.remotePeer?.toString?.(),
      connAddr: s?.connection?.remoteAddr?.toString?.(),
    });
  });
  node.addEventListener("stream:close", (evt: any) => {
    const s = evt.detail;
    console.info("[probe] stream:close", {
      protocol: s?.stat?.protocol,
      direction: s?.stat?.direction,
      connPeer: s?.connection?.remotePeer?.toString?.(),
      connAddr: s?.connection?.remoteAddr?.toString?.(),
      stat: safeStat(s),
    });
  });

  registerClipboardHandler(node, {
    allowLimited: true,
    onTrustRequest: async (msg, { stream }) => {
      if (pairTarget) return;
      console.info("[probe] handling trust-request", {
        from: msg?.from,
        payload: msg?.payload,
      });
      const ack = {
        type: "trust-ack" as const,
        from: node.peerId.toString(),
        payload: {
          id: msg?.payload?.deviceId || msg?.from,
          accepted: true,
        },
        sentAt: Date.now(),
      };
      try {
        await writeStream(stream, new TextEncoder().encode(JSON.stringify(ack)));
        console.info("[probe] sent trust-ack to incoming trust-request", ack);
      } catch (err: any) {
        console.warn("[probe] failed to send trust-ack", {
          error: err?.message || err,
          streamKeys: Object.keys(stream || {}),
        });
      }
    },
    onTrustAck: (msg) => {
      ackReceived = true;
      trustResponse = msg;
      console.info("[probe] received trust-ack", msg);
    },
  });
  const supported =
    (node as any)?.registrar?.getProtocols?.() ??
    (node as any)?.getProtocols?.() ??
    [];
  console.info("[probe] supported protocols after handler registration", supported);

  try {
    const baseRelay =
      typeof relayAddr === "string" ? multiaddr(relayAddr) : relayAddr;
    console.info("[probe] dialing relay transport", baseRelay.toString());
    const conn = await node.dial(baseRelay);
    console.info("[probe] relay dial succeeded");
    try {
      const id = await node.services.identify?.identify?.(conn);
      if (id) {
        console.info("[probe] identify result", {
          peer: id.peerId?.toString?.(),
          listenAddrs: id.listenAddrs?.map?.((a: any) => a.toString()),
          observedAddr: id.observedAddr?.toString?.(),
          protocols: id.protocols,
        });
      } else {
        console.warn("[probe] identify service not available");
      }
    } catch (err: any) {
      console.warn(
        "[probe] identify against relay failed",
        err?.message || err
      );
    }
  } catch (err: any) {
    console.error("[probe] dial to relay failed", err?.message || err);
  }

  await registerAndList(node, relayAddr, rendezvousTopic);

  const announced = node.getMultiaddrs().map(String);
  console.info("[probe] announced multiaddrs:", announced);

  if (pairTarget) {
    await sendPairRequest(node, pairTarget);
    console.info("[probe] waiting for trust-ack after sending request");
    await waitForResponses(10_000, 1_000);
  } else {
    console.info(
      "[probe] waiting for incoming trust-requests (no PAIR_TARGET set)"
    );
    await waitForResponses(60_000, 5_000);
  }

  console.info("[probe] done");
  await node.stop();
}

function toCircuitAddr(base: string): any {
  const ma = multiaddr(base);
  return ma.encapsulate("/p2p-circuit");
}

function defaultWsListen(relay: string) {
  const proto = relay.includes("/ip6/") ? "ip6" : "ip4";
  return multiaddr(`/${proto}/0.0.0.0/tcp/0/ws`);
}

function defaultTcpListen(relay: string) {
  const proto = relay.includes("/ip6/") ? "ip6" : "ip4";
  return multiaddr(`/${proto}/0.0.0.0/tcp/0`);
}

function defaultWebRTCListen(relay: string): any[] {
  const proto = relay.includes("/ip6/") ? "ip6" : "ip4";
  const override = env("PROBE_WEBRTC_LISTEN");
  if (override) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => multiaddr(s));
  }
  // Try both /webrtc-direct and /webrtc; UDP is the common transport for ICE.
  return [
    multiaddr(`/${proto}/0.0.0.0/udp/0/webrtc-direct`),
    multiaddr(`/${proto}/0.0.0.0/udp/0/webrtc`),
  ];
}

async function waitForResponses(totalMs: number, logIntervalMs: number) {
  let elapsed = 0;
  while (elapsed < totalMs) {
    await delay(logIntervalMs);
    elapsed += logIntervalMs;
    console.info("[probe] waiting for responses", {
      elapsedMs: elapsed,
      ackReceived,
    });
    if (ackReceived) break;
  }
}

async function registerAndList(node: any, relay: string, topic: string) {
  const encoder = new TextEncoder();
  const relayMa = typeof relay === "string" ? multiaddr(relay) : relay;
  try {
    const addrs = node.getMultiaddrs().map(String);
    console.info("[probe] rendezvous: registering", {
      topic,
      relay: relayMa.toString(),
    });
    const conn = await node.dialProtocol(relayMa, "/rendezvous/1.0.0");
    console.info("[probe] rendezvous register stream info", describeStream(conn));
    await writeStream(
      conn,
      u8FromString(
        JSON.stringify({
          action: "register",
          topic,
          addrs,
        })
      )
    );
    console.info("[probe] rendezvous register write complete");
    let got = false;
    const iterable = getStreamIterable(conn);
    if (!iterable) {
      console.warn("[probe] rendezvous register: stream missing async iterator", {
        keys: Object.keys(conn || {}),
        protocol: conn?.protocol,
      });
      return;
    }
    let waitLog: any;
    const start = Date.now();
    try {
      waitLog = setInterval(() => {
        console.info("[probe] rendezvous register: still waiting for response", {
          waitedMs: Date.now() - start,
        });
      }, 2_000);
      for await (const chunk of iterable) {
        if (!chunk) {
          console.warn(
            "[probe] rendezvous register: received falsy chunk",
            chunk
          );
          continue;
        }
        const buf =
          chunk instanceof Uint8Array
            ? chunk
            : typeof (chunk as any)?.subarray === "function"
            ? (chunk as any).subarray()
            : null;
        if (!buf) {
          console.warn("[probe] rendezvous register: non-Uint8Array chunk", {
            type: typeof chunk,
            ctor: (chunk as any)?.constructor?.name,
            value: chunk,
          });
          continue;
        }
        if (buf.length === 0) continue;
        console.info("[probe] rendezvous register response", u8ToString(buf));
        got = true;
        break;
      }
    } finally {
      if (waitLog) clearInterval(waitLog);
    }
    if (!got) {
      console.warn("[probe] rendezvous register: no response");
    }
  } catch (err: any) {
    console.error("[probe] rendezvous register stream info (error)", describeStream(err?.stream || {}));
    console.error(
      "[probe] rendezvous register failed",
      err?.message || err,
      err
    );
  }

  try {
    console.info("[probe] rendezvous: list", {
      topic,
      relay: relayMa.toString(),
    });
    const conn = await node.dialProtocol(relayMa, "/rendezvous/1.0.0");
    console.info("[probe] rendezvous list stream info", describeStream(conn));
    await writeStream(
      conn,
      u8FromString(JSON.stringify({ action: "list", topic }))
    );
    console.info("[probe] rendezvous list write complete");
    let got = false;
    const iterable = getStreamIterable(conn);
    if (!iterable) {
      console.warn("[probe] rendezvous list: stream missing async iterator", {
        keys: Object.keys(conn || {}),
        protocol: conn?.protocol,
      });
      return;
    }
    let waitLog: any;
    const start = Date.now();
    try {
      waitLog = setInterval(() => {
        console.info("[probe] rendezvous list: still waiting for response", {
          waitedMs: Date.now() - start,
        });
      }, 2_000);
      for await (const chunk of iterable) {
        if (!chunk) {
          console.warn("[probe] rendezvous list: received falsy chunk", chunk);
          continue;
        }
        const buf =
          chunk instanceof Uint8Array
            ? chunk
            : typeof (chunk as any)?.subarray === "function"
            ? (chunk as any).subarray()
            : null;
        if (!buf) {
          console.warn("[probe] rendezvous list: non-Uint8Array chunk", {
            type: typeof chunk,
            ctor: (chunk as any)?.constructor?.name,
            value: chunk,
          });
          continue;
        }
        if (buf.length === 0) continue;
        const text = u8ToString(buf);
        console.info("[probe] rendezvous list response", text);
        try {
          const parsed = JSON.parse(text);
          if (parsed?.peers && Array.isArray(parsed.peers)) {
            for (const p of parsed.peers) {
              const pid = p?.peer;
              const addrs: string[] = (p?.addrs || []).filter(
                (a: string) => typeof a === "string"
              );
              if (pid && addrs.length) {
                peerAddrHints[pid] = Array.from(
                  new Set([...(peerAddrHints[pid] || []), ...addrs])
                );
                try {
                  const mas = addrs.map((a: string) => multiaddr(a));
                  await node.peerStore?.addressBook?.add?.(pid, mas);
                } catch {
                  // best effort
                }
              }
            }
          }
        } catch {
          // ignore parse errors; raw text already logged
        }
        got = true;
        break;
      }
    } finally {
      if (waitLog) clearInterval(waitLog);
    }
    if (!got) {
      console.warn("[probe] rendezvous list: no response");
    }
  } catch (err: any) {
    console.error("[probe] rendezvous list stream info (error)", describeStream(err?.stream || {}));
    console.error("[probe] rendezvous list failed", err?.message || err, err);
  }
}

async function sendPairRequest(node: any, target: string | string[]) {
  const targets = Array.isArray(target) ? target : [target];
  const myAddrs = node.getMultiaddrs().map(String);
  if (myAddrs.length === 0) {
    myAddrs.push(toCircuitAddr(relayAddr).toString());
  }
  console.info("[probe] pairing using current multiaddrs", myAddrs);
  const deviceId = node.peerId.toString();
  const payload = {
    deviceId,
    deviceName: "Probe Client",
    publicKey: "probe-public-key",
    multiaddrs: myAddrs,
    createdAt: Date.now(),
  };
  for (const t of targets) {
    const targetMa = multiaddr(t);
    const peerId = extractPeerId(targetMa);
    const directCandidates: string[] = [];
    if (peerId && peerAddrHints[peerId]) {
      const hints = peerAddrHints[peerId].filter((a) => !a.includes("/p2p-circuit"));
      directCandidates.push(...hints);
      // Always add hinted addrs to the peer store so DCUtR can use them even if we skip direct dials.
      try {
        const mas = hints.map((a) => multiaddr(a));
        await node.peerStore?.addressBook?.add?.(peerId, mas);
      } catch {
        // best effort
      }
    }
    if (skipDirectDial) {
      console.info("[probe] skipping direct upgrade attempts (PROBE_SKIP_DIRECT_DIAL set)");
    } else {
      for (const addr of directCandidates) {
        try {
          const ma = multiaddr(addr);
          await node.peerStore?.addressBook?.add?.(ma.getPeerId?.() || peerId, [ma]);
          console.info("[probe] attempting direct upgrade before relay", {
            target: ma.toString(),
          });
          const ack = await sendTrustRequest(node, ma, payload, {
            allowLimited: false,
            logger: (...args: any[]) => console.info(...args),
          });
          if (ack) {
            ackReceived = true;
            trustResponse = ack;
            return;
          }
        } catch (err: any) {
          console.warn("[probe] direct upgrade attempt failed", {
            target: addr,
            error: err?.message || err,
          });
        }
      }
    }
    if (peerId && enableTcp && !disableDCUTR) {
      console.info("[probe] waiting for DCUtR/direct upgrade candidates", {
        peerId,
        peerAddrs: peerAddrHints[peerId],
      });
      await waitForDirectUpgrade(node, peerId, 10_000);
    }
    try {
      const ack = await sendTrustRequest(node, targetMa, payload, {
        allowLimited: true,
        logger: (...args: any[]) => console.info(...args),
      });
      if (ack) {
        ackReceived = true;
        trustResponse = ack;
        return;
      }
    } catch (err: any) {
      console.error("[probe] trust-request send failed", {
        target: targetMa.toString(),
        error: err?.message || err,
      });
    }
  }
}

main().catch((err) => {
  console.error("[probe] fatal error", err);
  process.exit(1);
});

function withLogger<T>(factory: any) {
  return (components: any) => {
    components.logger = components.logger || defaultLogger();
    return factory(components) as T;
  };
}

function withMuxerLogging(factory: any, name: string) {
  return (components: any) => {
    const f = factory(components);
    const orig = f.createStreamMuxer?.bind(f);
    if (!orig) return f;
    f.createStreamMuxer = (maConn: any) => {
      console.info(`[probe-muxer-${name}] createStreamMuxer called`, {
        argType: typeof maConn,
        argKeys: maConn ? Object.keys(maConn) : null,
        argCtor: maConn?.constructor?.name,
      });
      if (!maConn) {
        console.warn(`[probe-muxer-${name}] missing maConn`, {
          stack: new Error().stack,
        });
      } else if (!maConn.log) {
        console.warn(`[probe-muxer-${name}] maConn.log is missing; injecting default logger`, {
          maConnKeys: Object.keys(maConn || {}),
        });
        maConn.log = defaultLogger();
      }
      try {
        return orig(maConn);
      } catch (err: any) {
        console.error(`[probe-muxer-${name}] createStreamMuxer failed`, {
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadWebRTCTransports() {
  try {
    const mod = await import("@libp2p/webrtc");
    const iceServers = parseIceServers();
    const wrtc = await loadWrtc();
    const transports: any[] = [];

    if (typeof mod.webRTCDirect === "function") {
      console.info("[probe] enabling WebRTC-DIRECT transport", {
        iceServers,
        hasWrtc: !!wrtc,
      });
      transports.push(
        withLogger(
          mod.webRTCDirect({
            rtcConfiguration: { iceServers },
            ...(wrtc ? { wrtc } : {}),
          })
        )
      );
    }

    if (typeof mod.webRTC === "function") {
      console.info("[probe] enabling WebRTC transport", {
        iceServers,
        hasWrtc: !!wrtc,
      });
      transports.push(
        withLogger(
          mod.webRTC({
            rtcConfiguration: { iceServers },
            ...(wrtc ? { wrtc } : {}),
          })
        )
      );
    }

    if (transports.length) return transports;
  } catch (err: any) {
    console.warn("[probe] WebRTC transport not enabled", err?.message || err);
  }
  return [];
}

function parseIceServers(): Array<Record<string, any>> {
  const envIce = process.env.PROBE_WEBRTC_ICE;
  if (envIce) {
    try {
      const parsed = JSON.parse(envIce);
      if (Array.isArray(parsed)) return parsed as Array<Record<string, any>>;
    } catch (err: any) {
      console.warn("[probe] failed to parse PROBE_WEBRTC_ICE", err?.message || err);
    }
  }
  // Fallback to a public STUN; override via PROBE_WEBRTC_ICE for TURN.
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

async function loadWrtc() {
  const candidates = ["wrtc", "@koush/wrtc"];
  for (const c of candidates) {
    try {
      const mod = await import(c);
      return (mod as any).default ?? mod;
    } catch {
      continue;
    }
  }
  console.warn("[probe] no wrtc module found; WebRTC may not function in node");
  return undefined;
}

function extractPeerId(ma: any): string | undefined {
  try {
    if (typeof ma.getPeerId === "function") {
      return ma.getPeerId();
    }
    const s = ma.toString();
    const parts = s.split("/p2p/");
    return parts.length > 1 ? parts[parts.length - 1] : undefined;
  } catch {
    return undefined;
  }
}

async function waitForDirectUpgrade(node: any, peerId: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const conns = node.getConnections(peerId) || [];
    const direct = conns.find(
      (c: any) => !c.limits && !c.remoteAddr?.toString?.().includes("/p2p-circuit/")
    );
    console.info("[probe] direct upgrade poll", {
      peerId,
      connCount: conns.length,
      conns: conns.map((c: any) => ({
        addr: c?.remoteAddr?.toString?.(),
        limits: (c as any)?.limits,
        status: (c as any)?.stat?.status,
        direction: (c as any)?.stat?.direction,
      })),
    });
    if (direct) {
      console.info("[probe] DCUtR upgrade succeeded; direct connection present", {
        addr: direct.remoteAddr?.toString?.(),
      });
      return true;
    }
    await delay(500);
  }
  console.info("[probe] DCUtR upgrade wait finished; no direct connection");
  return false;
}
