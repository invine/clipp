import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { echo } from "@libp2p/echo";
import {
  circuitRelayTransport,
  circuitRelayServer,
} from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { WebRTC } from "@multiformats/multiaddr-matcher";
import delay from "delay";
import { createLibp2p } from "libp2p";
import type { Multiaddr } from "@multiformats/multiaddr";

async function loadWebRTC() {
  try {
    const mod = await import("@libp2p/webrtc");
    return (mod as any).webRTC;
  } catch (err: any) {
    console.error("WebRTC transport unavailable (dependency not installed)", err?.message || err);
    process.exitCode = 1;
    return undefined;
  }
}

const webRTC = await loadWebRTC();
if (!webRTC) {
  throw new Error("WebRTC transport required for web-rtc script; install @libp2p/webrtc to use it.");
}

// the relay server listens on a transport dialable by the listener and the
// dialer, and has a relay service configured
const relay = await createLibp2p({
  addresses: {
    listen: ["/ip4/127.0.0.1/tcp/0/ws"],
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionGater: {
    denyDialMultiaddr: () => false,
  },
  services: {
    identify: identify(),
    relay: circuitRelayServer(),
  },
});

// the listener has a WebSocket transport to dial the relay, a Circuit Relay
// transport to make a reservation, and a WebRTC transport to accept incoming
// WebRTC connections
const listener = await createLibp2p({
  addresses: {
    listen: ["/p2p-circuit", "/webrtc"],
  },
  transports: [webSockets(), webRTC(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionGater: {
    denyDialMultiaddr: () => false,
  },
  services: {
    identify: identify(),
    echo: echo(),
  },
});

// the listener dials the relay (or discovers a public relay via some other
// method)
await listener.dial(relay.getMultiaddrs(), {
  signal: AbortSignal.timeout(5000),
});

let webRTCMultiaddr: Multiaddr | undefined;

// wait for the listener to make a reservation on the relay
while (true) {
  webRTCMultiaddr = listener.getMultiaddrs().find((ma) => WebRTC.matches(ma));

  if (webRTCMultiaddr != null) {
    break;
  }

  // try again later
  await delay(1000);
}

// the dialer has Circuit Relay, WebSocket and WebRTC transports to dial
// the listener via the relay, complete the SDP handshake and establish a
// direct WebRTC connection
const dialer = await createLibp2p({
  transports: [webSockets(), webRTC(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionGater: {
    denyDialMultiaddr: () => false,
  },
  services: {
    identify: identify(),
    echo: echo(),
  },
});

// dial the listener and open an echo protocol stream
const stream = await dialer.dialProtocol(
  webRTCMultiaddr,
  dialer.services.echo.protocol,
  {
    signal: AbortSignal.timeout(5000),
  }
);

// we can now stop the relay
await relay.stop();

// send/receive some data from the remote peer via a direct connection
stream.send(new TextEncoder().encode("hello world"));

stream.addEventListener("message", (evt) => {
  console.info(new TextDecoder().decode(evt.data.subarray()));
});
